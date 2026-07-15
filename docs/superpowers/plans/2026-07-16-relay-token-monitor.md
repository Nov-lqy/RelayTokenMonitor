# RelayTokenMonitor Implementation Plan

> **Progress (2026-07-16):** Tasks **1–3 done**; next is **Task 4** (`relay.rs`). See `docs/superpowers/progress.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Windows tray app (forked from DeepSeekMonitorWindows) that monitors CCTQ/New API balance, multi-key remaining quota, and ~7-day usage trends, with zh/en UI and an NSIS installer.

**Architecture:** Keep Tauri 2 tray + WebView2 shell from the reference app. Replace DeepSeek balance/usage-token flows with a New API `relay_client` (Access Token + sk- keys). Persist config under `%APPDATA%\RelayTokenMonitor\`. Split the monolithic Rust backend into focused modules (`config`, `relay`, `aggregate`, `commands`) while the React UI stays tray-popup sized; add key manager + i18n.

**Tech Stack:** Tauri 2, React 18, TypeScript, Vite, Rust (reqwest/serde), lucide-react, NSIS bundle. Reference tree: `_ref/DeepSeekMonitorWindows/` (read-only).

**Spec:** `docs/superpowers/specs/2026-07-16-relay-token-monitor-design.md`

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `src-tauri/src/config.rs` | `StoredConfig` / load-save / AppData path / masking |
| `src-tauri/src/relay.rs` | HTTP client for CCTQ/New API endpoints |
| `src-tauri/src/aggregate.rs` | Pure quota→CNY + log→day/model aggregation |
| `src-tauri/src/commands.rs` | `#[tauri::command]` handlers |
| `src-tauri/src/lib.rs` | App bootstrap, tray, plugins, wire commands |
| `src-tauri/src/main.rs` | Binary entry (from ref) |
| `src-tauri/tauri.conf.json` | Rebrand productName / identifier / NSIS |
| `src-tauri/Cargo.toml` | Package metadata |
| `src/i18n.ts` | zh/en string tables + `t()` helper |
| `src/types.ts` | Shared TS types mirroring Rust DTOs |
| `src/main.tsx` | UI panels (home / keys / settings / detail) |
| `src/styles.css` | Keep tray chrome; add key-list + warn color |
| `package.json` | Rename package/scripts branding |
| `.gitignore` | Ignore `_ref/`, build artifacts |

**Delete / stop using (after rebrand):** DeepSeek usage-token sync, `login-sync` window, platform.deepseek.com remote capability, DeepSeek balance URL.

---

### Task 1: Scaffold project from reference ✅

**Files:**
- Create: project root app files by copying from `_ref/DeepSeekMonitorWindows/` (exclude `node_modules`, `target`, `dist`, `.git`)
- Modify: `.gitignore`
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

- [x] **Step 1: Copy reference sources into repo root**

```powershell
cd C:\Users\ASUS\RelayTokenMonitor
# Ensure _ref exists from zip extract
robocopy _ref\DeepSeekMonitorWindows . /E /XD node_modules target dist .git /NFL /NDL /NJH /NJS
```

Expected: `src/main.tsx`, `src-tauri/src/lib.rs`, `package.json` exist at repo root. Do **not** delete `_ref/`.

- [ ] **Step 2: Update `.gitignore`**

Append if missing:

```gitignore
_ref/
node_modules/
dist/
src-tauri/target/
.env
.env.*
.superpowers/
*.log
```

- [ ] **Step 3: Rebrand package metadata**

In `package.json` set:

```json
{
  "name": "relay-token-monitor",
  "version": "0.1.0",
  "private": true
}
```

Keep existing scripts (`dev`, `build`, `tauri:dev`, `tauri:check`).

In `src-tauri/Cargo.toml`:

```toml
[package]
name = "app"
version = "0.1.0"
description = "RelayTokenMonitor"
edition = "2021"
rust-version = "1.77.2"
```

In `src-tauri/tauri.conf.json`:

```json
{
  "productName": "RelayTokenMonitor",
  "version": "0.1.0",
  "identifier": "com.relay.token.monitor",
  "bundle": {
    "active": true,
    "targets": ["nsis"]
  }
}
```

Keep window geometry from ref (≈356x600, undecorated, `skipTaskbar: true`).

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore: scaffold RelayTokenMonitor from DeepSeekMonitorWindows"
```

---

### Task 2: Config module + unit tests (TDD) ✅

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod config;`)
- Test: unit tests inside `config.rs`

