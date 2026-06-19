const fs = require("node:fs");

const {
  FILE_COMMAND_PATH,
  FILE_RESULT_PATH,
  FILE_RESULT_POLL_INTERVAL_MS,
  FILE_SNAPSHOT_PATH
} = require("./bridge-contract");
const { createPublicCommand, normalizeBridgeSnapshot, normalizeFavoriteState } = require("./bridge-normalizer");
const { ensureFileBridgeDir, readJsonFile, writeJsonFile } = require("./file-bridge");

function createBridgeFilePoller(options = {}) {
  const runtime = options.runtime;
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};

  if (!runtime) {
    throw new Error("runtime is required to create bridge file poller.");
  }

  const bridgeState = runtime.state;

  function ensureBridgeDir() {
    try {
      ensureFileBridgeDir();
    } catch (error) {
      logStartup("inflink-file-bridge-error", {
        action: "mkdir",
        error: error?.message || String(error)
      });
    }
  }

  function readFileSnapshot(maxAgeMs) {
    let stats;
    try {
      stats = fs.statSync(FILE_SNAPSHOT_PATH);
    } catch {
      return undefined;
    }

    if (Date.now() - stats.mtimeMs > maxAgeMs) {
      return undefined;
    }

    const payload = readJsonFile(FILE_SNAPSHOT_PATH);
    if (!payload) {
      return undefined;
    }

    const snapshot = normalizeBridgeSnapshot(payload.snapshot || payload);
    snapshot.updatedAt = Number(payload.updatedAt) || stats.mtimeMs;
    runtime.setLastSnapshot(snapshot, "file");
    return snapshot;
  }

  function pollFileResult() {
    if (!bridgeState.pendingCommand) {
      return;
    }

    const payload = readJsonFile(FILE_RESULT_PATH);
    if (!payload || String(payload.id || "") !== bridgeState.pendingCommand.id) {
      return;
    }

    const result = {
      ok: payload.ok === true,
      available: true,
      active: true,
      action: payload.type || bridgeState.pendingCommand.type || "unknown",
      transport: "inflink-file-bridge",
      id: bridgeState.pendingCommand.id,
      error: typeof payload.error === "string" ? payload.error : "",
      favorited: normalizeFavoriteState(payload)
    };

    bridgeState.lastResult = {
      ...result,
      receivedAt: Date.now()
    };
    runtime.clearPendingCommand(result);
  }

  function startResultPolling() {
    if (!bridgeState.fileResultTimer) {
      bridgeState.fileResultTimer = setInterval(pollFileResult, FILE_RESULT_POLL_INTERVAL_MS);
    }
  }

  function stopResultPolling() {
    if (bridgeState.fileResultTimer) {
      clearInterval(bridgeState.fileResultTimer);
      bridgeState.fileResultTimer = undefined;
    }
  }

  function writeCommand(command) {
    try {
      writeJsonFile(FILE_COMMAND_PATH, {
        bridge: "dynamic-island-inflink",
        command: createPublicCommand(command),
        updatedAt: Date.now()
      });
    } catch (error) {
      logStartup("inflink-file-bridge-error", {
        action: "write-command",
        id: command.id,
        type: command.type,
        error: error?.message || String(error)
      });
    }
  }

  return {
    ensureBridgeDir,
    readFileSnapshot,
    startResultPolling,
    stopResultPolling,
    writeCommand
  };
}

module.exports = {
  createBridgeFilePoller
};
