const { configureIslandBrowserWindow, createIslandBrowserWindow } = require("./window-factory");
const { registerIslandWindowLifecycle } = require("./window-lifecycle");

function createWindowCreationController(options = {}) {
  const state = options.state;
  const logStartup = options.logStartup || (() => {});
  const loadRendererEntry = options.loadRendererEntry;
  const getDevServerUrl = options.getDevServerUrl;
  const opaqueWindow = Boolean(options.opaqueWindow);
  const preloadPath = options.preloadPath;
  const getWindowHeightForMode = options.getWindowHeightForMode || (() => 0);
  const getSystemWindowHeightForMode = options.getSystemWindowHeightForMode || (() => 0);
  const getStagePosition = options.getStagePosition || (() => ({ x: 0, y: 0 }));
  const getSystemStagePosition = options.getSystemStagePosition || (() => ({ x: 0, y: 0 }));
  const updateNativeHitShape = options.updateNativeHitShape || (() => {});
  const updateSystemNativeHitShape = options.updateSystemNativeHitShape || (() => {});
  const setMousePassthrough = options.setMousePassthrough || (() => {});
  const setSystemMousePassthrough = options.setSystemMousePassthrough || (() => {});
  const resizeIsland = options.resizeIsland || (() => {});
  const resizeSystemIsland = options.resizeSystemIsland || (() => {});
  const raiseWindowForPointer = options.raiseWindowForPointer || (() => {});
  const raiseSystemWindowForPointer = options.raiseSystemWindowForPointer || (() => {});
  const requestIslandMode = options.requestIslandMode || (() => {});
  const requestSystemIslandMode = options.requestSystemIslandMode || (() => {});
  const repositionStageWindow = options.repositionStageWindow || (() => {});
  const repositionSystemStageWindow = options.repositionSystemStageWindow || (() => {});
  const systemWindowShouldShow = options.systemWindowShouldShow || (() => false);
  const unparkSystemWindow = options.unparkSystemWindow || (() => {});
  const systemWindowVisibility = options.systemWindowVisibility;
  const createBrowserWindow = options.createIslandBrowserWindow || createIslandBrowserWindow;
  const configureBrowserWindow = options.configureIslandBrowserWindow || configureIslandBrowserWindow;
  const registerWindowLifecycle = options.registerIslandWindowLifecycle || registerIslandWindowLifecycle;

  if (!state) {
    throw new Error("state is required to create window creation controller.");
  }
  if (typeof loadRendererEntry !== "function") {
    throw new Error("loadRendererEntry is required to create window creation controller.");
  }

  function createWindow() {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      logStartup("reuse-window", state.mainWindow.getBounds());
      repositionStageWindow();
      state.mainWindow.show();
      raiseWindowForPointer(true);
      return state.mainWindow;
    }

    state.rendererReady = false;
    state.currentWindowHeight = getWindowHeightForMode(state.currentMode);
    const position = getStagePosition(state.currentWindowHeight);
    logStartup("create-window", { ...position, opaqueWindow });

    state.mainWindow = createBrowserWindow({
      width: state.stageWidth,
      height: state.currentWindowHeight,
      position,
      opaqueWindow,
      preloadPath
    });

    configureBrowserWindow(state.mainWindow, { opaqueWindow });
    updateNativeHitShape();
    setMousePassthrough(true);

    registerWindowLifecycle({
      window: state.mainWindow,
      logStartup,
      events: {
        readyToShow: "ready-to-show",
        didFinishLoad: "did-finish-load",
        didFailLoad: "did-fail-load",
        renderProcessGone: "render-process-gone",
        consoleMessage: "renderer-console",
        show: "window-show",
        hide: "window-hide",
        closed: "window-closed"
      },
      onReadyToShow: () => {
        if (!state.mainWindow || state.mainWindow.isDestroyed()) {
          return;
        }

        resizeIsland(state.currentMode);
        state.mainWindow.show();
        raiseWindowForPointer(true);
      },
      onDidFinishLoad: () => {
        if (!state.mainWindow || state.mainWindow.isDestroyed() || state.mainWindow.isVisible()) {
          return;
        }

        resizeIsland(state.currentMode);
        state.mainWindow.show();
        raiseWindowForPointer(true);
      },
      onClosed: () => {
        state.mainWindow = undefined;
      },
      onBlur: () => {
        if (
          state.currentMode !== "expanded" &&
          state.currentMode !== "clipboard" &&
          state.currentMode !== "settings" &&
          state.currentMode !== "privacy" &&
          state.currentMode !== "privacy-expanded"
        ) {
          requestIslandMode("idle");
        }
      }
    });
    loadRendererEntry(state.mainWindow, "index.html", "main", { getDevServerUrl, logStartup });
    return state.mainWindow;
  }

  function createSystemWindow() {
    if (state.systemWindow && !state.systemWindow.isDestroyed()) {
      logStartup("reuse-system-window", state.systemWindow.getBounds());
      if (systemWindowShouldShow()) {
        unparkSystemWindow();
        repositionSystemStageWindow();
        state.systemWindow.show();
        raiseSystemWindowForPointer(true);
      }
      return state.systemWindow;
    }

    state.systemRendererReady = false;
    state.systemCurrentMode = "idle";
    state.systemWindowHeight = getSystemWindowHeightForMode(state.systemCurrentMode);
    const position = getSystemStagePosition(state.systemWindowHeight);
    logStartup("create-system-window", { ...position, opaqueWindow });

    state.systemWindow = createBrowserWindow({
      width: state.systemStageWidth,
      height: state.systemWindowHeight,
      position,
      opaqueWindow,
      preloadPath
    });

    configureBrowserWindow(state.systemWindow, { opaqueWindow });
    updateSystemNativeHitShape();
    setSystemMousePassthrough(true);

    registerWindowLifecycle({
      window: state.systemWindow,
      logStartup,
      events: {
        readyToShow: "system-ready-to-show",
        didFinishLoad: "system-did-finish-load",
        didFailLoad: "system-did-fail-load",
        renderProcessGone: "system-render-process-gone",
        consoleMessage: "system-renderer-console",
        show: "system-window-show",
        hide: "system-window-hide",
        closed: "system-window-closed"
      },
      onReadyToShow: () => {
        if (!state.systemWindow || state.systemWindow.isDestroyed()) {
          return;
        }

        resizeSystemIsland(state.systemCurrentMode);
        if (state.taskbarVisible && systemWindowShouldShow()) {
          state.systemWindow.show();
          raiseSystemWindowForPointer(true);
        }
      },
      onDidFinishLoad: () => {
        if (!state.systemWindow || state.systemWindow.isDestroyed() || state.systemWindow.isVisible()) {
          return;
        }

        resizeSystemIsland(state.systemCurrentMode);
        if (state.taskbarVisible && systemWindowShouldShow()) {
          state.systemWindow.show();
          raiseSystemWindowForPointer(true);
        }
      },
      onClosed: () => {
        state.systemWindow = undefined;
      },
      onBlur: () => {
        if (state.systemCurrentMode !== "idle") {
          requestSystemIslandMode("idle");
        }
      }
    });
    loadRendererEntry(state.systemWindow, "system.html", "system", { getDevServerUrl, logStartup });
    return state.systemWindow;
  }

  function showExistingWindow() {
    if (!state.mainWindow || state.mainWindow.isDestroyed()) {
      createWindow();
    }

    if (!state.systemWindow || state.systemWindow.isDestroyed()) {
      createSystemWindow();
    }

    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      repositionStageWindow();
      state.mainWindow.show();
      raiseWindowForPointer(true);
      requestIslandMode(
        state.privacyActive && (state.currentMode === "privacy" || state.currentMode === "privacy-expanded")
          ? state.currentMode
          : state.privacyActive
            ? "privacy"
            : "peek"
      );
    }

    if (state.systemWindow && !state.systemWindow.isDestroyed()) {
      if (systemWindowShouldShow()) {
        unparkSystemWindow();
        repositionSystemStageWindow();
        state.systemWindow.show();
        raiseSystemWindowForPointer(true);
      } else {
        state.systemWindow.show();
        systemWindowVisibility.parkWithoutFade();
      }
    }
  }

  return {
    createSystemWindow,
    createWindow,
    showExistingWindow
  };
}

module.exports = {
  createWindowCreationController
};
