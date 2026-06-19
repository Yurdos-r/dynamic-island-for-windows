const path = require("node:path");
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session } = require("electron");
const { createStartupLogger } = require("./logger");
const { MEDIA_CONTROL_ACTIONS, createMediaController } = require("./media");
const { createClipboardMonitor } = require("./clipboard");
const { createPrivacyMonitor } = require("./privacy");
const { createNativeTaskbarWatch } = require("./native-taskbar");
const { createSystemMonitor } = require("./system-monitor");
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

const ISLAND_SIZES = {
  idle: { width: 360, height: 44 },
  peek: { width: 360, height: 48 },
  "clipboard-prompt": { width: 360, height: 48 },
  privacy: { width: 360, height: 44 },
  "privacy-expanded": { width: 360, height: 78 },
  hover: { width: 360, height: 78 },
  expanded: { width: 450, height: 336 },
  clipboard: { width: 450, height: 336 },
  settings: { width: 360, height: 264 },
  system: { width: 360, height: 300 }
};

const ISLAND_STATE_NAMES = {
  capsule: "胶囊",
  island: "小岛",
  card: "卡片"
};

const STAGE_SIZE = {
  width: 540,
  height: 360,
  left: 12,
  statusBarWidth: 820,
  statusBarGap: 8,
  bottom: 4,
  islandLeft: 2,
  islandBottom: 2,
  // 顶部居中布局的竖直锚（镜像 bottom/islandBottom）：胶囊贴屏幕顶部。
  top: 4,
  islandTop: 2
};

// 胶囊与任务栏图标区之间保持的最小间隙（px）。任务栏左缘比这更近时，胶囊开始退避缩小。
const TASKBAR_AVOID_GAP = 16;
// 胶囊退避时允许缩到的最小比例（避免缩成看不见）。
const TASKBAR_AVOID_MIN_SCALE = 0.72;
const TASKBAR_POLL_INTERVAL_MS = 400;
// 胶囊跟随任务栏显隐时的淡入淡出时长与步进（主进程用 setOpacity 步进实现）。
const FADE_DURATION_MS = 180;
const FADE_STEP_MS = 16;

const HOVER_DETECTION = {
  enterPadding: 1,
  exitPadding: 8,
  mousePadding: 4,
  openDelay: 24,
  closeDelay: 180,
  pollInterval: 32
};
const COLLAPSE_HIT_AREA_HOLD_MS = 820;
const NATIVE_HIT_SHAPE = process.platform === "win32";
const NATIVE_HIT_SHAPE_PADDING = 10;
const MIN_ANIMATION_WINDOW_HEIGHT = ISLAND_SIZES.idle.height + STAGE_SIZE.islandBottom * 2;
const RAISE_ON_POINTER_INTERVAL_MS = 120;

const VALID_ISLAND_MODES = new Set(Object.keys(ISLAND_SIZES));
const OPAQUE_WINDOW = process.argv.includes("--opaque-window");
const STARTUP_LOG_PATH = path.resolve(__dirname, "../../island-startup.log");
const USER_DATA_PATH = path.resolve(__dirname, "../../.tmp/dynamic-island-user-data");
const { logStartup, installGlobalErrorHandlers } = createStartupLogger(STARTUP_LOG_PATH);

let mainWindow;
let systemWindow;
let tray;
let mediaController;
let clipboardMonitor;
let privacyMonitor;
let systemMonitor;
let currentMode = "idle";
let systemCurrentMode = "idle";
let hoverPollTimer;
let hoverOpenTimer;
let hoverCloseTimer;
let systemHoverPollTimer;
let systemHoverCloseTimer;
let rendererReady = false;
let systemRendererReady = false;
let mediaActive = false;
let privacyActive = false;
let mouseEventsIgnored = false;
let systemMouseEventsIgnored = false;
let rendererInteracting = false;
let systemRendererInteracting = false;
let lastMousePassthroughCheck = 0;
let lastSystemMousePassthroughCheck = 0;
let mouseHitHoldMode = "";
let mouseHitHoldUntil = 0;
let systemMouseHitHoldMode = "";
let systemMouseHitHoldUntil = 0;
let shapeRefreshTimer;
let systemShapeRefreshTimer;
let currentWindowHeight = MIN_ANIMATION_WINDOW_HEIGHT;
let systemWindowHeight = MIN_ANIMATION_WINDOW_HEIGHT;
let lastPointerRaiseAt = 0;
let lastSystemPointerRaiseAt = 0;
let stageWidth = STAGE_SIZE.width;
let systemStageWidth = STAGE_SIZE.width;
let quitting = false;
let taskbarWatch;
// 任务栏图标区（ReBarWindow32）左缘的屏幕 x 坐标；0 表示尚未探测到，回退到旧的居中假设。
let taskbarIconLeft = 0;
// 任务栏当前是否可见（被全屏应用遮挡或自动隐藏retract时为 false）。胶囊据此显隐。
let taskbarVisible = true;
// 胶囊布局（"classic" 左下+右下双窗 / "top-center" 顶部居中单窗）与系统监控全局开关。
// 启动早期由 readUiSettings() 填充（见 app.whenReady），影响建窗/定位，故为主进程状态。
let layout = "classic";
let systemMonitorEnabled = true;
// 每个窗口正在进行的淡入淡出 setInterval 句柄，新淡入淡出会取消旧的，避免互相打架。
const fadeTimers = new WeakMap();

app.setPath("userData", USER_DATA_PATH);
app.setName("Dynamic Island for Windows");
installGlobalErrorHandlers();

function coerceIslandMode(mode) {
  return VALID_ISLAND_MODES.has(mode) ? mode : "idle";
}

function resolveModeForMediaState(mode) {
  const nextMode = coerceIslandMode(mode);

  if (nextMode === "clipboard" || nextMode === "clipboard-prompt") {
    return nextMode;
  }

  return mediaActive ||
    privacyActive ||
    nextMode === "idle" ||
    nextMode === "peek" ||
    nextMode === "settings" ||
    nextMode === "privacy" ||
    nextMode === "privacy-expanded"
    ? nextMode
    : "idle";
}

function getDevServerUrl() {
  const rawUrl = process.argv.find((argument) => argument.startsWith("--dev-server="))?.slice("--dev-server=".length);
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    const isLoopback = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    return isLoopback ? url.href : "";
  } catch {
    return "";
  }
}

