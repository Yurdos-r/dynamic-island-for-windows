const http = require("node:http");
const {
  BRIDGE_HOST,
  BRIDGE_PATH,
  BRIDGE_PORT,
  FILE_BRIDGE_DIR,
  SNAPSHOT_MAX_AGE_MS
} = require("./inflink/bridge-contract");
const { createBridgeCommandDispatcher } = require("./inflink/bridge-command-dispatcher");
const { createBridgeFilePoller } = require("./inflink/bridge-file-poller");
const { createBridgeHttpRouter } = require("./inflink/bridge-http-router");
const { createBridgeRuntime } = require("./inflink/bridge-runtime");

function createInflinkBridge(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const onSnapshot = typeof options.onSnapshot === "function" ? options.onSnapshot : () => {};
  const host = options.host || BRIDGE_HOST;
  const port = Number.isFinite(options.port) ? options.port : BRIDGE_PORT;
  const runtime = createBridgeRuntime({ logStartup, onSnapshot });
  const bridgeState = runtime.state;
  const filePoller = createBridgeFilePoller({ runtime, logStartup });
  const commandDispatcher = createBridgeCommandDispatcher({
    runtime,
    startBridge: start,
    writeCommand: filePoller.writeCommand,
    logStartup
  });
  const httpRouter = createBridgeHttpRouter({
    runtime,
    host,
    port,
    getSnapshot
  });

  function readFileSnapshot(maxAgeMs) {
    return filePoller.readFileSnapshot(maxAgeMs);
  }

  function getSnapshot(maxAgeMs = SNAPSHOT_MAX_AGE_MS) {
    const fileSnapshot = readFileSnapshot(maxAgeMs);
    if (fileSnapshot) {
      return {
        ...fileSnapshot,
        updatedAt: Date.now()
      };
    }

    if (!bridgeState.lastSnapshot) {
      return { available: false, active: false };
    }

    if (Date.now() - bridgeState.lastSnapshot.updatedAt > maxAgeMs) {
      return { available: true, active: false, source: "inflink-bridge", sourceApp: "cloudmusic.exe" };
    }

    return {
      ...bridgeState.lastSnapshot,
      updatedAt: Date.now()
    };
  }

  function handleRequest(request, response) {
    httpRouter.handleRequest(request, response);
  }

  function start() {
    filePoller.ensureBridgeDir();
    filePoller.startResultPolling();

    if (bridgeState.server) {
      return Promise.resolve(true);
    }

    if (bridgeState.startPromise) {
      return bridgeState.startPromise;
    }

    bridgeState.startPromise = new Promise((resolve) => {
      const nextServer = http.createServer(handleRequest);

      nextServer.on("error", (error) => {
        logStartup("inflink-bridge-error", {
          port,
          error: error?.message || String(error)
        });
        bridgeState.server = undefined;
        bridgeState.startPromise = undefined;
        resolve(false);
      });

      nextServer.listen(port, host, () => {
        bridgeState.server = nextServer;
        bridgeState.startPromise = undefined;
        logStartup("inflink-bridge-ready", {
          host,
          port
        });
        resolve(true);
      });
    });

    return bridgeState.startPromise;
  }

  function stop() {
    runtime.clearPendingCommand({
      ok: false,
      available: false,
      action: "unknown",
      transport: "inflink-bridge",
      error: "Bridge stopped."
    });

    filePoller.stopResultPolling();

    if (!bridgeState.server) {
      return;
    }

    bridgeState.server.close();
    bridgeState.server = undefined;
  }

  function seek(positionSeconds, snapshot = {}) {
    return commandDispatcher.seek(positionSeconds, snapshot);
  }

  function control(action, snapshot = {}) {
    return commandDispatcher.control(action, snapshot);
  }

  return {
    start,
    stop,
    seek,
    control,
    getSnapshot,
    get port() {
      return port;
    }
  };
}

module.exports = {
  BRIDGE_HOST,
  BRIDGE_PORT,
  BRIDGE_PATH,
  FILE_BRIDGE_DIR,
  createInflinkBridge
};
