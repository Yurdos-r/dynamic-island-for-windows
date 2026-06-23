function createWindowRuntimeState(options = {}) {
  const validLayouts = options.validLayouts || new Set(["classic", "top-center"]);
  const initialUiSettings = options.initialUiSettings || {};
  const minWindowHeight = Number(options.minWindowHeight || 1);
  const initialStageWidth = Number(options.initialStageWidth || 1);

  return {
    mainWindow: undefined,
    systemWindow: undefined,
    currentMode: "idle",
    systemCurrentMode: "idle",
    rendererReady: false,
    systemRendererReady: false,
    mediaActive: false,
    privacyActive: false,
    rendererInteracting: false,
    systemRendererInteracting: false,
    currentWindowHeight: minWindowHeight,
    systemWindowHeight: minWindowHeight,
    stageWidth: initialStageWidth,
    systemStageWidth: initialStageWidth,
    taskbarIconLeft: 0,
    taskbarVisible: true,
    layout: validLayouts.has(initialUiSettings.layout) ? initialUiSettings.layout : "top-center",
    systemMonitorEnabled: initialUiSettings.systemMonitorEnabled !== false,
    keyboardLockHintsEnabled: initialUiSettings.keyboardLockHintsEnabled !== false
  };
}

module.exports = {
  createWindowRuntimeState
};
