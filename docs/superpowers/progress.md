# RelayTokenMonitor 进度

**更新日期：** 2026-07-16  
**分支：** `feat/relay-token-monitor`  
**计划：** `docs/superpowers/plans/2026-07-16-relay-token-monitor.md`  
**规格：** `docs/superpowers/specs/2026-07-16-relay-token-monitor-design.md`

## 总览

约 **25%**（11 个 Task 中完成 1–3）。后端模块拆分中；前端 / CCTQ 联调尚未开始。

| Task | 内容 | 状态 |
|------|------|------|
| 1 | 从 DeepSeekMonitorWindows 脚手架 + 换品牌 | 已完成 |
| 2 | `config` 模块（AppData、默认值、mask、单测） | 已完成 |
| 3 | `aggregate` 模块（quota→CNY、按日/模型、单测） | 已完成（代码） |
| 4 | `relay` HTTP 客户端（CCTQ/New API） | 未开始 |
| 5 | Tauri commands + 去掉 DeepSeek usage sync | 未开始 |
| 6 | 前端 `types` + zh/en i18n | 未开始 |
| 7 | 设置面板（Access Token + probe） | 未开始 |
| 8 | 首页（余额 + 7 日图 + 模型） | 未开始 |
| 9 | 多 Key 管理 UI | 未开始 |
| 10 | 托盘 / 错误 UX / 语言切换收尾 | 未开始 |
| 11 | README + NSIS 安装包冒烟 | 未开始 |

## 已落地文件

- `src-tauri/src/config.rs` — `StoredConfig` / 读写 `%APPDATA%\RelayTokenMonitor\` / `mask_secret`
- `src-tauri/src/aggregate.rs` — `quota_to_cny` / `remaining_cny` / `aggregate_by_*`
- `src-tauri/src/lib.rs` — 已 `mod config;` `mod aggregate;`（主体仍是 DeepSeek 旧逻辑）
- `src-tauri/Cargo.toml` — 已加 `chrono`
- 文档：design spec + implementation plan

## 关键（续作入口）

1. **Task 4：** 新建 `src-tauri/src/relay.rs`（`/api/user/self`、`/api/usage/token`、`/api/log/self`、`/api/token/`）
2. **Task 5：** `commands.rs` 接线，删除 DeepSeek login-sync / usage-token 路径
3. 之后按计划做前端 Tasks 6–11

对 agent 说即可：`按 progress.md 从 Task 4 继续`

## 备份提示

本仓库暂无 git remote。上次桌面备份示例：

- `Desktop\RelayTokenMonitor-20260716-0343.bundle`
- `Desktop\RelayTokenMonitor-20260716-0343.zip`

额度将尽前建议再 `git commit` + 更新桌面 bundle/zip。
