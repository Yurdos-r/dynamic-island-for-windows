# Changelog

## 0.1.7 - 2026-06-29

### Fixed

- Fixed dismissed clipboard prompts not appearing again when the same text is copied after the prompt naturally disappears.
- Moved duplicate clipboard-text policy out of the native PowerShell helper so Windows clipboard update events for the same text still reach the main process.
- Kept fallback polling deduped so unchanged clipboard contents do not repeatedly trigger prompts.

### Tests

- Added coverage for dismissed repeated native clipboard text, fallback polling dedupe, and the native helper duplicate-filter guard.

## 0.1.6 - 2026-06-27

### Fixed

- Disabled opacity-based fade transitions for the main island window to avoid Windows transparent-layered-window redraw failures where the island becomes invisible while the hit area remains active.
- Kept the system monitor window on its existing off-screen parking visibility path.

### Tests

- Added coverage to ensure main-window show/hide no longer fades opacity to zero.

## 0.1.5 - 2026-06-27

### Added

- Confirmed clipboard history is now persisted to the app user data directory and restored after app or system restart.

### Fixed

- Deleting a clipboard history item and clearing clipboard history now update the persisted history file, so removed entries do not return after restart.

### Tests

- Added coverage for clipboard history restoration, durable accepted-item writes, durable deletion, and durable clearing.

## 0.1.4 - 2026-06-25

### Changed

- Privacy indicators now summarize multiple simultaneous permissions together instead of showing only one primary kind.
- Privacy detail text now lists all active permission kinds and their calling apps.

### Fixed

- Fixed the privacy capsule losing secondary active permission app names when camera and microphone were used at the same time.

### Tests

- Added coverage for multi-kind privacy snapshot normalization and combined privacy summary rendering.

## 0.1.3 - 2026-06-23

### Added

- Added lightweight Caps Lock and Num Lock status hints in the main island.
- Added a Settings toggle for keyboard lock hints.

### Fixed

- Fixed the classic-layout system monitor becoming hoverable/clickable but visually invisible.
- Changed the system monitor window hide/show path to park the transparent window off-screen at opacity 1 instead of using `hide()` or `setOpacity()`.
- Restored the right-bottom system monitor position and hit region after layout switches, taskbar visibility changes, and monitor setting changes.
- Reduced system monitor hover blur flicker by keeping the system glass blur stable across idle, hover, and expanded states.

### Tests

- Added coverage for keyboard lock monitoring, renderer hint behavior, settings sanitization, hover behavior, layout restoration, and system window visibility parking.

## 0.1.2 - 2026-06-22

### Changed

- Added threshold coloring for the system monitor tile meters.
- CPU tiles now turn red only for the portion above 70%.
- Memory tiles now keep the normal blue range through 70%, turn the portion above 70% orange, and turn the portion from 85% upward red.
- Added tile-meter tests for the CPU and memory threshold boundaries.

### Fixed

- Fixed memory warning styling so the entire memory metric no longer turns orange when memory usage passes 70%.
- Strengthened threshold tile CSS selectors so warning and alert colors override the default CPU/memory/GPU tile colors reliably.

## 0.1.1 - 2026-06-21

### Changed

- Added Windows installer output alongside the portable build.
- Updated GitHub download copy for installer and portable Windows x64 packages.
- Improved classic-layout system monitor placement near the taskbar.

### Fixed

- Fixed system monitor visibility and taskbar-band alignment in classic layout.
- Hardened local bridge/token handling and packaging paths.
