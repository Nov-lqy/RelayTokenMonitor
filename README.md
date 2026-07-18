# RelayTokenMonitor

Windows 托盘应用：监控 CCTQ / New API 兼容中转站的账户余额、多 API Key 剩余额度，以及约 7 日 Token 用量趋势。

当前版本：**0.1.3**

基于 DeepSeekMonitorWindows（Tauri 2 + React + Rust）适配改造，**不是** DeepSeek 或 CCTQ 官方产品。

## 功能

- 账户余额（CNY，按 `quota / quota_per_unit`）
- 低余额颜色警示（默认阈值 5 元）
- 多 Key 管理：手动添加 `sk-`、可选从面板同步（同步仅建条目，完整 `sk-` 需手动粘贴）
- 近 7 日 Token 用量柱状图 + 按模型汇总
- **按当前令牌过滤用量**（Keys 页「设为当前」后，首页只统计该令牌）
- 中 / 英界面切换
- 系统托盘：左键显示/隐藏主面板
- 用量短时缓存，减轻刷新卡顿

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
| 用户 ID | 数字 ID，对应请求头 `New-Api-User`。在 CCTQ 控制台按 F12 → Network，从任意请求头复制 |
| API Keys | 手动添加完整 `sk-...`；「从面板同步」可导入令牌名称，但面板列表通常不返回完整 SK |
| 当前令牌 | Keys 页选中后点「设为当前」，首页模型/柱状图按该令牌名称过滤 |
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
npx tauri build
```

产物一般在 `src-tauri\target\release\bundle\nsis\`（例如 `RelayTokenMonitor_0.1.3_x64-setup.exe`）。

构建前请确保本机 `rustup default` 已配置，且 Visual Studio Build Tools（C++）可用。

## 技术栈

- Tauri 2
- React 18 + TypeScript + Vite
- Rust（`reqwest` 调用 New API：`/api/user/self`、`/api/log/self`、`/api/token/`、`/api/usage/token`）

## License

MIT
