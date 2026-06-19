const path = require("node:path");
const { screen } = require("electron");
const { IPC_CHANNELS } = require("../../shared/island-contracts");
const {
  COLLAPSE_HIT_AREA_HOLD_MS,
  HOVER_DETECTION,
  MIN_ANIMATION_WINDOW_HEIGHT,
  NATIVE_HIT_SHAPE,
  NATIVE_HIT_SHAPE_PADDING,
  RAISE_ON_POINTER_INTERVAL_MS,
  STAGE_SIZE
} = require("./window-config");
const {
  coerceIslandMode: normalizeIslandMode,
  computeAvoidScale: computeLayoutAvoidScale,
  getMainIslandLocalRect,
  getMainStageMetrics,
  getModeArea: getLayoutModeArea,
  getSystemIslandLocalRect: getSystemIslandLocalRectFromLayout,
  getSystemStageMetrics,
  getWindowHeightForMode: getLayoutWindowHeightForMode,
  pointInRect,
  resolveModeForMediaState: resolveLayoutModeForMediaState
} = require("./layout-engine");
const { createWindowFader } = require("./fade-controller");
const { createHitTargetManager } = require("./hit-target-manager");
const { createMainHoverController, createSystemHoverController } = require("./hover-controller");
const { createLayoutTaskbarPolicy } = require("./layout-taskbar-policy");
const { createPointerWindowController } = require("./pointer-window-controller");
const { createStageBoundsController } = require("./stage-bounds-controller");
const { createSystemWindowVisibilityManager } = require("./system-window-visibility");
const { configureIslandBrowserWindow, createIslandBrowserWindow } = require("./window-factory");
const { registerIslandWindowLifecycle } = require("./window-lifecycle");

function createIslandWindowManager(options = {}) {
  const logStartup = options.logStartup || (() => {});
  const loadRendererEntry = options.loadRendererEntry;
  const getDevServerUrl = options.getDevServerUrl;
  const writeUiSettings = options.writeUiSettings || (() => {});
  const VALID_LAYOUTS = options.validLayouts || new Set(["classic", "top-center"]);
  const OPAQUE_WINDOW = Boolean(options.opaqueWindow);
  const preloadPath = options.preloadPath || path.join(__dirname, "../preload.js");
  const initialUiSettings = options.initialUiSettings || {};
  const onSystemMonitorRunningChange =
    typeof options.onSystemMonitorRunningChange === "function" ? options.onSystemMonitorRunningChange : () => {};

  if (typeof loadRendererEntry !== "function") {
    throw new Error("loadRendererEntry is required to create the island window manager.");
  }

  let mainWindow;
  let systemWindow;
  let currentMode = "idle";
  let systemCurrentMode = "idle";
  let rendererReady = false;
  let systemRendererReady = false;
  let mediaActive = false;
  let privacyActive = false;
  let rendererInteracting = false;
  let systemRendererInteracting = false;
  let currentWindowHeight = MIN_ANIMATION_WINDOW_HEIGHT;
  let systemWindowHeight = MIN_ANIMATION_WINDOW_HEIGHT;
  let stageWidth = STAGE_SIZE.width;
  let systemStageWidth = STAGE_SIZE.width;
  let taskbarIconLeft = 0;
  let taskbarVisible = true;
  let layout = VALID_LAYOUTS.has(initialUiSettings.layout) ? initialUiSettings.layout : "classic";
  let systemMonitorEnabled = initialUiSettings.systemMonitorEnabled !== false;
  const windowFader = createWindowFader();

function coerceIslandMode(mode) {
  return normalizeIslandMode(mode);
}

function resolveModeForMediaState(mode) {
  return resolveLayoutModeForMediaState(mode, { mediaActive, privacyActive });
}

function getStagePosition(windowHeight = currentWindowHeight, shouldLog = true) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  const metrics = getMainStageMetrics({ display, layout, windowHeight });
  stageWidth = metrics.stageWidth;

  if (shouldLog) {
    logStartup("stage-position", {
      cursor: point,
      bounds: display.bounds,
      workArea: display.workArea,
      taskbarIconLeft,
      stageWidthFixed: true,
      layout,
      windowHeight,
      stageWidth,
      position: metrics.position
    });
  }

  return metrics.position;
}