function installSecurityGuards() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        ]
      }
    });
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      const devServerUrl = getDevServerUrl();
      const allowedUrls = new Set([devServerUrl, devServerUrl ? `${devServerUrl.replace(/\/$/, "")}/` : ""]);

      if (!url.startsWith("file://") && !allowedUrls.has(url)) {
        event.preventDefault();
        logStartup("blocked-navigation", url);
      }
    });
  });
}

function getStagePosition(windowHeight = currentWindowHeight, shouldLog = true) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  // 任务栏图标区右缘的"障碍线"：优先用原生探测到的 ReBarWindow32 左缘（居中任务栏
  // 向左扩张时它会逼近左下角胶囊）；探测不到时回退到旧的写死居中假设。
  // stage 窗口宽度固定为能容纳最宽卡片模式 + 缩放余量，不再被任务栏压缩。
  // 胶囊按自身 --island-width 显示，退避完全交给 --avoid-scale（见 computeAvoidScale）。
  const widestMode = Math.max(
    ISLAND_SIZES.expanded.width,
    ISLAND_SIZES.clipboard.width,
    ISLAND_SIZES.settings ? ISLAND_SIZES.settings.width : 0
  );
  const desiredStageWidth = widestMode + STAGE_SIZE.islandLeft * 2 + 8;
  const boundsBottom = display.bounds.y + display.bounds.height;
  stageWidth = Math.min(display.bounds.width - STAGE_SIZE.left * 2, Math.max(ISLAND_SIZES.idle.width + 4, desiredStageWidth));
  // 顶部居中：窗口水平居中、贴屏幕顶部；经典：贴左下角（既有行为）。
  const position =
    layout === "top-center"
      ? {
          x: Math.round(display.bounds.x + (display.bounds.width - stageWidth) / 2),
          y: Math.round(display.bounds.y + STAGE_SIZE.top - STAGE_SIZE.islandTop)
        }
      : {
          x: Math.round(display.bounds.x + STAGE_SIZE.left - STAGE_SIZE.islandLeft),
          y: Math.round(boundsBottom - windowHeight - STAGE_SIZE.bottom + STAGE_SIZE.islandBottom)
        };

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
      position
    });
  }

  return position;
}

function getSystemStagePosition(windowHeight = systemWindowHeight, shouldLog = true) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  const widestMode = Math.max(ISLAND_SIZES.expanded.width, ISLAND_SIZES.hover.width, ISLAND_SIZES.idle.width);
  const desiredStageWidth = widestMode + STAGE_SIZE.islandLeft * 2 + 8;
  const boundsRight = display.bounds.x + display.bounds.width;
  const boundsBottom = display.bounds.y + display.bounds.height;
  systemStageWidth = Math.min(
    display.bounds.width - STAGE_SIZE.left * 2,
    Math.max(ISLAND_SIZES.idle.width + 4, desiredStageWidth)
  );
  const position = {
    x: Math.round(boundsRight - STAGE_SIZE.left - systemStageWidth + STAGE_SIZE.islandLeft),
    y: Math.round(boundsBottom - windowHeight - STAGE_SIZE.bottom + STAGE_SIZE.islandBottom)
  };

  if (shouldLog) {
    logStartup("system-stage-position", {
      cursor: point,
      bounds: display.bounds,
      workArea: display.workArea,
      windowHeight,
      systemStageWidth,
      position
    });
  }

  return position;
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function clampLocalRect(rect) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(stageWidth, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(currentWindowHeight, Math.ceil(rect.y + rect.height));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function clampSystemLocalRect(rect) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(systemStageWidth, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(systemWindowHeight, Math.ceil(rect.y + rect.height));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function getIslandLocalRect(mode = currentMode, paddingX = 0, paddingY = paddingX) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];

  // 顶部居中：胶囊贴 stage 顶部、按自身宽度水平居中，命中区随当前模式宽度走。
  if (layout === "top-center") {
    const width = size.width;
    return clampLocalRect({
      x: (stageWidth - width) / 2 - paddingX,
      y: STAGE_SIZE.islandTop - paddingY,
      width: width + paddingX * 2,
      height: size.height + paddingY * 2
    });
  }

  // 经典：胶囊左下角docked，命中区横跨内 stage 宽度（胶囊向右生长，左缘固定）。
  const width = Math.max(ISLAND_SIZES.idle.width, stageWidth - STAGE_SIZE.islandLeft * 2);
  return clampLocalRect({
    x: STAGE_SIZE.islandLeft - paddingX,
    y: currentWindowHeight - size.height - STAGE_SIZE.islandBottom - paddingY,
    width: width + paddingX * 2,
    height: size.height + paddingY * 2
  });
}

function getSystemIslandLocalRect(mode = systemCurrentMode, paddingX = 0, paddingY = paddingX) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];

  return clampSystemLocalRect({
    x: systemStageWidth - STAGE_SIZE.islandLeft - size.width - paddingX,
    y: systemWindowHeight - size.height - STAGE_SIZE.islandBottom - paddingY,
    width: size.width + paddingX * 2,
    height: size.height + paddingY * 2
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
  const size = ISLAND_SIZES[coerceIslandMode(mode)];
  return size.width * size.height;
}

function clearExpiredMouseHitHold(now = Date.now()) {
  if (mouseHitHoldUntil && now >= mouseHitHoldUntil) {
    mouseHitHoldMode = "";
    mouseHitHoldUntil = 0;
  }
}

function clearExpiredSystemMouseHitHold(now = Date.now()) {
  if (systemMouseHitHoldUntil && now >= systemMouseHitHoldUntil) {
    systemMouseHitHoldMode = "";
    systemMouseHitHoldUntil = 0;
  }
}

function clearShapeRefreshTimer() {
  if (shapeRefreshTimer) {
    clearTimeout(shapeRefreshTimer);
    shapeRefreshTimer = undefined;
  }
}

function clearSystemShapeRefreshTimer() {
  if (systemShapeRefreshTimer) {
    clearTimeout(systemShapeRefreshTimer);
    systemShapeRefreshTimer = undefined;
  }
}

function getWindowHeightForMode(mode = currentMode) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];
  return Math.min(STAGE_SIZE.height, Math.max(MIN_ANIMATION_WINDOW_HEIGHT, size.height + STAGE_SIZE.islandBottom * 2));
}

function getSystemWindowHeightForMode(mode = systemCurrentMode) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];
  return Math.min(STAGE_SIZE.height, Math.max(MIN_ANIMATION_WINDOW_HEIGHT, size.height + STAGE_SIZE.islandBottom * 2));
}

