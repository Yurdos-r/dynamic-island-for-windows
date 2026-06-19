function registerIslandWindowLifecycle(options = {}) {
  const win = options.window;
  const logStartup = options.logStartup || (() => {});
  const events = options.events || {};

  if (!win || win.isDestroyed()) {
    return;
  }

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) {
      return;
    }

    if (events.readyToShow) {
      logStartup(events.readyToShow, win.getBounds());
    }
    if (typeof options.onReadyToShow === "function") {
      options.onReadyToShow();
    }
  });

  win.webContents.once("did-finish-load", () => {
    if (events.didFinishLoad) {
      logStartup(events.didFinishLoad);
    }
    if (typeof options.onDidFinishLoad === "function") {
      options.onDidFinishLoad();
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (events.didFailLoad) {
      logStartup(events.didFailLoad, { errorCode, errorDescription, validatedURL });
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    if (events.renderProcessGone) {
      logStartup(events.renderProcessGone, details);
    }
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (events.consoleMessage) {
      logStartup(events.consoleMessage, { level, message, line, sourceId });
    }
  });

  win.on("show", () => {
    if (events.show && !win.isDestroyed()) {
      logStartup(events.show, win.getBounds());
    }
  });

  win.on("hide", () => {
    if (events.hide) {
      logStartup(events.hide);
    }
  });

  win.on("closed", () => {
    if (events.closed) {
      logStartup(events.closed);
    }
    if (typeof options.onClosed === "function") {
      options.onClosed();
    }
  });

  win.on("blur", () => {
    if (typeof options.onBlur === "function") {
      options.onBlur();
    }
  });
}

module.exports = {
  registerIslandWindowLifecycle
};