function getSystemStagePosition(windowHeight = systemWindowHeight, shouldLog = true) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  const metrics = getSystemStageMetrics({ display, windowHeight });
  systemStageWidth = metrics.systemStageWidth;

  if (shouldLog) {
    logStartup("system-stage-position", {
      cursor: point,
      bounds: display.bounds,
      workArea: display.workArea,
      windowHeight,
      systemStageWidth,
      position: metrics.position
    });
  }

  return metrics.position;
}

function getIslandLocalRect(mode = currentMode, paddingX = 0, paddingY = paddingX) {
  return getMainIslandLocalRect({
    mode,
    layout,
    stageWidth,
    windowHeight: currentWindowHeight,
    paddingX,
    paddingY
  });
}

function getSystemIslandLocalRect(mode = systemCurrentMode, paddingX = 0, paddingY = paddingX) {
  return getSystemIslandLocalRectFromLayout({
    mode,
    systemStageWidth,
    systemWindowHeight,
    paddingX,
    paddingY
  });
}

function getIslandRect(mode = currentMode, paddingX = 0, paddingY = paddingX) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bounds = mainWindow.getBounds();
  const localRect = getIslandLocalRect(mode, paddingX, paddingY);

  return {
    x: Math.round(bounds.x + localRect.x),
    y: Math.round(bounds.y + localRect.y),
    width: localRect.width,
    height: localRect.height
  };
}

function getSystemIslandRect(mode = systemCurrentMode, paddingX = 0, paddingY = paddingX) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bounds = systemWindow.getBounds();
  const localRect = getSystemIslandLocalRect(mode, paddingX, paddingY);

  return {
    x: Math.round(bounds.x + localRect.x),
    y: Math.round(bounds.y + localRect.y),
    width: localRect.width,
    height: localRect.height
  };
}

function isPointerInsideCurrentCard(padding = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  return pointInRect(screen.getCursorScreenPoint(), getIslandRect(currentMode, padding, padding));
}

function isPointerInsideSystemCard(padding = 0) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return false;
  }

  return pointInRect(screen.getCursorScreenPoint(), getSystemIslandRect(systemCurrentMode, padding, padding));
}

function getModeArea(mode) {
  return getLayoutModeArea(mode);
}

function clearShapeRefreshTimer() {
  mainHitTarget.clearShapeRefreshTimer();
}

function clearSystemShapeRefreshTimer() {
  systemHitTarget.clearShapeRefreshTimer();
}

function getWindowHeightForMode(mode = currentMode) {
  return getLayoutWindowHeightForMode(mode);
}

function getSystemWindowHeightForMode(mode = systemCurrentMode) {
  return getLayoutWindowHeightForMode(mode);
}

function applyStageWindowBounds(windowHeight = currentWindowHeight, options = {}) {
  mainStageBounds.applyBounds(windowHeight, options);
}

function applySystemStageWindowBounds(windowHeight = systemWindowHeight, options = {}) {
  systemStageBounds.applyBounds(windowHeight, options);
}

function scheduleStageWindowForMode(previousMode, nextMode) {
  mainStageBounds.scheduleForMode(previousMode, nextMode);
}

function scheduleSystemStageWindowForMode(previousMode, nextMode) {
  systemStageBounds.scheduleForMode(previousMode, nextMode);
}

function updateNativeHitShape() {
  mainHitTarget.updateNativeHitShape();
}

function updateSystemNativeHitShape() {
  systemHitTarget.updateNativeHitShape();
}

function armCollapseHitHold(previousMode, nextMode) {
  mainHitTarget.armCollapseHitHold(previousMode, nextMode);
}

function armSystemCollapseHitHold(previousMode, nextMode) {
  systemHitTarget.armCollapseHitHold(previousMode, nextMode);
}

function isPointerInsideMouseTarget(padding = 0) {
  return mainHitTarget.isPointerInsideMouseTarget(padding);
}

function isPointerInsideSystemMouseTarget(padding = 0) {
  return systemHitTarget.isPointerInsideMouseTarget(padding);
}

function setMousePassthrough(ignored) {
  mainPointerController.setMousePassthrough(ignored);
}

function setSystemMousePassthrough(ignored) {
  systemPointerController.setMousePassthrough(ignored);
}

function raiseWindowForPointer(force = false) {
  mainPointerController.raiseForPointer(force);
}

function raiseSystemWindowForPointer(force = false) {
  systemPointerController.raiseForPointer(force);
}

