const SYSTEM_PARK_Y_OFFSET = 10000;

function createSystemWindowVisibilityManager(options = {}) {
  let parked = false;
  let visibilityToken = 0;

  const getWindow = options.getWindow || (() => undefined);
  const isRendererReady = options.isRendererReady || (() => false);
  const collapseToIdle = options.collapseToIdle || (() => {});
  const reposition = options.reposition || (() => {});
  const fadeTo = options.fadeTo || (() => {});
  const showAndFadeIn = options.showAndFadeIn || (() => {});
  const raise = options.raise || (() => {});
  const restoreHitState = options.restoreHitState || (() => {});

  function isParked() {
    return parked;
  }

  function resolveY(y) {
    return parked ? y + SYSTEM_PARK_Y_OFFSET : y;
  }

  function unpark() {
    parked = false;
  }

  function parkWithoutFade() {
    parked = true;
    reposition();
  }

  function fadeOutAndPark() {
    const systemWindow = getWindow();
    if (!systemWindow || systemWindow.isDestroyed()) {
      return;
    }

    if (!systemWindow.isVisible()) {
      parkWithoutFade();
      return;
    }

    const token = ++visibilityToken;
    fadeTo(systemWindow, 0, () => {
      const currentWindow = getWindow();
      if (token !== visibilityToken || !currentWindow || currentWindow.isDestroyed()) {
        return;
      }

      parked = true;
      reposition();
    });
  }

  function show() {
    visibilityToken += 1;
    unpark();
    collapseToIdle();
    reposition();
    const systemWindow = getWindow();
    if (isRendererReady() && systemWindow && !systemWindow.isDestroyed()) {
      showAndFadeIn(systemWindow, raise, restoreHitState);
    }
  }

  function hide() {
    collapseToIdle();
    fadeOutAndPark();
  }

  return {
    hide,
    isParked,
    parkWithoutFade,
    resolveY,
    show,
    unpark
  };
}

module.exports = {
  createSystemWindowVisibilityManager
};
