const path = require("node:path");
const {
  MIN_ANIMATION_WINDOW_HEIGHT,
  STAGE_SIZE
} = require("./window-config");
const { createWindowControllerComposer } = require("./window-controller-composer");
const { createWindowRuntimeState } = require("./window-runtime-state");

function createIslandWindowManager(options = {}) {
  const logStartup = options.logStartup || (() => {});
  const loadRendererEntry = options.loadRendererEntry;
  const getDevServerUrl = options.getDevServerUrl;
  const writeUiSettings = options.writeUiSettings || (() => {});
  const validLayouts = options.validLayouts || new Set(["classic", "top-center"]);
  const opaqueWindow = Boolean(options.opaqueWindow);
  const preloadPath = options.preloadPath || path.join(__dirname, "../preload.js");
  const initialUiSettings = options.initialUiSettings || {};
  const onSystemMonitorRunningChange =
    typeof options.onSystemMonitorRunningChange === "function" ? options.onSystemMonitorRunningChange : () => {};

  if (typeof loadRendererEntry !== "function") {
    throw new Error("loadRendererEntry is required to create the island window manager.");
  }

  const state = createWindowRuntimeState({
    validLayouts,
    initialUiSettings,
    minWindowHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    initialStageWidth: STAGE_SIZE.width
  });

  return createWindowControllerComposer({
    state,
    logStartup,
    loadRendererEntry,
    getDevServerUrl,
    validLayouts,
    writeUiSettings,
    opaqueWindow,
    preloadPath,
    onSystemMonitorRunningChange
  });
}

module.exports = {
  createIslandWindowManager
};