function updateMousePassthrough(force = false) {
  mainPointerController.updateMousePassthrough(force);
}

function updateSystemMousePassthrough(force = false) {
  systemPointerController.updateMousePassthrough(force);
}

function resizeIsland(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return currentMode;
  }

  const previousMode = currentMode;
  currentMode = resolveModeForMediaState(mode);
  armCollapseHitHold(previousMode, currentMode);
  scheduleStageWindowForMode(previousMode, currentMode);
  updateMousePassthrough(true);
  if (previousMode !== currentMode) {
    sendAvoidScale();
  }
  return currentMode;
}

function resizeSystemIsland(mode) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return systemCurrentMode;
  }

  const previousMode = systemCurrentMode;
  systemCurrentMode = coerceIslandMode(mode);
  if (systemCurrentMode !== "idle" && systemCurrentMode !== "hover" && systemCurrentMode !== "expanded") {
    systemCurrentMode = "idle";
  }
  armSystemCollapseHitHold(previousMode, systemCurrentMode);
  scheduleSystemStageWindowForMode(previousMode, systemCurrentMode);
  updateSystemMousePassthrough(true);
  return systemCurrentMode;
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

// 系统窗口隐藏（切到顶部居中、或关闭监控）前把它收回 idle 基线尺寸。
// 否则隐藏时若停在 hover/expanded（如 340 高），systemWindowHeight 会保留陈旧高度，
// 下次切回经典时 repositionSystemStageWindow 用陈旧高度定位，窗口卡在错误的高/位（如
// y=618/h=340），其顶部大片透明区盖在胶囊本应让出的位置上，导致胶囊点不动（命中区与
// 窗口几何错位）。scheduleSystemStageWindowForMode 的收缩分支在 mode 未变（idle→idle）
// 时不会缩窗，故这里直接把 systemWindowHeight 重置并通知 renderer 同步回 idle。
function collapseSystemWindowToIdle() {
  systemCurrentMode = "idle";
  systemHitTarget.resetHold();
  systemWindowHeight = getSystemWindowHeightForMode("idle");
  if (systemWindow && !systemWindow.isDestroyed() && systemRendererReady) {
    systemWindow.webContents.send(IPC_CHANNELS.setMode, "idle");
  }
}

// 退避缩放因子：当任务栏图标区把胶囊可用宽度压到比当前模式正常宽度还窄时，
// 让胶囊整体等比缩小让位。stageWidth 已在 getStagePosition 里按任务栏左缘算好，
// 这里只需对比"可用空间"与"胶囊正常宽度"。
function computeAvoidScale() {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  return computeLayoutAvoidScale({
    layout,
    taskbarIconLeft,
    display,
    currentMode
  });
}

function sendAvoidScale() {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    return;
  }

  mainWindow.webContents.send(IPC_CHANNELS.avoidScale, computeAvoidScale());
}

// 用 setInterval 步进 setOpacity，把窗口透明度过渡到 target，到位后执行 done。
// 新的淡入淡出会先取消该窗口上一次未完成的过渡，避免两个 timer 互相打架。
function fadeWindowTo(win, target, done) {
  windowFader.fadeTo(win, target, done);
}

function fadeOutAndHide(win) {
  windowFader.fadeOutAndHide(win);
}

// onShown 在 show() 之后同步执行：Windows 上对 hidden 窗口 setShape/命中形状不生效，
// 必须在窗口真正可见后重设，否则窗口虽显示却整窗不可点（hover/click 全透传）。
function showAndFadeIn(win, raise, onShown) {
  windowFader.showAndFadeIn(win, raise, onShown);
}

// 系统窗显示后重建原生命中形状 + 刷新鼠标穿透，供所有显示系统窗的路径复用。
function restoreSystemWindowHitState() {
  updateSystemNativeHitShape();
  updateSystemMousePassthrough(true);
}

// 任务栏可见性变化时，把两个胶囊窗口一起淡入显示或淡出隐藏。隐藏时调用 hide()
// 彻底移出 z-order，这样全屏应用上方不会再残留胶囊。未 ready 的窗口只置状态，
// 由 renderer-ready 流程按 taskbarVisible 决定是否 show。
function applyTaskbarVisibility(visible) {
  layoutTaskbarPolicy.applyTaskbarVisibility(visible);
}

