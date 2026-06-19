const { BRIDGE_PATH, FILE_BRIDGE_DIR } = require("./bridge-contract");
const { createPublicCommand, normalizeBridgeSnapshot, normalizeFavoriteState } = require("./bridge-normalizer");
const { readJsonBody, sendJson, setCorsHeaders } = require("./http-utils");

function createBridgeHttpRouter(options = {}) {
  const runtime = options.runtime;
  const host = options.host || "127.0.0.1";
  const port = Number.isFinite(options.port) ? options.port : 32147;
  const getSnapshot = typeof options.getSnapshot === "function" ? options.getSnapshot : () => ({ available: false, active: false });

  if (!runtime) {
    throw new Error("runtime is required to create bridge HTTP router.");
  }

  const bridgeState = runtime.state;

  function handleCommandRequest(_request, response, url) {
    const lastId = url.searchParams.get("lastId") || "";
    const command = bridgeState.pendingCommand && bridgeState.pendingCommand.id !== lastId ? createPublicCommand(bridgeState.pendingCommand) : null;
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
        action: payload.type || bridgeState.pendingCommand?.type || "unknown",
        transport: "inflink-bridge",
        id,
        error: typeof payload.error === "string" ? payload.error : "",
        favorited: normalizeFavoriteState(payload)
      };

      bridgeState.lastResult = {
        ...result,
        receivedAt: Date.now()
      };

      if (bridgeState.pendingCommand && bridgeState.pendingCommand.id === id) {
        runtime.clearPendingCommand(result);
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

      runtime.setLastSnapshot(snapshot, "http");

      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error?.message || String(error)
      });
    }
  }

  function handleStatusRequest(_request, response) {
    sendJson(response, 200, {
      ok: true,
      bridge: "dynamic-island-inflink",
      pendingCommand: createPublicCommand(bridgeState.pendingCommand),
      lastResult: bridgeState.lastResult,
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

  return {
    handleRequest
  };
}

module.exports = {
  createBridgeHttpRouter
};
