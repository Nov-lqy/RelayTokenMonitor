# RelayTokenMonitor 进度

**更新日期：** 2026-07-16  
**分支：** `feat/relay-token-monitor`  
**计划：** `docs/superpowers/plans/2026-07-16-relay-token-monitor.md`  
**规格：** `docs/superpowers/specs/2026-07-16-relay-token-monitor-design.md`

## 总览

约 **100%**（11 个 Task 全部完成）。NSIS 冒烟已通过：`npx tauri build` 产出 `RelayTokenMonitor_0.1.0_x64-setup.exe`；Rust 单测 9/9 通过；前端 `npm run build` 通过。

| Task | 内容 | 状态 |
|------|------|------|
| 1 | 从 DeepSeekMonitorWindows 脚手架 + 换品牌 | 已完成 |
| 2 | `config` 模块（AppData、默认值、mask、单测） | 已完成 |
| 3 | `aggregate` 模块（quota→CNY、按日/模型、单测） | 已完成 |
| 4 | `relay` HTTP 客户端（CCTQ/New API） | 已完成 |
| 5 | Tauri commands + 去掉 DeepSeek usage sync | 已完成 |
| 6 | 前端 `types` + zh/en i18n | 已完成 |
| 7 | 设置面板（Access Token + probe） | 已完成 |
| 8 | 首页（余额 + 7 日图 + 模型） | 已完成 |
| 9 | 多 Key 管理 UI | 已完成 |
| 10 | 托盘 / 错误 UX / 语言切换收尾 | 已完成 |
| 11 | README + NSIS 安装包冒烟 | 已完成 |

## 验证记录（2026-07-16）

- `npm run build` — 通过
- `cargo test`（src-tauri，VS DevCmd）— 9 passed
- `npx tauri build` — NSIS `RelayTokenMonitor_0.1.0_x64-setup.exe` 生成成功

## 可选后续

1. 本机安装一次安装包做二次冒烟（托盘弹出 / 设置 Access Token）

## Logo（2026-07-16）

按 `docs/superpowers/specs/2026-07-16-relay-logo-design.md` / `docs/superpowers/plans/2026-07-16-relay-logo.md`：

- 源 SVG：`assets/brand/relay-mark.svg`（+ 16px 简化版）
- 托盘 / NSIS：`src-tauri/icons/*` 已用 `tauri icon` 从 1024 master 重生
- 应用内 `BrandIcon` 已换成双弧中转 mark（无底板）

## 修复记录

- **2026-07-16：** CCTQ/New API 管理接口需 `New-Api-User` 数字用户 ID；设置页增加「用户 ID」，请求头自动携带。
- **2026-07-17：** 首页用量按「当前令牌」过滤（`/api/log/self?token_name=`）；模型区限高约 2 行可滚动，避免挡住 7 日柱状图。见 `docs/superpowers/specs/2026-07-17-current-token-usage-filter-design.md`。
- **2026-07-17：** 响应优化：复用 HTTP Client、超时 8s、用量内存缓存 45s；自动刷新可走缓存，手动刷新强制更新。
- **2026-07-17：** 版本升至 **0.1.1**（令牌过滤 / 误报修复 / 性能缓存）。
- **2026-07-18：** 用量少算修复：`/api/log/self` 按 `total` 分页拉全；模型「已用配额」与同步密钥剩余额度统一为 CNY。
- **2026-07-18：** 七日柱状图按**本地自然日分段拉取**日志，避免「今日请求过多 + 倒序分页 5k 上限」把前 6 天截成 0；`created_at` 兼容毫秒时间戳。版本 **0.1.3**。