- [ ] **Step 1: Write failing tests for path + quota helpers**

Create `src-tauri/src/config.rs` with tests only first (compile will fail until types exist — write tests + stubs together is OK if stub returns wrong values):

```rust
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
```

- [ ] **Step 2: Run tests (expect fail or missing items)**

```powershell
cd src-tauri
cargo test config::tests -- --nocapture
```

Expected: FAIL until implementation lands (undefined items / wrong defaults).

- [ ] **Step 3: Implement config types + defaults**

```rust
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

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub access_token: Option<String>,
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

fn default_base_url() -> String { "https://www.cctq.ai".into() }
fn default_refresh() -> u64 { 60 }
fn default_threshold() -> f64 { 5.0 }
fn default_quota_per_unit() -> u64 { 500_000 }
fn default_locale() -> String { "zh".into() }

impl Default for StoredConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            access_token: None,
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
    PathBuf::from(appdata).join(APP_DIR_NAME).join("config.json")
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
    format!("{}***{}", &raw[..3.min(raw.len())], &raw[raw.len()-4..])
}
```

Wire in `lib.rs`:

```rust
mod config;
```

Temporarily keep old DeepSeek commands compiling if needed; or comment unused code until Task 6.

- [ ] **Step 4: Re-run tests**

```powershell
cd src-tauri
cargo test config::tests -- --nocapture
```

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/config.rs src-tauri/src/lib.rs
git commit -m "feat: add RelayTokenMonitor config module with defaults"
```

---

### Task 3: Aggregation helpers (TDD) ✅

**Files:**
- Create: `src-tauri/src/aggregate.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_to_cny_divides_by_unit() {
        assert!((quota_to_cny(1_000_000, 500_000) - 2.0).abs() < 1e-9);
        assert!((quota_to_cny(0, 500_000) - 0.0).abs() < 1e-9);
    }

    #[test]
    fn remaining_cny_subtracts_used() {
        assert!((remaining_cny(2_500_000, 500_000, 500_000) - 4.0).abs() < 1e-9);
    }

    #[test]
    fn is_low_balance_at_threshold() {
        assert!(is_low_balance(4.9, 5.0));
        assert!(!is_low_balance(5.0, 5.0));
    }

    #[test]
    fn aggregate_by_model_sums_tokens() {
        let logs = vec![
            LogRow { model_name: "gpt-x".into(), prompt_tokens: 10, completion_tokens: 5, quota: 100, created_at: 1 },
            LogRow { model_name: "gpt-x".into(), prompt_tokens: 3, completion_tokens: 2, quota: 40, created_at: 2 },
            LogRow { model_name: "claude-y".into(), prompt_tokens: 1, completion_tokens: 1, quota: 10, created_at: 3 },
        ];
        let m = aggregate_by_model(&logs);
        assert_eq!(m.get("gpt-x").unwrap().total_tokens, 20);
        assert_eq!(m.get("claude-y").unwrap().total_tokens, 2);
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
cd src-tauri
cargo test aggregate::tests -- --nocapture
```

- [ ] **Step 3: Implement**

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogRow {
    pub model_name: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub quota: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelAgg {
    pub total_tokens: u64,
    pub quota: u64,
}

pub fn quota_to_cny(quota: u64, quota_per_unit: u64) -> f64 {
    if quota_per_unit == 0 { return 0.0; }
    quota as f64 / quota_per_unit as f64
}

pub fn remaining_cny(quota: u64, used_quota: u64, quota_per_unit: u64) -> f64 {
    let rem = quota.saturating_sub(used_quota);
    quota_to_cny(rem, quota_per_unit)
}

pub fn is_low_balance(remaining: f64, threshold: f64) -> bool {
    remaining < threshold
}

pub fn aggregate_by_model(logs: &[LogRow]) -> HashMap<String, ModelAgg> {
    let mut map = HashMap::new();
    for row in logs {
        let e = map.entry(row.model_name.clone()).or_default();
        e.total_tokens += row.prompt_tokens + row.completion_tokens;
        e.quota += row.quota;
    }
    map
}

/// Group quota (or tokens) by local calendar day key `YYYY-MM-DD` from unix seconds.
pub fn aggregate_by_day(logs: &[LogRow]) -> HashMap<String, u64> {
    let mut map = HashMap::new();
    for row in logs {
        let day = chrono_day_key(row.created_at);
        *map.entry(day).or_insert(0) += row.prompt_tokens + row.completion_tokens;
    }
    map
}

fn chrono_day_key(ts: i64) -> String {
    // Local time via chrono crate OR manual offset; prefer adding `chrono` dependency.
    use chrono::{Local, TimeZone};
    Local.timestamp_opt(ts, 0).single()
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "unknown".into())
}
```

Add to `Cargo.toml` dependencies:

```toml
chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
```

`lib.rs`: `mod aggregate;`

- [ ] **Step 4: Run tests — expect PASS**

```powershell
cd src-tauri
cargo test aggregate::tests -- --nocapture
```

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/aggregate.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add quota and usage aggregation helpers"
```

---

### Task 4: Relay HTTP client (balance + logs + tokens)

**Files:**
- Create: `src-tauri/src/relay.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `relay.rs` unit tests for URL joining + response mapping (mock JSON parse; no live network required in CI)

- [ ] **Step 1: Write parse/mapping tests**

```rust
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
```

- [ ] **Step 2: Run — expect FAIL**

```powershell
cd src-tauri
cargo test relay::tests -- --nocapture
```

- [ ] **Step 3: Implement client**

```rust
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
    // New API typically: /api/log/self?type=2&start_timestamp=&end_timestamp=&page=&page_size=
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
        // Skip if this element is not an object log row
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

/// Merge remote tokens into local keys by sk; never delete local-only keys.
pub fn merge_remote_keys(
    local: &mut Vec<crate::config::StoredKey>,
    remote: &[RemoteToken],
) -> usize {
    let mut added = 0;
    for r in remote {
        if r.key.is_empty() { continue; }
        if local.iter().any(|k| k.sk == r.key) { continue; }
        local.push(crate::config::StoredKey {
            id: format!("remote-{}", r.id),
            name: if r.name.is_empty() { format!("token-{}", r.id) } else { r.name.clone() },
            sk: r.key.clone(),
            note: "synced".into(),
            enabled: r.status == 1,
            last_known_remaining: Some(r.remain_quota as f64),
        });
        added += 1;
    }
    added
}
```

Note: `reqwest` in ref uses async-friendly crate; if existing code uses async runtime, prefer `reqwest::Client` async + `tauri::async_runtime::block_on` / async commands to match Tauri 2 style. **Match whatever pattern already exists in `_ref` `lib.rs` for HTTP** (if async, convert these to `async fn`).

- [ ] **Step 4: Unit tests PASS**

```powershell
cd src-tauri
cargo test relay::tests -- --nocapture
```

- [ ] **Step 5: Optional live smoke (manual)**

With a real Access Token in env `CCTQ_TOKEN`:

```powershell
$env:CCTQ_TOKEN="(paste)"; cargo test -- --ignored
```

Only if you add an `#[ignore]` live test. Do not commit secrets.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/src/relay.rs src-tauri/src/lib.rs
git commit -m "feat: add New API relay client for CCTQ"
```

---

### Task 5: Tauri commands + remove DeepSeek usage sync

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (trim DeepSeek commands, register new handlers)
- Modify: `src-tauri/capabilities/default.json` (remove `login-sync` / deepseek remote URLs)

- [ ] **Step 1: Define command surface**

Implement in `commands.rs` (signatures):

```rust
// get_app_config() -> AppConfigDto (paths, masked token, keys with masked sk, prefs)
// save_settings(base_url, access_token, refresh_interval_seconds, auto_refresh_enabled,
//               low_balance_threshold, locale, autostart)
// add_key(name, sk, note) / update_key(...) / delete_key(id) / set_current_key(id)
// fetch_balance() -> { remaining_cny, quota, used_quota, is_low, cached_at?, error? }
// fetch_usage_summary(days: u32) -> { by_day: [...], by_model: [...] }
// refresh_key_usage(id) -> TokenUsage mapped to CNY remaining
// sync_keys_from_panel() -> { added: u32 }
// probe_connection() -> { user_self_ok, sample_key_ok, messages: [] }
// hide_main_window()
```

Map 401 to a stable error code/string `"unauthorized"` for UI.

- [ ] **Step 2: Delete DeepSeek-only paths from `lib.rs`**

Remove/stop registering:

- `fetch_balance` DeepSeek URL
- `save_usage_token` / `clear_usage_token` / `fetch_usage` (DeepSeek platform)
- `start_usage_sync` / `usage_token_captured` / webview title watcher / EBWebView cache scrape

Keep: tray show/hide, single-instance, autostart helper (repoint if it referenced old name).

- [ ] **Step 3: Update capabilities**

`capabilities/default.json`: windows `["main"]` only; remove deepseek platform remote permissions if present.

- [ ] **Step 4: Compile check**

```powershell
npm run tauri:check
```

Expected: success (or only known unused warnings).

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: wire relay commands; remove DeepSeek usage-token sync"
```

---

### Task 6: Frontend types + i18n skeleton

**Files:**
- Create: `src/types.ts`
- Create: `src/i18n.ts`
- Modify: `src/main.tsx` (import locale)

- [ ] **Step 1: Add types**

```typescript
export type Locale = "zh" | "en";

export interface StoredKeyView {
  id: string;
  name: string;
  skMasked: string;
  note: string;
  enabled: boolean;
  lastKnownRemaining?: number;
}

export interface AppConfigView {
  baseUrl: string;
  accessTokenMasked: string;
  hasAccessToken: boolean;
  keys: StoredKeyView[];
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
  lowBalanceThreshold: number;
  quotaPerUnit: number;
  locale: Locale;
  autostart: boolean;
  currentKeyId?: string;
  configPath: string;
}

export interface BalanceView {
  remainingCny: number;
  quota: number;
  usedQuota: number;
  isLow: boolean;
  error?: string;
  cachedAt?: string;
}
```

- [ ] **Step 2: Add i18n tables**

```typescript
import type { Locale } from "./types";

const dict = {
  zh: {
    balance: "余额",
    settings: "设置",
    keys: "密钥",
    refresh: "刷新",
    lowBalance: "余额偏低",
    accessToken: "系统访问令牌",
    probe: "探测连接",
    syncKeys: "从面板同步",
    addKey: "添加 Key",
    language: "语言",
    unauthorized: "登录态失效，请重新粘贴 Access Token",
  },
  en: {
    balance: "Balance",
    settings: "Settings",
    keys: "Keys",
    refresh: "Refresh",
    lowBalance: "Low balance",
    accessToken: "System access token",
    probe: "Probe connection",
    syncKeys: "Sync from panel",
    addKey: "Add key",
    language: "Language",
    unauthorized: "Session expired — paste a new Access Token",
  },
} as const;

export type MsgKey = keyof typeof dict.zh;

export function t(locale: Locale, key: MsgKey): string {
  return dict[locale][key];
}
```

Expand keys as UI grows; never hardcode new user-visible strings without adding both locales.

- [ ] **Step 3: Commit**

```powershell
git add src/types.ts src/i18n.ts
git commit -m "feat: add frontend types and zh/en i18n skeleton"
```

---

### Task 7: Settings panel (Access Token paste + probe)

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css` (minor)

- [ ] **Step 1: Replace DeepSeek API key / usage token settings UI**

Settings fields:

1. Base URL (default filled)
2. Access Token (password input + show toggle) — helper text: copy from CCTQ console personal settings system access token
3. Refresh interval + auto refresh toggle
4. Low balance threshold (number, default 5)
5. Language select `zh` | `en`
6. Autostart toggle
7. Buttons: Save, Probe connection

Invoke:

```typescript
await invoke("save_settings", { ... });
const probe = await invoke("probe_connection");
```

On probe failure show `t(locale, "unauthorized")` when message contains unauthorized.

- [ ] **Step 2: Manual test**

```powershell
npm run tauri:dev
```

Paste token → Probe → expect user_self_ok true.

- [ ] **Step 3: Commit**

```powershell
git add src/main.tsx src/styles.css
git commit -m "feat: settings for CCTQ access token and probe"
```

---

### Task 8: Home dashboard (balance + 7-day chart + models)

**Files:**
- Modify: `src/main.tsx` (reuse `BalanceCard`, `UsageChart`, strip Flash/Pro DeepSeek split)
- Modify: `src/styles.css` — `.balance-low` warn color

- [ ] **Step 1: Load balance via new command**

```typescript
const bal = await invoke<BalanceView>("fetch_balance");
// render remainingCny; if bal.isLow add CSS class balance-low
```

CSS:

```css
.balance-low .balance-value { color: #c62828; }
```

- [ ] **Step 2: Load usage summary**

```typescript
const summary = await invoke("fetch_usage_summary", { days: 7 });
// map by_day -> UsageChart bars (total tokens per day)
// map by_model -> list + detail panel
```

Remove DeepSeek V4 Flash/Pro-specific merging; one series is enough for v1.

- [ ] **Step 3: Auto-refresh timer**

Use `refreshIntervalSeconds` + `autoRefreshEnabled` from config; on error keep last good payload and show `cachedAt`.

- [ ] **Step 4: Manual test against CCTQ**

Confirm CNY balance roughly matches console; chart non-empty if account has recent usage.

- [ ] **Step 5: Commit**

```powershell
git add src/main.tsx src/styles.css
git commit -m "feat: home dashboard balance and usage charts for CCTQ"
```

---

### Task 9: Key manager UI

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Keys panel**

List rows: name, masked sk, remaining (CNY or quota), enabled, actions (set current / delete / refresh usage).

Toolbar:

- Add key (name + sk + note)
- Sync from panel → `invoke("sync_keys_from_panel")` → toast/banner with `added` count

- [ ] **Step 2: Manual test**

Add 2 keys; sync does not wipe local-only key; refresh updates remaining.

- [ ] **Step 3: Commit**

```powershell
git add src/main.tsx src/styles.css
git commit -m "feat: multi-key manager with optional panel sync"
```

---

### Task 10: Tray polish + error UX + locale switch end-to-end

**Files:**
- Modify: `src-tauri/src/lib.rs` (tray labels can stay English or use fixed bilingual short labels)
- Modify: `src/main.tsx` (every visible string through `t()`)

- [ ] **Step 1: Ensure locale persisted**

Changing language in Settings calls `save_settings` and immediately re-renders with new `t()`.

- [ ] **Step 2: Unauthorized UX**

When balance/usage returns unauthorized, banner + button linking to Settings; do not clear `keys`.

- [ ] **Step 3: Manual checklist**

- [ ] Tray left-click toggles window  
- [ ] Single-instance second launch focuses existing  
- [ ] Threshold 5 colors balance when remaining &lt; 5  
- [ ] zh ↔ en switches all chrome strings  

- [ ] **Step 4: Commit**

```powershell
git add src/main.tsx src-tauri/src/lib.rs
git commit -m "feat: i18n and unauthorized UX polish"
```

---

### Task 11: Icons, README, NSIS build smoke

**Files:**
- Modify: `README.md` (CCTQ setup: Access Token paste, AppData path, no DeepSeek instructions)
- Optional: replace `public/assets` / tray icons later (can keep placeholder icons in v0.1)
- Modify: `src-tauri/tauri.conf.json` if installer display name needs tweak

- [ ] **Step 1: Rewrite README essentials**

Include:

- Base URL `https://www.cctq.ai`
- Where to copy system access token
- Config path `%APPDATA%\RelayTokenMonitor\config.json`
- Dev: `npm install` then `npm run tauri:dev`
- Build installer: `npm run build` + tauri build / existing `scripts/build.ps1` if present
- Security warning: never commit config / screenshot secrets

- [ ] **Step 2: Build NSIS**

```powershell
npm install
npm run build
# use project script equivalent of tauri build
npx tauri build
```

Expected artifact under `src-tauri/target/release/bundle/nsis/*.exe`.

- [ ] **Step 3: Install smoke on a VM or secondary profile**

Launch → set token → see balance → quit/reopen persists config.

- [ ] **Step 4: Commit**

```powershell
git add README.md docs src package.json
git commit -m "docs: README for CCTQ RelayTokenMonitor; v0.1 packaging ready"
```

---

## Spec coverage self-review

| Spec requirement | Task(s) |
|------------------|---------|
| CCTQ balance CNY via Access Token | 4, 5, 7, 8 |
| Many keys, manual + optional sync | 2, 4, 5, 9 |
| ~7-day trend + per-model | 3, 4, 8 |
| Low balance color only (default 5) | 2, 3, 8, 10 |
| No pricing v1 | (intentionally omitted) |
| zh/en switch | 6, 7, 10 |
| Tray + NSIS | 1, 10, 11 |
| AppData `RelayTokenMonitor` | 2 |
| Error/backoff/cache | 5, 8, 10 |
| Fork DeepSeekMonitorWindows | 1 |

**Placeholder scan:** none intentional. Live CCTQ field names may need small parse tweaks in Task 4 if JSON shape differs (`data.items` vs array) — handle both as already coded.

**Type consistency:** `StoredKey` / `StoredConfig` in Rust ↔ `StoredKeyView` / `AppConfigView` in TS; commands listed in Task 5 must match frontend invokes in Tasks 7–9.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-relay-token-monitor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
