# Dynamic Island for Windows

Windows 桌面动态岛原型，基于 Electron + Vite 构建。它会在桌面顶部显示一个透明、置顶的动态岛，用于媒体播放、隐私状态、剪贴板操作和系统监控。

<p>
  <img src="assets/app-icon.png" width="96" alt="Dynamic Island for Windows app icon">
</p>

## 中文

### 下载

Windows x64 版本。

推荐下载：

- [Windows 动态岛安装 0.1.0.exe](https://github.com/Yurdos-r/dynamic-island-for-windows/releases/download/v0.1.0/Dynamic.Island.for.Windows.Setup.0.1.0.exe)：安装程序，带有开始菜单/桌面快捷方式，支持卸载。

便携替代方案：

- [Dynamic.Island.for.Windows.0.1.0.exe](https://github.com/Yurdos-r/dynamic-island-for-windows/releases/download/v0.1.0/Dynamic.Island.for.Windows.0.1.0.exe)：双击即可启动的便携构建。

备注：

- 当前构建未签名，Windows 或安全软件可能在首次启动时发出警告。
- 暂无自动更新和代码签名。
- 运行时日志会写入 `%APPDATA%\Dynamic Island for Windows\island-startup.log`。

### 功能

- 透明无边框桌面动态岛，支持胶囊、小岛和卡片状态。
- 默认顶部居中显示，也保留经典布局选项。
- 媒体界面支持专辑封面、歌曲信息、播放控制、进度跳转、喜欢状态和同步歌词。
- 隐私胶囊显示麦克风、摄像头和位置状态。
- 剪贴板提示和剪贴板历史界面。
- 系统监控胶囊显示 CPU、内存、GPU、磁盘和运行时间。
- 设置中可调整玻璃样式、布局、系统监控显示和 Windows 开机自启动。
- 托盘菜单支持显示动态岛、切换状态和退出应用。
- 支持 Windows x64 安装包和便携 `.exe`，内置渲染资源和 PowerShell 原生辅助脚本。

### 从源码运行

```bash
npm install
npm run dev
```

`npm run dev` 会启动 Vite `http://127.0.0.1:5173`，并用软件渲染模式打开 Electron，提升当前 Windows 环境兼容性。

本地生产模式运行：

```bash
npm start
```

### 构建 Windows 包

```bash
npm run dist:win
```

`npm run dist:win` 会同时生成两种格式：

- 安装包：`release/Dynamic Island for Windows Setup 0.1.0.exe`
- 便携版：`release/Dynamic Island for Windows 0.1.0.exe`

也可以单独构建：

```bash
npm run dist:installer
npm run dist:portable
```

生成的包用于 GitHub Releases，不建议提交到仓库。

打包运行时使用 Electron 默认用户数据目录，启动日志写入：

```text
%APPDATA%\Dynamic Island for Windows\island-startup.log
```

开发环境用户数据位于：

```text
.tmp/dynamic-island-user-data/
```

### 隐私

Dynamic Island for Windows 在本地运行。应用会读取本机 Windows 媒体/会话状态、隐私指示器、剪贴板数据和系统指标，用于渲染桌面动态岛。项目没有内置远程分析或遥测服务。

剪贴板监听仅在本地应用会话中使用。BetterNCM 桥接服务只监听 `127.0.0.1`。

### 网易云音乐 + InfLink-rs

网易云音乐可以通过 Windows 媒体会话暴露歌曲信息，但很多版本不会提供可跳转的播放进度。为了获得更准确的歌曲信息、进度和控制能力，可以配合 `integrations/betterncm-dynamic-island-bridge` 中的 BetterNCM 桥接插件和 InfLink-rs 使用。

安装方式：

1. 在网易云音乐中安装并启用 BetterNCM 和 InfLink-rs。
2. 将 `integrations/betterncm-dynamic-island-bridge` 复制到 BetterNCM 插件目录。
3. 重启网易云音乐。
4. 启动 Dynamic Island for Windows。

桥接插件只监听 `127.0.0.1:32147`。它会读取 `window.InfLinkApi` 和 BetterNCM 的网易云上下文，将当前歌曲信息、播放进度、喜欢状态和同步歌词发送给动态岛，并把播放/暂停、上一首、下一首、跳转和喜欢命令转发回网易云音乐/InfLink-rs。

### 仓库维护

仓库不会提交本地依赖、构建产物、运行数据、日志、本地备份和二进制运行依赖：

- `node_modules/`
- `dist/`
- `release/`
- `.tmp/`
- `.omc/`
- `*.log`
- `betterncm.dll`
- `modularization-backups/`

### 路线图

- 原生电池和电源状态提供器。
- 音量提供器和输出设备控制。
- 专注计时器和快捷操作。
- 通知捕获或应用事件适配器。
- 多显示器定位和可配置屏幕边缘位置。
- 代码签名和更新流程。

## English

### Download

Windows x64 release.

Recommended download:

- [Dynamic Island for Windows Setup 0.1.0.exe](https://github.com/Yurdos-r/dynamic-island-for-windows/releases/download/v0.1.0/Dynamic.Island.for.Windows.Setup.0.1.0.exe): installer with Start Menu/Desktop shortcuts and uninstall support.

Portable alternative:

- [Dynamic.Island.for.Windows.0.1.0.exe](https://github.com/Yurdos-r/dynamic-island-for-windows/releases/download/v0.1.0/Dynamic.Island.for.Windows.0.1.0.exe): portable build that can be launched by double-clicking.

Notes:

- The current builds are unsigned, so Windows or security software may warn on first launch.
- There is no auto-update flow or code signing yet.
- Runtime logs are written to `%APPDATA%\Dynamic Island for Windows\island-startup.log`.

### Features

- Transparent frameless desktop island with capsule, island, and card states.
- Default top-center layout with an optional classic layout.
- Media surface with album art, metadata, playback controls, progress seeking, favorite state, and synced lyrics.
- Privacy capsule for microphone, camera, and location activity.
- Clipboard prompt and clipboard history surface.
- System monitor capsule for CPU, memory, GPU, disk, and uptime data.
- Settings for glass style, layout, system monitor visibility, and Windows login auto-start.
- Tray menu for showing the island, switching states, and quitting the app.
- Windows x64 installer and portable `.exe` builds with bundled renderer assets and native PowerShell helpers.

### Run From Source

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on `http://127.0.0.1:5173` and opens the Electron app with software rendering enabled for better compatibility on this Windows build.

For a local production-style run without the Vite dev server:

```bash
npm start
```

### Build Windows Packages

```bash
npm run dist:win
```

`npm run dist:win` builds both release formats:

- Installer: `release/Dynamic Island for Windows Setup 0.1.0.exe`
- Portable: `release/Dynamic Island for Windows 0.1.0.exe`

You can also build a single format:

```bash
npm run dist:installer
npm run dist:portable
```

Generated packages are intended for GitHub Releases, not for committing to the repository.

Packaged runs use Electron's normal user data directory. Startup logs are written to:

```text
%APPDATA%\Dynamic Island for Windows\island-startup.log
```

Development runs store user data under:

```text
.tmp/dynamic-island-user-data/
```

### Privacy

Dynamic Island for Windows runs locally. The app reads local Windows media/session state, privacy indicators, clipboard data, and system metrics only to render the desktop island. It does not include a remote analytics or telemetry service.

Clipboard monitoring is local to the app session. The BetterNCM bridge listens on `127.0.0.1` only.

### NetEase Cloud Music + InfLink-rs

NetEase Cloud Music can expose song metadata through Windows media sessions, but many builds do not expose a seekable timeline. For more precise metadata, progress, and controls, use the BetterNCM bridge in `integrations/betterncm-dynamic-island-bridge` alongside InfLink-rs.

Install:

1. Install and enable BetterNCM and InfLink-rs in NetEase Cloud Music.
2. Copy `integrations/betterncm-dynamic-island-bridge` into the BetterNCM plugins directory.
3. Restart NetEase Cloud Music.
4. Start Dynamic Island for Windows.

The bridge listens only on `127.0.0.1:32147`. It reads `window.InfLinkApi` and BetterNCM's NetEase context, posts current song metadata, progress, favorite state, and synced lyrics to the island, and forwards play/pause, previous, next, seek, and favorite commands back to NetEase Cloud Music/InfLink-rs.

### Repository Hygiene

The repository intentionally excludes local dependencies, generated builds, runtime data, logs, local backup archives, and binary runtime dependencies:

- `node_modules/`
- `dist/`
- `release/`
- `.tmp/`
- `.omc/`
- `*.log`
- `betterncm.dll`
- `modularization-backups/`

### Roadmap

- Native battery and power status provider.
- Volume provider and device output controls.
- Focus timer and quick actions.
- Notification capture or app event adapters.
- Per-monitor positioning and user-configurable screen edge placement.
- Code signing and update workflow.

## License

MIT
