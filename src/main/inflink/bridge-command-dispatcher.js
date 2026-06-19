const { COMMAND_TIMEOUT_MS } = require("./bridge-contract");
const { normalizeSeconds } = require("./bridge-normalizer");

function createBridgeCommandDispatcher(options = {}) {
  const runtime = options.runtime;
  const startBridge = typeof options.startBridge === "function" ? options.startBridge : async () => false;
  const writeCommand = typeof options.writeCommand === "function" ? options.writeCommand : () => {};
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};

  if (!runtime) {
    throw new Error("runtime is required to create bridge command dispatcher.");
  }

  const bridgeState = runtime.state;

  async function sendCommand(type, payload = {}, snapshot = {}) {
    const isStarted = await startBridge();
    if (!isStarted) {
      return {
        ok: false,
        available: false,
        action: type,
        transport: "inflink-bridge",
        error: "Bridge server is not available."
      };
    }

    runtime.clearPendingCommand({
      ok: false,
      available: true,
      active: true,
      action: type,
      transport: "inflink-bridge",
      error: "Superseded by a newer command."
    });

    const id = runtime.allocateCommandId();

    return new Promise((resolve) => {
      bridgeState.pendingCommand = {
        id,
        type,
        positionSeconds: normalizeSeconds(payload.positionSeconds),
        positionMs: normalizeSeconds(payload.positionSeconds) * 1000,
        createdAt: Date.now(),
        source: snapshot.source || "",
        sourceApp: snapshot.sourceApp || "",
        title: snapshot.title || "",
        artist: snapshot.artist || "",
        resolve,
        timeout: setTimeout(() => {
          if (bridgeState.pendingCommand?.id !== id) {
            return;
          }

          bridgeState.pendingCommand = undefined;
          resolve({
            ok: false,
            available: true,
            active: true,
            action: type,
            transport: "inflink-bridge",
            id,
            error: "InfLink bridge did not acknowledge the command."
          });
        }, COMMAND_TIMEOUT_MS)
      };

      logStartup("inflink-bridge-command", {
        id,
        type,
        positionSeconds: bridgeState.pendingCommand.positionSeconds,
        source: bridgeState.pendingCommand.source,
        sourceApp: bridgeState.pendingCommand.sourceApp
      });

      writeCommand(bridgeState.pendingCommand);
    });
  }

  function seek(positionSeconds, snapshot = {}) {
    return sendCommand("seek", { positionSeconds }, snapshot);
  }

  function control(action, snapshot = {}) {
    return sendCommand(action, {}, snapshot);
  }

  return {
    control,
    seek,
    sendCommand
  };
}

module.exports = {
  createBridgeCommandDispatcher
};
