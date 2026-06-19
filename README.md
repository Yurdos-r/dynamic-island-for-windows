# Dynamic Island for Windows

A Windows-first Dynamic Island prototype inspired by Ripple. It uses Electron for the transparent always-on-top desktop window and Vite for the renderer.

## Run

```bash
npm install
npm run dev
```

`npm run dev` starts a Vite development server on `http://127.0.0.1:5173` for hot reload, then opens the Electron island at the top center of the display nearest the cursor.

For a local app run without the Vite development server:

```bash
npm start
```

`npm start` builds the renderer and loads `dist/index.html` directly in Electron.

## Current Features

- Transparent, frameless, always-on-top Electron window.
- Centered Windows desktop island with three user-facing states: 胶囊, 小岛, 卡片.
- 胶囊 is the default compact state, 小岛 is the first click expansion, and 卡片 is the deeper expansion from 小岛.
- Hover-to-breathe and click-to-expand interaction.
- Tray menu with show, 胶囊, 卡片, and quit actions.
- Renderer media surface with album art, track metadata, playback controls, progress seeking, favorite state/control, and synced lyric detail view.
- Privacy monitoring capsule for microphone, camera, and location usage, with app details shown after expanding to 小岛.
- Windows media session polling for current track metadata, progress, and transport controls.
- NetEase Cloud Music integration through InfLink-rs plus a local fallback adapter for metadata and basic controls.
- Sandboxed preload bridge for renderer-to-main IPC.
- Startup log with size cap at `island-startup.log`.

## NetEase Cloud Music + InfLink-rs

NetEase Cloud Music can expose song metadata through Windows media sessions, but many builds do not expose a seekable timeline. For precise metadata, progress, and controls, use the BetterNCM bridge in `integrations/betterncm-dynamic-island-bridge` alongside InfLink-rs.

Install:

1. Install and enable BetterNCM and InfLink-rs in NetEase Cloud Music.
2. Copy `integrations/betterncm-dynamic-island-bridge` into the BetterNCM plugins directory.
3. Restart NetEase Cloud Music.
4. Start Dynamic Island for Windows.

The bridge listens only on `127.0.0.1:32147`. It reads `window.InfLinkApi` and BetterNCM's NetEase context, posts current song metadata/progress/favorite state/synced lyrics to the island, and forwards play/pause, previous, next, seek, and favorite commands back to NetEase Cloud Music/InfLink-rs.

## Next Windows Integrations

- Native battery and power status provider.
- Volume provider and device output controls.
- Focus timer and quick actions.
- Clipboard history provider.
- Notification capture or app event adapters.
- Per-monitor positioning and user-configurable screen edge placement.
- Auto-start and settings persistence.
- App icon, package metadata, and installer workflow.
