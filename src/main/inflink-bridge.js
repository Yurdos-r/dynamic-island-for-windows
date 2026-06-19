const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 32147;
const BRIDGE_PATH = "/dynamic-island-bridge";
const FILE_BRIDGE_DIR = "C:\\betterncm\\dynamic-island-bridge";
const FILE_SNAPSHOT_PATH = path.join(FILE_BRIDGE_DIR, "snapshot.json");
const FILE_COMMAND_PATH = path.join(FILE_BRIDGE_DIR, "command.json");
const FILE_RESULT_PATH = path.join(FILE_BRIDGE_DIR, "result.json");
const COMMAND_TIMEOUT_MS = 2200;
const SNAPSHOT_MAX_AGE_MS = 3500;
const FILE_RESULT_POLL_INTERVAL_MS = 120;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_LYRIC_LINES = 120;

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body is not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sanitizeText(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function sanitizeCoverUrl(value) {
  const text = sanitizeText(value, 4096);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    return ["http:", "https:", "data:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function normalizeTrackId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && text !== "0" ? text : "";
}

function normalizeFavoriteState(payload = {}) {
  const candidates = [
    payload.favorited,
    payload.favorite,
    payload.liked,
    payload.isLiked,
    payload.isFavorite,
    payload.starred
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function normalizeLyricLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => ({
      timeMs: Math.max(0, Math.round(Number(line?.timeMs ?? line?.time ?? 0))),
      text: sanitizeText(line?.text || line?.originalLyric || "", 300),
      translation: sanitizeText(line?.translation || line?.translatedLyric || "", 300)
    }))
    .filter((line) => line.text)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, MAX_LYRIC_LINES);
}

function ensureFileBridgeDir() {
  fs.mkdirSync(FILE_BRIDGE_DIR, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJsonFile(filePath, payload) {
  ensureFileBridgeDir();
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
  fs.renameSync(tempPath, filePath);
}

function createPublicCommand(command) {
  if (!command) {
    return null;
  }

  return {
    id: command.id,
    type: command.type,
    positionMs: command.positionMs,
    positionSeconds: command.positionSeconds,
    createdAt: command.createdAt,
    timeoutMs: COMMAND_TIMEOUT_MS,
    source: command.source,
    sourceApp: command.sourceApp,
    title: command.title,
    artist: command.artist
  };
}

function normalizeBridgeSnapshot(payload = {}) {
  const ncmId = normalizeTrackId(payload.ncmId);
  const title = sanitizeText(payload.title || payload.songName || "Unknown Title");
  const artist = sanitizeText(payload.artist || payload.authorName || "NetEase Cloud Music");
  const durationSeconds = normalizeSeconds(payload.durationSeconds || Number(payload.durationMs) / 1000);
  const positionSeconds = normalizeSeconds(payload.positionSeconds || Number(payload.positionMs) / 1000);
  const active = payload.active !== false && Boolean(title || artist || ncmId);
  const favorited = normalizeFavoriteState(payload);
  const lyrics = normalizeLyricLines(payload.lyrics);

  const snapshot = {
    available: true,
    active,
    playing: active && payload.playing === true,
    status: payload.playing === true ? "Playing" : "Paused",
    title,
    artist,
    albumTitle: sanitizeText(payload.albumTitle || payload.albumName || ""),
    genres: ncmId ? [`NCM-${ncmId}`] : [],
    ncmId,
    cover: sanitizeCoverUrl(payload.cover || payload.coverUrl),
    source: "inflink-bridge",
    sourceApp: "cloudmusic.exe",
    controllable: true,
    durationSeconds: durationSeconds > 0 ? durationSeconds : 1,
    positionSeconds: durationSeconds > 0 ? Math.min(positionSeconds, durationSeconds) : positionSeconds,
    updatedAt: Date.now(),
    bridgeStatus: sanitizeText(payload.bridgeStatus || ""),
    bridgeVersion: sanitizeText(payload.bridgeVersion || ""),
    lyrics,
    lyricsSource: sanitizeText(payload.lyricsSource || "")
  };

  if (favorited !== undefined) {
    snapshot.favorited = favorited;
  }

  return snapshot;
}

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
