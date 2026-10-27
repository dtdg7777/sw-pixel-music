# sw-pixel-music — PIXEL MUSIC 8BIT

像素风网易云音乐播放器（v0.5.0，MIT）。无边框桌面窗口 + 本地音源代理。

**来源**：作者 `NB240520002`，以压缩包 `PIXEL-MUSIC-8BIT.zip` 交付，本仓库是解包后的源码部分。

## 它怎么工作

```
PixelMusic.exe (WinForms + WebView2 外壳, 12 KB)
   └─ 启动 bundled node，跑 server.js
        └─ http://127.0.0.1:8123  ← WebView2 加载 index.html
             └─ NeteaseCloudMusicApi  代理网易云接口 + 音频流
```

| 文件 | 作用 |
|---|---|
| `index.html` | 全部 UI（35 KB，单文件 PWA，像素风） |
| `server.js` | 本地服务：搜索 / 歌单 / 音源 / 扫码登录 / 歌词 / 封面代理 |
| `manifest.webmanifest` | PWA 清单 |
| `assets/` | 图标 + VT323 像素字体 |
| `node/node.exe` | 随包的 Node 运行时（91 MB，不入库） |
| `node_modules/` | 只有 `NeteaseCloudMusicApi` 一棵依赖树（不入库） |

## 跑起来

**发布形态**（双击即用）：
```
双击 PixelMusic.exe → 等 3~5 秒 → 窗口出现
```
需要 `node/` 与 `node_modules/` 在位（压缩包里自带）。

**开发形态**（不需要 exe）：
```powershell
node server.js            # 需要 node_modules，先 npm install
# 浏览器打开 http://127.0.0.1:8123
```

快捷键：`SPACE` 播放/暂停、`←/→` 切歌、输入框回车搜索。

## 登录与凭证

右上角「未登录」→ 二维码 → 手机网易云扫码。凭证只写本机 `.cookie.txt`（mode 0600），
**已在 `.gitignore` 里，永远不要提交**。删掉该文件即退出登录。

## 安全与合规（务必知道）

- 服务只监听 `127.0.0.1:8123`，不对外暴露
- `/img` 代理有域名白名单（仅 `*.126.net` / `*.music.126.net` / `netease.com`）
- 调用的是网易云**非公开接口**（`NeteaseCloudMusicApi`），仅供个人学习/自用；
  分发或商用有合规风险
- 启动器未签名，首次运行 Windows 会提示「已保护你的电脑」

## 已知代码问题（不影响使用，待修）

1. `server.js` 静态目录边界检查用 `file.startsWith(ROOT)`，缺少路径分隔符 ——
   理论上 `ROOT` 同级的 `PIXEL MUSIC2/...` 能绕过。本地服务风险低，但应该改成
   `path.resolve` 后比较 `ROOT + path.sep`。
2. `/api/logout` 等无 CSRF 防护 —— 同样因为只听 localhost 而风险低。

## 未包含的东西

- **`PixelMusic.exe` 的源码没有随包提供**（WinForms + WebView2 宿主）。
  仓库里只有可执行文件，且已 gitignore。要能重建启动器，需要那个 C# 工程。
- `node/node.exe` 与 `node_modules/` 是运行时，不入库；需要时按 `package.json` 重装。

## 目录

```
index.html  server.js  package.json  manifest.webmanifest  README.txt
assets/            图标与字体（入库）
node/ node_modules/ tmp/ wv2-data/    运行时（忽略）
PixelMusic.exe  *.dll                启动器与 WebView2 SDK（忽略）
```
