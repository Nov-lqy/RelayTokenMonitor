# RelayTokenMonitor

Windows 托盘应用：监控 CCTQ / New API 兼容中转站的账户余额、多 API Key 剩余额度，以及约 7 日 Token 用量趋势。

基于 [DeepSeekMonitorWindows](https://github.com/)（Tauri 2 + React + Rust）适配改造，**不是** DeepSeek 或 CCTQ 官方产品。

## 功能

- 账户余额（CNY，按 `quota / quota_per_unit`）
- 低余额颜色警示（默认阈值 5 元）
- 多 Key 管理：手动添加 `sk-`、可选从面板同步
- 近 7 日 Token 用量柱状图 + 按模型汇总
- 中 / 英界面切换
- 系统托盘：左键显示/隐藏主面板

## 前置

- Windows 10/11
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)（MSVC 工具链）
- WebView2（Win10/11 通常已自带）

## 配置说明

| 项 | 说明 |
|----|------|
| Base URL | 默认 `https://www.cctq.ai` |
| Access Token | 从 CCTQ 控制台 → 个人设置 → **系统访问令牌** 复制粘贴 |
| API Keys | 手动添加 `sk-...`，或「从面板同步」 |
| 配置文件 | `%APPDATA%\RelayTokenMonitor\config.json` |

**安全：** 不要把 `config.json`、截图里的 Token/SK 提交到 Git 或发到公开群。

## 开发

```powershell
npm install
npm run tauri:dev
```

前端单独预览（无 Rust IPC）：

```powershell
npm run dev
```

## 打包（NSIS 安装包）

```powershell
npm install
npm run build
# 或使用仓库脚本：
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

产物一般在 `src-tauri\target\release\bundle\nsis\`。

## 技术栈

- Tauri 2
- React 18 + TypeScript + Vite
- Rust（`reqwest` 调用 New API：`/api/user/self`、`/api/log/self`、`/api/token/`、`/api/usage/token`）

## License

MIT
