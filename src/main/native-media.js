const { getNativeHelperPath, getRuntimeDataPath } = require("./app-paths");
const { createNativeMediaCommandFiles } = require("./native-media/command-files");
const { createNativeMediaHelperProcess } = require("./native-media/helper-process");
const { createNativeMediaLineDispatcher } = require("./native-media/line-dispatcher");
const { createNativeMediaRuntime } = require("./native-media/runtime");

const HELPER_SCRIPT_NAME = "native-media-helper.ps1";
const SNAPSHOT_MAX_AGE_MS = 1500;
const COMMAND_TIMEOUT_MS = 1800;
const RESTART_DELAY_MS = 1200;

function createNativeMediaSession(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const platform = options.platform || process.platform;
  const pollInterval = Number.isFinite(options.pollInterval) ? options.pollInterval : 300;
  const commandDir = options.commandDir || getRuntimeDataPath("native-media-commands");
  const helperScriptPath = options.helperScriptPath || getNativeHelperPath(HELPER_SCRIPT_NAME);
  const runtime = createNativeMediaRuntime();
  const commandFiles = createNativeMediaCommandFiles({
    runtime,
    commandDir,
    commandTimeoutMs: COMMAND_TIMEOUT_MS
  });
  const lineDispatcher = createNativeMediaLineDispatcher({ logStartup, runtime });
  const helperProcess = createNativeMediaHelperProcess({
    runtime,
    commandFiles,
    lineDispatcher,
    logStartup,
    platform,
    pollInterval,
    helperScriptPath,
    commandDir,
    restartDelayMs: RESTART_DELAY_MS
  });

  function start() {
    return helperProcess.start();
  }

  function stop() {
    helperProcess.stop();
  }

  function getSnapshot() {
    return runtime.getSnapshot(SNAPSHOT_MAX_AGE_MS);
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

    return commandFiles.sendCommand(action, positionSeconds);
  }

  return {
    start,
    stop,
    getSnapshot,
    control,
    get ready() {
      return runtime.state.ready;
    }
  };
}

module.exports = {
  createNativeMediaSession
};