function applyStageWindowBounds(windowHeight = currentWindowHeight, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const nextHeight = Math.round(
    Math.min(STAGE_SIZE.height, Math.max(MIN_ANIMATION_WINDOW_HEIGHT, Number(windowHeight) || MIN_ANIMATION_WINDOW_HEIGHT))
  );
  const position = getStagePosition(nextHeight, options.logPosition !== false);
  const currentBounds = mainWindow.getBounds();
  currentWindowHeight = nextHeight;

  if (
    currentBounds.x !== position.x ||
    currentBounds.y !== position.y ||
    currentBounds.width !== stageWidth ||
    currentBounds.height !== nextHeight
  ) {
    mainWindow.setBounds({
      ...position,
      width: stageWidth,
      height: nextHeight
    });
  }

  updateNativeHitShape();
  if (options.raise !== false) {
    raiseWindowForPointer(true);
  }
}

function applySystemStageWindowBounds(windowHeight = systemWindowHeight, options = {}) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return;
  }

  const nextHeight = Math.round(
    Math.min(STAGE_SIZE.height, Math.max(MIN_ANIMATION_WINDOW_HEIGHT, Number(windowHeight) || MIN_ANIMATION_WINDOW_HEIGHT))
  );
  const position = getSystemStagePosition(nextHeight, options.logPosition !== false);
  const currentBounds = systemWindow.getBounds();
  systemWindowHeight = nextHeight;

  if (
    currentBounds.x !== position.x ||
    currentBounds.y !== position.y ||
    currentBounds.width !== systemStageWidth ||
    currentBounds.height !== nextHeight
  ) {
    systemWindow.setBounds({
      ...position,
      width: systemStageWidth,
      height: nextHeight
    });
  }

  updateSystemNativeHitShape();
  if (options.raise !== false) {
    raiseSystemWindowForPointer(true);
  }
}

function scheduleStageWindowForMode(previousMode, nextMode) {
  const previousHeight = Math.max(currentWindowHeight, getWindowHeightForMode(previousMode));
  const nextHeight = getWindowHeightForMode(nextMode);

  if (nextHeight === currentWindowHeight) {
    updateNativeHitShape();
    raiseWindowForPointer(true);
    return;
  }

  if (nextHeight >= previousHeight) {
    applyStageWindowBounds(nextHeight);
    return;
  }

  updateNativeHitShape();
  raiseWindowForPointer(true);
}

function scheduleSystemStageWindowForMode(previousMode, nextMode) {
  const previousHeight = Math.max(systemWindowHeight, getSystemWindowHeightForMode(previousMode));
  const nextHeight = getSystemWindowHeightForMode(nextMode);

  if (nextHeight === systemWindowHeight) {
    updateSystemNativeHitShape();
    raiseSystemWindowForPointer(true);
    return;
  }

  if (nextHeight >= previousHeight) {
    applySystemStageWindowBounds(nextHeight);
    return;
  }

  updateSystemNativeHitShape();
  raiseSystemWindowForPointer(true);
}

function updateNativeHitShape() {
  if (!NATIVE_HIT_SHAPE || !mainWindow || mainWindow.isDestroyed() || typeof mainWindow.setShape !== "function") {
    return;
  }

  const now = Date.now();
  clearExpiredMouseHitHold(now);

  const rects = [getIslandLocalRect(currentMode, NATIVE_HIT_SHAPE_PADDING, NATIVE_HIT_SHAPE_PADDING)];

  if (mouseHitHoldMode && mouseHitHoldUntil > now) {
    rects.push(getIslandLocalRect(mouseHitHoldMode, NATIVE_HIT_SHAPE_PADDING, NATIVE_HIT_SHAPE_PADDING));
  }

  mainWindow.setShape(rects);

  clearShapeRefreshTimer();
  if (mouseHitHoldMode && mouseHitHoldUntil > now) {
    shapeRefreshTimer = setTimeout(() => {
      shapeRefreshTimer = undefined;
      clearExpiredMouseHitHold();
      updateNativeHitShape();
    }, mouseHitHoldUntil - now + 16);
  }
}

function updateSystemNativeHitShape() {
  if (!NATIVE_HIT_SHAPE || !systemWindow || systemWindow.isDestroyed() || typeof systemWindow.setShape !== "function") {
    return;
  }

  const now = Date.now();
  clearExpiredSystemMouseHitHold(now);

  const rects = [getSystemIslandLocalRect(systemCurrentMode, NATIVE_HIT_SHAPE_PADDING, NATIVE_HIT_SHAPE_PADDING)];

  if (systemMouseHitHoldMode && systemMouseHitHoldUntil > now) {
    rects.push(getSystemIslandLocalRect(systemMouseHitHoldMode, NATIVE_HIT_SHAPE_PADDING, NATIVE_HIT_SHAPE_PADDING));
  }

  systemWindow.setShape(rects);

  clearSystemShapeRefreshTimer();
  if (systemMouseHitHoldMode && systemMouseHitHoldUntil > now) {
    systemShapeRefreshTimer = setTimeout(() => {
      systemShapeRefreshTimer = undefined;
      clearExpiredSystemMouseHitHold();
      updateSystemNativeHitShape();
    }, systemMouseHitHoldUntil - now + 16);
  }
}

function armCollapseHitHold(previousMode, nextMode) {
  if (previousMode === nextMode) {
    return;
  }

  if (getModeArea(previousMode) <= getModeArea(nextMode)) {
    mouseHitHoldMode = "";
    mouseHitHoldUntil = 0;
    return;
  }

  mouseHitHoldMode = previousMode;
  mouseHitHoldUntil = Date.now() + COLLAPSE_HIT_AREA_HOLD_MS;
}

function armSystemCollapseHitHold(previousMode, nextMode) {
  if (previousMode === nextMode) {
    return;
  }

  if (getModeArea(previousMode) <= getModeArea(nextMode)) {
    systemMouseHitHoldMode = "";
    systemMouseHitHoldUntil = 0;
    return;
  }

  systemMouseHitHoldMode = previousMode;
  systemMouseHitHoldUntil = Date.now() + COLLAPSE_HIT_AREA_HOLD_MS;
}

