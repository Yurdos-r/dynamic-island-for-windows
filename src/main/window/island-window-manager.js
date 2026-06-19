const path = require("node:path");
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
const { createWindowFader } = require("./fade-controller");
const { createHitTargetManager } = require("./hit-target-manager");
const { createMainHoverController, createSystemHoverController } = require("./hover-controller");
const { createLayoutTaskbarPolicy } = require("./layout-taskbar-policy");
const { createPointerWindowController } = require("./pointer-window-controller");
const { createStageBoundsController } = require("./stage-bounds-controller");
const { createSystemWindowVisibilityManager } = require("./system-window-visibility");
const { createFrameInteractionController } = require("./frame-interaction");
const { createRendererReadinessController } = require("./renderer-readiness");
const { createWindowSnapshotDispatcher } = require("./snapshot-dispatcher");
const { createWindowCreationController } = require("./window-creation-controller");
const { createWindowGeometryController } = require("./window-geometry-controller");
const { createWindowModeController } = require("./window-mode-controller");
const { createWindowRuntimeState } = require("./window-runtime-state");

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

  const state = createWindowRuntimeState({
    validLayouts: VALID_LAYOUTS,
    initialUiSettings,
    minWindowHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    initialStageWidth: STAGE_SIZE.width
  });
  const windowFader = createWindowFader();
  const geometry = createWindowGeometryController({ state, logStartup });
  let creationController;
  let modeController;

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

function getStagePosition(windowHeight = state.currentWindowHeight, shouldLog = true) {
  return geometry.getStagePosition(windowHeight, shouldLog);
}

function getSystemStagePosition(windowHeight = state.systemWindowHeight, shouldLog = true) {
  return geometry.getSystemStagePosition(windowHeight, shouldLog);
}

function getIslandLocalRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
  return geometry.getIslandLocalRect(mode, paddingX, paddingY);
}

function getSystemIslandLocalRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
  return geometry.getSystemIslandLocalRect(mode, paddingX, paddingY);
}

function getIslandRect(mode = state.currentMode, paddingX = 0, paddingY = paddingX) {
  return geometry.getIslandRect(mode, paddingX, paddingY);
}

function getSystemIslandRect(mode = state.systemCurrentMode, paddingX = 0, paddingY = paddingX) {
  return geometry.getSystemIslandRect(mode, paddingX, paddingY);
}

function isPointerInsideCurrentCard(padding = 0) {
  return geometry.isPointerInsideCurrentCard(padding);
}

function isPointerInsideSystemCard(padding = 0) {
  return geometry.isPointerInsideSystemCard(padding);
}

function getModeArea(mode) {
  return geometry.getModeArea(mode);
}

function clearShapeRefreshTimer() {
  mainHitTarget.clearShapeRefreshTimer();
}

function clearSystemShapeRefreshTimer() {
  systemHitTarget.clearShapeRefreshTimer();
}

function getWindowHeightForMode(mode = state.currentMode) {
  return geometry.getWindowHeightForMode(mode);
}

function getSystemWindowHeightForMode(mode = state.systemCurrentMode) {
  return geometry.getSystemWindowHeightForMode(mode);
}

function updateNativeHitShape() {
  mainHitTarget.updateNativeHitShape();
}

