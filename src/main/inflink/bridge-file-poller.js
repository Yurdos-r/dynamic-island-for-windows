const fs = require("node:fs");

const {
  FILE_BRIDGE_VERSION,
  FILE_COMMAND_NAME,
  FILE_RESULT_NAME,
  FILE_RESULT_POLL_INTERVAL_MS,
  FILE_SNAPSHOT_NAME
} = require("./bridge-contract");
const { createPublicCommand, normalizeBridgeSnapshot, normalizeFavoriteState } = require("./bridge-normalizer");
const { ensureFileBridgeDirs, getFileBridgePath, readJsonFile, writeJsonFileToDirs } = require("./file-bridge");
const { payloadHasValidBridgeToken } = require("./bridge-token");

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createBridgeFilePoller(options = {}) {
  const runtime = options.runtime;
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const bridgeDirs = Array.isArray(options.bridgeDirs) ? options.bridgeDirs : [];
  const bridgeToken = typeof options.bridgeToken === "string" ? options.bridgeToken : "";

  if (!runtime) {
    throw new Error("runtime is required to create bridge file poller.");
  }

  const bridgeState = runtime.state;

  function ensureBridgeDir() {
    try {
      ensureFileBridgeDirs(bridgeDirs);
    } catch (error) {
      logStartup("inflink-file-bridge-error", {
        action: "mkdir",
        error: getErrorMessage(error)
      });
    }
  }

  function readFreshPayloads(fileName, maxAgeMs) {
    return bridgeDirs
      .map((dirPath) => {
        const filePath = getFileBridgePath(dirPath, fileName);
        try {
          const stats = fs.statSync(filePath);
          return { dirPath, filePath, stats };
        } catch {
          return undefined;
        }
      })
      .filter(Boolean)
      .filter((entry) => Date.now() - entry.stats.mtimeMs <= maxAgeMs)
      .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)
      .map((entry) => ({
        ...entry,
        payload: readJsonFile(entry.filePath)
      }))
      .filter((entry) => entry.payload && payloadHasValidBridgeToken(entry.payload, bridgeToken));
  }

  function readFileSnapshot(maxAgeMs) {
    const entry = readFreshPayloads(FILE_SNAPSHOT_NAME, maxAgeMs)[0];
    if (!entry) {
      return undefined;
    }

    const { payload, stats } = entry;
    const snapshot = normalizeBridgeSnapshot(payload.snapshot || payload);
    snapshot.updatedAt = Number(payload.updatedAt) || stats.mtimeMs;
    runtime.setLastSnapshot(snapshot, "file");
    return snapshot;
  }

  function pollFileResult() {
    if (!bridgeState.pendingCommand) {
      return;
    }

    const payload = bridgeDirs
      .map((dirPath) => readJsonFile(getFileBridgePath(dirPath, FILE_RESULT_NAME)))
      .find((candidate) => candidate && payloadHasValidBridgeToken(candidate, bridgeToken));
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
      writeJsonFileToDirs(bridgeDirs, FILE_COMMAND_NAME, {
        bridge: "dynamic-island-inflink",
        version: FILE_BRIDGE_VERSION,
        bridgeToken,
        command: createPublicCommand(command),
        updatedAt: Date.now()
      });
    } catch (error) {
      logStartup("inflink-file-bridge-error", {
        action: "write-command",
        id: command.id,
        type: command.type,
        error: getErrorMessage(error)
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
