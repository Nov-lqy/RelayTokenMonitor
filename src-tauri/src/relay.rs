use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::aggregate::LogRow;

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

pub fn parse_user_self(v: &Value) -> Result<UserSelf, String> {
    let data = v.get("data").ok_or("missing data")?;
    Ok(UserSelf {
        quota: data.get("quota").and_then(|x| x.as_u64()).unwrap_or(0),
        used_quota: data.get("used_quota").and_then(|x| x.as_u64()).unwrap_or(0),
    })
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn auth_get(base: &str, path: &str, token: &str) -> Result<Value, String> {
    let url = api_url(base, path);
    let resp = client()?
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let v: Value = resp.json().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err("unauthorized".into());
    }
    if status.is_success() == false && v.get("success") != Some(&Value::Bool(true)) {
        return Err(format!("http {}", status));
    }
    Ok(v)
}

pub fn fetch_user_self(base: &str, access_token: &str) -> Result<UserSelf, String> {
    let v = auth_get(base, "/api/user/self", access_token)?;
    parse_user_self(&v)
}

pub fn fetch_token_usage(base: &str, sk: &str) -> Result<TokenUsage, String> {
    let v = auth_get(base, "/api/usage/token", sk)?;
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
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<LogRow>, String> {
    let path = format!(
        "/api/log/self?type=2&start_timestamp={}&end_timestamp={}&page_size=100",
        start_ts, end_ts
    );
    let v = auth_get(base, &path, access_token)?;
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

pub fn fetch_remote_tokens(base: &str, access_token: &str) -> Result<Vec<RemoteToken>, String> {
    let v = auth_get(base, "/api/token/?p=0&size=100", access_token)?;
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
}
