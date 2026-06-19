const { IPC_CHANNELS } = require("../../shared/island-contracts");
const {
  coerceIslandMode: normalizeIslandMode,
  resolveModeForMediaState: resolveLayoutModeForMediaState
} = require("./layout-engine");

function createWindowModeController(options = {}) {
  const state = options.state;
  const mainHoverController = options.mainHoverController;
  const systemHoverController = options.systemHoverController;
  const mainHitTarget = options.mainHitTarget;
  const systemHitTarget = options.systemHitTarget;
  const mainStageBounds = options.mainStageBounds;
  const systemStageBounds = options.systemStageBounds;
  const mainPointerController = options.mainPointerController;
  const systemPointerController = options.systemPointerController;
  const getSystemWindowHeightForMode = options.getSystemWindowHeightForMode || (() => 0);
  const sendAvoidScale = options.sendAvoidScale || (() => {});

  if (!state) {
    throw new Error("state is required to create window mode controller.");
  }

  function coerceIslandMode(mode) {
    return normalizeIslandMode(mode);
  }

  function resolveModeForMediaState(mode) {
    return resolveLayoutModeForMediaState(mode, {
      mediaActive: state.mediaActive,
      privacyActive: state.privacyActive
    });
  }

  function resizeIsland(mode) {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      return state.currentMode;
    }

    const previousMode = state.currentMode;
    state.currentMode = resolveModeForMediaState(mode);
    mainHitTarget.armCollapseHitHold(previousMode, state.currentMode);
    mainStageBounds.scheduleForMode(previousMode, state.currentMode);
    mainPointerController.updateMousePassthrough(true);
    if (previousMode !== state.currentMode) {
      sendAvoidScale();
    }
    return state.currentMode;
  }

  function resizeSystemIsland(mode) {
    if (!state.systemWindow || state.systemWindow.isDestroyed()) {
      return state.systemCurrentMode;
    }

    const previousMode = state.systemCurrentMode;
    state.systemCurrentMode = coerceIslandMode(mode);
    if (state.systemCurrentMode !== "idle" && state.systemCurrentMode !== "hover" && state.systemCurrentMode !== "expanded") {
      state.systemCurrentMode = "idle";
    }
    systemHitTarget.armCollapseHitHold(previousMode, state.systemCurrentMode);
    systemStageBounds.scheduleForMode(previousMode, state.systemCurrentMode);
    systemPointerController.updateMousePassthrough(true);
    return state.systemCurrentMode;
  }

  function collapseSystemWindowToIdle() {
    state.systemCurrentMode = "idle";
    systemHitTarget.resetHold();
    state.systemWindowHeight = getSystemWindowHeightForMode("idle");
    if (state.systemWindow && !state.systemWindow.isDestroyed() && state.systemRendererReady) {
      state.systemWindow.webContents.send(IPC_CHANNELS.setMode, "idle");
    }
  }

  function requestIslandMode(mode) {
    if (!state.mainWindow || state.mainWindow.isDestroyed() || !state.rendererReady) {
      return;
    }

    const nextMode = resolveModeForMediaState(mode);
    mainHoverController.clearTimers();
    resizeIsland(nextMode);
    setTimeout(() => {
      if (!state.mainWindow || state.mainWindow.isDestroyed() || !state.rendererReady) {
        return;
      }

      state.mainWindow.webContents.send(IPC_CHANNELS.setMode, nextMode);
    }, 16);
  }

  function requestSystemIslandMode(mode) {
    if (!state.systemWindow || state.systemWindow.isDestroyed() || !state.systemRendererReady) {
      return;
    }

    const nextMode = resizeSystemIsland(mode);
    systemHoverController.clearCloseTimer();

    setTimeout(() => {
      if (!state.systemWindow || state.systemWindow.isDestroyed() || !state.systemRendererReady) {
        return;
      }

      state.systemWindow.webContents.send(IPC_CHANNELS.setMode, nextMode);
    }, 16);
  }

  return {
    coerceIslandMode,
    collapseSystemWindowToIdle,
    requestIslandMode,
    requestSystemIslandMode,
    resizeIsland,
    resizeSystemIsland,
    resolveModeForMediaState
  };
}

module.exports = {
  createWindowModeController
};
