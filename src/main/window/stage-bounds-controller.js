function normalizeStageHeight(windowHeight, { minHeight, maxHeight }) {
  return Math.round(Math.min(maxHeight, Math.max(minHeight, Number(windowHeight) || minHeight)));
}

function boundsMatch(bounds, position, width, height) {
  return bounds.x === position.x && bounds.y === position.y && bounds.width === width && bounds.height === height;
}

function createStageBoundsController(options = {}) {
  const getWindow = options.getWindow || (() => undefined);
  const getCurrentMode = options.getCurrentMode || (() => "idle");
  const getWindowHeight = options.getWindowHeight || (() => 0);
  const setWindowHeight = options.setWindowHeight || (() => {});
  const getStageWidth = options.getStageWidth || (() => 0);
  const getPosition = options.getPosition || (() => ({ x: 0, y: 0 }));
  const resolvePosition = options.resolvePosition || ((position) => position);
  const getHeightForMode = options.getHeightForMode || (() => 0);
  const updateHitShape = options.updateHitShape || (() => {});
  const raiseForPointer = options.raiseForPointer || (() => {});
  const resizeCurrentMode = options.resizeCurrentMode || (() => {});
  const minHeight = Number(options.minHeight || 1);
  const maxHeight = Number(options.maxHeight || minHeight);

  function applyBounds(windowHeight = getWindowHeight(), applyOptions = {}) {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }

    const nextHeight = normalizeStageHeight(windowHeight, { minHeight, maxHeight });
    const position = resolvePosition(getPosition(nextHeight, applyOptions.logPosition !== false));
    const width = getStageWidth();
    const currentBounds = win.getBounds();
    setWindowHeight(nextHeight);

    if (!boundsMatch(currentBounds, position, width, nextHeight)) {
      win.setBounds({
        ...position,
        width,
        height: nextHeight
      });
    }

    updateHitShape();
    if (applyOptions.raise !== false) {
      raiseForPointer(true);
    }
  }

  function scheduleForMode(previousMode, nextMode) {
    const previousHeight = Math.max(getWindowHeight(), getHeightForMode(previousMode));
    const nextHeight = getHeightForMode(nextMode);

    if (nextHeight === getWindowHeight()) {
      updateHitShape();
      raiseForPointer(true);
      return;
    }

    if (nextHeight >= previousHeight) {
      applyBounds(nextHeight);
      return;
    }

    updateHitShape();
    raiseForPointer(true);
  }

  function reposition() {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }

    const position = resolvePosition(getPosition());
    win.setBounds({
      ...position,
      width: getStageWidth(),
      height: getWindowHeight()
    });
    updateHitShape();
    resizeCurrentMode(getCurrentMode());
  }

  return {
    applyBounds,
    reposition,
    scheduleForMode
  };
}

module.exports = {
  createStageBoundsController,
  normalizeStageHeight
};
