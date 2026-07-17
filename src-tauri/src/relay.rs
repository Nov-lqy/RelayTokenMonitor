use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;
use crate::aggregate::LogRow;

const HTTP_TIMEOUT_SECS: u64 = 8;

fn http_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
            .pool_max_idle_per_host(4)
            .build()
            .expect("reqwest client")
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSelf {
    pub quota: u64,
    pub used_quota: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub name: String,
    pub total_granted: u64,
    pub total_used: u64,
    pub total_available: u64,
    pub unlimited_quota: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteToken {
    pub id: i64,
    pub name: String,
    pub key: String,
    pub status: i32,
    pub remain_quota: u64,
    pub used_quota: u64,
    pub unlimited_quota: bool,
}

pub fn api_url(base: &str, path: &str) -> String {
    format!("{}{}", base.trim_end_matches('/'), path)
}

/// Minimal query-component encoding for token_name (RFC 3986 unreserved passthrough).
fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

pub fn parse_user_self(v: &Value) -> Result<UserSelf, String> {
    let data = v.get("data").ok_or("missing data")?;
    Ok(UserSelf {
        quota: data.get("quota").and_then(|x| x.as_u64()).unwrap_or(0),
        used_quota: data.get("used_quota").and_then(|x| x.as_u64()).unwrap_or(0),
    })
}

fn map_api_error(status: reqwest::StatusCode, v: &Value) -> String {
    let message = v
        .get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let lower = message.to_lowercase();
    if lower.contains("new-api-user") {
        if lower.contains("not provided") {
            return "未配置用户 ID（New-Api-User）".into();
        }
        if lower.contains("format") {
            return "用户 ID 必须是数字".into();
        }
        if lower.contains("mismatch") {
            return "用户 ID 与 Access Token 不匹配".into();
        }
        return message;
    }
    if status.as_u16() == 401 || lower.contains("unauthorized") || lower.contains("access token")
    {
        return "unauthorized".into();
    }
    if !message.is_empty() {
        return message;
    }
    format!("http {}", status)
}

fn auth_get(
    base: &str,
    path: &str,
    token: &str,
    new_api_user: Option<&str>,
) -> Result<Value, String> {
    let url = api_url(base, path);
    let mut req = http_client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", token));
    if let Some(uid) = new_api_user.map(str::trim).filter(|u| !u.is_empty()) {
        req = req.header("New-Api-User", uid);
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let status = resp.status();
    let v: Value = resp.json().map_err(|e| e.to_string())?;
    if v.get("success") == Some(&Value::Bool(true)) {
        return Ok(v);
    }
    if v.get("success") == Some(&Value::Bool(false)) {
        return Err(map_api_error(status, &v));
    }
    if !status.is_success() {
        return Err(map_api_error(status, &v));
    }
    Ok(v)
}

pub fn fetch_user_self(
    base: &str,
    access_token: &str,
    user_id: &str,
) -> Result<UserSelf, String> {
    let v = auth_get(base, "/api/user/self", access_token, Some(user_id))?;
    parse_user_self(&v)
}

pub fn fetch_token_usage(base: &str, sk: &str) -> Result<TokenUsage, String> {
    let v = auth_get(base, "/api/usage/token", sk, None)?;
    let data = v.get("data").ok_or("missing data")?;
    Ok(TokenUsage {
        name: data.get("name").and_then(|x| x.as_str()).unwrap_or("").into(),
        total_granted: data.get("total_granted").and_then(|x| x.as_u64()).unwrap_or(0),
        total_used: data.get("total_used").and_then(|x| x.as_u64()).unwrap_or(0),
        total_available: data.get("total_available").and_then(|x| x.as_u64()).unwrap_or(0),
        unlimited_quota: data.get("unlimited_quota").and_then(|x| x.as_bool()).unwrap_or(false),
    })
}

pub fn fetch_log_self(
    base: &str,
    access_token: &str,
    user_id: &str,
    start_ts: i64,
    end_ts: i64,
    token_name: Option<&str>,
) -> Result<Vec<LogRow>, String> {
    let mut path = format!(
        "/api/log/self?type=2&start_timestamp={}&end_timestamp={}&page_size=100",
        start_ts, end_ts
    );
    if let Some(name) = token_name.map(str::trim).filter(|n| !n.is_empty()) {
        path.push_str("&token_name=");
        path.push_str(&urlencoding_encode(name));
    }
    let v = auth_get(base, &path, access_token, Some(user_id))?;
    let items = v.pointer("/data/items")
        .or_else(|| v.pointer("/data"))
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let mut rows = Vec::new();
    for it in items {
        if !it.is_object() { continue; }
        rows.push(LogRow {
            model_name: it.get("model_name").and_then(|x| x.as_str()).unwrap_or("unknown").into(),
            prompt_tokens: it.get("prompt_tokens").and_then(|x| x.as_u64()).unwrap_or(0),
            completion_tokens: it.get("completion_tokens").and_then(|x| x.as_u64()).unwrap_or(0),
            quota: it.get("quota").and_then(|x| x.as_u64()).unwrap_or(0),
            created_at: it.get("created_at").and_then(|x| x.as_i64()).unwrap_or(0),
        });
    }
    Ok(rows)
}

pub fn fetch_remote_tokens(
    base: &str,
    access_token: &str,
    user_id: &str,
) -> Result<Vec<RemoteToken>, String> {
    let v = auth_get(base, "/api/token/?p=0&size=100", access_token, Some(user_id))?;
    let items = v.pointer("/data/items")
        .or_else(|| v.pointer("/data"))
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for it in items {
        if !it.is_object() { continue; }
        out.push(RemoteToken {
            id: it.get("id").and_then(|x| x.as_i64()).unwrap_or(0),
            name: it.get("name").and_then(|x| x.as_str()).unwrap_or("").into(),
            key: it.get("key").and_then(|x| x.as_str()).unwrap_or("").into(),
            status: it.get("status").and_then(|x| x.as_i64()).unwrap_or(0) as i32,
            remain_quota: it.get("remain_quota").and_then(|x| x.as_u64()).unwrap_or(0),
            used_quota: it.get("used_quota").and_then(|x| x.as_u64()).unwrap_or(0),
            unlimited_quota: it.get("unlimited_quota").and_then(|x| x.as_bool()).unwrap_or(false),
        });
    }
    Ok(out)
}

/// Merge remote tokens into local keys by sk; never delete local-only keys.
/// CCTQ/New API list endpoints often return truncated key fragments (not full `sk-...`);
/// those must not be stored as usable secrets.
pub fn merge_remote_keys(
    local: &mut Vec<crate::config::StoredKey>,
    remote: &[RemoteToken],
) -> usize {
    let mut added = 0;
    for r in remote {
        let remote_id = format!("remote-{}", r.id);
        if let Some(existing) = local.iter_mut().find(|k| k.id == remote_id || (!r.key.is_empty() && k.sk == r.key && is_usable_sk(&r.key))) {
            if !r.name.is_empty() {
                existing.name = r.name.clone();
            }
            existing.enabled = r.status == 1;
            existing.last_known_remaining = Some(r.remain_quota as f64);
            if is_usable_sk(&r.key) {
                existing.sk = r.key.clone();
            }
            continue;
        }

        if local.iter().any(|k| is_usable_sk(&r.key) && k.sk == r.key) {
            continue;
        }

        let usable = is_usable_sk(&r.key);
        local.push(crate::config::StoredKey {
            id: remote_id,
            name: if r.name.is_empty() {
                format!("token-{}", r.id)
            } else {
                r.name.clone()
            },
            sk: if usable { r.key.clone() } else { String::new() },
            note: if usable {
                "synced".into()
            } else {
                "synced — paste full sk".into()
            },
            enabled: r.status == 1,
            last_known_remaining: Some(r.remain_quota as f64),
        });
        added += 1;
    }
    added
}

/// Full API keys from New API are `sk-...` and much longer than list-view fragments.
pub fn is_usable_sk(key: &str) -> bool {
    let key = key.trim();
    key.starts_with("sk-") && key.len() >= 24
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_api_strips_trailing_slash() {
        assert_eq!(
            api_url("https://www.cctq.ai/", "/api/user/self"),
            "https://www.cctq.ai/api/user/self"
        );
    }

    #[test]
    fn parse_user_self_extracts_quota_fields() {
        let v = serde_json::json!({
            "success": true,
            "data": { "quota": 2500000, "used_quota": 500000, "display_name": "u" }
        });
        let u = parse_user_self(&v).unwrap();
        assert_eq!(u.quota, 2_500_000);
        assert_eq!(u.used_quota, 500_000);
    }

    #[test]
    fn urlencoding_encodes_spaces_and_keeps_safe_chars() {
        assert_eq!(urlencoding_encode("my-token_1"), "my-token_1");
        assert_eq!(urlencoding_encode("a b"), "a%20b");
        assert_eq!(urlencoding_encode("中"), "%E4%B8%AD");
    }

    #[test]
    fn usable_sk_rejects_truncated_fragments() {
        assert!(!is_usable_sk(""));
        assert!(!is_usable_sk("tFHm****fragment"));
        assert!(!is_usable_sk("sk-short"));
        assert!(is_usable_sk("sk-abcdefghijklmnopqrstuvwx"));
    }

    #[test]
    fn merge_remote_keys_skips_storing_truncated_secret() {
        let remote = vec![RemoteToken {
            id: 1,
            name: "demo".into(),
            key: "tFHmTruncatedFrag!".into(),
            status: 1,
            remain_quota: 100,
            used_quota: 0,
            unlimited_quota: false,
        }];
        let mut local = vec![];
        let added = merge_remote_keys(&mut local, &remote);
        assert_eq!(added, 1);
        assert_eq!(local[0].name, "demo");
        assert!(local[0].sk.is_empty());
        assert!(local[0].note.contains("paste full sk"));
    }
}
