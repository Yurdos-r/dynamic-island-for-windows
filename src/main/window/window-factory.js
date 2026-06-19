const { BrowserWindow } = require("electron");

function createIslandBrowserWindow(options = {}) {
  const opaqueWindow = Boolean(options.opaqueWindow);

  return new BrowserWindow({
    width: options.width,
    height: options.height,
    ...options.position,
    show: false,
    frame: false,
    transparent: !opaqueWindow,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: opaqueWindow ? "#05070c" : "#00000000",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
}

function configureIslandBrowserWindow(win) {
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
}

module.exports = {
  configureIslandBrowserWindow,
  createIslandBrowserWindow
};
