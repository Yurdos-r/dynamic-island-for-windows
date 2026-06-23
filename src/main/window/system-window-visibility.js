const SYSTEM_PARK_Y_OFFSET = 10000;

function createSystemWindowVisibilityManager(options = {}) {
  let parked = false;
  let visibilityToken = 0;

  const getWindow = options.getWindow || (() => undefined);
  const isRendererReady = options.isRendererReady || (() => false);
  const logStartup = options.logStartup || (() => {});
  const collapseToIdle = options.collapseToIdle || (() => {});
  const reposition = options.reposition || (() => {});
  const raise = options.raise || (() => {});
  const restoreHitState = options.restoreHitState || (() => {});

  function getWindowState(win) {
    if (!win || win.isDestroyed()) {
      return { available: false };
    }

    return {
      available: true,
      bounds: typeof win.getBounds === "function" ? win.getBounds() : undefined,
      opacity: typeof win.getOpacity === "function" ? win.getOpacity() : undefined,
      visible: typeof win.isVisible === "function" ? win.isVisible() : undefined
    };
  }

  function forceShow(win) {
    if (!win || win.isDestroyed()) {
      return;
    }

    if (typeof win.isVisible === "function" && win.isVisible()) {
      return;
    }

    if (typeof win.showInactive === "function") {
      win.showInactive();
      return;
    }

    win.show();
  }

  function isParked() {
    return parked;
  }

  function resolveY(y) {
    return parked ? y + SYSTEM_PARK_Y_OFFSET : y;
  }

  function unpark() {
    parked = false;
  }

  // Keep the transparent system window shown at opacity 1. On Windows layered
  // windows, hide() can drop native hit testing, and setOpacity(0) can leave DWM
  // with no recomposited pixels after returning to opacity 1 under software
  // rendering. Parking off-screen avoids both failure modes.
  function parkWithoutFade() {
    visibilityToken += 1;
    parked = true;
    reposition();
    const systemWindow = getWindow();
    if (systemWindow && !systemWindow.isDestroyed()) {
      logStartup("system-window-park", getWindowState(systemWindow));
    }
  }

  function show() {
    visibilityToken += 1;
    unpark();
    collapseToIdle();
    reposition();
    const systemWindow = getWindow();
    if (!systemWindow || systemWindow.isDestroyed()) {
      return;
    }

    logStartup("system-window-restore", {
      rendererReady: isRendererReady(),
      before: getWindowState(systemWindow)
    });
    forceShow(systemWindow);
    raise(true);
    restoreHitState();
    logStartup("system-window-restored", getWindowState(systemWindow));
  }

  function hide() {
    collapseToIdle();
    parkWithoutFade();
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
