const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const HELPER_SCRIPT_PATH = path.join(__dirname, "native-taskbar-helper.ps1");
const SNAPSHOT_MAX_AGE_MS = 4000;
const RESTART_DELAY_MS = 1500;

// Watches the centered taskbar icon area (ReBarWindow32). When it grows toward
// the bottom-left capsule, the main process uses leftEdge to shrink the stage.
function createNativeTaskbarWatch(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const platform = options.platform || process.platform;
  const pollInterval = Number.isFinite(options.pollInterval) ? options.pollInterval : 400;
  const onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : () => {};
  let child;
  let lineReader;
  let restartTimer;
  let stopped = false;
  let ready = false;
  let lastSnapshot;

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = undefined;
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
      logStartup("native-taskbar-parse-error", text.slice(0, 180));
      return;
    }

    if (payload.type === "status") {
      ready = payload.status === "ready";
      logStartup("native-taskbar-status", { status: payload.status || "" });
      return;
    }

    if (payload.type === "taskbar") {
      // Taskbar is treated as visible unless the helper explicitly says otherwise,
      // so a missing/garbled flag never strands the capsules in a hidden state.
      const visible = payload.visible !== false;
      if (payload.available === false) {
        lastSnapshot = { available: false, visible, updatedAt: Date.now() };
      } else {
        lastSnapshot = {
          available: true,
          left: Number(payload.left),
          right: Number(payload.right),
          top: Number(payload.top),
          bottom: Number(payload.bottom),
          width: Number(payload.width),
          visible,
          updatedAt: Date.now()
        };
      }
      onUpdate(getSnapshot());
    }
  }

  function scheduleRestart(reason, details = {}) {
    if (stopped || restartTimer || platform !== "win32") {
      return;
    }

    logStartup("native-taskbar-restart", { reason, ...details });
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
        String(Math.max(150, Math.round(pollInterval)))
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
        logStartup("native-taskbar-stderr", message.slice(0, 300));
      }
    });

    child.on("error", (error) => {
      logStartup("native-taskbar-spawn-error", error?.message || String(error));
    });

    child.on("exit", (code, signal) => {
      lineReader?.close();
      lineReader = undefined;
      child = undefined;
      ready = false;

      if (!stopped) {
        scheduleRestart("helper-exit", { code, signal });
      }
    });

    return true;
  }

  function stop() {
    stopped = true;
    clearRestartTimer();
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
      // Stale or missing data defaults to visible so the capsule is never stuck hidden.
      return { available: false, visible: true, nativeReady: ready };
    }

    return { ...lastSnapshot, nativeReady: ready };
  }

  return {
    start,
    stop,
    getSnapshot,
    get ready() {
      return ready;
    }
  };
}

module.exports = {
  createNativeTaskbarWatch
};
