const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { getNativeHelperPath } = require("./app-paths");

const HELPER_SCRIPT_NAME = "native-system-helper.ps1";
const RESTART_DELAY_MS = 1500;
const GPU_REFRESH_INTERVAL_MS = 1500;
const DISK_REFRESH_INTERVAL_MS = 5000;

// Resident PowerShell process that supplies the two Windows-specific system
// metrics (GPU utilization, fixed-drive sizes). Replaces the per-tick
// `runPowerShellJson` cold starts in system-monitor.js: one long-lived process,
// stdout JSON lines, auto-restart on crash. CPU/memory stay on Node `os`.
// On non-Windows the helper never starts and the getters return inert values.
function createNativeSystemProbe(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const platform = options.platform || process.platform;
  const gpuInterval = Number.isFinite(options.gpuInterval) ? options.gpuInterval : GPU_REFRESH_INTERVAL_MS;
  const diskInterval = Number.isFinite(options.diskInterval) ? options.diskInterval : DISK_REFRESH_INTERVAL_MS;
  const helperScriptPath = options.helperScriptPath || getNativeHelperPath(HELPER_SCRIPT_NAME);
  let child;
  let lineReader;
  let restartTimer;
  let stopped = false;
  let ready = false;
  let gpuPercent = 0;
  let diskItems = [];

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
      logStartup("native-system-parse-error", text.slice(0, 180));
      return;
    }

    if (payload.type === "status") {
      ready = payload.status === "ready";
      logStartup("native-system-status", { status: payload.status || "" });
      return;
    }

    if (payload.type === "gpu") {
      gpuPercent = Math.max(0, Math.min(100, Math.round(Number(payload.gpuPercent) || 0)));
      return;
    }

    if (payload.type === "disk") {
      // PowerShell collapses a single-element array to a bare object in JSON;
      // coerce back to an array so the normalizer always sees a list.
      const raw = payload.disks;
      diskItems = Array.isArray(raw) ? raw : raw ? [raw] : [];
    }
  }

  function scheduleRestart(reason, details = {}) {
    if (stopped || restartTimer || platform !== "win32") {
      return;
    }

    logStartup("native-system-restart", { reason, ...details });
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
        helperScriptPath,
        "-GpuIntervalMs",
        String(Math.max(400, Math.round(gpuInterval))),
        "-DiskIntervalMs",
        String(Math.max(1000, Math.round(diskInterval)))
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
        logStartup("native-system-stderr", message.slice(0, 300));
      }
    });

    child.on("error", (error) => {
      logStartup("native-system-spawn-error", error?.message || String(error));
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

  return {
    start,
    stop,
    getGpuPercent: () => gpuPercent,
    getDiskItems: () => diskItems,
    get ready() {
      return ready;
    }
  };
}

module.exports = {
  createNativeSystemProbe
};
