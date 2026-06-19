const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const HELPER_SCRIPT_PATH = path.join(__dirname, "native-clipboard-helper.ps1");
const READY_TIMEOUT_MS = 1800;

function createNativeClipboardListener(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const onText = typeof options.onText === "function" ? options.onText : () => {};
  const onReady = typeof options.onReady === "function" ? options.onReady : () => {};
  const onUnavailable = typeof options.onUnavailable === "function" ? options.onUnavailable : () => {};
  const platform = options.platform || process.platform;
  let child;
  let lineReader;
  let readyTimer;
  let ready = false;
  let stopped = false;

  function clearReadyTimer() {
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = undefined;
    }
  }

  function markUnavailable(reason, details = {}) {
    if (stopped) {
      return;
    }

    clearReadyTimer();
    logStartup("native-clipboard-unavailable", {
      reason,
      ...details
    });
    onUnavailable(reason);
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
      logStartup("native-clipboard-parse-error", text.slice(0, 180));
      return;
    }

    if (payload.type === "status" && payload.status === "ready") {
      ready = true;
      clearReadyTimer();
      logStartup("native-clipboard-ready", {
        transport: payload.transport || "win32-clipboard-listener"
      });
      onReady();
      return;
    }

    if (payload.type === "clipboard") {
      onText(payload.text || "", payload.transport || "win32-clipboard-listener");
    }
  }

  function start() {
    if (platform !== "win32") {
      markUnavailable("unsupported-platform");
      return false;
    }

    if (child && !child.killed) {
      return true;
    }

    stopped = false;
    ready = false;

    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Sta", "-ExecutionPolicy", "Bypass", "-File", HELPER_SCRIPT_PATH],
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
        logStartup("native-clipboard-stderr", message.slice(0, 500));
      }
    });

    child.on("error", (error) => {
      markUnavailable("spawn-error", {
        error: error?.message || String(error)
      });
    });

    child.on("exit", (code, signal) => {
      const wasReady = ready;
      clearReadyTimer();
      lineReader?.close();
      lineReader = undefined;
      child = undefined;
      ready = false;

      if (!stopped) {
        markUnavailable(wasReady ? "helper-exit" : "helper-startup-exit", {
          code,
          signal
        });
      }
    });

    readyTimer = setTimeout(() => {
      if (!ready) {
        markUnavailable("ready-timeout");
      }
    }, READY_TIMEOUT_MS);

    return true;
  }

  function stop() {
    stopped = true;
    clearReadyTimer();
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
    get ready() {
      return ready;
    }
  };
}

module.exports = {
  createNativeClipboardListener
};
