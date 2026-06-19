const { createWindowFader } = require("./fade-controller");
const { createLayoutTaskbarPolicy } = require("./layout-taskbar-policy");
const { createSystemWindowVisibilityManager } = require("./system-window-visibility");

function createWindowVisibilityLayoutDelegate(options = {}) {
  const state = options.state;
  const logStartup = options.logStartup || (() => {});
  const validLayouts = options.validLayouts || new Set(["classic", "top-center"]);
  const writeUiSettings = options.writeUiSettings || (() => {});
  const onSystemMonitorRunningChange =
    typeof options.onSystemMonitorRunningChange === "function" ? options.onSystemMonitorRunningChange : () => {};
  const collapseSystemWindowToIdle = options.collapseSystemWindowToIdle || (() => {});
  const repositionStageWindow = options.repositionStageWindow || (() => {});
  const repositionSystemStageWindow = options.repositionSystemStageWindow || (() => {});
  const raiseWindowForPointer = options.raiseWindowForPointer || (() => {});
  const raiseSystemWindowForPointer = options.raiseSystemWindowForPointer || (() => {});
  const restoreSystemWindowHitState = options.restoreSystemWindowHitState || (() => {});
  const sendAvoidScale = options.sendAvoidScale || (() => {});

  if (!state) {
    throw new Error("state is required to create window visibility layout delegate.");
  }

  const windowFader = createWindowFader();

  function fadeWindowTo(win, target, done) {
    windowFader.fadeTo(win, target, done);
  }

  function fadeOutAndHide(win) {
    windowFader.fadeOutAndHide(win);
  }

  function showAndFadeIn(win, raise, onShown) {
    windowFader.showAndFadeIn(win, raise, onShown);
  }

  function syncSystemMonitorRunning() {
    onSystemMonitorRunningChange(state.systemMonitorEnabled);
  }

  const systemWindowVisibility = createSystemWindowVisibilityManager({
    getWindow: () => state.systemWindow,
    isRendererReady: () => state.systemRendererReady,
    collapseToIdle: collapseSystemWindowToIdle,
    reposition: repositionSystemStageWindow,
    fadeTo: fadeWindowTo,
    showAndFadeIn,
    raise: raiseSystemWindowForPointer,
    restoreHitState: restoreSystemWindowHitState
  });

  function unparkSystemWindow() {
    systemWindowVisibility.unpark();
  }

  function showSystemWindow() {
    systemWindowVisibility.show();
  }

  function hideSystemWindow() {
    systemWindowVisibility.hide();
  }

  const layoutTaskbarPolicy = createLayoutTaskbarPolicy({
    validLayouts,
    getLayout: () => state.layout,
    setLayoutValue: (value) => {
      state.layout = value;
    },
    getSystemMonitorEnabled: () => state.systemMonitorEnabled,
    setSystemMonitorEnabledValue: (value) => {
      state.systemMonitorEnabled = value;
    },
    getTaskbarVisible: () => state.taskbarVisible,
    setTaskbarVisibleValue: (value) => {
      state.taskbarVisible = value;
    },
    getMainWindow: () => state.mainWindow,
    getSystemWindow: () => state.systemWindow,
    isRendererReady: () => state.rendererReady,
    isSystemRendererReady: () => state.systemRendererReady,
    logStartup,
    writeUiSettings,
    repositionMainWindow: repositionStageWindow,
    showMainWindow: (win) => showAndFadeIn(win, raiseWindowForPointer),
    hideMainWindow: fadeOutAndHide,
    showSystemWindow,
    hideSystemWindow,
    sendAvoidScale,
    syncSystemMonitorRunning
  });

  return {
    applyLayout: layoutTaskbarPolicy.applyLayout,
    applySystemMonitorEnabled: layoutTaskbarPolicy.applySystemMonitorEnabled,
    applyTaskbarVisibility: layoutTaskbarPolicy.applyTaskbarVisibility,
    fadeOutAndHide,
    fadeWindowTo,
    getUiSettings: layoutTaskbarPolicy.getUiSettings,
    hideSystemWindow,
    showAndFadeIn,
    showSystemWindow,
    syncSystemMonitorRunning,
    systemWindowShouldShow: layoutTaskbarPolicy.systemWindowShouldShow,
    systemWindowVisibility,
    unparkSystemWindow
  };
}

module.exports = {
  createWindowVisibilityLayoutDelegate
};
