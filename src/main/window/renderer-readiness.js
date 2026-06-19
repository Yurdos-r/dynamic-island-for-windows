const { IPC_CHANNELS } = require("../../shared/island-contracts");

function createRendererReadinessController(options = {}) {
  const state = options.state;
  const logStartup = options.logStartup || (() => {});
  const raiseWindowForPointer = options.raiseWindowForPointer || (() => {});
  const raiseSystemWindowForPointer = options.raiseSystemWindowForPointer || (() => {});
  const resizeIsland = options.resizeIsland || (() => {});
  const resizeSystemIsland = options.resizeSystemIsland || (() => {});
  const sendAvoidScale = options.sendAvoidScale || (() => {});
  const startHoverDetection = options.startHoverDetection || (() => {});
  const startSystemHoverDetection = options.startSystemHoverDetection || (() => {});
  const syncSystemMonitorRunning = options.syncSystemMonitorRunning || (() => {});
  const systemWindowShouldShow = options.systemWindowShouldShow || (() => false);
  const systemWindowVisibility = options.systemWindowVisibility;

  if (!state) {
    throw new Error("state is required to create renderer readiness controller.");
  }

  function handleMainRendererReady() {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      return;
    }

    state.rendererReady = true;
    logStartup("renderer-ready", state.mainWindow.getBounds());
    resizeIsland(state.currentMode);

    if (state.taskbarVisible) {
      state.mainWindow.show();
      raiseWindowForPointer(true);
    }

    startHoverDetection();
    sendAvoidScale();
    state.mainWindow.webContents.send(IPC_CHANNELS.layoutChanged, {
      layout: state.layout,
      systemMonitorEnabled: state.systemMonitorEnabled
    });
  }

  function handleSystemRendererReady() {
    if (!state.systemWindow || state.systemWindow.isDestroyed()) {
      return;
    }

    state.systemRendererReady = true;
    logStartup("system-renderer-ready", state.systemWindow.getBounds());
    resizeSystemIsland(state.systemCurrentMode);

    if (state.taskbarVisible && systemWindowShouldShow()) {
      state.systemWindow.show();
      raiseSystemWindowForPointer(true);
    } else {
      state.systemWindow.show();
      systemWindowVisibility?.parkWithoutFade();
    }

    startSystemHoverDetection();
    syncSystemMonitorRunning();
  }

  return {
    handleMainRendererReady,
    handleSystemRendererReady
  };
}

module.exports = {
  createRendererReadinessController
};
