const {
  COLLAPSE_HIT_AREA_HOLD_MS,
  HOVER_DETECTION,
  NATIVE_HIT_SHAPE,
  NATIVE_HIT_SHAPE_PADDING,
  RAISE_ON_POINTER_INTERVAL_MS
} = require("./window-config");
const { createHitTargetManager } = require("./hit-target-manager");
const { createMainHoverController, createSystemHoverController } = require("./hover-controller");
const { createPointerWindowController } = require("./pointer-window-controller");

function createWindowInteractionDelegate(options = {}) {
  const state = options.state;
  const geometry = options.geometry;
  const requestIslandMode = options.requestIslandMode || (() => {});
  const requestSystemIslandMode = options.requestSystemIslandMode || (() => {});

  if (!state || !geometry) {
    throw new Error("state and geometry are required to create window interaction delegate.");
  }

  function clearShapeRefreshTimer() {
    mainHitTarget.clearShapeRefreshTimer();
  }

  function clearSystemShapeRefreshTimer() {
    systemHitTarget.clearShapeRefreshTimer();
  }

  function updateNativeHitShape() {
    mainHitTarget.updateNativeHitShape();
  }

  function updateSystemNativeHitShape() {
    systemHitTarget.updateNativeHitShape();
  }

  function isPointerInsideMouseTarget(padding = 0) {
    return mainHitTarget.isPointerInsideMouseTarget(padding);
  }

  function isPointerInsideSystemMouseTarget(padding = 0) {
    return systemHitTarget.isPointerInsideMouseTarget(padding);
  }

  function setMousePassthrough(ignored) {
    mainPointerController.setMousePassthrough(ignored);
  }

  function setSystemMousePassthrough(ignored) {
    systemPointerController.setMousePassthrough(ignored);
  }

  function raiseWindowForPointer(force = false) {
    mainPointerController.raiseForPointer(force);
  }

  function raiseSystemWindowForPointer(force = false) {
    systemPointerController.raiseForPointer(force);
  }

  function updateMousePassthrough(force = false) {
    mainPointerController.updateMousePassthrough(force);
  }

  function updateSystemMousePassthrough(force = false) {
    systemPointerController.updateMousePassthrough(force);
  }

  function startHoverDetection() {
    mainHoverController.start();
  }

  function startSystemHoverDetection() {
    systemHoverController.start();
  }

  function stopHoverDetection() {
    mainHoverController.stop();
    clearShapeRefreshTimer();
  }

  function stopSystemHoverDetection() {
    systemHoverController.stop();
    clearSystemShapeRefreshTimer();
  }

  function restoreSystemWindowHitState() {
    updateSystemNativeHitShape();
    updateSystemMousePassthrough(true);
  }

  const mainHoverController = createMainHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => state.currentMode,
    isPointerInsideCard: geometry.isPointerInsideCurrentCard,
    isPrivacyActive: () => state.privacyActive,
    requestIslandMode,
    updateMousePassthrough
  });

  const systemHoverController = createSystemHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => state.systemCurrentMode,
    isPointerInsideCard: geometry.isPointerInsideSystemCard,
    requestIslandMode: requestSystemIslandMode,
    updateMousePassthrough: updateSystemMousePassthrough
  });

  const mainHitTarget = createHitTargetManager({
    nativeHitShape: NATIVE_HIT_SHAPE,
    nativeHitShapePadding: NATIVE_HIT_SHAPE_PADDING,
    collapseHoldMs: COLLAPSE_HIT_AREA_HOLD_MS,
    getWindow: () => state.mainWindow,
    getCurrentMode: () => state.currentMode,
    getLocalRect: geometry.getIslandLocalRect,
    getScreenRect: geometry.getIslandRect,
    getModeArea: geometry.getModeArea,
    getCursorPoint: geometry.getCursorPoint,
    pointInRect: geometry.pointInRect
  });

  const systemHitTarget = createHitTargetManager({
    nativeHitShape: NATIVE_HIT_SHAPE,
    nativeHitShapePadding: NATIVE_HIT_SHAPE_PADDING,
    collapseHoldMs: COLLAPSE_HIT_AREA_HOLD_MS,
    getWindow: () => state.systemWindow,
    getCurrentMode: () => state.systemCurrentMode,
    getLocalRect: geometry.getSystemIslandLocalRect,
    getScreenRect: geometry.getSystemIslandRect,
    getModeArea: geometry.getModeArea,
    getCursorPoint: geometry.getCursorPoint,
    pointInRect: geometry.pointInRect
  });

  const mainPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => state.mainWindow,
    getTaskbarVisible: () => state.taskbarVisible,
    getRendererReady: () => state.rendererReady,
    getRendererInteracting: () => state.rendererInteracting,
    isPointerInsideMouseTarget
  });

  const systemPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => state.systemWindow,
    getTaskbarVisible: () => state.taskbarVisible,
    getRendererReady: () => state.systemRendererReady,
    getRendererInteracting: () => state.systemRendererInteracting,
    isPointerInsideMouseTarget: isPointerInsideSystemMouseTarget
  });

  return {
    clearShapeRefreshTimer,
    clearSystemShapeRefreshTimer,
    mainHitTarget,
    mainHoverController,
    mainPointerController,
    raiseSystemWindowForPointer,
    raiseWindowForPointer,
    restoreSystemWindowHitState,
    setMousePassthrough,
    setSystemMousePassthrough,
    startHoverDetection,
    startSystemHoverDetection,
    stopHoverDetection,
    stopSystemHoverDetection,
    systemHitTarget,
    systemHoverController,
    systemPointerController,
    updateMousePassthrough,
    updateNativeHitShape,
    updateSystemMousePassthrough,
    updateSystemNativeHitShape
  };
}

module.exports = {
  createWindowInteractionDelegate
};