function isPointerInsideMouseTarget(padding = 0) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  const now = Date.now();
  const point = screen.getCursorScreenPoint();

  if (pointInRect(point, getIslandRect(currentMode, padding, padding))) {
    return true;
  }

  clearExpiredMouseHitHold(now);
  return Boolean(
    mouseHitHoldMode &&
      mouseHitHoldUntil > now &&
      pointInRect(point, getIslandRect(mouseHitHoldMode, padding, padding))
  );
}

function isPointerInsideSystemMouseTarget(padding = 0) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return false;
  }

  const now = Date.now();
  const point = screen.getCursorScreenPoint();

  if (pointInRect(point, getSystemIslandRect(systemCurrentMode, padding, padding))) {
    return true;
  }

  clearExpiredSystemMouseHitHold(now);
  return Boolean(
    systemMouseHitHoldMode &&
      systemMouseHitHoldUntil > now &&
      pointInRect(point, getSystemIslandRect(systemMouseHitHoldMode, padding, padding))
  );
}

function setMousePassthrough(ignored) {
  if (!mainWindow || mainWindow.isDestroyed() || mouseEventsIgnored === ignored) {
    return;
  }

  mainWindow.setIgnoreMouseEvents(ignored, { forward: true });
  mouseEventsIgnored = ignored;
}

function setSystemMousePassthrough(ignored) {
  if (!systemWindow || systemWindow.isDestroyed() || systemMouseEventsIgnored === ignored) {
    return;
  }

  systemWindow.setIgnoreMouseEvents(ignored, { forward: true });
  systemMouseEventsIgnored = ignored;
}

function raiseWindowForPointer(force = false) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // 任务栏隐藏期间不把窗口拉回最上层，否则会盖在全屏应用上。
  if (!taskbarVisible) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastPointerRaiseAt < RAISE_ON_POINTER_INTERVAL_MS) {
    return;
  }

  lastPointerRaiseAt = now;
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.moveTop();
}

function raiseSystemWindowForPointer(force = false) {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return;
  }

  // 任务栏隐藏期间不把窗口拉回最上层，否则会盖在全屏应用上。
  if (!taskbarVisible) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastSystemPointerRaiseAt < RAISE_ON_POINTER_INTERVAL_MS) {
    return;
  }

  lastSystemPointerRaiseAt = now;
  systemWindow.setAlwaysOnTop(true, "screen-saver");
  systemWindow.moveTop();
}

function updateMousePassthrough(force = false) {
  if (NATIVE_HIT_SHAPE) {
    if (rendererReady && isPointerInsideMouseTarget(HOVER_DETECTION.mousePadding)) {
      raiseWindowForPointer(force);
    }
    setMousePassthrough(!rendererReady);
    return;
  }

  const now = Date.now();
  if (!force && now - lastMousePassthroughCheck < HOVER_DETECTION.pollInterval) {
    return;
  }
  lastMousePassthroughCheck = now;

  if (!rendererReady) {
    setMousePassthrough(true);
    return;
  }

  if (rendererInteracting) {
    setMousePassthrough(false);
    return;
  }

  setMousePassthrough(!isPointerInsideMouseTarget(HOVER_DETECTION.mousePadding));
}

function updateSystemMousePassthrough(force = false) {
  if (NATIVE_HIT_SHAPE) {
    if (systemRendererReady && isPointerInsideSystemMouseTarget(HOVER_DETECTION.mousePadding)) {
      raiseSystemWindowForPointer(force);
    }
    setSystemMousePassthrough(!systemRendererReady);
    return;
  }

  const now = Date.now();
  if (!force && now - lastSystemMousePassthroughCheck < HOVER_DETECTION.pollInterval) {
    return;
  }
  lastSystemMousePassthroughCheck = now;

  if (!systemRendererReady) {
    setSystemMousePassthrough(true);
    return;
  }

  if (systemRendererInteracting) {
    setSystemMousePassthrough(false);
    return;
  }

  setSystemMousePassthrough(!isPointerInsideSystemMouseTarget(HOVER_DETECTION.mousePadding));
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const position = getStagePosition();
  mainWindow.setBounds({
    ...position,
    width: stageWidth,
    height: currentWindowHeight
  });
  updateNativeHitShape();
  resizeIsland(currentMode);
}

function repositionSystemStageWindow() {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return;
  }

  const position = getSystemStagePosition();
  // 已 park（隐藏）的窗口：保持移出屏幕，仅同步尺寸与命中区，绝不移回屏幕内。
  // 这样任务栏轮询触发的周期性 repositionAllStageWindows 不会把隐藏的系统窗拽回来。
  const y = systemWindowParked ? position.y + SYSTEM_PARK_Y_OFFSET : position.y;
  systemWindow.setBounds({
    x: position.x,
    y,
    width: systemStageWidth,
    height: systemWindowHeight
  });
  updateSystemNativeHitShape();
  resizeSystemIsland(systemCurrentMode);
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
  systemMouseHitHoldMode = "";
  systemMouseHitHoldUntil = 0;
  systemWindowHeight = getSystemWindowHeightForMode("idle");
  if (systemWindow && !systemWindow.isDestroyed() && systemRendererReady) {
    systemWindow.webContents.send("island:set-mode", "idle");
  }
}

// 退避缩放因子：当任务栏图标区把胶囊可用宽度压到比当前模式正常宽度还窄时，
// 让胶囊整体等比缩小让位。stageWidth 已在 getStagePosition 里按任务栏左缘算好，
// 这里只需对比"可用空间"与"胶囊正常宽度"。
function computeAvoidScale() {
  // 顶部居中布局远离任务栏图标区，无碰撞，永不退避。
  if (layout === "top-center") {
    return 1;
  }

  // 没探测到任务栏图标区左缘时不退避。
  if (!(taskbarIconLeft > 0)) {
    return 1;
  }

  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point) || screen.getPrimaryDisplay();
  const naturalWidth = ISLAND_SIZES[coerceIslandMode(currentMode)].width;
  // 胶囊左缘的屏幕 x（贴左下角，从 STAGE_SIZE.left 起）。
  const capsuleLeft = display.bounds.x + STAGE_SIZE.left;
  // 胶囊右缘想要伸到的位置 + 与任务栏保持的间隙。
  const capsuleRightWanted = capsuleLeft + naturalWidth + TASKBAR_AVOID_GAP;
  // 任务栏图标区左缘没逼近胶囊：保持标准大小。
  if (capsuleRightWanted <= taskbarIconLeft) {
    return 1;
  }

  // 任务栏左缘留给胶囊的实际可用宽度。
  const availableWidth = taskbarIconLeft - capsuleLeft - TASKBAR_AVOID_GAP;
  const scale = availableWidth / naturalWidth;
  return Math.max(TASKBAR_AVOID_MIN_SCALE, Math.min(1, scale));
}

