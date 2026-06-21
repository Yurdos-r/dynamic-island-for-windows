# Dynamic Island for Windows Repair Report

Date: 2026-06-21

## Summary

This report records the risk remediation work completed for Dynamic Island for Windows. The repair focused on Electron renderer hardening, local bridge authentication, file bridge path safety, duplicate window prevention, test coverage, type checking, and mojibake cleanup.

All planned verification commands passed:

- `npm.cmd run test`
- `npm.cmd run build`
- `npm.cmd run check`
- `git diff --check`

## Fixed Risks

### Electron Renderer Hardening

- Enabled `sandbox: true` for the Electron renderer.
- Kept `contextIsolation: true` and `nodeIntegration: false`.
- Updated `preload.js` so it no longer imports local shared files through `require("../shared/...")`.
- Inlined preload IPC channel names and allowed value sets to keep the sandboxed preload self-contained.

### Local Bridge Authentication

- Added required HTTP header:

```text
X-Dynamic-Island-Bridge-Token
```

- All non-`OPTIONS` bridge HTTP routes now require a valid token:
  - `/dynamic-island-bridge/status`
  - `/dynamic-island-bridge/snapshot`
  - `/dynamic-island-bridge/result`
  - `/dynamic-island-bridge/command`

- Unauthorized requests return `401` and do not expose bridge status, snapshots, pending commands, or results.
- Added persistent per-install bridge token generation.
- Token files are written as `bridge-token.json` in bridge directories.

### File Bridge v2

- File bridge payloads now use version 2.
- Snapshot/result payloads must include:

```text
bridgeToken
```

- Legacy v1 payloads without `bridgeToken` are ignored.
- Commands written by the desktop app include:
  - `bridge`
  - `version`
  - `bridgeToken`
  - `command`
  - `updatedAt`

### Bridge Directory Safety

- Added support for:

```text
DYNAMIC_ISLAND_BRIDGE_DIR
```

- Default bridge directory now resolves under the app userData runtime path.
- `C:\betterncm\dynamic-island-bridge` is retained only as a legacy candidate directory, not as the sole hardcoded bridge path.

### BetterNCM Plugin Upgrade

- Updated BetterNCM bridge plugin version to `0.5.0`.
- Plugin now reads `bridge-token.json`.
- Plugin sends `X-Dynamic-Island-Bridge-Token` for HTTP bridge requests.
- Plugin writes file bridge v2 snapshot/result payloads with `bridgeToken`.
- Older plugin versions are expected to fail against the new secured bridge.

### Duplicate Window Prevention

- `createWindow()` now reuses an existing main window when one exists.
- `createSystemWindow()` now reuses an existing system window when one exists.
- The app `activate` event now shows/reuses existing windows instead of creating new ones.
- Added test-only dependency injection points for window creation so reuse behavior can be verified without launching Electron.

### Type Checking and Tests

- Added Vitest.
- Added npm scripts:

```json
"test": "vitest run",
"check": "npm run test && npm run build"
```

- Enabled `checkJs: true`.
- Scoped JS checking to the high-risk repaired modules and TypeScript renderer code.
- Added tests for:
  - Bridge HTTP token rejection and acceptance.
  - File bridge v1 rejection and v2 acceptance.
  - Bridge/media normalizer sanitization.
  - Clipboard controller normalization.
  - Main/system window reuse.
  - Mojibake regression detection.

### Mojibake Cleanup

- Repaired user-facing Chinese text in renderer state labels and aria labels.
- Rewrote README Chinese content in readable UTF-8.
- Replaced mojibake comments in CSS with concise readable English comments.
- Added a test guard to detect known mojibake fragments in source, docs, scripts, and integrations.

## Verification Results

### Unit Tests

Command:

```bash
npm.cmd run test
```

Result:

```text
6 test files passed
11 tests passed
```

### Build

Command:

```bash
npm.cmd run build
```

Result:

```text
tsc --noEmit passed
vite build passed
```

### Full Check

Command:

```bash
npm.cmd run check
```

Result:

```text
test passed
build passed
```

### Diff Hygiene

Command:

```bash
git diff --check
```

Result:

```text
passed
```

## Important Compatibility Notes

- The local bridge now follows a security-first policy.
- Older BetterNCM bridge plugins are rejected because they do not know the per-install token.
- Users must update the BetterNCM bridge plugin to `0.5.0` or later.
- If `DYNAMIC_ISLAND_BRIDGE_DIR` is configured, both the desktop app and BetterNCM plugin must be able to access the same bridge directory.

## Remaining Risk

`npm audit --audit-level=high` still reports high-severity vulnerabilities in `undici` through the Electron dependency chain:

- `electron`
- `@electron/get`
- `undici`

The audit output reports:

```text
No fix available
```

No automatic dependency fix was applied because it would require upstream Electron dependency changes or a deliberate Electron upgrade decision.

## Recommended Manual Acceptance

Before release, perform a real desktop smoke test:

1. Start the updated desktop app.
2. Install the updated BetterNCM bridge plugin.
3. Confirm media snapshot updates: title, artist, cover, progress, lyrics.
4. Confirm commands: play/pause, previous, next, seek, favorite.
5. Confirm unauthenticated local requests to `127.0.0.1:32147` return `401`.
6. Confirm app activation and tray show actions do not create duplicate windows.

