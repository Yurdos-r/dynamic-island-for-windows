# Changelog

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
