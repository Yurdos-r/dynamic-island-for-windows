const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const HELPER_SCRIPT_PATH = path.join(__dirname, "native-media-helper.ps1");
const COMMAND_DIR = path.resolve(__dirname, "../../.tmp/native-media-commands");
const SNAPSHOT_MAX_AGE_MS = 1500;
const COMMAND_TIMEOUT_MS = 1800;
const RESTART_DELAY_MS = 1200;

function safeRemoveCommandFiles(commandDir) {
  let files = [];
  try {
    files = fs.readdirSync(commandDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!/^\d+-\d+\.json$/.test(file)) {
      continue;
    }

    try {
      fs.unlinkSync(path.join(commandDir, file));
    } catch {
      // Best effort cleanup.
    }
  }
}

function createNativeMediaSession(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const platform = options.platform || process.platform;
  const pollInterval = Number.isFinite(options.pollInterval) ? options.pollInterval : 300;
  let child;
  let lineReader;
  let restartTimer;
  let stopped = false;
  let ready = false;
  let lastSnapshot;
  let nextCommandId = 1;
  let commandDirPrepared = false;
  const pendingCommands = new Map();

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = undefined;
    }
  }

  function ensureCommandDir(cleanup = false) {
    fs.mkdirSync(COMMAND_DIR, { recursive: true });
    if (cleanup) {
      safeRemoveCommandFiles(COMMAND_DIR);
    }
    commandDirPrepared = true;
  }

  function resolvePendingCommand(id, result) {
    const pending = pendingCommands.get(id);
    if (!pending) {
      return;
    }

    pendingCommands.delete(id);
    clearTimeout(pending.timeout);
    pending.resolve(result);
  }

  function rejectPendingCommands(error) {
    for (const [id, pending] of pendingCommands.entries()) {
      clearTimeout(pending.timeout);
      pending.resolve({
        ok: false,
        available: false,
        active: false,
        action: pending.action,
        transport: "native-gsmtc-helper",
        error
      });
      pendingCommands.delete(id);
    }
  }

  function handleLine(line) {
    const text = String(line || "").trim();
    if (!text) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      logStartup("native-media-parse-error", text.slice(0, 180));
      return;
    }

    if (payload.type === "status") {
      ready = payload.status === "ready";
      logStartup("native-media-status", {
        status: payload.status || "",
        transport: payload.transport || "native-gsmtc-helper",
        error: payload.error || ""
      });
      return;
    }

    if (payload.type === "snapshot") {
      lastSnapshot = {
        ...payload,
        updatedAt: Date.now()
      };
      return;
    }

    if (payload.type === "control-result") {
      resolvePendingCommand(String(payload.id || ""), {
        ok: payload.ok === true,
        available: payload.available !== false,
        active: payload.active !== false,
        action: payload.action || "unknown",
        transport: payload.transport || "native-gsmtc-helper",
        requestedPositionTicks: payload.requestedPositionTicks,
        error: payload.error || ""
      });
    }
  }

  function scheduleRestart(reason, details = {}) {
    if (stopped || restartTimer || platform !== "win32") {
      return;
    }

    logStartup("native-media-restart", {
      reason,
      ...details
    });
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      start();
    }, RESTART_DELAY_MS);
  }

  function start() {
    if (platform !== "win32") {
      return false;
    }

    if (child && !child.killed) {
      return true;
    }

    stopped = false;
    ready = false;
    clearRestartTimer();

    try {
      ensureCommandDir(true);
    } catch (error) {
      logStartup("native-media-command-dir-error", error?.message || String(error));
    }

    child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        HELPER_SCRIPT_PATH,
        "-PollIntervalMs",
        String(Math.max(100, Math.round(pollInterval))),
        "-CommandDir",
        COMMAND_DIR
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    lineReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity
    });
    lineReader.on("line", handleLine);

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (message) {
        logStartup("native-media-stderr", message.slice(0, 500));
      }
    });

    child.on("error", (error) => {
      logStartup("native-media-spawn-error", error?.message || String(error));
      rejectPendingCommands(error?.message || "Native media helper failed to start.");
    });

    child.on("exit", (code, signal) => {
      lineReader?.close();
      lineReader = undefined;
      child = undefined;
      ready = false;
      rejectPendingCommands("Native media helper exited.");

      if (!stopped) {
        scheduleRestart("helper-exit", { code, signal });
      }
    });

    return true;
  }

  function stop() {
    stopped = true;
    clearRestartTimer();
    rejectPendingCommands("Native media helper stopped.");
    lineReader?.close();
    lineReader = undefined;

    if (child && !child.killed) {
      child.kill();
    }

    child = undefined;
    ready = false;
  }

  function getSnapshot() {
    if (!lastSnapshot || Date.now() - lastSnapshot.updatedAt > SNAPSHOT_MAX_AGE_MS) {
      return {
        available: false,
        active: false,
        waitingForNative: Boolean(child),
        nativeReady: ready,
        source: "windows-media-session",
        transport: "native-gsmtc-helper"
      };
    }

    return lastSnapshot;
  }

  function control(action, positionSeconds = 0) {
    if (platform !== "win32" || !start()) {
      return Promise.resolve({
        ok: false,
        available: false,
        active: false,
        action,
        transport: "native-gsmtc-helper",
        error: "Native media helper is not available."
      });
    }

    const id = `${Date.now()}-${nextCommandId++}`;
    const commandPath = path.join(COMMAND_DIR, `${id}.json`);
    const tempPath = `${commandPath}.${process.pid}.tmp`;
    const payload = {
      id,
      action,
      positionSeconds: Math.max(0, Math.round(Number(positionSeconds) || 0)),
      createdAt: Date.now()
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingCommands.delete(id);
        resolve({
          ok: false,
          available: false,
          active: false,
          action,
          transport: "native-gsmtc-helper",
          error: "Native media helper did not acknowledge the command."
        });
      }, COMMAND_TIMEOUT_MS);

      pendingCommands.set(id, {
        action,
        resolve,
        timeout
      });

      try {
        if (!commandDirPrepared) {
          ensureCommandDir(false);
        }
        fs.writeFileSync(tempPath, JSON.stringify(payload), "utf8");
        fs.renameSync(tempPath, commandPath);
      } catch (error) {
        resolvePendingCommand(id, {
          ok: false,
          available: false,
          active: false,
          action,
          transport: "native-gsmtc-helper",
          error: error?.message || String(error)
        });
      }
    });
  }

  return {
    start,
    stop,
    getSnapshot,
    control,
    get ready() {
      return ready;
    }
  };
}

module.exports = {
  createNativeMediaSession
};
