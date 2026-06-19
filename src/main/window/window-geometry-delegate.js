const { IPC_CHANNELS } = require("../../shared/island-contracts");

function createWindowGeometryDelegate(options = {}) {
  const state = options.state;
  const geometry = options.geometry;

  if (!state || !geometry) {
    throw new Error("state and geometry are required to create window geometry delegate.");
  }

  function getStagePosition(windowHeight = state.currentWindowHeight, shouldLog = true) {
    return geometry.getStagePosition(windowHeight, shouldLog);
  }

  function getSystemStagePosition(windowHeight = state.systemWindowHeight, shouldLog = true) {
    return geometry.getSystemStagePosition(windowHeight, shouldLog);
  }

  function getIslandLocalRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
    return geometry.getIslandLocalRect(mode, paddingX, paddingY);
  }

  function getSystemIslandLocalRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
    return geometry.getSystemIslandLocalRect(mode, paddingX, paddingY);
  }

  function getIslandRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
    return geometry.getIslandRect(mode, paddingX, paddingY);
  }

  function getSystemIslandRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
    return geometry.getSystemIslandRect(mode, paddingX, paddingY);
  }

  function getWindowHeightForMode(mode = state.currentMode) {
    return geometry.getWindowHeightForMode(mode);
  }

  function getSystemWindowHeightForMode(mode = state.systemCurrentMode) {
    return geometry.getSystemWindowHeightForMode(mode);
  }

  function sendAvoidScale() {
    if (!state.mainWindow || state.mainWindow.isDestroyed() || !state.rendererReady) {
      return;
    }

    state.mainWindow.webContents.send(IPC_CHANNELS.avoidScale, geometry.computeAvoidScale());
  }

  return {
    computeAvoidScale: geometry.computeAvoidScale,
    getCursorPoint: geometry.getCursorPoint,
    getIslandLocalRect,
    getIslandRect,
    getModeArea: geometry.getModeArea,
    getStagePosition,
    getSystemIslandLocalRect,
    getSystemIslandRect,
    getSystemStagePosition,
    getSystemWindowHeightForMode,
    getWindowHeightForMode,
    isPointerInsideCurrentCard: geometry.isPointerInsideCurrentCard,
    isPointerInsideSystemCard: geometry.isPointerInsideSystemCard,
    pointInRect: geometry.pointInRect,
    sendAvoidScale
  };
}

module.exports = {
  createWindowGeometryDelegate
};