function sendAvoidScale() {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    return;
  }

  mainWindow.webContents.send("island:avoid-scale", computeAvoidScale());
}

function clearFadeTimer(win) {
  const timer = fadeTimers.get(win);
  if (timer) {
    clearInterval(timer);
    fadeTimers.delete(win);
  }
}

// 用 setInterval 步进 setOpacity，把窗口透明度过渡到 target，到位后执行 done。
// 新的淡入淡出会先取消该窗口上一次未完成的过渡，避免两个 timer 互相打架。
function fadeWindowTo(win, target, done) {
  if (!win || win.isDestroyed()) {
    return;
  }

  clearFadeTimer(win);
  const start = win.getOpacity();
  const delta = target - start;
  if (Math.abs(delta) < 0.01) {
    win.setOpacity(target);
    if (done) {
      done();
    }
    return;
  }

  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearFadeTimer(win);
      return;
    }

    const progress = Math.min(1, (Date.now() - startedAt) / FADE_DURATION_MS);
    win.setOpacity(start + delta * progress);
    if (progress >= 1) {
      clearFadeTimer(win);
      if (done) {
        done();
      }
    }
  }, FADE_STEP_MS);
  fadeTimers.set(win, timer);
}

function fadeOutAndHide(win) {
  if (!win || win.isDestroyed() || !win.isVisible()) {
    return;
  }

  fadeWindowTo(win, 0, () => {
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  });
}

// onShown 在 show() 之后同步执行：Windows 上对 hidden 窗口 setShape/命中形状不生效，
// 必须在窗口真正可见后重设，否则窗口虽显示却整窗不可点（hover/click 全透传）。
function showAndFadeIn(win, raise, onShown) {
  if (!win || win.isDestroyed()) {
    return;
  }

  win.setOpacity(0);
  if (!win.isVisible()) {
    win.show();
  }
  if (raise) {
    raise(true);
  }
  if (onShown) {
    onShown();
  }
  fadeWindowTo(win, 1);
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
  const nextVisible = visible !== false;
  if (nextVisible === taskbarVisible) {
    return;
  }

  taskbarVisible = nextVisible;
  logStartup("taskbar-visibility", { visible: taskbarVisible });

  if (taskbarVisible) {
    if (rendererReady) {
      showAndFadeIn(mainWindow, raiseWindowForPointer);
    }
    if (systemRendererReady && systemWindowShouldShow()) {
      showSystemWindow();
    }
  } else {
    fadeOutAndHide(mainWindow);
    hideSystemWindow();
  }
}

// 系统窗口（右下独立胶囊）仅在经典布局且系统监控开启时显示。顶部居中布局下系统监控
// 并入主窗口，独立系统窗口隐藏；监控关闭时两布局都不显示它。
function systemWindowShouldShow() {
  return layout === "classic" && systemMonitorEnabled;
}

// 系统监控进程仅在开启时运行（两布局通用：经典喂系统窗口、顶部居中喂主窗口）。
// start/stop 幂等，可安全重复调用。
function syncSystemMonitorRunning() {
  if (systemMonitorEnabled) {
    systemMonitor?.start();
  } else {
    systemMonitor?.stop();
  }
}

// 把当前布局/开关落到窗口上：主窗口总在（按布局重定位），系统窗口按 shouldShow 显隐。
//
// 系统窗口的「隐藏」必须用移出屏幕（park）而非 hide()：Windows 上对透明分层窗口
// （WS_EX_LAYERED + 透明）调用 hide() 会破坏其命中测试状态，随后 show() 回来即使重设
// setShape / setIgnoreMouseEvents 也无法恢复命中（实测 force-fix、整窗 setShape 均无效，
// 仅销毁重建可救）——这正是「切到顶部居中再切回 / 关开监控后右下胶囊可见却点不动，重启
// 才好」的根因。改用「移到屏幕外 → 移回原位」隐藏/显示，命中测试全程保持有效（实测移屏
// 循环后仍可点）。SYSTEM_PARK_Y_OFFSET 足够大以确保窗口完全移出任意显示器。
const SYSTEM_PARK_Y_OFFSET = 10000;
let systemWindowParked = false;

function unparkSystemWindow() {
  systemWindowParked = false;
}

// 淡出后把系统窗口移出屏幕（替代 fadeOutAndHide）。用 systemVisibilityToken 防竞态：
// 若淡出未完成时 show 路径已介入（token 递增），过期的淡出回调不再 park，避免把刚显示
// 的窗口又移出屏幕。
let systemVisibilityToken = 0;

function fadeOutAndParkSystemWindow() {
  if (!systemWindow || systemWindow.isDestroyed()) {
    return;
  }
  if (!systemWindow.isVisible()) {
    // 从未显示过：直接标记 park（位置在 reposition 时落到屏幕外），无需淡出。
    systemWindowParked = true;
    repositionSystemStageWindow();
    return;
  }
  const token = ++systemVisibilityToken;
  fadeWindowTo(systemWindow, 0, () => {
    if (token !== systemVisibilityToken || !systemWindow || systemWindow.isDestroyed()) {
      return;
    }
    systemWindowParked = true;
    repositionSystemStageWindow();
  });
}

// 显示系统窗口：解除 park（含使过期淡出回调失效）→ 收回 idle 基线 → 重定位到屏幕内 → 淡入。
// park 回来的窗口始终 isVisible，showAndFadeIn 不重复 show()，只淡入透明度。
function showSystemWindow() {
  systemVisibilityToken += 1;
  unparkSystemWindow();
  collapseSystemWindowToIdle();
  repositionSystemStageWindow();
  if (systemRendererReady) {
    showAndFadeIn(systemWindow, raiseSystemWindowForPointer, restoreSystemWindowHitState);
  }
}

// 隐藏系统窗口：收回 idle 基线后淡出并 park（移出屏幕，绝不 hide()）。
function hideSystemWindow() {
  collapseSystemWindowToIdle();
  fadeOutAndParkSystemWindow();
}

function applyLayoutToWindows() {
  repositionStageWindow();

  if (systemWindow && !systemWindow.isDestroyed()) {
    if (systemWindowShouldShow() && taskbarVisible) {
      showSystemWindow();
    } else {
      hideSystemWindow();
    }
  }
}

