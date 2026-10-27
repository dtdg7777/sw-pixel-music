# AGENTS.md — sw-pixel-music（软件项目）

> 项目级规则。跨机共识见 hub 的 `AGENTS.md`，**不要在这里重复**。
> 本机专属事实写在 `AGENTS.local.md`（已 gitignore）。

## 这是什么

像素风网易云音乐播放器：WinForms + WebView2 桌面外壳，配一个只监听 `127.0.0.1:8123`
的本地 Node 服务（`server.js`），前端是单文件 `index.html`。
**当前阶段**：v0.5.0 可用（搜索 / 歌单 / 音源 / 扫码登录 / 歌词），等待补启动器源码。

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | 全部 UI（单文件，像素风） |
| `server.js` | 本地服务：搜索 / 歌单 / 音源 / 扫码登录 / 歌词 / 封面代理 |
| `assets/` | 图标 + VT323 字体 |
| `node/` `node_modules/` `tmp/` `wv2-data/` | 运行时（gitignore） |
| `PixelMusic.exe` `*.dll` | 启动器与 WebView2 SDK（gitignore） |

## 本项目的硬约束

- **`.cookie.txt` 是账号凭证**：绝不能入库、不能贴进对话。已在 `.gitignore`
- **服务只绑 `127.0.0.1`**，不要改成 `0.0.0.0`；`/img` 的域名白名单也不要放宽
- 调用的是网易云**非公开接口**，仅供个人自用；不要做成可公开分发的服务
- 改 `server.js` 后至少手测三件事：搜索返回、`/api/status` 正常、`/` 能打开

## 已知待修

1. 静态文件边界检查 `file.startsWith(ROOT)` 缺路径分隔符，应改 `path.resolve` + `ROOT + path.sep`
2. `/api/logout` 等无 CSRF 防护（本地服务风险低）

## 与 hub 的关系

单机项目，不需要多机认领协议。要跨机器并行时走 hub 的 `tasks/`。
