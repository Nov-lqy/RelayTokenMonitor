use crate::aggregate::{
    aggregate_by_day, aggregate_by_model, aggregate_by_model_day, is_low_balance, quota_to_cny,
    remaining_cny,
};
use crate::config::{
    config_path, mask_secret, read_stored_config, write_stored_config, StoredConfig, StoredKey,
};
use crate::relay::{
    fetch_log_self, fetch_remote_tokens, fetch_token_usage, fetch_user_self, merge_remote_keys,
};
use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const USAGE_CACHE_TTL: Duration = Duration::from_secs(45);

#[derive(Clone)]
struct UsageCacheEntry {
    key: String,
    fetched_at: Instant,
    value: UsageSummaryDto,
}

fn usage_cache() -> &'static Mutex<Option<UsageCacheEntry>> {
    static CACHE: Mutex<Option<UsageCacheEntry>> = Mutex::new(None);
    &CACHE
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDto {
    pub id: String,
    pub name: String,
    pub sk_masked: String,
    pub note: String,
    pub enabled: bool,
    pub last_known_remaining: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigDto {
    pub base_url: String,
    pub access_token_masked: Option<String>,
    pub has_access_token: bool,
    pub user_id: String,
    pub keys: Vec<KeyDto>,
    pub refresh_interval_seconds: u64,
    pub auto_refresh_enabled: bool,
    pub low_balance_threshold: f64,
    pub quota_per_unit: u64,
    pub locale: String,
    pub autostart: bool,
    pub current_key_id: Option<String>,
    pub config_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceDto {
    pub remaining_cny: f64,
    pub quota: u64,
    pub used_quota: u64,
    pub is_low: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayUsageDto {
    pub date: String,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsageDto {
    pub model_name: String,
    pub total_tokens: u64,
    pub quota: u64,
    #[serde(default)]
    pub by_day: Vec<DayUsageDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryDto {
    pub by_day: Vec<DayUsageDto>,
    pub by_model: Vec<ModelUsageDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter_token_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncKeysResult {
    pub added: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub user_self_ok: bool,
    pub sample_key_ok: bool,
    pub messages: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyUsageDto {
    pub remaining_cny: f64,
    pub name: String,
    pub total_granted: u64,
    pub total_used: u64,
    pub total_available: u64,
    pub unlimited_quota: bool,
}

fn normalize_refresh_interval_seconds(value: u64) -> u64 {
    match value {
        60 | 300 | 1800 | 3600 => value,
        _ => 60,
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn new_key_id() -> String {
    format!(
        "key-{}-{}",
        now_unix(),
        &uuid_like_suffix()
    )
}

fn uuid_like_suffix() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    now_unix().hash(&mut h);
    std::thread::current().id().hash(&mut h);
    format!("{:x}", h.finish())
}

fn to_key_dto(key: &StoredKey) -> KeyDto {
    KeyDto {
        id: key.id.clone(),
        name: key.name.clone(),
        sk_masked: mask_secret(&key.sk),
        note: key.note.clone(),
        enabled: key.enabled,
        last_known_remaining: key.last_known_remaining,
    }
}

fn to_app_config_dto(cfg: &StoredConfig) -> AppConfigDto {
    let has_access_token = cfg
        .access_token
        .as_ref()
        .map(|t| !t.is_empty())
        .unwrap_or(false);
    let access_token_masked = cfg
        .access_token
        .as_ref()
        .filter(|t| !t.is_empty())
        .map(|t| mask_secret(t));

    AppConfigDto {
        base_url: cfg.base_url.clone(),
        access_token_masked,
        has_access_token,
        user_id: cfg.user_id.clone().unwrap_or_default(),
        keys: cfg.keys.iter().map(to_key_dto).collect(),
        refresh_interval_seconds: cfg.refresh_interval_seconds,
        auto_refresh_enabled: cfg.auto_refresh_enabled,
        low_balance_threshold: cfg.low_balance_threshold,
        quota_per_unit: cfg.quota_per_unit,
        locale: cfg.locale.clone(),
        autostart: cfg.autostart,
        current_key_id: cfg.current_key_id.clone(),
        config_path: config_path().to_string_lossy().to_string(),
    }
}

pub fn apply_autostart(enabled: bool) -> Result<(), String> {
    let run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let value_name = "RelayTokenMonitor";

    if enabled {
        let exe = std::env::current_exe().map_err(|error| error.to_string())?;
        let exe_arg = exe.to_string_lossy().to_string();
        let status = Command::new("reg")
            .args(["add", run_key, "/v", value_name, "/t", "REG_SZ", "/d"])
            .arg(exe_arg)
            .args(["/f"])
            .status()
            .map_err(|error| format!("写入开机自启失败：{error}"))?;
        if !status.success() {
            return Err("写入开机自启失败".to_string());
        }
        return Ok(());
    }

    let status = Command::new("reg")
        .args(["delete", run_key, "/v", value_name, "/f"])
        .status()
        .map_err(|error| format!("关闭开机自启失败：{error}"))?;
    if !status.success() {
        return Ok(());
    }
    Ok(())
}

fn require_panel_auth(cfg: &StoredConfig) -> Result<(String, String, String), String> {
    let token = cfg
        .access_token
        .as_ref()
        .filter(|t| !t.is_empty())
        .cloned()
        .ok_or_else(|| "未配置 Access Token".to_string())?;
    let user_id = cfg
        .user_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "未配置用户 ID（New-Api-User）".to_string())?;
    if user_id.parse::<i64>().is_err() {
        return Err("用户 ID 必须是数字".to_string());
    }
    Ok((cfg.base_url.clone(), token, user_id))
}

#[tauri::command]
pub fn get_app_config() -> Result<AppConfigDto, String> {
    Ok(to_app_config_dto(&read_stored_config()))
}

#[tauri::command]
pub fn save_settings(
    base_url: String,
    access_token: String,
    user_id: String,
    refresh_interval_seconds: u64,
    auto_refresh_enabled: bool,
    low_balance_threshold: f64,
    locale: String,
    autostart: bool,
) -> Result<AppConfigDto, String> {
    let mut cfg = read_stored_config();
    let base = base_url.trim().to_string();
    if !base.is_empty() {
        cfg.base_url = base;
    }
    let token = access_token.trim().to_string();
    if !token.is_empty() {
        cfg.access_token = Some(token);
    }
    let uid = user_id.trim().to_string();
    if !uid.is_empty() {
        if uid.parse::<i64>().is_err() {
            return Err("用户 ID 必须是数字".to_string());
        }
        cfg.user_id = Some(uid);
    }
    cfg.refresh_interval_seconds = normalize_refresh_interval_seconds(refresh_interval_seconds);
    cfg.auto_refresh_enabled = auto_refresh_enabled;
    cfg.low_balance_threshold = low_balance_threshold;
    if !locale.trim().is_empty() {
        cfg.locale = locale.trim().to_string();
    }
    if cfg.autostart != autostart {
        apply_autostart(autostart)?;
    }
    cfg.autostart = autostart;
    write_stored_config(&cfg)?;
    Ok(to_app_config_dto(&cfg))
}

#[tauri::command]
pub fn add_key(name: String, sk: String, note: String) -> Result<AppConfigDto, String> {
    let sk = sk.trim().to_string();
    if sk.is_empty() {
        return Err("SK 不能为空".to_string());
    }
    let mut cfg = read_stored_config();
    if cfg.keys.iter().any(|k| k.sk == sk) {
        return Err("该 SK 已存在".to_string());
    }
    cfg.keys.push(StoredKey {
        id: new_key_id(),
        name: if name.trim().is_empty() {
            "key".into()
        } else {
            name.trim().to_string()
        },
        sk,
        note: note.trim().to_string(),
        enabled: true,
        last_known_remaining: None,
    });
    if cfg.current_key_id.is_none() {
        cfg.current_key_id = cfg.keys.last().map(|k| k.id.clone());
    }
    write_stored_config(&cfg)?;
    Ok(to_app_config_dto(&cfg))
}

#[tauri::command]
pub fn update_key(
    id: String,
    name: String,
    sk: String,
    note: String,
    enabled: bool,
) -> Result<AppConfigDto, String> {
    let mut cfg = read_stored_config();
    let key = cfg
        .keys
        .iter_mut()
        .find(|k| k.id == id)
        .ok_or_else(|| "密钥不存在".to_string())?;
    if !name.trim().is_empty() {
        key.name = name.trim().to_string();
    }
    let sk = sk.trim().to_string();
    if !sk.is_empty() {
        key.sk = sk;
    }
    key.note = note;
    key.enabled = enabled;
    write_stored_config(&cfg)?;
    Ok(to_app_config_dto(&cfg))
}

#[tauri::command]
pub fn delete_key(id: String) -> Result<AppConfigDto, String> {
    let mut cfg = read_stored_config();
    let before = cfg.keys.len();
    cfg.keys.retain(|k| k.id != id);
    if cfg.keys.len() == before {
        return Err("密钥不存在".to_string());
    }
    if cfg.current_key_id.as_deref() == Some(id.as_str()) {
        cfg.current_key_id = cfg.keys.first().map(|k| k.id.clone());
    }
    write_stored_config(&cfg)?;
    Ok(to_app_config_dto(&cfg))
}

#[tauri::command]
pub fn set_current_key(id: String) -> Result<AppConfigDto, String> {
    let mut cfg = read_stored_config();
    if !cfg.keys.iter().any(|k| k.id == id) {
        return Err("密钥不存在".to_string());
    }
    cfg.current_key_id = Some(id);
    write_stored_config(&cfg)?;
    Ok(to_app_config_dto(&cfg))
}

#[tauri::command]
pub fn fetch_balance() -> Result<BalanceDto, String> {
    let cfg = read_stored_config();
    let (base, token, user_id) = match require_panel_auth(&cfg) {
        Ok(v) => v,
        Err(e) => {
            return Ok(BalanceDto {
                remaining_cny: 0.0,
                quota: 0,
                used_quota: 0,
                is_low: true,
                cached_at: None,
                error: Some(e),
            });
        }
    };

    match fetch_user_self(&base, &token, &user_id) {
        Ok(user) => {
            let remaining = remaining_cny(user.quota, cfg.quota_per_unit);
            Ok(BalanceDto {
                remaining_cny: remaining,
                quota: user.quota,
                used_quota: user.used_quota,
                is_low: is_low_balance(remaining, cfg.low_balance_threshold),
                cached_at: Some(now_unix()),
                error: None,
            })
        }
        Err(e) if e == "unauthorized" || e.to_lowercase().contains("unauthorized") => {
            Ok(BalanceDto {
                remaining_cny: 0.0,
                quota: 0,
                used_quota: 0,
                is_low: true,
                cached_at: None,
                error: Some("unauthorized".into()),
            })
        }
        Err(e) => Ok(BalanceDto {
            remaining_cny: 0.0,
            quota: 0,
            used_quota: 0,
            is_low: true,
            cached_at: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub fn fetch_usage_summary(days: u32, force: Option<bool>) -> Result<UsageSummaryDto, String> {
    let cfg = read_stored_config();
    let (base, token, user_id) = require_panel_auth(&cfg)?;
    let days = days.max(1).min(90) as i64;
    let force = force.unwrap_or(false);

    let filter_token_name = cfg
        .current_key_id
        .as_ref()
        .and_then(|id| cfg.keys.iter().find(|k| &k.id == id))
        .map(|k| k.name.trim().to_string())
        .filter(|n| !n.is_empty());

    let cache_key = format!(
        "{}|{}|{}|{}",
        base,
        user_id,
        days,
        filter_token_name.as_deref().unwrap_or("")
    );

    if !force {
        if let Ok(guard) = usage_cache().lock() {
            if let Some(entry) = guard.as_ref() {
                if entry.key == cache_key && entry.fetched_at.elapsed() < USAGE_CACHE_TTL {
                    return Ok(entry.value.clone());
                }
            }
        }
    }

    let end_ts = now_unix();
    let start_ts = end_ts - days * 86_400;

    let logs = fetch_log_self(
        &base,
        &token,
        &user_id,
        start_ts,
        end_ts,
        filter_token_name.as_deref(),
    )
    .map_err(|e| {
        if e == "unauthorized" || e.to_lowercase().contains("unauthorized") {
            "unauthorized".to_string()
        } else {
            e
        }
    })?;

    let mut by_day: Vec<DayUsageDto> = aggregate_by_day(&logs)
        .into_iter()
        .map(|(date, total_tokens)| DayUsageDto { date, total_tokens })
        .collect();
    by_day.sort_by(|a, b| a.date.cmp(&b.date));

    let model_days = aggregate_by_model_day(&logs);
    let mut by_model: Vec<ModelUsageDto> = aggregate_by_model(&logs)
        .into_iter()
        .map(|(model_name, agg)| {
            let mut days: Vec<DayUsageDto> = model_days
                .iter()
                .filter(|((name, _), _)| name == &model_name)
                .map(|((_, date), total_tokens)| DayUsageDto {
                    date: date.clone(),
                    total_tokens: *total_tokens,
                })
                .collect();
            days.sort_by(|a, b| a.date.cmp(&b.date));
            ModelUsageDto {
                model_name,
                total_tokens: agg.total_tokens,
                quota: agg.quota,
                by_day: days,
            }
        })
        .collect();
    by_model.sort_by(|a, b| b.total_tokens.cmp(&a.total_tokens));

    let summary = UsageSummaryDto {
        by_day,
        by_model,
        filter_token_name,
    };

    if let Ok(mut guard) = usage_cache().lock() {
        *guard = Some(UsageCacheEntry {
            key: cache_key,
            fetched_at: Instant::now(),
            value: summary.clone(),
        });
    }

    Ok(summary)
}

#[tauri::command]
pub fn refresh_key_usage(id: String) -> Result<KeyUsageDto, String> {
    let mut cfg = read_stored_config();
    let key_index = cfg
        .keys
        .iter()
        .position(|k| k.id == id)
        .ok_or_else(|| "密钥不存在".to_string())?;
    let sk = cfg.keys[key_index].sk.clone();
    let base = cfg.base_url.clone();
    let quota_per_unit = cfg.quota_per_unit;

    let usage = fetch_token_usage(&base, &sk).map_err(|e| {
        if e == "unauthorized" || e.to_lowercase().contains("unauthorized") {
            "unauthorized".to_string()
        } else {
            e
        }
    })?;

    let remaining = if usage.unlimited_quota {
        f64::INFINITY
    } else {
        quota_to_cny(usage.total_available, quota_per_unit)
    };

    cfg.keys[key_index].last_known_remaining = if remaining.is_finite() {
        Some(remaining)
    } else {
        None
    };
    write_stored_config(&cfg)?;

    Ok(KeyUsageDto {
        remaining_cny: if remaining.is_finite() {
            remaining
        } else {
            -1.0
        },
        name: usage.name,
        total_granted: usage.total_granted,
        total_used: usage.total_used,
        total_available: usage.total_available,
        unlimited_quota: usage.unlimited_quota,
    })
}

#[tauri::command]
pub fn sync_keys_from_panel() -> Result<SyncKeysResult, String> {
    let mut cfg = read_stored_config();
    let (base, token, user_id) = require_panel_auth(&cfg)?;
    let remote = fetch_remote_tokens(&base, &token, &user_id).map_err(|e| {
        if e == "unauthorized" || e.to_lowercase().contains("unauthorized") {
            "unauthorized".to_string()
        } else {
            e
        }
    })?;
    let added = merge_remote_keys(&mut cfg.keys, &remote);
    write_stored_config(&cfg)?;
    Ok(SyncKeysResult {
        added: added as u32,
    })
}

#[tauri::command]
pub fn probe_connection() -> Result<ProbeResult, String> {
    let cfg = read_stored_config();
    let mut messages = Vec::new();
    let mut user_self_ok = false;
    let mut sample_key_ok = false;

    match require_panel_auth(&cfg) {
        Ok((base, token, user_id)) => match fetch_user_self(&base, &token, &user_id) {
            Ok(user) => {
                user_self_ok = true;
                messages.push(format!(
                    "user/self ok: quota={} used={}",
                    user.quota, user.used_quota
                ));
            }
            Err(e) => {
                messages.push(format!("user/self failed: {e}"));
            }
        },
        Err(e) => messages.push(e),
    }

    if let Some(key) = cfg
        .keys
        .iter()
        .find(|k| k.enabled && crate::relay::is_usable_sk(&k.sk))
    {
        match fetch_token_usage(&cfg.base_url, &key.sk) {
            Ok(usage) => {
                sample_key_ok = true;
                messages.push(format!(
                    "sample key ok: {} available={}",
                    key.name, usage.total_available
                ));
            }
            Err(e) => messages.push(format!("sample key failed: {e}")),
        }
    } else if cfg.keys.iter().any(|k| k.enabled) {
        messages.push("synced keys need full sk- pasted manually".into());
    } else {
        messages.push("no enabled key to probe".into());
    }

    Ok(ProbeResult {
        user_self_ok,
        sample_key_ok,
        messages,
    })
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
