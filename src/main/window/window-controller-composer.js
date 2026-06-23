const {
  MIN_ANIMATION_WINDOW_HEIGHT,
  STAGE_SIZE
} = require("./window-config");
const { createFrameInteractionController } = require("./frame-interaction");
const { createRendererReadinessController } = require("./renderer-readiness");
const { createStageBoundsController } = require("./stage-bounds-controller");
const { createWindowCreationController } = require("./window-creation-controller");
const { createWindowGeometryController } = require("./window-geometry-controller");
const { createWindowGeometryDelegate } = require("./window-geometry-delegate");
const { createWindowInteractionDelegate } = require("./window-interaction-delegate");
const { createWindowModeController } = require("./window-mode-controller");
const { createWindowSnapshotDispatcher } = require("./snapshot-dispatcher");
const { createWindowVisibilityLayoutDelegate } = require("./window-visibility-layout-delegate");

function createWindowControllerComposer(options = {}) {
  const state = options.state;
  const logStartup = options.logStartup || (() => {});
  const loadRendererEntry = options.loadRendererEntry;
  const getDevServerUrl = options.getDevServerUrl;
  const validLayouts = options.validLayouts || new Set(["classic", "top-center"]);
  const writeUiSettings = options.writeUiSettings || (() => {});
  const opaqueWindow = Boolean(options.opaqueWindow);
  const preloadPath = options.preloadPath;
  const onSystemMonitorRunningChange =
    typeof options.onSystemMonitorRunningChange === "function" ? options.onSystemMonitorRunningChange : () => {};

  if (!state) {
    throw new Error("state is required to create window controller composer.");
  }
  if (typeof loadRendererEntry !== "function") {
    throw new Error("loadRendererEntry is required to create window controller composer.");
  }

  const geometryController = createWindowGeometryController({ state, logStartup });
  const geometry = createWindowGeometryDelegate({ state, geometry: geometryController });
  let creationController;
  let modeController;
  let mainStageBounds;
  let systemStageBounds;
  let interaction;
  let visibilityLayout;

  function getCreationController() {
    if (!creationController) {
      throw new Error("window creation controller has not been initialized.");
    }
    return creationController;
  }

  function getModeController() {
    if (!modeController) {
      throw new Error("window mode controller has not been initialized.");
    }
    return modeController;
  }

  function resizeIsland(mode) {
    return getModeController().resizeIsland(mode);
  }

  function resizeSystemIsland(mode) {
    return getModeController().resizeSystemIsland(mode);
  }

  function repositionStageWindow() {
    mainStageBounds.reposition();
  }

  function repositionSystemStageWindow() {
    systemStageBounds.reposition();
  }

  function repositionAllStageWindows() {
    repositionStageWindow();
    repositionSystemStageWindow();
  }

  function collapseSystemWindowToIdle() {
    getModeController().collapseSystemWindowToIdle();
  }

  function requestIslandMode(mode) {
    getModeController().requestIslandMode(mode);
  }

  function requestSystemIslandMode(mode) {
    getModeController().requestSystemIslandMode(mode);
  }

  function createWindow() {
    return getCreationController().createWindow();
  }

  function createSystemWindow() {
    return getCreationController().createSystemWindow();
  }

  function showExistingWindow() {
    return getCreationController().showExistingWindow();
  }

  visibilityLayout = createWindowVisibilityLayoutDelegate({
    state,
    logStartup,
    validLayouts,
    writeUiSettings,
    onSystemMonitorRunningChange,
    collapseSystemWindowToIdle,
    repositionStageWindow,
    repositionSystemStageWindow,
    raiseWindowForPointer: (force) => interaction.raiseWindowForPointer(force),
    raiseSystemWindowForPointer: (force) => interaction.raiseSystemWindowForPointer(force),
    restoreSystemWindowHitState: () => interaction.restoreSystemWindowHitState(),
    sendAvoidScale: geometry.sendAvoidScale
  });

  interaction = createWindowInteractionDelegate({
    state,
    geometry,
    requestIslandMode,
    requestSystemIslandMode
  });

  mainStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => state.mainWindow,
    getCurrentMode: () => state.currentMode,
    getWindowHeight: () => state.currentWindowHeight,
    setWindowHeight: (height) => {
      state.currentWindowHeight = height;
    },
    getStageWidth: () => state.stageWidth,
    getPosition: geometry.getStagePosition,
    getHeightForMode: geometry.getWindowHeightForMode,
    updateHitShape: interaction.updateNativeHitShape,
    raiseForPointer: interaction.raiseWindowForPointer,
    resizeCurrentMode: resizeIsland
  });

  systemStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => state.systemWindow,
    getCurrentMode: () => state.systemCurrentMode,
    getWindowHeight: () => state.systemWindowHeight,
    setWindowHeight: (height) => {
      state.systemWindowHeight = height;
    },
    getStageWidth: () => state.systemStageWidth,
    getPosition: geometry.getSystemStagePosition,
    resolvePosition: (position) => ({
      x: position.x,
      y: visibilityLayout.systemWindowVisibility.resolveY(position.y)
    }),
    getHeightForMode: geometry.getSystemWindowHeightForMode,
    updateHitShape: interaction.updateSystemNativeHitShape,
    raiseForPointer: interaction.raiseSystemWindowForPointer,
    resizeCurrentMode: resizeSystemIsland
  });

  modeController = createWindowModeController({
    state,
    mainHoverController: interaction.mainHoverController,
    systemHoverController: interaction.systemHoverController,
    mainHitTarget: interaction.mainHitTarget,
    systemHitTarget: interaction.systemHitTarget,
    mainStageBounds,
    systemStageBounds,
    mainPointerController: interaction.mainPointerController,
    systemPointerController: interaction.systemPointerController,
    getSystemWindowHeightForMode: geometry.getSystemWindowHeightForMode,
    sendAvoidScale: geometry.sendAvoidScale
  });

  creationController = createWindowCreationController({
    state,
    logStartup,
    loadRendererEntry,
    getDevServerUrl,
    opaqueWindow,
    preloadPath,
    getWindowHeightForMode: geometry.getWindowHeightForMode,
    getSystemWindowHeightForMode: geometry.getSystemWindowHeightForMode,
    getStagePosition: geometry.getStagePosition,
    getSystemStagePosition: geometry.getSystemStagePosition,
    updateNativeHitShape: interaction.updateNativeHitShape,
    updateSystemNativeHitShape: interaction.updateSystemNativeHitShape,
    setMousePassthrough: interaction.setMousePassthrough,
    setSystemMousePassthrough: interaction.setSystemMousePassthrough,
    resizeIsland,
    resizeSystemIsland,
    raiseWindowForPointer: interaction.raiseWindowForPointer,
    raiseSystemWindowForPointer: interaction.raiseSystemWindowForPointer,
    requestIslandMode,
    requestSystemIslandMode,
    repositionStageWindow,
    repositionSystemStageWindow,
    systemWindowShouldShow: visibilityLayout.systemWindowShouldShow,
    unparkSystemWindow: visibilityLayout.unparkSystemWindow,
    systemWindowVisibility: visibilityLayout.systemWindowVisibility
  });

  const snapshotDispatcher = createWindowSnapshotDispatcher({
    state,
    applyTaskbarVisibility: visibilityLayout.applyTaskbarVisibility,
    repositionAllStageWindows,
    requestIslandMode,
    sendAvoidScale: geometry.sendAvoidScale
  });

  const rendererReadiness = createRendererReadinessController({
    state,
    getUiSettings: visibilityLayout.getUiSettings,
    logStartup,
    raiseWindowForPointer: interaction.raiseWindowForPointer,
    raiseSystemWindowForPointer: interaction.raiseSystemWindowForPointer,
    resizeIsland,
    resizeSystemIsland,
    sendAvoidScale: geometry.sendAvoidScale,
    startHoverDetection: interaction.startHoverDetection,
    startSystemHoverDetection: interaction.startSystemHoverDetection,
    syncSystemMonitorRunning: visibilityLayout.syncSystemMonitorRunning,
    systemWindowShouldShow: visibilityLayout.systemWindowShouldShow,
    systemWindowVisibility: visibilityLayout.systemWindowVisibility
  });

  const frameInteraction = createFrameInteractionController({
    state,
    mainHoverController: interaction.mainHoverController,
    updateMousePassthrough: interaction.updateMousePassthrough,
    updateSystemMousePassthrough: interaction.updateSystemMousePassthrough
  });

  function dispose() {
    interaction.stopHoverDetection();
    interaction.stopSystemHoverDetection();
  }

  return {
    applyKeyboardLockHintsEnabled: visibilityLayout.applyKeyboardLockHintsEnabled,
    applyLayout: visibilityLayout.applyLayout,
    applySystemMonitorEnabled: visibilityLayout.applySystemMonitorEnabled,
    assertMainFrameSender: frameInteraction.assertMainFrameSender,
    assertSystemFrameSender: frameInteraction.assertSystemFrameSender,
    createSystemWindow,
    createWindow,
    dispose,
    getCurrentMode: () => state.currentMode,
    getMainWindow: () => state.mainWindow,
    getUiSettings: visibilityLayout.getUiSettings,
    handleClipboardSnapshot: snapshotDispatcher.handleClipboardSnapshot,
    handleKeyboardLockSnapshot: snapshotDispatcher.handleKeyboardLockSnapshot,
    handleMainRendererReady: rendererReadiness.handleMainRendererReady,
    handleMediaSnapshot: snapshotDispatcher.handleMediaSnapshot,
    handlePrivacySnapshot: snapshotDispatcher.handlePrivacySnapshot,
    handleSystemRendererReady: rendererReadiness.handleSystemRendererReady,
    handleSystemSnapshot: snapshotDispatcher.handleSystemSnapshot,
    handleTaskbarSnapshot: snapshotDispatcher.handleTaskbarSnapshot,
    repositionAllStageWindows,
    repositionStageWindow,
    requestIslandMode,
    resizeIsland,
    resizeSystemIsland,
    setMainInteracting: frameInteraction.setMainInteracting,
    setSystemInteracting: frameInteraction.setSystemInteracting,
    showExistingWindow
  };
}

module.exports = {
  createWindowControllerComposer
};
