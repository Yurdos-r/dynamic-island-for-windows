const http = require("node:http");
const fs = require("node:fs");
const {
  BRIDGE_HOST,
  BRIDGE_PATH,
  BRIDGE_PORT,
  COMMAND_TIMEOUT_MS,
  FILE_BRIDGE_DIR,
  FILE_COMMAND_PATH,
  FILE_RESULT_PATH,
  FILE_RESULT_POLL_INTERVAL_MS,
  FILE_SNAPSHOT_PATH,
  SNAPSHOT_MAX_AGE_MS
} = require("./inflink/bridge-contract");
const { ensureFileBridgeDir, readJsonFile, writeJsonFile } = require("./inflink/file-bridge");
const { readJsonBody, sendJson, setCorsHeaders } = require("./inflink/http-utils");
const {
  createPublicCommand,
  normalizeBridgeSnapshot,
  normalizeFavoriteState,
  normalizeSeconds
} = require("./inflink/bridge-normalizer");

function createInflinkBridge(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const onSnapshot = typeof options.onSnapshot === "function" ? options.onSnapshot : () => {};
  const host = options.host || BRIDGE_HOST;
  const port = Number.isFinite(options.port) ? options.port : BRIDGE_PORT;
  let server;
  let startPromise;
  let pendingCommand;
  let lastResult;
  let lastSnapshot;
  let lastSnapshotLogKey = "";
  let lastSnapshotPushKey = "";
  let fileResultTimer;
  let nextCommandId = 1;

  function setLastSnapshot(snapshot, transport) {
    lastSnapshot = snapshot;
    const pushKey = [
      snapshot.active,
      snapshot.title,
      snapshot.artist,
      snapshot.playing,
      snapshot.positionSeconds,
      snapshot.durationSeconds,
      snapshot.cover,
      snapshot.ncmId,
      snapshot.favorited
    ].join("|");

    if (transport === "http" && pushKey !== lastSnapshotPushKey) {
      lastSnapshotPushKey = pushKey;
      onSnapshot({
        ...snapshot,
        updatedAt: Date.now()
      });
    }

    const logKey = [
      transport,
      snapshot.active,
      snapshot.title,
      snapshot.artist,
      snapshot.playing,
      snapshot.durationSeconds,
      snapshot.bridgeStatus
    ].join("|");

    if (logKey !== lastSnapshotLogKey) {
      lastSnapshotLogKey = logKey;
      logStartup("inflink-bridge-snapshot", {
        transport,
        active: snapshot.active,
        title: snapshot.title,
        artist: snapshot.artist,
        playing: snapshot.playing,
        durationSeconds: snapshot.durationSeconds,
        ncmId: snapshot.ncmId || "",
        bridgeStatus: snapshot.bridgeStatus
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
    setLastSnapshot(snapshot, "file");
    return snapshot;
  }

  function pollFileResult() {
    if (!pendingCommand) {
      return;
    }

    const payload = readJsonFile(FILE_RESULT_PATH);
    if (!payload || String(payload.id || "") !== pendingCommand.id) {
      return;
    }

    const result = {
      ok: payload.ok === true,
      available: true,
      active: true,
      action: payload.type || pendingCommand.type || "unknown",
      transport: "inflink-file-bridge",
      id: pendingCommand.id,
      error: typeof payload.error === "string" ? payload.error : "",
      favorited: normalizeFavoriteState(payload)
    };

    lastResult = {
      ...result,
      receivedAt: Date.now()
    };
    clearPendingCommand(result);
  }

  function clearPendingCommand(result) {
    if (!pendingCommand) {
      return;
    }

    const command = pendingCommand;
    pendingCommand = undefined;
    clearTimeout(command.timeout);
    command.resolve(result);
  }

  function handleCommandRequest(_request, response, url) {
    const lastId = url.searchParams.get("lastId") || "";
    const command = pendingCommand && pendingCommand.id !== lastId ? createPublicCommand(pendingCommand) : null;
    sendJson(response, 200, {
      ok: true,
      bridge: "dynamic-island-inflink",
      command
    });
  }

  async function handleResultRequest(request, response) {
    try {
      const payload = await readJsonBody(request);
      const id = String(payload.id || "");
      const result = {
        ok: payload.ok === true,
        available: true,
        active: true,
        action: payload.type || pendingCommand?.type || "unknown",
        transport: "inflink-bridge",
        id,
        error: typeof payload.error === "string" ? payload.error : "",
        favorited: normalizeFavoriteState(payload)
      };

      lastResult = {
        ...result,
        receivedAt: Date.now()
      };

      if (pendingCommand && pendingCommand.id === id) {
        clearPendingCommand(result);
      }

      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  async function handleSnapshotRequest(request, response) {
    try {
      const payload = await readJsonBody(request);
      const snapshot = normalizeBridgeSnapshot(payload.snapshot || payload);

      setLastSnapshot(snapshot, "http");

      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  function getSnapshot(maxAgeMs = SNAPSHOT_MAX_AGE_MS) {
    const fileSnapshot = readFileSnapshot(maxAgeMs);
    if (fileSnapshot) {
      return {
        ...fileSnapshot,
        updatedAt: Date.now()
      };
    }

    if (!lastSnapshot) {
      return { available: false, active: false };
    }

    if (Date.now() - lastSnapshot.updatedAt > maxAgeMs) {
      return { available: true, active: false, source: "inflink-bridge", sourceApp: "cloudmusic.exe" };
    }

    return {
      ...lastSnapshot,
      updatedAt: Date.now()
    };
  }

  function handleStatusRequest(_request, response) {
    sendJson(response, 200, {
      ok: true,
      bridge: "dynamic-island-inflink",
      pendingCommand: createPublicCommand(pendingCommand),
      lastResult,
      lastSnapshot: getSnapshot(),
      fileBridgeDir: FILE_BRIDGE_DIR,
      port
    });
  }

  function handleRequest(request, response) {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (request.method === "GET" && url.pathname === `${BRIDGE_PATH}/command`) {
      handleCommandRequest(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === `${BRIDGE_PATH}/result`) {
      void handleResultRequest(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === `${BRIDGE_PATH}/snapshot`) {
      void handleSnapshotRequest(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === `${BRIDGE_PATH}/status`) {
      handleStatusRequest(request, response);
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  }

  function start() {
    try {
      ensureFileBridgeDir();
    } catch (error) {
      logStartup("inflink-file-bridge-error", {
        action: "mkdir",
        error: error?.message || String(error)
      });
    }

    if (!fileResultTimer) {
      fileResultTimer = setInterval(pollFileResult, FILE_RESULT_POLL_INTERVAL_MS);
    }

    if (server) {
      return Promise.resolve(true);
    }

    if (startPromise) {
      return startPromise;
    }

    startPromise = new Promise((resolve) => {
      const nextServer = http.createServer(handleRequest);

      nextServer.on("error", (error) => {
        logStartup("inflink-bridge-error", {
          port,
          error: error?.message || String(error)
        });
        server = undefined;
        startPromise = undefined;
        resolve(false);
      });

      nextServer.listen(port, host, () => {
        server = nextServer;
        startPromise = undefined;
        logStartup("inflink-bridge-ready", {
          host,
          port
        });
        resolve(true);
      });
    });

    return startPromise;
  }

  function stop() {
    clearPendingCommand({
      ok: false,
      available: false,
      action: "unknown",
      transport: "inflink-bridge",
      error: "Bridge stopped."
    });

    if (fileResultTimer) {
      clearInterval(fileResultTimer);
      fileResultTimer = undefined;
    }

    if (!server) {
      return;
    }

    server.close();
    server = undefined;
  }

  async function sendCommand(type, payload = {}, snapshot = {}) {
    const isStarted = await start();
    if (!isStarted) {
      return {
        ok: false,
        available: false,
        action: type,
        transport: "inflink-bridge",
        error: "Bridge server is not available."
      };
    }

    clearPendingCommand({
      ok: false,
      available: true,
      active: true,
      action: type,
      transport: "inflink-bridge",
      error: "Superseded by a newer command."
    });

    const id = `${Date.now()}-${nextCommandId++}`;

    return new Promise((resolve) => {
      pendingCommand = {
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
          if (pendingCommand?.id !== id) {
            return;
          }

          pendingCommand = undefined;
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
        positionSeconds: pendingCommand.positionSeconds,
        source: pendingCommand.source,
        sourceApp: pendingCommand.sourceApp
      });

      try {
        writeJsonFile(FILE_COMMAND_PATH, {
          bridge: "dynamic-island-inflink",
          command: createPublicCommand(pendingCommand),
          updatedAt: Date.now()
        });
      } catch (error) {
        logStartup("inflink-file-bridge-error", {
          action: "write-command",
          id,
          type,
          error: error?.message || String(error)
        });
      }
    });
  }

  function seek(positionSeconds, snapshot = {}) {
    return sendCommand("seek", { positionSeconds }, snapshot);
  }

  function control(action, snapshot = {}) {
    return sendCommand(action, {}, snapshot);
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
