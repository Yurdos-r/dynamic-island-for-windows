const { BrowserWindow } = require("electron");
const { getAppAssetPath } = require("../app-paths");

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
    icon: getAppAssetPath("app-icon.ico"),
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

function configureIslandBrowserWindow(win, options = {}) {
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);

  // NOTE: acrylic blur-behind is temporarily disabled. On a transparent
  // DirectComposition window the OS acrylic fills the entire window rectangle
  // (the 540x360 stage) — setShape only clips hit-testing, not the visual — so
  // the blur leaked across the whole stage and covered the desktop. Re-enabling
  // requires sizing the window tight to the pill (see notes), not this hook.
  void options;
}

module.exports = {
  configureIslandBrowserWindow,
  createIslandBrowserWindow
};
