function createPointerWindowController(options = {}) {
  let mouseEventsIgnored = false;
  let lastPassthroughCheck = 0;
  let lastPointerRaiseAt = 0;

  const getWindow = options.getWindow || (() => undefined);
  const getTaskbarVisible = options.getTaskbarVisible || (() => true);
  const getRendererReady = options.getRendererReady || (() => false);
  const getRendererInteracting = options.getRendererInteracting || (() => false);
  const isPointerInsideMouseTarget = options.isPointerInsideMouseTarget || (() => false);
  const nativeHitShape = Boolean(options.nativeHitShape);
  const hoverDetection = options.hoverDetection || { mousePadding: 0, pollInterval: 32 };
  const raiseIntervalMs = Number(options.raiseIntervalMs || 0);

  function setMousePassthrough(ignored) {
    const win = getWindow();
    if (!win || win.isDestroyed() || mouseEventsIgnored === ignored) {
      return;
    }

    win.setIgnoreMouseEvents(ignored, { forward: true });
    mouseEventsIgnored = ignored;
  }

  function raiseForPointer(force = false) {
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      return;
    }

    if (!getTaskbarVisible()) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastPointerRaiseAt < raiseIntervalMs) {
      return;
    }

    lastPointerRaiseAt = now;
    win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  }

  function updateMousePassthrough(force = false) {
    if (nativeHitShape) {
      if (getRendererReady() && isPointerInsideMouseTarget(hoverDetection.mousePadding)) {
        raiseForPointer(force);
      }
      setMousePassthrough(!getRendererReady());
      return;
    }

    const now = Date.now();
    if (!force && now - lastPassthroughCheck < hoverDetection.pollInterval) {
      return;
    }
    lastPassthroughCheck = now;

    if (!getRendererReady()) {
      setMousePassthrough(true);
      return;
    }

    if (getRendererInteracting()) {
      setMousePassthrough(false);
      return;
    }

    setMousePassthrough(!isPointerInsideMouseTarget(hoverDetection.mousePadding));
  }

  return {
    raiseForPointer,
    setMousePassthrough,
    updateMousePassthrough
  };
}

module.exports = {
  createPointerWindowController
};
