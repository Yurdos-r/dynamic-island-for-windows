const { spawn } = require("node:child_process");
const readline = require("node:readline");

function createNativeMediaHelperProcess(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const platform = options.platform || process.platform;
  const pollInterval = Number.isFinite(options.pollInterval) ? options.pollInterval : 300;
  const runtime = options.runtime;
  const commandFiles = options.commandFiles;
  const lineDispatcher = options.lineDispatcher;
  const helperScriptPath = options.helperScriptPath;
  const commandDir = options.commandDir;
  const restartDelayMs = options.restartDelayMs;

  if (!runtime || !commandFiles || !lineDispatcher || !helperScriptPath || !commandDir || !Number.isFinite(restartDelayMs)) {
    throw new Error("runtime, commandFiles, lineDispatcher, helperScriptPath, commandDir, and restartDelayMs are required.");
  }

  function scheduleRestart(reason, details = {}) {
    if (runtime.state.stopped || runtime.state.restartTimer || platform !== "win32") {
      return;
    }

    logStartup("native-media-restart", {
      reason,
      ...details
    });
    runtime.state.restartTimer = setTimeout(() => {
      runtime.state.restartTimer = undefined;
      start();
    }, restartDelayMs);
  }

  function start() {
    if (platform !== "win32") {
      return false;
    }

    if (runtime.state.child && !runtime.state.child.killed) {
      return true;
    }

    runtime.state.stopped = false;
    runtime.setReady(false);
    runtime.clearRestartTimer();

    try {
      commandFiles.ensureCommandDir(true);
    } catch (error) {
      logStartup("native-media-command-dir-error", error?.message || String(error));
    }

    runtime.state.child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperScriptPath,
        "-PollIntervalMs",
        String(Math.max(100, Math.round(pollInterval))),
        "-CommandDir",
        commandDir
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    runtime.state.lineReader = readline.createInterface({
      input: runtime.state.child.stdout,
      crlfDelay: Infinity
    });
    runtime.state.lineReader.on("line", lineDispatcher.handleLine);

    runtime.state.child.stderr?.setEncoding("utf8");
    runtime.state.child.stderr?.on("data", (chunk) => {
      const message = String(chunk || "").trim();
      if (message) {
        logStartup("native-media-stderr", message.slice(0, 500));
      }
    });

    runtime.state.child.on("error", (error) => {
      logStartup("native-media-spawn-error", error?.message || String(error));
      runtime.rejectPendingCommands(error?.message || "Native media helper failed to start.");
    });

    runtime.state.child.on("exit", (code, signal) => {
      runtime.state.lineReader?.close();
      runtime.state.lineReader = undefined;
      runtime.state.child = undefined;
      runtime.setReady(false);
      runtime.rejectPendingCommands("Native media helper exited.");

      if (!runtime.state.stopped) {
        scheduleRestart("helper-exit", { code, signal });
      }
    });

    return true;
  }

  function stop() {
    runtime.state.stopped = true;
    runtime.clearRestartTimer();
    runtime.rejectPendingCommands("Native media helper stopped.");
    runtime.state.lineReader?.close();
    runtime.state.lineReader = undefined;

    if (runtime.state.child && !runtime.state.child.killed) {
      runtime.state.child.kill();
    }

    runtime.state.child = undefined;
    runtime.setReady(false);
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createNativeMediaHelperProcess
};
