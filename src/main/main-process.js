const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { getDevServerUrl, installSecurityGuards } = require("./app/security");
const { loadRendererEntry } = require("./app/renderer-entry");
const { createIslandTray } = require("./app/tray");
const { createIslandProviderOrchestrator } = require("./app/provider-orchestrator");
const { registerIslandIpcHandlers } = require("./ipc-handlers");
const { createStartupLogger } = require("./logger");
const { createIslandWindowManager } = require("./window/island-window-manager");
const { ISLAND_STATE_NAMES, TASKBAR_POLL_INTERVAL_MS } = require("./window/window-config");
const { VALID_LAYOUTS, readUiSettings, writeUiSettings } = require("./settings-store");

const FORCE_SOFTWARE_RENDERING = process.argv.includes("--software-rendering");

if (FORCE_SOFTWARE_RENDERING) {
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("disable-direct-composition");
  app.commandLine.appendSwitch("disable-features", "DirectComposition");
} else {
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
}

const OPAQUE_WINDOW = process.argv.includes("--opaque-window");
const STARTUP_LOG_PATH = path.resolve(__dirname, "../../island-startup.log");
const USER_DATA_PATH = path.resolve(__dirname, "../../.tmp/dynamic-island-user-data");
const { logStartup, installGlobalErrorHandlers } = createStartupLogger(STARTUP_LOG_PATH);

let tray;
let providers;
let windowManager;
let quitting = false;

app.setPath("userData", USER_DATA_PATH);
app.setName("Dynamic Island for Windows");
installGlobalErrorHandlers();

function registerIpcHandlers() {
  registerIslandIpcHandlers({
    ipcMain,
    assertMainFrameSender: (event) => windowManager?.assertMainFrameSender(event),
    assertSystemFrameSender: (event) => windowManager?.assertSystemFrameSender(event),
    getCurrentMode: () => windowManager?.getCurrentMode() ?? "idle",
    getUiSettings: () => windowManager?.getUiSettings() ?? { layout: "classic", systemMonitorEnabled: true },
    onSystemRendererReady: () => windowManager?.handleSystemRendererReady(),
    onMainRendererReady: () => {
      windowManager?.handleMainRendererReady();
      providers?.startMainProviders();
    },
    resizeSystemIsland: (mode) => windowManager?.resizeSystemIsland(mode),
    resizeIsland: (mode) => windowManager?.resizeIsland(mode),
    applyLayout: (layout) => windowManager?.applyLayout(layout),
    applySystemMonitorEnabled: (enabled) => windowManager?.applySystemMonitorEnabled(enabled),
    setSystemInteracting: (interacting) => windowManager?.setSystemInteracting(interacting),
    setMainInteracting: (interacting) => windowManager?.setMainInteracting(interacting),
    controlMedia: (action) => providers?.controlMedia(action) ?? { ok: false, available: false },
    seekMedia: (seconds) => providers?.seekMedia(seconds) ?? { ok: false, available: false },
    writeClipboardText: (text) => providers?.writeClipboardText(text) ?? { ok: false, error: "Clipboard monitor is not available." },
    acceptClipboardPending: (id) => providers?.acceptClipboardPending(id) ?? { ok: false, error: "Clipboard monitor is not available." },
    dismissClipboardPending: (id) => providers?.dismissClipboardPending(id) ?? { ok: false, error: "Clipboard monitor is not available." },
    clearClipboardItems: () => providers?.clearClipboardItems() ?? { ok: false, error: "Clipboard monitor is not available." },
    removeClipboardItem: (id) => providers?.removeClipboardItem(id) ?? { ok: false, error: "Clipboard monitor is not available." }
  });
}

function createTray() {
  tray = createIslandTray({
    labels: ISLAND_STATE_NAMES,
    getCurrentMode: () => windowManager?.getCurrentMode() ?? "idle",
    getMainWindow: () => windowManager?.getMainWindow(),
    repositionStageWindow: () => windowManager?.repositionStageWindow(),
    resizeIsland: (mode) => windowManager?.resizeIsland(mode),
    requestIslandMode: (mode) => windowManager?.requestIslandMode(mode),
    setQuitting: (nextQuitting) => {
      quitting = Boolean(nextQuitting);
    }
  });
}

function showExistingWindow() {
  windowManager?.showExistingWindow();
}

function createWindows() {
  windowManager?.createWindow();
  windowManager?.createSystemWindow();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  logStartup("second-instance-quit");
  app.quit();
} else {
  app.on("second-instance", showExistingWindow);

  app.whenReady().then(() => {
    logStartup("app-ready", { argv: process.argv });
    installSecurityGuards({ getDevServerUrl, logStartup });

    const ui = readUiSettings();
    logStartup("ui-settings", ui);

    windowManager = createIslandWindowManager({
      getDevServerUrl,
      initialUiSettings: ui,
      loadRendererEntry,
      logStartup,
      opaqueWindow: OPAQUE_WINDOW,
      preloadPath: path.join(__dirname, "preload.js"),
      validLayouts: VALID_LAYOUTS,
      writeUiSettings,
      onSystemMonitorRunningChange: (enabled) => providers?.syncSystemMonitorRunning(enabled)
    });

    providers = createIslandProviderOrchestrator({
      logStartup,
      taskbarPollInterval: TASKBAR_POLL_INTERVAL_MS,
      emitMediaSnapshot: (snapshot) => windowManager?.handleMediaSnapshot(snapshot),
      emitClipboardSnapshot: (snapshot) => windowManager?.handleClipboardSnapshot(snapshot),
      emitPrivacySnapshot: (snapshot) => windowManager?.handlePrivacySnapshot(snapshot),
      emitSystemSnapshot: (snapshot) => windowManager?.handleSystemSnapshot(snapshot),
      emitTaskbarSnapshot: (snapshot) => windowManager?.handleTaskbarSnapshot(snapshot)
    });

    createWindows();
    createTray();
    registerIpcHandlers();
    providers.startTaskbarWatch();

    screen.on("display-metrics-changed", windowManager.repositionAllStageWindows);
    screen.on("display-added", windowManager.repositionAllStageWindows);
    screen.on("display-removed", windowManager.repositionAllStageWindows);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindows();
      return;
    }

    createWindows();
  });

  app.on("window-all-closed", (event) => {
    logStartup("window-all-closed");

    if (!quitting) {
      event.preventDefault();
    }
  });

  app.on("before-quit", () => {
    quitting = true;
    logStartup("before-quit");
    windowManager?.dispose();
    providers?.stopAll();
    tray?.destroy();
  });

  app.on("will-quit", () => {
    logStartup("will-quit");
  });

  app.on("quit", (_event, exitCode) => {
    logStartup("quit", { exitCode });
  });
}
