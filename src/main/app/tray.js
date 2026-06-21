const { app, Menu, Tray, nativeImage } = require("electron");
const { getAppAssetPath } = require("../app-paths");

const DEFAULT_ISLAND_STATE_NAMES = Object.freeze({
  capsule: "胶囊",
  island: "小岛",
  card: "卡片"
});

function createIslandTray(options = {}) {
  const labels = options.labels || DEFAULT_ISLAND_STATE_NAMES;
  const getCurrentMode = typeof options.getCurrentMode === "function" ? options.getCurrentMode : () => "idle";
  const getMainWindow = typeof options.getMainWindow === "function" ? options.getMainWindow : () => undefined;
  const repositionStageWindow = typeof options.repositionStageWindow === "function" ? options.repositionStageWindow : () => {};
  const resizeIsland = typeof options.resizeIsland === "function" ? options.resizeIsland : () => {};
  const requestIslandMode = typeof options.requestIslandMode === "function" ? options.requestIslandMode : () => {};
  const setQuitting = typeof options.setQuitting === "function" ? options.setQuitting : () => {};

  const iconPath = options.iconPath || getAppAssetPath("app-icon.png");
  const trayIcon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(
    trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon.resize({ width: 16, height: 16, quality: "best" })
  );
  tray.setToolTip("动态岛");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示小岛",
        click: () => {
          repositionStageWindow();
          getMainWindow()?.show();
          resizeIsland(getCurrentMode());
        }
      },
      {
        label: labels.capsule,
        click: () => requestIslandMode("idle")
      },
      {
        label: labels.card,
        click: () => requestIslandMode("expanded")
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          setQuitting(true);
          app.quit();
        }
      }
    ])
  );

  return tray;
}

module.exports = {
  createIslandTray
};
