function createHitTargetManager(options = {}) {
  let holdMode = "";
  let holdUntil = 0;
  let shapeRefreshTimer;

  const getWindow = options.getWindow || (() => undefined);
  const getCurrentMode = options.getCurrentMode || (() => "idle");
  const getLocalRect = options.getLocalRect || (() => ({ x: 0, y: 0, width: 1, height: 1 }));
  const getScreenRect = options.getScreenRect || (() => ({ x: 0, y: 0, width: 1, height: 1 }));
  const getModeArea = options.getModeArea || (() => 0);
  const getCursorPoint = options.getCursorPoint || (() => ({ x: 0, y: 0 }));
  const pointInRect = options.pointInRect || (() => false);
  const nativeHitShape = Boolean(options.nativeHitShape);
  const nativeHitShapePadding = Number(options.nativeHitShapePadding || 0);
  const collapseHoldMs = Number(options.collapseHoldMs || 0);

  function clearExpiredHold(now = Date.now()) {
    if (holdUntil && now >= holdUntil) {
      holdMode = "";
      holdUntil = 0;
    }
  }

  function clearShapeRefreshTimer() {
    if (shapeRefreshTimer) {
      clearTimeout(shapeRefreshTimer);
      shapeRefreshTimer = undefined;
    }
  }

  function resetHold() {
    holdMode = "";
    holdUntil = 0;
    clearShapeRefreshTimer();
  }

  function updateNativeHitShape() {
    const win = getWindow();
    if (!nativeHitShape || !win || win.isDestroyed() || typeof win.setShape !== "function") {
      return;
    }

    const now = Date.now();
    clearExpiredHold(now);

    const rects = [getLocalRect(getCurrentMode(), nativeHitShapePadding, nativeHitShapePadding)];

    if (holdMode && holdUntil > now) {
      rects.push(getLocalRect(holdMode, nativeHitShapePadding, nativeHitShapePadding));
    }

    win.setShape(rects);

    clearShapeRefreshTimer();
    if (holdMode && holdUntil > now) {
      shapeRefreshTimer = setTimeout(() => {
        shapeRefreshTimer = undefined;
        clearExpiredHold();
        updateNativeHitShape();
      }, holdUntil - now + 16);
    }
  }

  function armCollapseHitHold(previousMode, nextMode) {
    if (previousMode === nextMode) {
      return;
    }

    if (getModeArea(previousMode) <= getModeArea(nextMode)) {
      resetHold();
      return;
    }

    holdMode = previousMode;
    holdUntil = Date.now() + collapseHoldMs;
  }

  function isPointerInsideMouseTarget(padding = 0) {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return false;
    }

    const now = Date.now();
    const point = getCursorPoint();

    if (pointInRect(point, getScreenRect(getCurrentMode(), padding, padding))) {
      return true;
    }

    clearExpiredHold(now);
    return Boolean(holdMode && holdUntil > now && pointInRect(point, getScreenRect(holdMode, padding, padding)));
  }

  return {
    armCollapseHitHold,
    clearExpiredHold,
    clearShapeRefreshTimer,
    isPointerInsideMouseTarget,
    resetHold,
    updateNativeHitShape
  };
}

module.exports = {
  createHitTargetManager
};
