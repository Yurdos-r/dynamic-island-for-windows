const { screen } = require("electron");
const {
  computeAvoidScale: computeLayoutAvoidScale,
  getMainIslandLocalRect,
  getMainStageMetrics,
  getModeArea: getLayoutModeArea,
  getSystemIslandLocalRect: getSystemIslandLocalRectFromLayout,
  getSystemStageMetrics,
  getWindowHeightForMode: getLayoutWindowHeightForMode,
  pointInRect
} = require("./layout-engine");

function createWindowGeometryController(options = {}) {
  const state = options.state;
  const logStartup = options.logStartup || (() => {});

  if (!state) {
    throw new Error("state is required to create window geometry controller.");
  }

  function getCursorPoint() {
    return screen.getCursorScreenPoint();
  }

  function getNearestDisplay(point = getCursorPoint()) {
    return screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  }

  function getStagePosition(windowHeight = state.currentWindowHeight, shouldLog = true) {
    const point = getCursorPoint();
    const display = getNearestDisplay(point);
    const metrics = getMainStageMetrics({ display, layout: state.layout, windowHeight });
    state.stageWidth = metrics.stageWidth;

    if (shouldLog) {
      logStartup("stage-position", {
        cursor: point,
        bounds: display.bounds,
        workArea: display.workArea,
        taskbarIconLeft: state.taskbarIconLeft,
        stageWidthFixed: true,
        layout: state.layout,
        windowHeight,
        stageWidth: state.stageWidth,
        position: metrics.position
      });
    }

    return metrics.position;
  }

  function getSystemStagePosition(windowHeight = state.systemWindowHeight, shouldLog = true) {
    const point = getCursorPoint();
    const display = getNearestDisplay(point);
    const metrics = getSystemStageMetrics({ display, windowHeight });
    state.systemStageWidth = metrics.systemStageWidth;

    if (shouldLog) {
      logStartup("system-stage-position", {
        cursor: point,
        bounds: display.bounds,
        workArea: display.workArea,
        windowHeight,
        systemStageWidth: state.systemStageWidth,
        position: metrics.position
      });
    }

    return metrics.position;
  }

  function getIslandLocalRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
    return getMainIslandLocalRect({
      mode,
      layout: state.layout,
      stageWidth: state.stageWidth,
      windowHeight: state.currentWindowHeight,
      paddingX,
      paddingY
    });
  }

  function getSystemIslandLocalRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
    return getSystemIslandLocalRectFromLayout({
      mode,
      systemStageWidth: state.systemStageWidth,
      systemWindowHeight: state.systemWindowHeight,
      paddingX,
      paddingY
    });
  }

  function getIslandRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const bounds = state.mainWindow.getBounds();
    const localRect = getIslandLocalRect(mode, paddingX, paddingY);

    return {
      x: Math.round(bounds.x + localRect.x),
      y: Math.round(bounds.y + localRect.y),
      width: localRect.width,
      height: localRect.height
    };
  }

  function getSystemIslandRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
    if (!state.systemWindow || state.systemWindow.isDestroyed()) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const bounds = state.systemWindow.getBounds();
    const localRect = getSystemIslandLocalRect(mode, paddingX, paddingY);

    return {
      x: Math.round(bounds.x + localRect.x),
      y: Math.round(bounds.y + localRect.y),
      width: localRect.width,
      height: localRect.height
    };
  }

  function isPointerInsideCurrentCard(padding = 0) {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      return false;
    }

    return pointInRect(getCursorPoint(), getIslandRect(state.currentMode, padding, padding));
  }

  function isPointerInsideSystemCard(padding = 0) {
    if (!state.systemWindow || state.systemWindow.isDestroyed()) {
      return false;
    }

    return pointInRect(getCursorPoint(), getSystemIslandRect(state.systemCurrentMode, padding, padding));
  }

  function computeAvoidScale() {
    const point = getCursorPoint();
    const display = getNearestDisplay(point);
    return computeLayoutAvoidScale({
      layout: state.layout,
      taskbarIconLeft: state.taskbarIconLeft,
      display,
      currentMode: state.currentMode
    });
  }

  return {
    computeAvoidScale,
    getCursorPoint,
    getIslandLocalRect,
    getIslandRect,
    getModeArea: getLayoutModeArea,
    getStagePosition,
    getSystemIslandLocalRect,
    getSystemIslandRect,
    getSystemStagePosition,
    getSystemWindowHeightForMode: getLayoutWindowHeightForMode,
    getWindowHeightForMode: getLayoutWindowHeightForMode,
    isPointerInsideCurrentCard,
    isPointerInsideSystemCard,
    pointInRect
  };
}

module.exports = {
  createWindowGeometryController
};