// 向两个 renderer 广播最新 UI 设置，让 main.ts 同步 data-layout / 内嵌系统卡显隐。
function broadcastUiSettings() {
  const payload = { layout, systemMonitorEnabled };
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send("island:layout-changed", payload);
  }
  if (systemWindow && !systemWindow.isDestroyed() && systemRendererReady) {
    systemWindow.webContents.send("island:layout-changed", payload);
  }
}

function applyLayout(next) {
  const value = VALID_LAYOUTS.has(next) ? next : "classic";
  if (value === layout) {
    return layout;
  }

  layout = value;
  writeUiSettings({ layout });
  logStartup("apply-layout", { layout });
  applyLayoutToWindows();
  sendAvoidScale();
  broadcastUiSettings();
  return layout;
}

function applySystemMonitorEnabled(next) {
  const value = Boolean(next);
  if (value === systemMonitorEnabled) {
    return systemMonitorEnabled;
  }

  systemMonitorEnabled = value;
  writeUiSettings({ systemMonitorEnabled });
  logStartup("apply-system-monitor", { systemMonitorEnabled });
  syncSystemMonitorRunning();
  applyLayoutToWindows();
  broadcastUiSettings();
  return systemMonitorEnabled;
}

function clearHoverOpenTimer() {
  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = undefined;
  }
}

function clearHoverCloseTimer() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = undefined;
  }
}

function requestIslandMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
    return;
  }

  const nextMode = resolveModeForMediaState(mode);
  clearHoverOpenTimer();
  clearHoverCloseTimer();
  resizeIsland(nextMode);
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !rendererReady) {
      return;
    }

    mainWindow.webContents.send("island:set-mode", nextMode);
  }, 16);
}

function requestSystemIslandMode(mode) {
  if (!systemWindow || systemWindow.isDestroyed() || !systemRendererReady) {
    return;
  }

  const nextMode = resizeSystemIsland(mode);
  if (systemHoverCloseTimer) {
    clearTimeout(systemHoverCloseTimer);
    systemHoverCloseTimer = undefined;
  }

  setTimeout(() => {
    if (!systemWindow || systemWindow.isDestroyed() || !systemRendererReady) {
      return;
    }

    systemWindow.webContents.send("island:set-mode", nextMode);
  }, 16);
}

function startHoverDetection() {
  if (hoverPollTimer) {
    return;
  }

  hoverPollTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    updateMousePassthrough();

    if (currentMode === "privacy" || currentMode === "privacy-expanded" || currentMode === "clipboard-prompt") {
      clearHoverOpenTimer();
      clearHoverCloseTimer();
      return;
    }

    const insideCard = isPointerInsideCurrentCard(HOVER_DETECTION.enterPadding);
    const insideExitArea = isPointerInsideCurrentCard(HOVER_DETECTION.exitPadding);

    if (insideExitArea) {
      clearHoverCloseTimer();
    }

    if (!privacyActive && insideCard && currentMode === "idle" && !hoverOpenTimer) {
      hoverOpenTimer = setTimeout(() => {
        hoverOpenTimer = undefined;

        if (!privacyActive && currentMode === "idle" && isPointerInsideCurrentCard(HOVER_DETECTION.enterPadding)) {
          requestIslandMode("peek");
        }
      }, HOVER_DETECTION.openDelay);
    }

    if (insideExitArea) {
      return;
    }

    clearHoverOpenTimer();

    const collapseMode = privacyActive ? "privacy" : "idle";
    if (currentMode !== collapseMode && currentMode !== "clipboard-prompt" && !hoverCloseTimer) {
      hoverCloseTimer = setTimeout(() => {
        hoverCloseTimer = undefined;

        if (currentMode !== collapseMode && !isPointerInsideCurrentCard(HOVER_DETECTION.exitPadding)) {
          requestIslandMode(collapseMode);
        }
      }, HOVER_DETECTION.closeDelay);
    }
  }, HOVER_DETECTION.pollInterval);
}

function startSystemHoverDetection() {
  if (systemHoverPollTimer) {
    return;
  }

  systemHoverPollTimer = setInterval(() => {
    if (!systemWindow || systemWindow.isDestroyed()) {
      return;
    }

    updateSystemMousePassthrough();

    const insideExitArea = isPointerInsideSystemCard(HOVER_DETECTION.exitPadding);
    if (insideExitArea) {
      if (systemHoverCloseTimer) {
        clearTimeout(systemHoverCloseTimer);
        systemHoverCloseTimer = undefined;
      }
      return;
    }

    if (systemCurrentMode !== "idle" && !systemHoverCloseTimer) {
      systemHoverCloseTimer = setTimeout(() => {
        systemHoverCloseTimer = undefined;

        if (systemCurrentMode !== "idle" && !isPointerInsideSystemCard(HOVER_DETECTION.exitPadding)) {
          requestSystemIslandMode("idle");
        }
      }, systemCurrentMode === "expanded" ? 220 : HOVER_DETECTION.closeDelay);
    }
  }, HOVER_DETECTION.pollInterval);
}

function stopHoverDetection() {
  if (hoverPollTimer) {
    clearInterval(hoverPollTimer);
    hoverPollTimer = undefined;
  }

  clearHoverOpenTimer();
  clearHoverCloseTimer();
  clearShapeRefreshTimer();
}

function stopSystemHoverDetection() {
  if (systemHoverPollTimer) {
    clearInterval(systemHoverPollTimer);
    systemHoverPollTimer = undefined;
  }

  if (systemHoverCloseTimer) {
    clearTimeout(systemHoverCloseTimer);
    systemHoverCloseTimer = undefined;
  }

  clearSystemShapeRefreshTimer();
}

function assertMainFrameSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function assertSystemFrameSender(event) {
  return Boolean(systemWindow && !systemWindow.isDestroyed() && event.sender === systemWindow.webContents);
}

