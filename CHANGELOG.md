# Changelog

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
