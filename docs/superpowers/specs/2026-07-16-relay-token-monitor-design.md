# RelayTokenMonitor - Design Spec

**Date:** 2026-07-16  
**Status:** Draft for user review  
**Primary target:** CCTQ (https://www.cctq.ai) - New API-compatible relay  
**Base codebase:** Fork/adapt DeepSeekMonitorWindows (Tauri 2 + React + Rust)

## 1. Goal

Build a Windows tray monitor (UX close to DeepSeekMonitorWindows) that:

- Shows account balance for a New API-compatible relay (default CCTQ)
- Supports many API keys under one base_url, with a manageable key list
- Shows usage history (about 7-day trend + per-model summary)
- Warns on low balance via color change only (no toast / sound / nagging)

v1 does NOT auto-fetch model pricing or estimate spend from /api/pricing.

## 2. Context and decisions

| Topic | Decision |
|-------|----------|
| Relay type | New API / One API-style panel |
| Site | CCTQ: https://www.cctq.ai (API alt: https://cf-fast.cctq.ai) |
| Auth | Panel Access Token and multiple sk- keys |
| Form factor | Windows tray + main panel (like DeepSeek monitor) |
| Stack | Tauri 2 + React + TypeScript + Rust (same as DeepSeekMonitorWindows) |
| Approach | Fork/adapt DeepSeekMonitorWindows; replace DeepSeek APIs with relay adapter |
| Pricing | Out of v1 scope |
| Multi-site | Out of v1 scope |
| Alerts | Color only when below threshold |

Verified on CCTQ (public endpoints):

- GET /api/status -> quota_per_unit: 500000, quota_display_type: CNY, display_in_currency: true
- GET /api/pricing -> public catalog exists, but unused in v1

## 3. Architecture

```
React UI (WebView2) - Home | Key Manager | Settings | Model detail
  -> Tauri commands ->
Rust (config store, tray, single-instance, reqwest, refresh scheduler)
  -> HTTPS ->
CCTQ / New API (/api/user/self, /api/log/self[/stat], /api/token/, /api/usage/token)
```

Units:

- config: load/save settings and keys locally
- relay_client: typed New API calls
- refresh: poll loop, backoff, cache last success
- tray: icon, menu, show/hide window
- ui: panels, charts, key CRUD, masking

## 4. Data and APIs

### 4.1 Config fields

- base_url - default https://www.cctq.ai
- access_token - panel user token
- keys[] - { id, name, sk, note, enabled, last_known_remaining? }
- refresh_interval_seconds - default 60
- auto_refresh_enabled - default true
- low_balance_threshold - CNY for color warning
- quota_per_unit - default 500000 (configurable)
- autostart - optional
- UI prefs as needed

Storage path: %APPDATA%\RelayTokenMonitor\ (do not reuse DeepSeekMonitorWindows folder).

### 4.2 Endpoints (v1)

- Account balance: GET /api/user/self (Access Token)
- Usage logs: GET /api/log/self (Access Token)
- Usage stats: GET /api/log/self/stat (Access Token)
- List keys: GET /api/token/ (Access Token)
- Per-key remaining: GET /api/usage/token (Bearer sk-...)

Headers: Authorization Bearer token. Optional New-Api-User flag if needed.

### 4.3 Display mapping

- Balance CNY ~= (quota - used_quota) / quota_per_unit (map fields flexibly after probe)
- Trend / model summary from log + stat over last 7 days
- Low balance: remaining < threshold -> warn color

### 4.4 Refresh policy

- Default 60s
- On failure: exponential backoff 60->120->240... cap 10 min; reset after success
- Always refresh account balance; lazy per-key refresh for selected/visible keys

## 5. UI

Tray: residence; open panel; menu Show / Refresh / Quit.

Home: CNY balance with low-balance color; ~7-day trend; today/month overview; per-model summary.

Key manager: list with note, remaining, status; add/edit/delete/set current; Access Token only in Settings.

Settings: Base URL, Access Token, refresh interval, threshold, autostart, connection probe. No pricing sync in v1.

## 6. Security

- Tokens/keys on device only; no telemetry
- UI masks secrets; reveal requires click
- gitignore local secrets; document screenshot warning
- single-instance to avoid concurrent writes

## 7. Error handling

- 401: clear message + Settings CTA; do not wipe keys
- Network: keep last success + cached at timestamp
- Partial 404: probe marks failures; degrade
- One key failure: that row only
- Empty logs: empty chart state

## 8. Out of scope (v1)

- Auto /api/pricing and spend estimates
- Notifications / sound / flash
- Multiple relay sites
- Cloud sync
- Non-Windows

## 9. Testing and acceptance

Tests: CCTQ smoke; config CRUD; key CRUD + masking; tray/single-instance/auto-refresh; low-balance color.

Acceptance:

1. CCTQ Access Token -> account balance CNY visible
2. Multiple keys managed; remaining/status refresh works
3. ~7-day trend + per-model summary visible
4. Below threshold -> color warning; token expiry -> clear prompt

## 10. Implementation note

Start from DeepSeekMonitorWindows Tauri source: keep tray, panels, charts, refresh loop; replace DeepSeek balance + web usage-token flow with relay client; rebrand to RelayTokenMonitor and new AppData path.