function registerIpcHandlers() {
  ipcMain.on("island:renderer-ready", (event) => {
    if (assertSystemFrameSender(event)) {
      systemRendererReady = true;
      logStartup("system-renderer-ready", systemWindow.getBounds());
      resizeSystemIsland(systemCurrentMode);
      // 仅经典布局 + 监控开启 + 任务栏可见时显示独立系统窗口；否则用 park（移出屏幕）
      // 隐藏，绝不 hide()——避免后续 show 触发命中僵死（详见 applyLayoutToWindows 上方注释）。
      if (taskbarVisible && systemWindowShouldShow()) {
        systemWindow.show();
        raiseSystemWindowForPointer(true);
      } else {
        systemWindow.show();
        systemWindowParked = true;
        repositionSystemStageWindow();
      }
      startSystemHoverDetection();
      syncSystemMonitorRunning();
      return;
    }

    if (!assertMainFrameSender(event)) {
      return;
    }

    rendererReady = true;
    logStartup("renderer-ready", mainWindow.getBounds());
    resizeIsland(currentMode);
    // 任务栏隐藏中（如应用全屏启动）则先不显示，等任务栏恢复时再淡入。
    if (taskbarVisible) {
      mainWindow.show();
      raiseWindowForPointer(true);
    }
    startHoverDetection();
    mediaController?.start();
    clipboardMonitor?.start();
    privacyMonitor?.start();
    sendAvoidScale();
    // 把初始布局/监控开关推给主 renderer（用于 data-layout 与内嵌系统卡显隐）。
    mainWindow.webContents.send("island:layout-changed", { layout, systemMonitorEnabled });
  });

  ipcMain.handle("island:resize", (event, mode) => {
    if (assertSystemFrameSender(event)) {
      return resizeSystemIsland(mode);
    }

    if (!assertMainFrameSender(event)) {
      return currentMode;
    }

    return resizeIsland(mode);
  });

  ipcMain.handle("island:get-ui-settings", (event) => {
    if (!assertMainFrameSender(event)) {
      return { layout, systemMonitorEnabled };
    }

    return { layout, systemMonitorEnabled };
  });

  ipcMain.handle("island:set-layout", (event, nextLayout) => {
    if (!assertMainFrameSender(event)) {
      return layout;
    }

    return applyLayout(nextLayout);
  });

  ipcMain.handle("island:set-system-monitor", (event, enabled) => {
    if (!assertMainFrameSender(event)) {
      return systemMonitorEnabled;
    }

    return applySystemMonitorEnabled(enabled);
  });

  ipcMain.handle("island:set-interacting", (event, interacting) => {
    if (assertSystemFrameSender(event)) {
      systemRendererInteracting = Boolean(interacting);
      updateSystemMousePassthrough(true);
      return systemRendererInteracting;
    }

    if (!assertMainFrameSender(event)) {
      return false;
    }

    rendererInteracting = Boolean(interacting);
    if (rendererInteracting) {
      clearHoverOpenTimer();
      clearHoverCloseTimer();
    }
    updateMousePassthrough(true);

    return rendererInteracting;
  });

  ipcMain.handle("media:control", (event, action) => {
    if (!assertMainFrameSender(event) || !MEDIA_CONTROL_ACTIONS.has(action)) {
      return { ok: false, available: false };
    }

    return mediaController?.control(action) ?? { ok: false, available: false };
  });

  ipcMain.handle("media:seek", (event, seconds) => {
    if (!assertMainFrameSender(event) || !Number.isFinite(seconds)) {
      return { ok: false, available: false };
    }

    return mediaController?.control("seek", Math.max(0, Math.round(seconds))) ?? { ok: false, available: false };
  });

  ipcMain.handle("clipboard:write", (event, text) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return clipboardMonitor?.writeText(text) ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle("clipboard:accept-pending", (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return clipboardMonitor?.acceptPending(typeof id === "string" ? id : "") ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle("clipboard:dismiss-pending", (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return clipboardMonitor?.dismissPending(typeof id === "string" ? id : "") ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle("clipboard:clear", (event) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return clipboardMonitor?.clearItems() ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle("clipboard:remove", (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return clipboardMonitor?.removeItem(typeof id === "string" ? id : "") ?? { ok: false, error: "Clipboard monitor is not available." };
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("动态岛");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示小岛",
        click: () => {
          repositionStageWindow();
          mainWindow?.show();
          resizeIsland(currentMode);
        }
      },
      {
        label: ISLAND_STATE_NAMES.capsule,
        click: () => requestIslandMode("idle")
      },
      {
        label: ISLAND_STATE_NAMES.card,
        click: () => requestIslandMode("expanded")
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          quitting = true;
          app.quit();
        }
      }
    ])
  );
}

function loadRendererEntry(windowToLoad, htmlFile, label) {
  const devServerUrl = getDevServerUrl();
  if (devServerUrl) {
    const url = new URL(htmlFile, devServerUrl).href;
    logStartup(`load-url-${label}`, url);
    windowToLoad.loadURL(url);
    return;
  }

  const filePath = path.join(__dirname, "../../dist", htmlFile);
  logStartup(`load-file-${label}`, filePath);
  windowToLoad.loadFile(filePath).catch((error) => {
    logStartup(`load-file-${label}-error`, error?.stack || error?.message || String(error));
  });
}

function createWindow() {
  rendererReady = false;
  currentWindowHeight = getWindowHeightForMode(currentMode);
  const position = getStagePosition(currentWindowHeight);
  logStartup("create-window", { ...position, opaqueWindow: OPAQUE_WINDOW });

  mainWindow = new BrowserWindow({
    width: stageWidth,
    height: currentWindowHeight,
    ...position,
    show: false,
    frame: false,
    transparent: !OPAQUE_WINDOW,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: OPAQUE_WINDOW ? "#05070c" : "#00000000",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setMenuBarVisibility(false);
  updateNativeHitShape();
  setMousePassthrough(true);

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    logStartup("ready-to-show", mainWindow.getBounds());
    resizeIsland(currentMode);
    mainWindow.show();
    raiseWindowForPointer(true);
  });

  mainWindow.webContents.once("did-finish-load", () => {
    logStartup("did-finish-load");

    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) {
      return;
    }

    resizeIsland(currentMode);
    mainWindow.show();
    raiseWindowForPointer(true);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logStartup("did-fail-load", { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logStartup("render-process-gone", details);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logStartup("renderer-console", { level, message, line, sourceId });
  });

  mainWindow.on("show", () => {
    logStartup("window-show", mainWindow.getBounds());
  });

  mainWindow.on("hide", () => {
    logStartup("window-hide");
  });

  mainWindow.on("closed", () => {
    logStartup("window-closed");
    mainWindow = undefined;
  });

  mainWindow.on("blur", () => {
    if (
      currentMode !== "expanded" &&
      currentMode !== "clipboard" &&
      currentMode !== "settings" &&
      currentMode !== "privacy" &&
      currentMode !== "privacy-expanded"
    ) {
      requestIslandMode("idle");
    }
  });

  loadRendererEntry(mainWindow, "index.html", "main");
}

function createSystemWindow() {
  systemRendererReady = false;
  systemCurrentMode = "idle";
  systemWindowHeight = getSystemWindowHeightForMode(systemCurrentMode);
  const position = getSystemStagePosition(systemWindowHeight);
  logStartup("create-system-window", { ...position, opaqueWindow: OPAQUE_WINDOW });

  systemWindow = new BrowserWindow({
    width: systemStageWidth,
    height: systemWindowHeight,
    ...position,
    show: false,
    frame: false,
    transparent: !OPAQUE_WINDOW,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: OPAQUE_WINDOW ? "#05070c" : "#00000000",
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  systemWindow.setAlwaysOnTop(true, "screen-saver");
  systemWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  systemWindow.setMenuBarVisibility(false);
  updateSystemNativeHitShape();
  setSystemMousePassthrough(true);

  systemWindow.once("ready-to-show", () => {
    if (!systemWindow || systemWindow.isDestroyed()) {
      return;
    }

    logStartup("system-ready-to-show", systemWindow.getBounds());
    resizeSystemIsland(systemCurrentMode);
    // 仅经典布局 + 监控开启 + 任务栏可见时显示；顶部居中/监控关闭时保持隐藏，避免闪现。
    if (taskbarVisible && systemWindowShouldShow()) {
      systemWindow.show();
      raiseSystemWindowForPointer(true);
    }
  });

  systemWindow.webContents.once("did-finish-load", () => {
    logStartup("system-did-finish-load");

    if (!systemWindow || systemWindow.isDestroyed() || systemWindow.isVisible()) {
      return;
    }

    resizeSystemIsland(systemCurrentMode);
    if (taskbarVisible && systemWindowShouldShow()) {
      systemWindow.show();
      raiseSystemWindowForPointer(true);
    }
  });

  systemWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logStartup("system-did-fail-load", { errorCode, errorDescription, validatedURL });
  });

  systemWindow.webContents.on("render-process-gone", (_event, details) => {
    logStartup("system-render-process-gone", details);
  });

  systemWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logStartup("system-renderer-console", { level, message, line, sourceId });
  });

  systemWindow.on("show", () => {
    logStartup("system-window-show", systemWindow.getBounds());
  });

  systemWindow.on("hide", () => {
    logStartup("system-window-hide");
  });

  systemWindow.on("closed", () => {
    logStartup("system-window-closed");
    systemWindow = undefined;
  });

  systemWindow.on("blur", () => {
    if (systemCurrentMode !== "idle") {
      requestSystemIslandMode("idle");
    }
  });

  loadRendererEntry(systemWindow, "system.html", "system");
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
      systemWindowParked = true;
      repositionSystemStageWindow();
    }
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  logStartup("second-instance-quit");
  app.quit();
} else {
  app.on("second-instance", showExistingWindow);

  app.whenReady().then(() => {
    logStartup("app-ready", { argv: process.argv });
    installSecurityGuards();
    // 建窗前读持久化的布局/监控开关，避免按错误布局建窗后再闪一下。
    const ui = readUiSettings();
    layout = ui.layout;
    systemMonitorEnabled = ui.systemMonitorEnabled;
    logStartup("ui-settings", ui);
    mediaController = createMediaController({
      logStartup,
      emitSnapshot: (snapshot) => {
        mediaActive = Boolean(snapshot?.active);
        if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
          mainWindow.webContents.send("media:update", snapshot);
          if (!mediaActive && !privacyActive && (currentMode === "hover" || currentMode === "expanded")) {
            requestIslandMode("idle");
          }
        }
      }
    });
    clipboardMonitor = createClipboardMonitor({
      logStartup,
      emitSnapshot: (snapshot) => {
        if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
          mainWindow.webContents.send("clipboard:update", snapshot);
        }
      }
    });
    privacyMonitor = createPrivacyMonitor({
      logStartup,
      emitSnapshot: (snapshot) => {
        const nextPrivacyActive = Boolean(snapshot?.active);
        const privacyJustActivated = !privacyActive && nextPrivacyActive;
        privacyActive = nextPrivacyActive;
        if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
          mainWindow.webContents.send("privacy:update", snapshot);
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
    });
    systemMonitor = createSystemMonitor({
      logStartup,
      emitSnapshot: (snapshot) => {
        // 顶部居中：系统监控并入主窗口；经典：喂独立系统窗口。监控关闭时不分发（进程已 stop）。
        if (layout === "top-center") {
          if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
            mainWindow.webContents.send("system:update", snapshot);
          }
        } else if (systemWindow && !systemWindow.isDestroyed() && systemRendererReady) {
          systemWindow.webContents.send("system:update", snapshot);
        }
      }
    });
    createWindow();
    createSystemWindow();
    createTray();
    registerIpcHandlers();

    taskbarWatch = createNativeTaskbarWatch({
      logStartup,
      pollInterval: TASKBAR_POLL_INTERVAL_MS,
      onUpdate: (snapshot) => {
        // 可见性优先处理：全屏切换时图标区矩形不变（nextLeft 相等），不能被下面的
        // early-return 吞掉，否则胶囊不会随全屏显隐。
        applyTaskbarVisibility(snapshot?.visible);

        const nextLeft = snapshot?.available && Number.isFinite(snapshot.left) ? snapshot.left : 0;
        if (nextLeft === taskbarIconLeft) {
          return;
        }

        taskbarIconLeft = nextLeft;
        repositionAllStageWindows();
        sendAvoidScale();
      }
    });
    taskbarWatch.start();
    screen.on("display-metrics-changed", repositionAllStageWindows);
    screen.on("display-added", repositionAllStageWindows);
    screen.on("display-removed", repositionAllStageWindows);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createSystemWindow();
    } else {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      }
      if (!systemWindow || systemWindow.isDestroyed()) {
        createSystemWindow();
      }
    }
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
    stopHoverDetection();
    stopSystemHoverDetection();
    mediaController?.stop();
    clipboardMonitor?.stop();
    privacyMonitor?.stop();
    systemMonitor?.stop();
    taskbarWatch?.stop();
    tray?.destroy();
  });

  app.on("will-quit", () => {
    logStartup("will-quit");
  });

  app.on("quit", (_event, exitCode) => {
    logStartup("quit", { exitCode });
  });
}
