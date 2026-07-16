use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const APP_DIR_NAME: &str = "RelayTokenMonitor";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredKey {
    pub id: String,
    pub name: String,
    pub sk: String,
    #[serde(default)]
    pub note: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub last_known_remaining: Option<f64>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub access_token: Option<String>,
    /// Numeric New API user id for the `New-Api-User` request header.
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub keys: Vec<StoredKey>,
    #[serde(default = "default_refresh")]
    pub refresh_interval_seconds: u64,
    #[serde(default = "default_true")]
    pub auto_refresh_enabled: bool,
    #[serde(default = "default_threshold")]
    pub low_balance_threshold: f64,
    #[serde(default = "default_quota_per_unit")]
    pub quota_per_unit: u64,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub current_key_id: Option<String>,
}

fn default_base_url() -> String {
    "https://www.cctq.ai".into()
}
fn default_refresh() -> u64 {
    60
}
fn default_threshold() -> f64 {
    5.0
}
fn default_quota_per_unit() -> u64 {
    500_000
}
fn default_locale() -> String {
    "zh".into()
}

impl Default for StoredConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            access_token: None,
            user_id: None,
            keys: vec![],
            refresh_interval_seconds: default_refresh(),
            auto_refresh_enabled: true,
            low_balance_threshold: default_threshold(),
            quota_per_unit: default_quota_per_unit(),
            locale: default_locale(),
            autostart: false,
            current_key_id: None,
        }
    }
}

pub fn config_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").expect("APPDATA");
    PathBuf::from(appdata)
        .join(APP_DIR_NAME)
        .join("config.json")
}

pub fn read_stored_config() -> StoredConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => StoredConfig::default(),
    }
}

pub fn write_stored_config(cfg: &StoredConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())
}

pub fn mask_secret(raw: &str) -> String {
    if raw.len() <= 8 {
        return "***".into();
    }
    format!("{}***{}", &raw[..3.min(raw.len())], &raw[raw.len() - 4..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_dir_name_is_relay_token_monitor() {
        assert_eq!(APP_DIR_NAME, "RelayTokenMonitor");
    }

    #[test]
    fn default_config_has_cctq_and_threshold_5() {
        let c = StoredConfig::default();
        assert_eq!(c.base_url, "https://www.cctq.ai");
        assert_eq!(c.low_balance_threshold, 5.0);
        assert_eq!(c.quota_per_unit, 500_000);
        assert_eq!(c.refresh_interval_seconds, 60);
        assert!(c.auto_refresh_enabled);
        assert_eq!(c.locale, "zh");
        assert!(c.keys.is_empty());
        assert!(c.access_token.is_none() || c.access_token.as_deref() == Some(""));
    }

    #[test]
    fn mask_sk_keeps_suffix() {
        assert_eq!(mask_secret("sk-abcdefghijklmnop"), "sk-***mnop");
    }
}
