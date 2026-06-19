const { runPowerShellJson: defaultRunPowerShellJson, runTextCommand: defaultRunTextCommand } = require("./commands");
const { createInflinkBridge } = require("./inflink-bridge");
const { createNativeMediaSession } = require("./native-media");
const { createNeteaseProvider } = require("./netease");
const { normalizeMediaSnapshot } = require("./media/media-normalizer");
const { createMediaControlRouter } = require("./media/media-control-router");
const { createMediaPollingOrchestrator } = require("./media/media-polling-orchestrator");
const { createMediaRuntime } = require("./media/media-runtime");
const { createMediaSourceQuery } = require("./media/media-source-query");
const { MEDIA_CONTROL_ACTION_SET } = require("../shared/island-contracts");

const MEDIA_POLL_INTERVAL = 300;
const MEDIA_CONTROL_ACTIONS = MEDIA_CONTROL_ACTION_SET;

function createMediaController(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const runPowerShellJson = options.runPowerShellJson || defaultRunPowerShellJson;
  const runTextCommand = options.runTextCommand || defaultRunTextCommand;
  const platform = options.platform || process.platform;
  const neteaseProvider = createNeteaseProvider({ logStartup, runTextCommand });
  const nativeMediaSession = createNativeMediaSession({
    logStartup,
    platform,
    pollInterval: MEDIA_POLL_INTERVAL
  });
  const runtime = createMediaRuntime({ logStartup, emitSnapshot });
  const inflinkBridge = createInflinkBridge({
    logStartup,
    onSnapshot: (snapshot) => {
      sendMediaSnapshot(normalizeMediaSnapshot(snapshot));
    }
  });
  const sourceQuery = createMediaSourceQuery({
    platform,
    logStartup,
    runPowerShellJson,
    nativeMediaSession,
    inflinkBridge,
    neteaseProvider,
    runtime
  });
  const polling = createMediaPollingOrchestrator({
    runtime,
    inflinkBridge,
    nativeMediaSession,
    queryMediaSnapshot: sourceQuery.queryMediaSnapshot,
    sendMediaSnapshot,
    pollInterval: MEDIA_POLL_INTERVAL
  });
  const controlRouter = createMediaControlRouter({
    platform,
    logStartup,
    runPowerShellJson,
    nativeMediaSession,
    inflinkBridge,
    neteaseProvider,
    runtime,
    pollSoon: polling.pollSoon
  });

  function sendMediaSnapshot(snapshot) {
    runtime.sendMediaSnapshot(snapshot);
  }

  async function poll() {
    return polling.poll();
  }

  function start() {
    polling.start();
  }

  function stop() {
    polling.stop();
  }

  async function control(action, positionSeconds) {
    return controlRouter.control(action, positionSeconds);
  }

  return {
    start,
    stop,
    poll,
    control
  };
}

module.exports = {
  MEDIA_CONTROL_ACTIONS,
  createMediaController,
  normalizeMediaSnapshot
};
