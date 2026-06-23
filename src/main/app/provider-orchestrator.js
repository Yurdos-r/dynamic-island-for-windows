const { createMediaController } = require("../media");
const { createClipboardMonitor } = require("../clipboard");
const { createPrivacyMonitor } = require("../privacy");
const { createNativeTaskbarWatch } = require("../native-taskbar");
const { createSystemMonitor } = require("../system-monitor");
const { createKeyboardLockMonitor } = require("../keyboard-lock");

function createIslandProviderOrchestrator(options = {}) {
  const logStartup = options.logStartup || (() => {});
  const emitMediaSnapshot = options.emitMediaSnapshot || (() => {});
  const emitClipboardSnapshot = options.emitClipboardSnapshot || (() => {});
  const emitPrivacySnapshot = options.emitPrivacySnapshot || (() => {});
  const emitSystemSnapshot = options.emitSystemSnapshot || (() => {});
  const emitTaskbarSnapshot = options.emitTaskbarSnapshot || (() => {});
  const emitKeyboardLockSnapshot = options.emitKeyboardLockSnapshot || (() => {});

  const mediaController = createMediaController({
    logStartup,
    emitSnapshot: emitMediaSnapshot
  });
  const clipboardMonitor = createClipboardMonitor({
    logStartup,
    emitSnapshot: emitClipboardSnapshot
  });
  const privacyMonitor = createPrivacyMonitor({
    logStartup,
    emitSnapshot: emitPrivacySnapshot
  });
  const keyboardLockMonitor = createKeyboardLockMonitor({
    logStartup,
    emitSnapshot: emitKeyboardLockSnapshot
  });
  const systemMonitor = createSystemMonitor({
    logStartup,
    emitSnapshot: emitSystemSnapshot
  });
  const taskbarWatch = createNativeTaskbarWatch({
    logStartup,
    pollInterval: options.taskbarPollInterval,
    onUpdate: emitTaskbarSnapshot
  });

  function startMainProviders() {
    mediaController.start();
    clipboardMonitor.start();
    privacyMonitor.start();
    keyboardLockMonitor.start();
  }

  function syncSystemMonitorRunning(enabled) {
    if (enabled) {
      systemMonitor.start();
    } else {
      systemMonitor.stop();
    }
  }

  function startTaskbarWatch() {
    taskbarWatch.start();
  }

  function stopAll() {
    mediaController.stop();
    clipboardMonitor.stop();
    privacyMonitor.stop();
    keyboardLockMonitor.stop();
    systemMonitor.stop();
    taskbarWatch.stop();
  }

  return {
    acceptClipboardPending: (id) => clipboardMonitor.acceptPending(id),
    clearClipboardItems: () => clipboardMonitor.clearItems(),
    controlMedia: (action) => mediaController.control(action),
    dismissClipboardPending: (id) => clipboardMonitor.dismissPending(id),
    removeClipboardItem: (id) => clipboardMonitor.removeItem(id),
    seekMedia: (seconds) => mediaController.control("seek", seconds),
    startMainProviders,
    startTaskbarWatch,
    stopAll,
    syncSystemMonitorRunning,
    writeClipboardText: (text) => clipboardMonitor.writeText(text)
  };
}

module.exports = {
  createIslandProviderOrchestrator
};
