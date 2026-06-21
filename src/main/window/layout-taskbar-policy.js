const { IPC_CHANNELS } = require("../../shared/island-contracts");

function createLayoutTaskbarPolicy(options = {}) {
  const validLayouts = options.validLayouts || new Set(["classic", "top-center"]);
  const getLayout = options.getLayout || (() => "top-center");
  const setLayoutValue = options.setLayoutValue || (() => {});
  const getSystemMonitorEnabled = options.getSystemMonitorEnabled || (() => true);
  const setSystemMonitorEnabledValue = options.setSystemMonitorEnabledValue || (() => {});
  const getTaskbarVisible = options.getTaskbarVisible || (() => true);
  const setTaskbarVisibleValue = options.setTaskbarVisibleValue || (() => {});
  const getMainWindow = options.getMainWindow || (() => undefined);
  const getSystemWindow = options.getSystemWindow || (() => undefined);
  const isRendererReady = options.isRendererReady || (() => false);
  const isSystemRendererReady = options.isSystemRendererReady || (() => false);
  const logStartup = options.logStartup || (() => {});
  const writeUiSettings = options.writeUiSettings || (() => {});
  const repositionMainWindow = options.repositionMainWindow || (() => {});
  const showMainWindow = options.showMainWindow || (() => {});
  const hideMainWindow = options.hideMainWindow || (() => {});
  const showSystemWindow = options.showSystemWindow || (() => {});
  const hideSystemWindow = options.hideSystemWindow || (() => {});
  const sendAvoidScale = options.sendAvoidScale || (() => {});
  const syncSystemMonitorRunning = options.syncSystemMonitorRunning || (() => {});

  function getUiSettings() {
    return {
      layout: getLayout(),
      systemMonitorEnabled: getSystemMonitorEnabled()
    };
  }

  function systemWindowShouldShow() {
    return getLayout() === "classic" && getSystemMonitorEnabled();
  }

  function broadcastUiSettings() {
    const payload = getUiSettings();
    const mainWindow = getMainWindow();
    const systemWindow = getSystemWindow();

    if (mainWindow && !mainWindow.isDestroyed() && isRendererReady()) {
      mainWindow.webContents.send(IPC_CHANNELS.layoutChanged, payload);
    }
    if (systemWindow && !systemWindow.isDestroyed() && isSystemRendererReady()) {
      systemWindow.webContents.send(IPC_CHANNELS.layoutChanged, payload);
    }
  }

  function applyLayoutToWindows() {
    repositionMainWindow();

    const systemWindow = getSystemWindow();
    if (!systemWindow || systemWindow.isDestroyed()) {
      return;
    }

    if (systemWindowShouldShow() && getTaskbarVisible()) {
      showSystemWindow();
    } else {
      hideSystemWindow();
    }
  }

  function applyTaskbarVisibility(visible) {
    const nextVisible = visible !== false;
    if (nextVisible === getTaskbarVisible()) {
      return;
    }

    setTaskbarVisibleValue(nextVisible);
    logStartup("taskbar-visibility", { visible: nextVisible });

    if (nextVisible) {
      const mainWindow = getMainWindow();
      if (isRendererReady() && mainWindow && !mainWindow.isDestroyed()) {
        showMainWindow(mainWindow);
      }
      if (isSystemRendererReady() && systemWindowShouldShow()) {
        showSystemWindow();
      }
    } else {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        hideMainWindow(mainWindow);
      }
      hideSystemWindow();
    }
  }

  function applyLayout(next) {
    const value = validLayouts.has(next) ? next : "top-center";
    if (value === getLayout()) {
      return getLayout();
    }

    setLayoutValue(value);
    writeUiSettings({ layout: value });
    logStartup("apply-layout", { layout: value });
    applyLayoutToWindows();
    sendAvoidScale();
    broadcastUiSettings();
    return value;
  }

  function applySystemMonitorEnabled(next) {
    const value = Boolean(next);
    if (value === getSystemMonitorEnabled()) {
      return getSystemMonitorEnabled();
    }

    setSystemMonitorEnabledValue(value);
    writeUiSettings({ systemMonitorEnabled: value });
    logStartup("apply-system-monitor", { systemMonitorEnabled: value });
    syncSystemMonitorRunning();
    applyLayoutToWindows();
    broadcastUiSettings();
    return value;
  }

  return {
    applyLayout,
    applyLayoutToWindows,
    applySystemMonitorEnabled,
    applyTaskbarVisibility,
    broadcastUiSettings,
    getUiSettings,
    systemWindowShouldShow
  };
}

module.exports = {
  createLayoutTaskbarPolicy
};
