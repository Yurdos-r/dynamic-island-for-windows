# Dynamic Island Bridge for BetterNCM

This small BetterNCM plugin connects Dynamic Island for Windows to InfLink-rs inside NetEase Cloud Music.

It reports current song metadata, cover URL, playback state, timeline progress, favorite state, and synced lyrics to the island, then forwards island media commands back through NetEase Cloud Music and `window.InfLinkApi`.

## Requirements

- BetterNCM installed in NetEase Cloud Music.
- InfLink-rs installed and enabled.
- Dynamic Island for Windows running on the same Windows user session.

## Install

Copy this whole `betterncm-dynamic-island-bridge` folder into your BetterNCM plugins directory, then restart NetEase Cloud Music.

When it is loaded, the plugin talks to `http://127.0.0.1:32147/dynamic-island-bridge`.

Supported commands:

- `seek`: calls `window.InfLinkApi.seekTo(positionMs)`.
- `toggle-play`: calls `play()` or `pause()` based on the current InfLink-rs playback state.
- `previous-track`: calls `previous()`.
- `next-track`: calls `next()`.
- `favorite-track`: toggles the current song by clicking NetEase Cloud Music's own player favorite button, with InfLink-rs favorite/like API probing kept as a fallback.