function updateSystemNativeHitShape() {
  systemHitTarget.updateNativeHitShape();
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

// 绯荤粺绐楀彛闅愯棌锛堝垏鍒伴《閮ㄥ眳涓€佹垨鍏抽棴鐩戞帶锛夊墠鎶婂畠鏀跺洖 idle 鍩虹嚎灏哄銆?
// 鍚﹀垯闅愯棌鏃惰嫢鍋滃湪 hover/expanded锛堝 340 楂橈級锛宻ystemWindowHeight 浼氫繚鐣欓檲鏃ч珮搴︼紝
// 涓嬫鍒囧洖缁忓吀鏃?repositionSystemStageWindow 鐢ㄩ檲鏃ч珮搴﹀畾浣嶏紝绐楀彛鍗″湪閿欒鐨勯珮/浣嶏紙濡?
// y=618/h=340锛夛紝鍏堕《閮ㄥぇ鐗囬€忔槑鍖虹洊鍦ㄨ兌鍥婃湰搴旇鍑虹殑浣嶇疆涓婏紝瀵艰嚧鑳跺泭鐐逛笉鍔紙鍛戒腑鍖轰笌
// 绐楀彛鍑犱綍閿欎綅锛夈€俿cheduleSystemStageWindowForMode 鐨勬敹缂╁垎鏀湪 mode 鏈彉锛坕dle鈫抜dle锛?
// 鏃朵笉浼氱缉绐楋紝鏁呰繖閲岀洿鎺ユ妸 systemWindowHeight 閲嶇疆骞堕€氱煡 renderer 鍚屾鍥?idle銆?
function collapseSystemWindowToIdle() {
  getModeController().collapseSystemWindowToIdle();
}

// 閫€閬跨缉鏀惧洜瀛愶細褰撲换鍔℃爮鍥炬爣鍖烘妸鑳跺泭鍙敤瀹藉害鍘嬪埌姣斿綋鍓嶆ā寮忔甯稿搴﹁繕绐勬椂锛?
// 璁╄兌鍥婃暣浣撶瓑姣旂缉灏忚浣嶃€俿tageWidth 宸插湪 getStagePosition 閲屾寜浠诲姟鏍忓乏缂樼畻濂斤紝
// 杩欓噷鍙渶瀵规瘮"鍙敤绌洪棿"涓?鑳跺泭姝ｅ父瀹藉害"銆?
function computeAvoidScale() {
  return geometry.computeAvoidScale();
}

function sendAvoidScale() {
  if (!state.mainWindow || state.mainWindow.isDestroyed() || !state.rendererReady) {
    return;
  }

  state.mainWindow.webContents.send(IPC_CHANNELS.avoidScale, computeAvoidScale());
}

// 鐢?setInterval 姝ヨ繘 setOpacity锛屾妸绐楀彛閫忔槑搴﹁繃娓″埌 target锛屽埌浣嶅悗鎵ц done銆?
// 鏂扮殑娣″叆娣″嚭浼氬厛鍙栨秷璇ョ獥鍙ｄ笂涓€娆℃湭瀹屾垚鐨勮繃娓★紝閬垮厤涓や釜 timer 浜掔浉鎵撴灦銆?
function fadeWindowTo(win, target, done) {
  windowFader.fadeTo(win, target, done);
}

function fadeOutAndHide(win) {
  windowFader.fadeOutAndHide(win);
}

// onShown 鍦?show() 涔嬪悗鍚屾鎵ц锛歐indows 涓婂 hidden 绐楀彛 setShape/鍛戒腑褰㈢姸涓嶇敓鏁堬紝
// 蹇呴』鍦ㄧ獥鍙ｇ湡姝ｅ彲瑙佸悗閲嶈锛屽惁鍒欑獥鍙ｈ櫧鏄剧ず鍗存暣绐椾笉鍙偣锛坔over/click 鍏ㄩ€忎紶锛夈€?
function showAndFadeIn(win, raise, onShown) {
  windowFader.showAndFadeIn(win, raise, onShown);
}

// 绯荤粺绐楁樉绀哄悗閲嶅缓鍘熺敓鍛戒腑褰㈢姸 + 鍒锋柊榧犳爣绌块€忥紝渚涙墍鏈夋樉绀虹郴缁熺獥鐨勮矾寰勫鐢ㄣ€?
function restoreSystemWindowHitState() {
  updateSystemNativeHitShape();
  updateSystemMousePassthrough(true);
}

// 浠诲姟鏍忓彲瑙佹€у彉鍖栨椂锛屾妸涓や釜鑳跺泭绐楀彛涓€璧锋贰鍏ユ樉绀烘垨娣″嚭闅愯棌銆傞殣钘忔椂璋冪敤 hide()
// 褰诲簳绉诲嚭 z-order锛岃繖鏍峰叏灞忓簲鐢ㄤ笂鏂逛笉浼氬啀娈嬬暀鑳跺泭銆傛湭 ready 鐨勭獥鍙ｅ彧缃姸鎬侊紝
// 鐢?renderer-ready 娴佺▼鎸?taskbarVisible 鍐冲畾鏄惁 show銆?
function applyTaskbarVisibility(visible) {
  layoutTaskbarPolicy.applyTaskbarVisibility(visible);
}

// 绯荤粺绐楀彛锛堝彸涓嬬嫭绔嬭兌鍥婏級浠呭湪缁忓吀甯冨眬涓旂郴缁熺洃鎺у紑鍚椂鏄剧ず銆傞《閮ㄥ眳涓竷灞€涓嬬郴缁熺洃鎺?
// 骞跺叆涓荤獥鍙ｏ紝鐙珛绯荤粺绐楀彛闅愯棌锛涚洃鎺у叧闂椂涓ゅ竷灞€閮戒笉鏄剧ず瀹冦€?
function systemWindowShouldShow() {
  return layoutTaskbarPolicy.systemWindowShouldShow();
}

// 绯荤粺鐩戞帶杩涚▼浠呭湪寮€鍚椂杩愯锛堜袱甯冨眬閫氱敤锛氱粡鍏稿杺绯荤粺绐楀彛銆侀《閮ㄥ眳涓杺涓荤獥鍙ｏ級銆?
// start/stop 骞傜瓑锛屽彲瀹夊叏閲嶅璋冪敤銆?
function syncSystemMonitorRunning() {
  onSystemMonitorRunningChange(state.systemMonitorEnabled);
}

// 鎶婂綋鍓嶅竷灞€/寮€鍏宠惤鍒扮獥鍙ｄ笂锛氫富绐楀彛鎬诲湪锛堟寜甯冨眬閲嶅畾浣嶏級锛岀郴缁熺獥鍙ｆ寜 shouldShow 鏄鹃殣銆?
//
// 绯荤粺绐楀彛鐨勩€岄殣钘忋€嶅繀椤荤敤绉诲嚭灞忓箷锛坧ark锛夎€岄潪 hide()锛歐indows 涓婂閫忔槑鍒嗗眰绐楀彛
// 锛圵S_EX_LAYERED + 閫忔槑锛夎皟鐢?hide() 浼氱牬鍧忓叾鍛戒腑娴嬭瘯鐘舵€侊紝闅忓悗 show() 鍥炴潵鍗充娇閲嶈
// setShape / setIgnoreMouseEvents 涔熸棤娉曟仮澶嶅懡涓紙瀹炴祴 force-fix銆佹暣绐?setShape 鍧囨棤鏁堬紝
// 浠呴攢姣侀噸寤哄彲鏁戯級鈥斺€旇繖姝ｆ槸銆屽垏鍒伴《閮ㄥ眳涓啀鍒囧洖 / 鍏冲紑鐩戞帶鍚庡彸涓嬭兌鍥婂彲瑙佸嵈鐐逛笉鍔紝閲嶅惎
// 鎵嶅ソ銆嶇殑鏍瑰洜銆傛敼鐢ㄣ€岀Щ鍒板睆骞曞 鈫?绉诲洖鍘熶綅銆嶉殣钘?鏄剧ず锛屽懡涓祴璇曞叏绋嬩繚鎸佹湁鏁堬紙瀹炴祴绉诲睆
// 寰幆鍚庝粛鍙偣锛夈€係YSTEM_PARK_Y_OFFSET 瓒冲澶т互纭繚绐楀彛瀹屽叏绉诲嚭浠绘剰鏄剧ず鍣ㄣ€?
function unparkSystemWindow() {
  systemWindowVisibility.unpark();
}

// 娣″嚭鍚庢妸绯荤粺绐楀彛绉诲嚭灞忓箷锛堟浛浠?fadeOutAndHide锛夈€傜敤 systemVisibilityToken 闃茬珵鎬侊細
// 鑻ユ贰鍑烘湭瀹屾垚鏃?show 璺緞宸蹭粙鍏ワ紙token 閫掑锛夛紝杩囨湡鐨勬贰鍑哄洖璋冧笉鍐?park锛岄伩鍏嶆妸鍒氭樉绀?
// 鐨勭獥鍙ｅ張绉诲嚭灞忓箷銆?
// 鏄剧ず绯荤粺绐楀彛锛氳В闄?park锛堝惈浣胯繃鏈熸贰鍑哄洖璋冨け鏁堬級鈫?鏀跺洖 idle 鍩虹嚎 鈫?閲嶅畾浣嶅埌灞忓箷鍐?鈫?娣″叆銆?
// park 鍥炴潵鐨勭獥鍙ｅ缁?isVisible锛宻howAndFadeIn 涓嶉噸澶?show()锛屽彧娣″叆閫忔槑搴︺€?
function showSystemWindow() {
  systemWindowVisibility.show();
}

// 闅愯棌绯荤粺绐楀彛锛氭敹鍥?idle 鍩虹嚎鍚庢贰鍑哄苟 park锛堢Щ鍑哄睆骞曪紝缁濅笉 hide()锛夈€?
function hideSystemWindow() {
  systemWindowVisibility.hide();
}

function applyLayout(next) {
  return layoutTaskbarPolicy.applyLayout(next);
}

function applySystemMonitorEnabled(next) {
  return layoutTaskbarPolicy.applySystemMonitorEnabled(next);
}

function requestIslandMode(mode) {
  getModeController().requestIslandMode(mode);
}

function requestSystemIslandMode(mode) {
  getModeController().requestSystemIslandMode(mode);
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
  return getCreationController().createWindow();
}

function createSystemWindow() {
  return getCreationController().createSystemWindow();
}

function showExistingWindow() {
  return getCreationController().showExistingWindow();
}



  const mainHoverController = createMainHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => state.currentMode,
    isPointerInsideCard: isPointerInsideCurrentCard,
    isPrivacyActive: () => state.privacyActive,
    requestIslandMode,
    updateMousePassthrough
  });

  const systemHoverController = createSystemHoverController({
    hoverDetection: HOVER_DETECTION,
    getCurrentMode: () => state.systemCurrentMode,
    isPointerInsideCard: isPointerInsideSystemCard,
    requestIslandMode: requestSystemIslandMode,
    updateMousePassthrough: updateSystemMousePassthrough
  });

  const systemWindowVisibility = createSystemWindowVisibilityManager({
    getWindow: () => state.systemWindow,
    isRendererReady: () => state.systemRendererReady,
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
    getWindow: () => state.mainWindow,
    getCurrentMode: () => state.currentMode,
    getLocalRect: getIslandLocalRect,
    getScreenRect: getIslandRect,
    getModeArea,
    getCursorPoint: geometry.getCursorPoint,
    pointInRect: geometry.pointInRect
  });

  const systemHitTarget = createHitTargetManager({
    nativeHitShape: NATIVE_HIT_SHAPE,
    nativeHitShapePadding: NATIVE_HIT_SHAPE_PADDING,
    collapseHoldMs: COLLAPSE_HIT_AREA_HOLD_MS,
    getWindow: () => state.systemWindow,
    getCurrentMode: () => state.systemCurrentMode,
    getLocalRect: getSystemIslandLocalRect,
    getScreenRect: getSystemIslandRect,
    getModeArea,
    getCursorPoint: geometry.getCursorPoint,
    pointInRect: geometry.pointInRect
  });

  const mainPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => state.mainWindow,
    getTaskbarVisible: () => state.taskbarVisible,
    getRendererReady: () => state.rendererReady,
    getRendererInteracting: () => state.rendererInteracting,
    isPointerInsideMouseTarget
  });

  const systemPointerController = createPointerWindowController({
    nativeHitShape: NATIVE_HIT_SHAPE,
    hoverDetection: HOVER_DETECTION,
    raiseIntervalMs: RAISE_ON_POINTER_INTERVAL_MS,
    getWindow: () => state.systemWindow,
    getTaskbarVisible: () => state.taskbarVisible,
    getRendererReady: () => state.systemRendererReady,
    getRendererInteracting: () => state.systemRendererInteracting,
    isPointerInsideMouseTarget: isPointerInsideSystemMouseTarget
  });

  const mainStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => state.mainWindow,
    getCurrentMode: () => state.currentMode,
    getWindowHeight: () => state.currentWindowHeight,
    setWindowHeight: (height) => {
      state.currentWindowHeight = height;
    },
    getStageWidth: () => state.stageWidth,
    getPosition: getStagePosition,
    getHeightForMode: getWindowHeightForMode,
    updateHitShape: updateNativeHitShape,
    raiseForPointer: raiseWindowForPointer,
    resizeCurrentMode: resizeIsland
  });

  const systemStageBounds = createStageBoundsController({
    minHeight: MIN_ANIMATION_WINDOW_HEIGHT,
    maxHeight: STAGE_SIZE.height,
    getWindow: () => state.systemWindow,
    getCurrentMode: () => state.systemCurrentMode,
    getWindowHeight: () => state.systemWindowHeight,
    setWindowHeight: (height) => {
      state.systemWindowHeight = height;
    },
    getStageWidth: () => state.systemStageWidth,
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

  modeController = createWindowModeController({
    state,
    mainHoverController,
    systemHoverController,
    mainHitTarget,
    systemHitTarget,
    mainStageBounds,
    systemStageBounds,
    mainPointerController,
    systemPointerController,
    getSystemWindowHeightForMode,
    sendAvoidScale
  });

  const layoutTaskbarPolicy = createLayoutTaskbarPolicy({
    validLayouts: VALID_LAYOUTS,
    getLayout: () => state.layout,
    setLayoutValue: (value) => {
      state.layout = value;
    },
    getSystemMonitorEnabled: () => state.systemMonitorEnabled,
    setSystemMonitorEnabledValue: (value) => {
      state.systemMonitorEnabled = value;
    },
    getTaskbarVisible: () => state.taskbarVisible,
    setTaskbarVisibleValue: (value) => {
      state.taskbarVisible = value;
    },
    getMainWindow: () => state.mainWindow,
    getSystemWindow: () => state.systemWindow,
    isRendererReady: () => state.rendererReady,
    isSystemRendererReady: () => state.systemRendererReady,
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

  creationController = createWindowCreationController({
    state,
    logStartup,
    loadRendererEntry,
    getDevServerUrl,
    opaqueWindow: OPAQUE_WINDOW,
    preloadPath,
    getWindowHeightForMode,
    getSystemWindowHeightForMode,
    getStagePosition,
    getSystemStagePosition,
    updateNativeHitShape,
    updateSystemNativeHitShape,
    setMousePassthrough,
    setSystemMousePassthrough,
    resizeIsland,
    resizeSystemIsland,
    raiseWindowForPointer,
    raiseSystemWindowForPointer,
    requestIslandMode,
    requestSystemIslandMode,
    repositionStageWindow,
    repositionSystemStageWindow,
    systemWindowShouldShow,
    unparkSystemWindow,
    systemWindowVisibility
  });

  const snapshotDispatcher = createWindowSnapshotDispatcher({
    state,
    applyTaskbarVisibility,
    repositionAllStageWindows,
    requestIslandMode,
    sendAvoidScale
  });

  const rendererReadiness = createRendererReadinessController({
    state,
    logStartup,
    raiseWindowForPointer,
    raiseSystemWindowForPointer,
    resizeIsland,
    resizeSystemIsland,
    sendAvoidScale,
    startHoverDetection,
    startSystemHoverDetection,
    syncSystemMonitorRunning,
    systemWindowShouldShow,
    systemWindowVisibility
  });

  const frameInteraction = createFrameInteractionController({
    state,
    mainHoverController,
    updateMousePassthrough,
    updateSystemMousePassthrough
  });

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
    assertMainFrameSender: frameInteraction.assertMainFrameSender,
    assertSystemFrameSender: frameInteraction.assertSystemFrameSender,
    createSystemWindow,
    createWindow,
    dispose,
    getCurrentMode: () => state.currentMode,
    getMainWindow: () => state.mainWindow,
    getUiSettings,
    handleClipboardSnapshot: snapshotDispatcher.handleClipboardSnapshot,
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
  createIslandWindowManager
};