// 系统窗口（右下独立胶囊）仅在经典布局且系统监控开启时显示。顶部居中布局下系统监控
// 并入主窗口，独立系统窗口隐藏；监控关闭时两布局都不显示它。
function systemWindowShouldShow() {
  return layoutTaskbarPolicy.systemWindowShouldShow();
}

// 系统监控进程仅在开启时运行（两布局通用：经典喂系统窗口、顶部居中喂主窗口）。
// start/stop 幂等，可安全重复调用。
function syncSystemMonitorRunning() {
  onSystemMonitorRunningChange(systemMonitorEnabled);
}

// 把当前布局/开关落到窗口上：主窗口总在（按布局重定位），系统窗口按 shouldShow 显隐。
//
// 系统窗口的「隐藏」必须用移出屏幕（park）而非 hide()：Windows 上对透明分层窗口
// （WS_EX_LAYERED + 透明）调用 hide() 会破坏其命中测试状态，随后 show() 回来即使重设
// setShape / setIgnoreMouseEvents 也无法恢复命中（实测 force-fix、整窗 setShape 均无效，
// 仅销毁重建可救）——这正是「切到顶部居中再切回 / 关开监控后右下胶囊可见却点不动，重启
// 才好」的根因。改用「移到屏幕外 → 移回原位」隐藏/显示，命中测试全程保持有效（实测移屏
// 循环后仍可点）。SYSTEM_PARK_Y_OFFSET 足够大以确保窗口完全移出任意显示器。
function unparkSystemWindow() {
  systemWindowVisibility.unpark();
}

// 淡出后把系统窗口移出屏幕（替代 fadeOutAndHide）。用 systemVisibilityToken 防竞态：
// 若淡出未完成时 show 路径已介入（token 递增），过期的淡出回调不再 park，避免把刚显示
// 的窗口又移出屏幕。
// 显示系统窗口：解除 park（含使过期淡出回调失效）→ 收回 idle 基线 → 重定位到屏幕内 → 淡入。
// park 回来的窗口始终 isVisible，showAndFadeIn 不重复 show()，只淡入透明度。
function showSystemWindow() {
  systemWindowVisibility.show();
}

// 隐藏系统窗口：收回 idle 基线后淡出并 park（移出屏幕，绝不 hide()）。
function hideSystemWindow() {
  systemWindowVisibility.hide();
}

function applyLayoutToWindows() {
  layoutTaskbarPolicy.applyLayoutToWindows();
}

// 向两个 renderer 广播最新 UI 设置，让 main.ts 同步 data-layout / 内嵌系统卡显隐。
function broadcastUiSettings() {
  layoutTaskbarPolicy.broadcastUiSettings();
}

function applyLayout(next) {
  return layoutTaskbarPolicy.applyLayout(next);
}

function applySystemMonitorEnabled(next) {
  return layoutTaskbarPolicy.applySystemMonitorEnabled(next);
}

function requestIslandMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    return;
  }

  const nextMode = resolveModeForMediaState(mode);
  mainHoverController.clearTimers();
  resizeIsland(nextMode);
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
      return;
    }

    mainWindow.webContents.send(IPC_CHANNELS.setMode, nextMode);
  }, 16);
}

function requestSystemIslandMode(mode) {
  if (!systemWindow || systemWindow.isDestroyed() || !systemRendererReady) {
    return;
  }

  const nextMode = resizeSystemIsland(mode);
  systemHoverController.clearCloseTimer();

  setTimeout(() => {
    if (!systemWindow || systemWindow.isDestroyed() || !systemRendererReady) {
      return;
    }

    systemWindow.webContents.send(IPC_CHANNELS.setMode, nextMode);
  }, 16);
}

function startHoverDetection() {
  mainHoverController.start();
}

function startSystemHoverDetection() {
  systemHoverController.start();
}

function stopHoverDetection() {
  mainHoverController.stop();
  clearShapeRefreshTimer();
}

function stopSystemHoverDetection() {
  systemHoverController.stop();
  clearSystemShapeRefreshTimer();
}

