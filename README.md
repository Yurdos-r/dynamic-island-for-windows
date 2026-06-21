# Dynamic Island for Windows

A Windows-first Dynamic Island prototype built with Electron and Vite. It creates a transparent, always-on-top desktop island for media playback, privacy status, clipboard actions, and system monitoring.

<p>
  <img src="assets/app-icon.png" width="96" alt="Dynamic Island for Windows app icon">
</p>

## Features

- Transparent frameless desktop island with capsule, island, and card states.
- Default top-center layout with an optional classic layout.
- Media surface with album art, metadata, playback controls, progress seeking, favorite state, and synced lyrics.
- Privacy capsule for microphone, camera, and location activity.
- Clipboard prompt and clipboard history surface.
- System monitor capsule for CPU, memory, GPU, disk, and uptime data.
- Settings for glass style, layout, system monitor visibility, and Windows login auto-start.
- Tray menu for showing the island, switching states, and quitting the app.
- Portable Windows x64 `.exe` build with bundled renderer assets and native PowerShell helpers.

## Run From Source

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on `http://127.0.0.1:5173` and opens the Electron app with software rendering enabled for better compatibility on this Windows build.

For a local production-style run without the Vite dev server:

```bash
npm start
```

## Build Portable EXE

```bash
npm run dist:portable
```

The portable Windows x64 executable is written to `release/`. The generated file is intended for GitHub Releases, not for committing to the repository.

Packaged runs use Electron's normal user data directory. Startup logs are written to:

```text
%APPDATA%\Dynamic Island for Windows\island-startup.log
```

Development runs store user data under:

```text
.tmp/dynamic-island-user-data/
```

## GitHub Release Notes

- Upload `release/Dynamic Island for Windows 0.1.0.exe` as a Release asset.
- The current portable build is unsigned, so Windows or security software may show a warning on first launch.
- There is no installer, auto-update flow, or code signing yet.

## Privacy

Dynamic Island for Windows runs locally. The app reads local Windows media/session state, privacy indicators, clipboard data, and system metrics only to render the desktop island. It does not include a remote analytics or telemetry service.

Clipboard monitoring is local to the app session. The BetterNCM bridge listens on `127.0.0.1` only.

## NetEase Cloud Music + InfLink-rs

NetEase Cloud Music can expose song metadata through Windows media sessions, but many builds do not expose a seekable timeline. For more precise metadata, progress, and controls, use the BetterNCM bridge in `integrations/betterncm-dynamic-island-bridge` alongside InfLink-rs.

Install:

1. Install and enable BetterNCM and InfLink-rs in NetEase Cloud Music.
2. Copy `integrations/betterncm-dynamic-island-bridge` into the BetterNCM plugins directory.
3. Restart NetEase Cloud Music.
4. Start Dynamic Island for Windows.

The bridge listens only on `127.0.0.1:32147`. It reads `window.InfLinkApi` and BetterNCM's NetEase context, posts current song metadata, progress, favorite state, and synced lyrics to the island, and forwards play/pause, previous, next, seek, and favorite commands back to NetEase Cloud Music/InfLink-rs.

## Repository Hygiene

The repository intentionally excludes local dependencies, generated builds, runtime data, logs, local backup archives, and binary runtime dependencies:

- `node_modules/`
- `dist/`
- `release/`
- `.tmp/`
- `.omc/`
- `*.log`
- `betterncm.dll`
- `modularization-backups/`

## Roadmap

- Native battery and power status provider.
- Volume provider and device output controls.
- Focus timer and quick actions.
- Notification capture or app event adapters.
- Per-monitor positioning and user-configurable screen edge placement.
- Installer, code signing, and update workflow.

## License

MIT