function createWindow() {
  rendererReady = false;
  currentWindowHeight = getWindowHeightForMode(currentMode);
  const position = getStagePosition(currentWindowHeight);
  logStartup("create-window", { ...position, opaqueWindow: OPAQUE_WINDOW });

  mainWindow = createIslandBrowserWindow({
    width: stageWidth,
    height: currentWindowHeight,
    position,
    opaqueWindow: OPAQUE_WINDOW,
    preloadPath
  });

  configureIslandBrowserWindow(mainWindow);
  updateNativeHitShape();
  setMousePassthrough(true);

  registerIslandWindowLifecycle({
    window: mainWindow,
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
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      resizeIsland(currentMode);
      mainWindow.show();
      raiseWindowForPointer(true);
    },
    onDidFinishLoad: () => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) {
        return;
      }

      resizeIsland(currentMode);
      mainWindow.show();
      raiseWindowForPointer(true);
    },
    onClosed: () => {
      mainWindow = undefined;
    },
    onBlur: () => {
      if (
        currentMode !== "expanded" &&
        currentMode !== "clipboard" &&
        currentMode !== "settings" &&
        currentMode !== "privacy" &&
        currentMode !== "privacy-expanded"
      ) {
        requestIslandMode("idle");
      }
    }
  });
  loadRendererEntry(mainWindow, "index.html", "main", { getDevServerUrl, logStartup });
}

function createSystemWindow() {
  systemRendererReady = false;
  systemCurrentMode = "idle";
  systemWindowHeight = getSystemWindowHeightForMode(systemCurrentMode);
  const position = getSystemStagePosition(systemWindowHeight);
  logStartup("create-system-window", { ...position, opaqueWindow: OPAQUE_WINDOW });

  systemWindow = createIslandBrowserWindow({
    width: systemStageWidth,
    height: systemWindowHeight,
    position,
    opaqueWindow: OPAQUE_WINDOW,
    preloadPath
  });

  configureIslandBrowserWindow(systemWindow);
  updateSystemNativeHitShape();
  setSystemMousePassthrough(true);

  registerIslandWindowLifecycle({
    window: systemWindow,
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
      if (!systemWindow || systemWindow.isDestroyed()) {
        return;
      }

      resizeSystemIsland(systemCurrentMode);
      if (taskbarVisible && systemWindowShouldShow()) {
        systemWindow.show();
        raiseSystemWindowForPointer(true);
      }
    },
    onDidFinishLoad: () => {
      if (!systemWindow || systemWindow.isDestroyed() || systemWindow.isVisible()) {
        return;
      }

      resizeSystemIsland(systemCurrentMode);
      if (taskbarVisible && systemWindowShouldShow()) {
        systemWindow.show();
        raiseSystemWindowForPointer(true);
      }
    },
    onClosed: () => {
      systemWindow = undefined;
    },
    onBlur: () => {
      if (systemCurrentMode !== "idle") {
        requestSystemIslandMode("idle");
      }
    }
  });
  loadRendererEntry(systemWindow, "system.html", "system", { getDevServerUrl, logStartup });
}

function showExistingWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  if (!systemWindow || systemWindow.isDestroyed()) {
    createSystemWindow();
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    repositionStageWindow();
    mainWindow.show();
    raiseWindowForPointer(true);
    requestIslandMode(
      privacyActive && (currentMode === "privacy" || currentMode === "privacy-expanded")
        ? currentMode
        : privacyActive
          ? "privacy"
          : "peek"
    );
  }

  if (systemWindow && !systemWindow.isDestroyed()) {
    if (systemWindowShouldShow()) {
      unparkSystemWindow();
      repositionSystemStageWindow();
      systemWindow.show();
      raiseSystemWindowForPointer(true);
    } else {
      // park（移出屏幕）而非 hide()：避免后续 show 触发命中僵死。
      systemWindow.show();
      systemWindowVisibility.parkWithoutFade();
    }
  }
}



  const mainHoverController = createMainHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => currentMode,
    isPointerInsideCard: isPointerInsideCurrentCard,
    isPrivacyActive: () => privacyActive,
    requestIslandMode,
    updateMousePassthrough
  });

  const systemHoverController = createSystemHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => systemCurrentMode,
    isPointerInsideCard: isPointerInsideSystemCard,
    requestIslandMode: requestSystemIslandMode,
    updateMousePassthrough: updateSystemMousePassthrough
  });

  const systemWindowVisibility = createSystemWindowVisibilityManager({
    getWindow: () => systemWindow,
    isRendererReady: () => systemRendererReady,
    collapseToIdle: collapseSystemWindowToIdle,
    reposition: repositionSystemStageWindow,
    fadeTo: fadeWindowTo,
    showAndFadeIn,
    raise: raiseSystemWindowForPointer,
    restoreHitState: restoreSystemWindowHitState
  });

  const mainHitTarget = createHitTargetManager({
    nativeHitShape: NATIVE_HIT_SHAPE,
    nativeHitShapePadding: NATIVE_HIT_SHAPE_PADDING,
    collapseHoldMs: COLLAPSE_HIT_AREA_HOLD_MS,
    getWindow: () => mainWindow,
    getCurrentMode: () => currentMode,
    getLocalRect: getIslandLocalRect,
    getScreenRect: getIslandRect,
    getModeArea,
    getCursorPoint: () => screen.getCursorScreenPoint(),
    pointInRect
  });

  const systemHitTarget = createHitTargetManager({
    nativeHitShape: NATIVE_HIT_SHAPE,
    nativeHitShapePadding: NATIVE_HIT_SHAPE_PADDING,
    collapseHoldMs: COLLAPSE_HIT_AREA_HOLD_MS,
    getWindow: () => systemWindow,
    getCurrentMode: () => systemCurrentMode,
    getLocalRect: getSystemIslandLocalRect,
    getScreenRect: getSystemIslandRect,
    getModeArea,
    getCursorPoint: () => screen.getCursorScreenPoint(),
    pointInRect
  });

  const mainPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => mainWindow,
    getTaskbarVisible: () => taskbarVisible,
    getRendererReady: () => rendererReady,
    getRendererInteracting: () => rendererInteracting,
    isPointerInsideMouseTarget
  });

  const systemPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => systemWindow,
    getTaskbarVisible: () => taskbarVisible,
    getRendererReady: () => systemRendererReady,
    getRendererInteracting: () => systemRendererInteracting,
    isPointerInsideMouseTarget: isPointerInsideSystemMouseTarget
  });

  const mainStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => mainWindow,
    getCurrentMode: () => currentMode,
    getWindowHeight: () => currentWindowHeight,
    setWindowHeight: (height) => {
      currentWindowHeight = height;
    },
    getStageWidth: () => stageWidth,
    getPosition: getStagePosition,
    getHeightForMode: getWindowHeightForMode,
    updateHitShape: updateNativeHitShape,
    raiseForPointer: raiseWindowForPointer,
    resizeCurrentMode: resizeIsland
  });

  const systemStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => systemWindow,
    getCurrentMode: () => systemCurrentMode,
    getWindowHeight: () => systemWindowHeight,
    setWindowHeight: (height) => {
      systemWindowHeight = height;
    },
    getStageWidth: () => systemStageWidth,
    getPosition: getSystemStagePosition,
    resolvePosition: (position) => ({
      x: position.x,
      y: systemWindowVisibility.resolveY(position.y)
    }),
    getHeightForMode: getSystemWindowHeightForMode,
    updateHitShape: updateSystemNativeHitShape,
    raiseForPointer: raiseSystemWindowForPointer,
    resizeCurrentMode: resizeSystemIsland
  });

  const layoutTaskbarPolicy = createLayoutTaskbarPolicy({
    validLayouts: VALID_LAYOUTS,
    getLayout: () => layout,
    setLayoutValue: (value) => {
      layout = value;
    },
    getSystemMonitorEnabled: () => systemMonitorEnabled,
    setSystemMonitorEnabledValue: (value) => {
      systemMonitorEnabled = value;
    },
    getTaskbarVisible: () => taskbarVisible,
    setTaskbarVisibleValue: (value) => {
      taskbarVisible = value;
    },
    getMainWindow: () => mainWindow,
    getSystemWindow: () => systemWindow,
    isRendererReady: () => rendererReady,
    isSystemRendererReady: () => systemRendererReady,
    logStartup,
    writeUiSettings,
    repositionMainWindow: repositionStageWindow,
    showMainWindow: (win) => showAndFadeIn(win, raiseWindowForPointer),
    hideMainWindow: fadeOutAndHide,
    showSystemWindow,
    hideSystemWindow,
    sendAvoidScale,
    syncSystemMonitorRunning
  });

  function handleMainRendererReady() {
    rendererReady = true;
    logStartup("renderer-ready", mainWindow.getBounds());
    resizeIsland(currentMode);

    if (taskbarVisible) {
      mainWindow.show();
      raiseWindowForPointer(true);
    }

    startHoverDetection();
    sendAvoidScale();
    mainWindow.webContents.send(IPC_CHANNELS.layoutChanged, { layout, systemMonitorEnabled });
  }

  function handleSystemRendererReady() {
    systemRendererReady = true;
    logStartup("system-renderer-ready", systemWindow.getBounds());
    resizeSystemIsland(systemCurrentMode);

    if (taskbarVisible && systemWindowShouldShow()) {
      systemWindow.show();
      raiseSystemWindowForPointer(true);
    } else {
      systemWindow.show();
      systemWindowVisibility.parkWithoutFade();
    }

    startSystemHoverDetection();
    syncSystemMonitorRunning();
  }

  function handleMediaSnapshot(snapshot) {
    mediaActive = Boolean(snapshot?.active);
    if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
      mainWindow.webContents.send(IPC_CHANNELS.mediaUpdate, snapshot);
      if (!mediaActive && !privacyActive && (currentMode === "hover" || currentMode === "expanded")) {
        requestIslandMode("idle");
      }
    }
  }

  function handleClipboardSnapshot(snapshot) {
    if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
      mainWindow.webContents.send(IPC_CHANNELS.clipboardUpdate, snapshot);
    }
  }

  function handlePrivacySnapshot(snapshot) {
    const nextPrivacyActive = Boolean(snapshot?.active);
    const privacyJustActivated = !privacyActive && nextPrivacyActive;
    privacyActive = nextPrivacyActive;
    if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
      mainWindow.webContents.send(IPC_CHANNELS.privacyUpdate, snapshot);
      if (
        privacyJustActivated &&
        currentMode !== "privacy" &&
        currentMode !== "privacy-expanded" &&
        currentMode !== "clipboard" &&
        currentMode !== "clipboard-prompt"
      ) {
        requestIslandMode("privacy");
      }
    }
  }

  function handleSystemSnapshot(snapshot) {
    if (layout === "top-center") {
      if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
        mainWindow.webContents.send(IPC_CHANNELS.systemUpdate, snapshot);
      }
    } else if (systemWindow && !systemWindow.isDestroyed() && systemRendererReady) {
      systemWindow.webContents.send(IPC_CHANNELS.systemUpdate, snapshot);
    }
  }

  function handleTaskbarSnapshot(snapshot) {
    applyTaskbarVisibility(snapshot?.visible);

    const nextLeft = snapshot?.available && Number.isFinite(snapshot.left) ? snapshot.left : 0;
    if (nextLeft === taskbarIconLeft) {
      return;
    }

    taskbarIconLeft = nextLeft;
    repositionAllStageWindows();
    sendAvoidScale();
  }

  function assertMainFrameSender(event) {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
  }

  function assertSystemFrameSender(event) {
    return Boolean(systemWindow && !systemWindow.isDestroyed() && event.sender === systemWindow.webContents);
  }

  function setMainInteracting(interacting) {
    rendererInteracting = Boolean(interacting);
    if (rendererInteracting) {
      mainHoverController.clearTimers();
    }
    updateMousePassthrough(true);
    return rendererInteracting;
  }

  function setSystemInteracting(interacting) {
    systemRendererInteracting = Boolean(interacting);
    updateSystemMousePassthrough(true);
    return systemRendererInteracting;
  }

  function getUiSettings() {
  return layoutTaskbarPolicy.getUiSettings();
}

  function dispose() {
    stopHoverDetection();
    stopSystemHoverDetection();
  }

  return {
    applyLayout,
    applySystemMonitorEnabled,
    assertMainFrameSender,
    assertSystemFrameSender,
    createSystemWindow,
    createWindow,
    dispose,
    getCurrentMode: () => currentMode,
    getMainWindow: () => mainWindow,
    getUiSettings,
    handleClipboardSnapshot,
    handleMainRendererReady,
    handleMediaSnapshot,
    handlePrivacySnapshot,
    handleSystemRendererReady,
    handleSystemSnapshot,
    handleTaskbarSnapshot,
    repositionAllStageWindows,
    repositionStageWindow,
    requestIslandMode,
    resizeIsland,
    resizeSystemIsland,
    setMainInteracting,
    setSystemInteracting,
    showExistingWindow
  };
}

module.exports = {
  createIslandWindowManager
};
