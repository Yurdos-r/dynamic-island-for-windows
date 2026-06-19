import "../styles.css";
import {
  EMPTY_SYSTEM_SNAPSHOT,
  normalizeSystemSnapshot
} from "../system-view";
import { createAppStateRuntime, createRendererRuntimeState } from "./runtime-state";
import type { ClipboardItem, ClipboardSnapshot, LyricLine, PrivacySnapshot, SettingsPage, TrackState } from "./state";
import {
  getAvailableCardModesForState,
  isCapsuleMode as isCapsuleModeFromController,
  isCardMode as isCardModeFromController,
  isTransparentIdleMode as isTransparentIdleModeFromController,
  resolveRendererModeForMediaState
} from "./controllers/mode-controller";
import {
  clampProgressSecondsForTrack,
  formatMediaTime,
  getActiveLyricIndexForProgress,
  getDisplayedLyricsForState,
  getProgressPercent,
  getProgressSecondsFromPointerPosition
} from "./controllers/media-controller";
import {
  getPrivacyAppsForKind,
  getPrivacyDetailTextForKind,
  getPrivacyDisplayName as getPrivacyDisplayNameFromController,
  getPrivacyLabelForKind
} from "./controllers/privacy-controller";
import {
  formatClipboardTimestamp,
  normalizeClipboardSnapshot as normalizeClipboardSnapshotFromController
} from "./controllers/clipboard-controller";
import {
  isGlassIntensityValue,
  isGlassStyleValue,
  isLayoutValue,
  persistGlassIntensityValue,
  persistGlassStyleValue,
  readStoredGlassIntensityValue,
  readStoredGlassStyleValue
} from "./controllers/settings-controller";
import { registerIslandApiListeners, registerRendererEvents } from "./event-binder";
import { renderLyricsListView, prewarmExpandedLayerView, syncRendererView } from "./view-sync";
import { renderIslandTemplate } from "./views/template-view";
import {
  CAPSULE_APPEAR_TRANSITION_MS,
  DEFAULT_GLASS_INTENSITY,
  DEFAULT_GLASS_STYLE,
  GLASS_INTENSITY_DISPLACE_SCALE,
  GLASS_INTENSITY_STORAGE_KEY,
  GLASS_STYLE_STORAGE_KEY,
  MEDIA_ENTER_TRANSITION_MS,
  MEDIA_EXIT_TRANSITION_MS,
  PRIORITY_TRANSITION_MEDIA_TO_PRIVACY,
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_STAGE_SWITCH_MS,
  PRIVACY_PRIORITY_TRANSITION_MS,
  PRIVACY_TO_MEDIA_IDLE_DELAY_MS,
  SETTINGS_LONG_PRESS_MS
} from "./state";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root not found");
}

const app = appRoot;

const runtime = createRendererRuntimeState({
  glassStyle: readStoredGlassStyle(),
  glassIntensity: readStoredGlassIntensity(),
  systemSnapshot: { ...EMPTY_SYSTEM_SNAPSHOT },
  lastPlaybackSyncTime: window.performance.now()
});

const appState = createAppStateRuntime(runtime);

function isGlassStyle(value: unknown): value is GlassStyle {
  return isGlassStyleValue(value);
}

function readStoredGlassStyle(): GlassStyle {
  return readStoredGlassStyleValue(GLASS_STYLE_STORAGE_KEY, DEFAULT_GLASS_STYLE);
}

function persistGlassStyle(style: GlassStyle) {
  persistGlassStyleValue(GLASS_STYLE_STORAGE_KEY, style);
}

function setGlassStyle(style: GlassStyle) {
  if (!isGlassStyle(style) || style === runtime.glassStyle) {
    return;
  }

  runtime.glassStyle = style;
  persistGlassStyle(style);
  queueSync();
}

function isGlassIntensity(value: unknown): value is GlassIntensity {
  return isGlassIntensityValue(value);
}

function readStoredGlassIntensity(): GlassIntensity {
  return readStoredGlassIntensityValue(GLASS_INTENSITY_STORAGE_KEY, DEFAULT_GLASS_INTENSITY);
}

function persistGlassIntensity(intensity: GlassIntensity) {
  persistGlassIntensityValue(GLASS_INTENSITY_STORAGE_KEY, intensity);
}

function applyGlassIntensityToFilter() {
  const node = document.getElementById("liquid-glass-displace-node");
  if (node) {
    node.setAttribute("scale", String(GLASS_INTENSITY_DISPLACE_SCALE[runtime.glassIntensity]));
  }
}

function setGlassIntensity(intensity: GlassIntensity) {
  if (!isGlassIntensity(intensity) || intensity === runtime.glassIntensity) {
    return;
  }

  runtime.glassIntensity = intensity;
  persistGlassIntensity(intensity);
  applyGlassIntensityToFilter();
  queueSync();
}

function isLayout(value: unknown): value is IslandLayout {
  return isLayoutValue(value);
}

// 布局/开关变化后，如果当前正停在已失效的内嵌系统卡（切回经典或关闭监控），退回静息态。
function ensureSystemModeValid() {
  if (runtime.mode === "system" && !hasSystemCard()) {
    setMode("idle");
  }
}

// 切换布局：乐观更新本地镜像并立即重绘，再把权威值交给主进程持久化/重定位窗口。
// 主进程随后回推 onLayoutChanged，与此处保持一致。
function setLayout(nextLayout: IslandLayout) {
  if (!isLayout(nextLayout) || nextLayout === runtime.layout) {
    return;
  }

  runtime.layout = nextLayout;
  ensureSystemModeValid();
  queueSync();
  void window.island?.setLayout(nextLayout);
}

function setSystemMonitorEnabled(enabled: boolean) {
  if (enabled === runtime.systemMonitorEnabled) {
    return;
  }

  runtime.systemMonitorEnabled = enabled;
  ensureSystemModeValid();
  queueSync();
  void window.island?.setSystemMonitor(enabled);
}

// 主进程推送的最新 UI 设置（启动首帧 + 每次运行时切换）。只更新镜像并重绘，不回写主进程。
function applyUiSettings(settings: UiSettings | undefined) {
  if (settings && isLayout(settings.layout)) {
    runtime.layout = settings.layout;
  }
  if (settings && typeof settings.systemMonitorEnabled === "boolean") {
    runtime.systemMonitorEnabled = settings.systemMonitorEnabled;
  }
  ensureSystemModeValid();
  queueSync();
}

function setSettingsPage(page: "hub" | "appearance" | "layout" | "monitor") {
  if (runtime.settingsPage === page) {
    return;
  }

  runtime.settingsPage = page;
  queueSync();
}

function openSettings() {
  if (runtime.mode === "settings") {
    return;
  }

  // Only reachable from the resting capsule states; never hijack media /
  // privacy / clipboard foreground surfaces.
  if (runtime.mode !== "idle" && runtime.mode !== "peek") {
    return;
  }

  runtime.settingsReturnMode = "idle";
  runtime.settingsPage = "hub";
  runtime.suppressNextClick = true;
  setMode("settings");
}

function closeSettings() {
  if (runtime.mode !== "settings") {
    return;
  }

  runtime.settingsPage = "hub";
  setMode(runtime.settingsReturnMode || "idle");
}

// 从静息系统读数胶囊展开到系统监控卡片。
function openSystemCard() {
  if (runtime.mode === "system" || !hasSystemCard()) {
    return;
  }

  if (runtime.mode !== "idle" && runtime.mode !== "peek") {
    return;
  }

  runtime.suppressNextClick = true;
  setMode("system");
}

// 退出系统卡片：回到静息态（随后静息读数胶囊会再次常驻显示）。
function closeSystemCard() {
  if (runtime.mode !== "system") {
    return;
  }

  setMode("idle");
}

function clearSettingsLongPress() {
  if (runtime.settingsLongPressTimer !== undefined) {
    window.clearTimeout(runtime.settingsLongPressTimer);
    runtime.settingsLongPressTimer = undefined;
  }

  runtime.settingsLongPressPointerId = undefined;
}

function scheduleSettingsLongPress(pointerId: number) {
  clearSettingsLongPress();

  if (runtime.mode !== "idle" && runtime.mode !== "peek") {
    return;
  }

  runtime.settingsLongPressPointerId = pointerId;
  runtime.settingsLongPressTimer = window.setTimeout(() => {
    runtime.settingsLongPressTimer = undefined;
    runtime.settingsLongPressPointerId = undefined;
    openSettings();
  }, SETTINGS_LONG_PRESS_MS);
}

function resolveModeForMediaState(nextMode: IslandMode) {
  return resolveRendererModeForMediaState(nextMode, {
    privacyActive: runtime.privacyState.active,
    systemMediaActive: runtime.systemMediaActive
  });
}

function formatTime(totalSeconds: number) {
  return formatMediaTime(totalSeconds);
}

function progressPercent() {
  return getProgressPercent(runtime.progressSeconds, runtime.track.durationSeconds);
}

function clampProgressSeconds(seconds: number) {
  return clampProgressSecondsForTrack(seconds, runtime.track);
}

function getProgressSecondsFromPointer(event: PointerEvent, progressTrack: HTMLElement) {
  return getProgressSecondsFromPointerPosition(event, progressTrack, runtime.track);
}

function setProgressPreview(seconds: number) {
  runtime.progressSeconds = clampProgressSeconds(seconds);
  queueSync();
}

function getActiveLyricIndex() {
  return getActiveLyricIndexForProgress(runtime.lyrics, runtime.progressSeconds);
}

function getDisplayedLyrics() {
  return getDisplayedLyricsForState(runtime.lyrics, runtime.systemMediaActive);
}

function getPrivacyLabel(kind: PrivacySnapshot["kind"]) {
  return getPrivacyLabelForKind(kind);
}

function getPrivacyApps(kind: PrivacySnapshot["kind"]) {
  return getPrivacyAppsForKind(runtime.privacyState, kind);
}

function getPrivacyDisplayName(app: string) {
  return getPrivacyDisplayNameFromController(app);
}

function getPrivacyDetailText(kind: PrivacySnapshot["kind"]) {
  return getPrivacyDetailTextForKind(runtime.privacyState, kind);
}

function canUseClipboardCard() {
  return true;
}

function canShowClipboardPrompt() {
  return (
    runtime.mode === "idle" ||
    runtime.mode === "peek" ||
    runtime.mode === "hover" ||
    runtime.mode === "privacy" ||
    runtime.mode === "privacy-expanded" ||
    runtime.mode === "clipboard-prompt"
  );
}

function hasClipboardItems() {
  return runtime.clipboardSnapshot.items.length > 0;
}

function getPendingClipboardItem() {
  return runtime.clipboardSnapshot.pending;
}

function getClipboardPreviewText() {
  const pendingItem = getPendingClipboardItem();
  return pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
}

function clearClipboardPromptTimer() {
  if (runtime.clipboardPromptTimer !== undefined) {
    window.clearTimeout(runtime.clipboardPromptTimer);
    runtime.clipboardPromptTimer = undefined;
  }
}

function getClipboardPromptRestoreMode() {
  if (runtime.privacyState.active) {
    return "privacy";
  }

  if (runtime.systemMediaActive && !runtime.privacyState.active) {
    return "idle";
  }

  if (
    runtime.clipboardReturnMode === "clipboard-prompt" ||
    runtime.clipboardReturnMode === "clipboard" ||
    runtime.clipboardReturnMode === "expanded"
  ) {
    return "idle";
  }

  return runtime.clipboardReturnMode || "idle";
}

function getClipboardFallbackMode() {
  return runtime.privacyState.active ? "privacy" : "idle";
}

function hideClipboardPrompt(restoreMode = true) {
  clearClipboardPromptTimer();

  if (!runtime.clipboardPromptVisible && runtime.mode !== "clipboard-prompt") {
    return;
  }

  runtime.clipboardPromptVisible = false;

  if (restoreMode && runtime.mode === "clipboard-prompt") {
    const nextMode = getClipboardPromptRestoreMode();
    runtime.clipboardReturnMode = "idle";
    setMode(nextMode);
  } else {
    queueSync();
  }
}

function dismissClipboardPrompt(restoreMode = true) {
  const pendingId = getPendingClipboardItem()?.id || "";
  hideClipboardPrompt(restoreMode);
  void window.island?.dismissClipboardPending(pendingId);
}

function showClipboardPrompt() {
  if (!canShowClipboardPrompt() || !getPendingClipboardItem() || runtime.mode === "clipboard") {
    return;
  }

  clearClipboardPromptTimer();
  runtime.clipboardPromptVisible = true;
  runtime.clipboardReturnMode = runtime.mode === "clipboard-prompt" ? runtime.clipboardReturnMode : runtime.mode;
  setMode("clipboard-prompt");
  runtime.clipboardPromptTimer = window.setTimeout(() => {
    dismissClipboardPrompt(true);
  }, 3000);
  queueSync();
}

function openClipboardCard() {
  if (!canUseClipboardCard() || (!hasClipboardItems() && !getPendingClipboardItem())) {
    return;
  }

  hideClipboardPrompt(false);
  setMode("clipboard");
}

async function acceptClipboardPrompt(restoreAfterAccept = false) {
  const pendingItem = getPendingClipboardItem();
  const pendingId = pendingItem?.id || "";
  if (!pendingId) {
    dismissClipboardPrompt(true);
    return;
  }

  const restoreMode = getClipboardPromptRestoreMode();
  hideClipboardPrompt(false);

  if (runtime.mode !== "clipboard") {
    await window.island?.acceptClipboardPending(pendingId);
    runtime.clipboardReturnMode = "idle";
    setMode(restoreAfterAccept ? restoreMode : "clipboard");
    return;
  }

  if (runtime.clipboardAccepting || runtime.clipboardAcceptedItem) {
    return;
  }

  runtime.clipboardAccepting = true;
  runtime.clipboardAcceptPreview = pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
  runtime.clipboardAcceptedItem = pendingItem;
  queueSync();

  if (runtime.clipboardAcceptTimer !== undefined) {
    window.clearTimeout(runtime.clipboardAcceptTimer);
  }

  await window.island?.acceptClipboardPending(pendingId);
  runtime.clipboardReturnMode = "idle";

  if (restoreAfterAccept) {
    runtime.clipboardAccepting = false;
    runtime.clipboardAcceptPreview = "";
    runtime.clipboardAcceptedItem = undefined;
    setMode(restoreMode);
    return;
  }

  runtime.clipboardAcceptTimer = window.setTimeout(() => {
    runtime.clipboardAcceptTimer = undefined;
    runtime.clipboardAccepting = false;
    runtime.clipboardAcceptPreview = "";
    queueSync();
  }, 540);
}

function rejectClipboardPrompt() {
  const restoreMode = getClipboardPromptRestoreMode();
  dismissClipboardPrompt(false);
  runtime.clipboardReturnMode = "idle";
  setMode(restoreMode);
}

function normalizeClipboardSnapshot(snapshot: ClipboardSnapshot | undefined): ClipboardSnapshot {
  return normalizeClipboardSnapshotFromController(snapshot);
}

function formatClipboardTime(timestamp: number) {
  return formatClipboardTimestamp(timestamp);
}

function hasMusicCard() {
  return runtime.systemMediaActive || runtime.mediaEntering || runtime.mediaExiting;
}

function hasPrivacyIsland() {
  return runtime.privacyState.active;
}

function hasClipboardCard() {
  return canUseClipboardCard() && (hasClipboardItems() || Boolean(getPendingClipboardItem()));
}

// 系统监控卡片仅在顶部居中布局 + 监控开启时可用（经典布局走独立系统窗口）。
function hasSystemCard() {
  return runtime.layout === "top-center" && runtime.systemMonitorEnabled;
}

// 顶部居中 + 监控开启 + 当前没有任何前台内容（音乐/权限/剪贴板）时，静息胶囊常驻系统读数。
function isIdleSystemActive() {
  return hasSystemCard() && !hasMusicCard() && !hasPrivacyIsland() && !hasClipboardItems() && !getPendingClipboardItem();
}

function getAvailableCardModes(): IslandMode[] {
  return getAvailableCardModesForState({
    hasClipboardCard: hasClipboardCard(),
    hasMusicCard: hasMusicCard(),
    hasPrivacyIsland: hasPrivacyIsland(),
    hasSystemCard: hasSystemCard(),
    systemMediaActive: runtime.systemMediaActive
  });
}

function isCardMode(nextMode = runtime.mode) {
  return isCardModeFromController(nextMode);
}

function switchCardPage(direction: number) {
  if (!isCardMode() || runtime.clipboardDeleteDialogItemId || runtime.draggingProgress) {
    return false;
  }

  const now = window.performance.now();
  if (now < runtime.cardWheelLockedUntil) {
    return true;
  }

  const cardModes = getAvailableCardModes();
  if (cardModes.length < 2) {
    return false;
  }

  const currentIndex = Math.max(0, cardModes.indexOf(runtime.mode));
  const offset = direction > 0 ? 1 : -1;
  const nextIndex = (currentIndex + offset + cardModes.length) % cardModes.length;
  runtime.cardWheelLockedUntil = now + 420;
  setMode(cardModes[nextIndex]);
  return true;
}

function clearPriorityTransition() {
  if (runtime.priorityTransitionStageTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionStageTimer);
    runtime.priorityTransitionStageTimer = undefined;
  }

  if (runtime.priorityTransitionTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionTimer);
    runtime.priorityTransitionTimer = undefined;
  }

  if (runtime.priorityTransitionSettleTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionSettleTimer);
    runtime.priorityTransitionSettleTimer = undefined;
  }

  if (!runtime.priorityTransition) {
    return;
  }

  runtime.priorityTransition = "";
  runtime.priorityTransitionStage = "";
  queueSync();
}

function clearInactiveMediaState() {
  runtime.favorited = false;
  runtime.progressSeconds = 0;
  runtime.lyrics = [];
  runtime.lastLyricsDataKey = "";
  runtime.lastPlaybackSyncTime = window.performance.now();
}

function cancelMediaExitTransition() {
  if (runtime.mediaExitTimer !== undefined) {
    window.clearTimeout(runtime.mediaExitTimer);
    runtime.mediaExitTimer = undefined;
  }

  if (runtime.mediaExiting) {
    runtime.mediaExiting = false;
    queueSync();
  }
}

function cancelMediaEnterTransition() {
  if (runtime.mediaEnterTimer !== undefined) {
    window.clearTimeout(runtime.mediaEnterTimer);
    runtime.mediaEnterTimer = undefined;
  }

  if (runtime.mediaEntering) {
    runtime.mediaEntering = false;
    queueSync();
  }
}

function cancelCapsuleAppearTransition() {
  if (runtime.capsuleAppearTimer !== undefined) {
    window.clearTimeout(runtime.capsuleAppearTimer);
    runtime.capsuleAppearTimer = undefined;
  }

  if (runtime.capsuleAppearing) {
    runtime.capsuleAppearing = false;
    queueSync();
  }
}

function cancelCapsuleDisappearTransition() {
  if (runtime.capsuleDisappearTimer !== undefined) {
    window.clearTimeout(runtime.capsuleDisappearTimer);
    runtime.capsuleDisappearTimer = undefined;
  }

  if (runtime.capsuleDisappearing) {
    runtime.capsuleDisappearing = false;
    queueSync();
  }
}

function startCapsuleAppearTransition() {
  if (runtime.capsuleAppearing) {
    return;
  }

  runtime.capsuleAppearing = true;
  queueSync();
  runtime.capsuleAppearTimer = window.setTimeout(() => {
    runtime.capsuleAppearTimer = undefined;
    runtime.capsuleAppearing = false;
    queueSync();
  }, CAPSULE_APPEAR_TRANSITION_MS);
}

function startCapsuleDisappearTransition() {
  if (runtime.capsuleDisappearing) {
    return;
  }

  runtime.capsuleDisappearing = true;
  queueSync();
  runtime.capsuleDisappearTimer = window.setTimeout(() => {
    runtime.capsuleDisappearTimer = undefined;
    runtime.capsuleDisappearing = false;
    queueSync();
  }, MEDIA_EXIT_TRANSITION_MS);
}

function startMediaEnterTransition() {
  if (runtime.mediaEntering) {
    return;
  }

  runtime.mediaEntering = true;
  runtime.mediaEnterTimer = window.setTimeout(() => {
    runtime.mediaEnterTimer = undefined;
    runtime.mediaEntering = false;
    queueSync();
  }, MEDIA_ENTER_TRANSITION_MS);
}

function startMediaExitTransition() {
  if (runtime.mediaExiting) {
    return;
  }

  runtime.mediaExiting = true;
  runtime.mediaExitTimer = window.setTimeout(() => {
    runtime.mediaExitTimer = undefined;
    runtime.mediaExiting = false;
    clearInactiveMediaState();
    queueSync();
  }, MEDIA_EXIT_TRANSITION_MS);
}

function getPriorityTransitionStages(name: string) {
  if (name === PRIORITY_TRANSITION_PRIVACY_TO_MEDIA) {
    return ["privacy-out", "music-in"] as const;
  }

  return ["music-out", "privacy-in"] as const;
}

function getPriorityTransitionDurations(name: string) {
  if (name === PRIORITY_TRANSITION_PRIVACY_TO_MEDIA) {
    return {
      duration: 760,
      stageSwitch: 380,
      settleDelay: PRIVACY_TO_MEDIA_IDLE_DELAY_MS
    };
  }

  return {
    duration: PRIVACY_PRIORITY_TRANSITION_MS,
    stageSwitch: PRIVACY_PRIORITY_STAGE_SWITCH_MS,
    settleDelay: 0
  };
}

function startPriorityTransition(name: string, duration = PRIVACY_PRIORITY_TRANSITION_MS, onDone?: () => void) {
  const timing = getPriorityTransitionDurations(name);
  const transitionDuration = duration === PRIVACY_PRIORITY_TRANSITION_MS ? timing.duration : duration;
  const stageSwitchDuration = timing.stageSwitch;
  const settleDelay = timing.settleDelay;

  if (runtime.priorityTransitionStageTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionStageTimer);
    runtime.priorityTransitionStageTimer = undefined;
  }

  if (runtime.priorityTransitionTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionTimer);
    runtime.priorityTransitionTimer = undefined;
  }

  if (runtime.priorityTransitionSettleTimer !== undefined) {
    window.clearTimeout(runtime.priorityTransitionSettleTimer);
    runtime.priorityTransitionSettleTimer = undefined;
  }

  const [firstStage, secondStage] = getPriorityTransitionStages(name);
  runtime.priorityTransition = name;
  runtime.priorityTransitionStage = firstStage;
  runtime.priorityTransitionStageTimer = window.setTimeout(() => {
    runtime.priorityTransitionStageTimer = undefined;

    if (runtime.priorityTransition === name) {
      runtime.priorityTransitionStage = secondStage;
      queueSync();
    }
  }, Math.min(stageSwitchDuration, Math.max(0, transitionDuration - 40)));
  runtime.priorityTransitionTimer = window.setTimeout(() => {
    runtime.priorityTransitionTimer = undefined;

    if (runtime.priorityTransition === name) {
      const finishTransition = () => {
        if (runtime.priorityTransition !== name) {
          return;
        }

        runtime.priorityTransition = "";
        runtime.priorityTransitionStage = "";
        onDone?.();
        queueSync();
      };

      if (settleDelay > 0) {
        runtime.priorityTransitionSettleTimer = window.setTimeout(() => {
          runtime.priorityTransitionSettleTimer = undefined;
          finishTransition();
        }, settleDelay);
      } else {
        finishTransition();
      }
    }
  }, transitionDuration);

  queueSync();
}

async function setRendererInteracting(interacting: boolean) {
  try {
    await window.island?.setInteracting(interacting);
  } catch {
    // Best effort only.
  }
}

async function commitProgress(seconds: number) {
  const nextSeconds = clampProgressSeconds(seconds);
  setProgressPreview(nextSeconds);

  if (runtime.systemMediaActive && runtime.mediaControllable) {
    const result = await window.island?.seekMedia(nextSeconds);
    return result;
  }

  return undefined;
}

function renderTemplate() {
  renderIslandTemplate({
    app,
    track: runtime.track,
    progressSeconds: runtime.progressSeconds,
    progressPercent,
    formatTime,
    resetLyricsDataKey: () => {
      runtime.lastLyricsDataKey = "";
    },
    renderLyricsList
  });
}

function queueSync() {
  if (runtime.frameQueued) {
    return;
  }

  runtime.frameQueued = true;
  window.requestAnimationFrame(() => {
    runtime.frameQueued = false;
    syncUi();
  });
}

function createViewSyncContext() {
  return {
    app,
    get track() { return runtime.track; },
    set track(value: TrackState) { runtime.track = value; },
    get progressSeconds() { return runtime.progressSeconds; },
    set progressSeconds(value: number) { runtime.progressSeconds = value; },
    get lyrics() { return runtime.lyrics; },
    set lyrics(value: LyricLine[]) { runtime.lyrics = value; },
    get systemMediaActive() { return runtime.systemMediaActive; },
    set systemMediaActive(value: boolean) { runtime.systemMediaActive = value; },
    get lastLyricsDataKey() { return runtime.lastLyricsDataKey; },
    set lastLyricsDataKey(value: string) { runtime.lastLyricsDataKey = value; },
    get lyricsCenterFrame() { return runtime.lyricsCenterFrame; },
    set lyricsCenterFrame(value: number) { runtime.lyricsCenterFrame = value; },
    get mode() { return runtime.mode; },
    set mode(value: IslandMode) { runtime.mode = value; },
    get glassStyle() { return runtime.glassStyle; },
    set glassStyle(value: GlassStyle) { runtime.glassStyle = value; },
    get glassIntensity() { return runtime.glassIntensity; },
    set glassIntensity(value: GlassIntensity) { runtime.glassIntensity = value; },
    get playing() { return runtime.playing; },
    set playing(value: boolean) { runtime.playing = value; },
    get favorited() { return runtime.favorited; },
    set favorited(value: boolean) { runtime.favorited = value; },
    get draggingProgress() { return runtime.draggingProgress; },
    set draggingProgress(value: boolean) { runtime.draggingProgress = value; },
    get mediaEntering() { return runtime.mediaEntering; },
    set mediaEntering(value: boolean) { runtime.mediaEntering = value; },
    get mediaExiting() { return runtime.mediaExiting; },
    set mediaExiting(value: boolean) { runtime.mediaExiting = value; },
    get capsuleAppearing() { return runtime.capsuleAppearing; },
    set capsuleAppearing(value: boolean) { runtime.capsuleAppearing = value; },
    get capsuleDisappearing() { return runtime.capsuleDisappearing; },
    set capsuleDisappearing(value: boolean) { runtime.capsuleDisappearing = value; },
    get privacyState() { return runtime.privacyState; },
    set privacyState(value: PrivacySnapshot) { runtime.privacyState = value; },
    get priorityTransition() { return runtime.priorityTransition; },
    set priorityTransition(value: string) { runtime.priorityTransition = value; },
    get priorityTransitionStage() { return runtime.priorityTransitionStage; },
    set priorityTransitionStage(value: string) { runtime.priorityTransitionStage = value; },
    get clipboardPromptVisible() { return runtime.clipboardPromptVisible; },
    set clipboardPromptVisible(value: boolean) { runtime.clipboardPromptVisible = value; },
    get settingsPage() { return runtime.settingsPage; },
    set settingsPage(value: SettingsPage) { runtime.settingsPage = value; },
    get layout() { return runtime.layout; },
    set layout(value: IslandLayout) { runtime.layout = value; },
    get systemMonitorEnabled() { return runtime.systemMonitorEnabled; },
    set systemMonitorEnabled(value: boolean) { runtime.systemMonitorEnabled = value; },
    get systemSnapshot() { return runtime.systemSnapshot; },
    set systemSnapshot(value: SystemSnapshot) { runtime.systemSnapshot = value; },
    get privacyExpanded() { return runtime.privacyExpanded; },
    set privacyExpanded(value: boolean) { runtime.privacyExpanded = value; },
    get clipboardSnapshot() { return runtime.clipboardSnapshot; },
    set clipboardSnapshot(value: ClipboardSnapshot) { runtime.clipboardSnapshot = value; },
    get clipboardAccepting() { return runtime.clipboardAccepting; },
    set clipboardAccepting(value: boolean) { runtime.clipboardAccepting = value; },
    get clipboardAcceptPreview() { return runtime.clipboardAcceptPreview; },
    set clipboardAcceptPreview(value: string) { runtime.clipboardAcceptPreview = value; },
    get clipboardListRenderKey() { return runtime.clipboardListRenderKey; },
    set clipboardListRenderKey(value: string) { runtime.clipboardListRenderKey = value; },
    get clipboardDeleteDialogItemId() { return runtime.clipboardDeleteDialogItemId; },
    set clipboardDeleteDialogItemId(value: string) { runtime.clipboardDeleteDialogItemId = value; },
    get expandedLayerPrewarmed() { return runtime.expandedLayerPrewarmed; },
    set expandedLayerPrewarmed(value: boolean) { runtime.expandedLayerPrewarmed = value; },
    getDisplayedLyrics,
    getActiveLyricIndex,
    getAvailableCardModes,
    hasClipboardItems,
    isIdleSystemActive,
    formatTime,
    progressPercent,
    getClipboardPreviewText,
    getPendingClipboardItem,
    getAcceptedClipboardItem,
    formatClipboardTime,
    getClipboardItemById,
    isCardMode,
    getPrivacyLabel,
    getPrivacyDetailText
  };
}

function renderLyricsList() {
  renderLyricsListView(createViewSyncContext());
}

function syncUi() {
  syncRendererView(createViewSyncContext());
}

function prewarmExpandedLayer() {
  prewarmExpandedLayerView(createViewSyncContext());
}

function isTransparentIdleMode(nextMode: IslandMode) {
  return isTransparentIdleModeFromController(nextMode);
}

function isCapsuleMode(nextMode: IslandMode) {
  return isCapsuleModeFromController(nextMode);
}

function commitModeChange(previousMode: IslandMode, resolvedMode: IslandMode, resizeAfterCommit: boolean) {
  const shouldAnimateCapsuleAppear = isTransparentIdleMode(previousMode) && isCapsuleMode(resolvedMode) && resolvedMode !== "idle";
  const shouldAnimateCapsuleDisappear =
    (previousMode === "privacy" || previousMode === "clipboard-prompt") && isTransparentIdleMode(resolvedMode);

  app.dataset.previousMode = previousMode;
  runtime.mode = resolvedMode;

  if (runtime.clipboardTransitionTimer !== undefined) {
    window.clearTimeout(runtime.clipboardTransitionTimer);
    runtime.clipboardTransitionTimer = undefined;
  }

  if (shouldAnimateCapsuleAppear) {
    cancelCapsuleDisappearTransition();
    startCapsuleAppearTransition();
  } else if (shouldAnimateCapsuleDisappear) {
    cancelCapsuleAppearTransition();
    startCapsuleDisappearTransition();
  } else if (resolvedMode === "expanded" || resolvedMode === "clipboard" || resolvedMode === "idle") {
    cancelCapsuleAppearTransition();
    cancelCapsuleDisappearTransition();
  }

  if (runtime.expandedTransitionTimer !== undefined) {
    window.clearTimeout(runtime.expandedTransitionTimer);
    runtime.expandedTransitionTimer = undefined;
  }

  if (resolvedMode === "expanded" && previousMode !== "expanded") {
    app.dataset.enteringExpanded = "true";
    runtime.expandedTransitionTimer = window.setTimeout(() => {
      runtime.expandedTransitionTimer = undefined;
      if (app.dataset.enteringExpanded === "true") {
        app.dataset.enteringExpanded = "false";
      }
    }, 580);
  } else {
    app.dataset.enteringExpanded = "false";
  }

  if (previousMode === "expanded" && resolvedMode !== "expanded") {
    app.dataset.returningFromExpanded = "true";
    window.setTimeout(() => {
      if (app.dataset.returningFromExpanded === "true") {
        app.dataset.returningFromExpanded = "false";
      }
    }, 700);
  } else {
    app.dataset.returningFromExpanded = "false";
  }

  if (resolvedMode === "clipboard") {
    app.dataset.enteringClipboard = "true";
    app.dataset.returningFromClipboard = "false";
    runtime.clipboardTransitionTimer = window.setTimeout(() => {
      runtime.clipboardTransitionTimer = undefined;
      if (app.dataset.enteringClipboard === "true") {
        app.dataset.enteringClipboard = "false";
      }
    }, 520);
  } else if (previousMode === "clipboard") {
    clearAcceptedClipboardSurface();
    app.dataset.enteringClipboard = "false";
    app.dataset.returningFromClipboard = "true";
    runtime.clipboardTransitionTimer = window.setTimeout(() => {
      runtime.clipboardTransitionTimer = undefined;
      if (app.dataset.returningFromClipboard === "true") {
        app.dataset.returningFromClipboard = "false";
      }
    }, 680);
  } else {
    app.dataset.enteringClipboard = "false";
    app.dataset.returningFromClipboard = "false";
  }

  if (resizeAfterCommit) {
    void window.island?.resize(resolvedMode);
  }

  if (resolvedMode === "expanded" && previousMode !== "expanded") {
    runtime.frameQueued = false;
    syncUi();
    return;
  }

  queueSync();
}

function setMode(nextMode: IslandMode, resizeWindow = true) {
  const resolvedMode = resolveModeForMediaState(nextMode);
  const shouldResizeWindow = resizeWindow || resolvedMode !== nextMode;

  if (runtime.mode === resolvedMode) {
    if (shouldResizeWindow) {
      void window.island?.resize(resolvedMode);
    }

    return;
  }

  const previousMode = runtime.mode;
  runtime.modeCommitToken += 1;
  commitModeChange(previousMode, resolvedMode, shouldResizeWindow);
}

function togglePrivacyDetail() {
  if (!runtime.privacyState.active) {
    return;
  }

  runtime.privacyExpanded = !runtime.privacyExpanded;
  setMode(runtime.privacyExpanded ? "privacy-expanded" : "privacy");
  queueSync();
}

function collapsePrivacyDetail() {
  if (!runtime.privacyExpanded) {
    return;
  }

  runtime.privacyExpanded = false;
  setMode("privacy");
  queueSync();
}

function togglePlay() {
  if (!runtime.systemMediaActive || !runtime.mediaControllable) {
    return;
  }

  runtime.playing = !runtime.playing;
  queueSync();
  void window.island?.controlMedia("toggle-play");
}

function skipTrack(action: "previous-track" | "next-track") {
  if (!runtime.systemMediaActive || !runtime.mediaControllable) {
    return;
  }

  runtime.playing = true;
  runtime.progressSeconds = 0;
  queueSync();
  void window.island?.controlMedia(action);
}

async function toggleFavorite() {
  if (!runtime.systemMediaActive || !runtime.mediaControllable) {
    return;
  }

  const previousFavorited = runtime.favorited;
  runtime.favorited = !runtime.favorited;
  queueSync();

  const result = await window.island?.controlMedia("favorite-track");
  if (typeof result?.favorited === "boolean") {
    runtime.favorited = result.favorited;
    queueSync();
    return;
  }

  if (result?.ok === false) {
    runtime.favorited = previousFavorited;
    queueSync();
  }
}

function setProgress(seconds: number, syncSystem = false) {
  setProgressPreview(seconds);

  if (syncSystem && runtime.systemMediaActive && runtime.mediaControllable) {
    void window.island?.seekMedia(runtime.progressSeconds);
  }
}

function setProgressFromPointer(event: PointerEvent, progressTrack: HTMLElement) {
  setProgressPreview(getProgressSecondsFromPointer(event, progressTrack));
}

async function copyClipboardText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  await window.island?.writeClipboardText(trimmed);
}

function clearClipboardDeleteTimer() {
  if (runtime.clipboardDeleteTimer !== undefined) {
    window.clearTimeout(runtime.clipboardDeleteTimer);
    runtime.clipboardDeleteTimer = undefined;
  }

  runtime.clipboardDeletePointerId = undefined;
  runtime.clipboardDeleteItemId = "";
}

function getClipboardItemById(itemId: string) {
  return runtime.clipboardSnapshot.items.find((item) => item.id === itemId);
}

function getAcceptedClipboardItem() {
  if (!runtime.clipboardAcceptedItem) {
    return undefined;
  }

  return (
    runtime.clipboardSnapshot.items.find((item) => item.id === runtime.clipboardAcceptedItem?.id) ||
    runtime.clipboardSnapshot.items.find((item) => item.text === runtime.clipboardAcceptedItem?.text) ||
    runtime.clipboardAcceptedItem
  );
}

function clearAcceptedClipboardSurface() {
  if (runtime.clipboardAcceptTimer !== undefined) {
    window.clearTimeout(runtime.clipboardAcceptTimer);
    runtime.clipboardAcceptTimer = undefined;
  }

  runtime.clipboardAccepting = false;
  runtime.clipboardAcceptPreview = "";
  runtime.clipboardAcceptedItem = undefined;
}

function openClipboardDeleteDialog(itemId: string) {
  if (!getClipboardItemById(itemId)) {
    return;
  }

  runtime.clipboardDeleteDialogItemId = itemId;
  queueSync();
}

function closeClipboardDeleteDialog() {
  if (!runtime.clipboardDeleteDialogItemId) {
    return;
  }

  runtime.clipboardDeleteDialogItemId = "";
  queueSync();
}

function confirmClipboardDelete() {
  const deleteId = runtime.clipboardDeleteDialogItemId;
  runtime.clipboardDeleteDialogItemId = "";

  if (deleteId) {
    const acceptedItem = getAcceptedClipboardItem();
    if (acceptedItem?.id === deleteId) {
      clearAcceptedClipboardSurface();
    }
    void window.island?.removeClipboardItem(deleteId);
  }

  queueSync();
}

function scheduleClipboardItemDelete(itemId: string, pointerId: number) {
  clearClipboardDeleteTimer();

  if (!itemId) {
    return;
  }

  runtime.clipboardDeleteItemId = itemId;
  runtime.clipboardDeletePointerId = pointerId;
  runtime.clipboardDeleteTimer = window.setTimeout(() => {
    const deleteId = runtime.clipboardDeleteItemId;
    clearClipboardDeleteTimer();
    if (deleteId) {
      openClipboardDeleteDialog(deleteId);
    }
  }, 650);
}

function createRendererEventContext() {
  return {
    app,
    island: window.island,
    get suppressNextClick() {
      return runtime.suppressNextClick;
    },
    set suppressNextClick(value: boolean) {
      runtime.suppressNextClick = value;
    },
    get mode() {
      return appState.mode;
    },
    set mode(value: IslandMode) {
      appState.mode = value;
    },
    get settingsPage() {
      return appState.settingsPage;
    },
    set settingsPage(value: SettingsPage) {
      appState.settingsPage = value;
    },
    get systemMonitorEnabled() {
      return runtime.systemMonitorEnabled;
    },
    set systemMonitorEnabled(value: boolean) {
      runtime.systemMonitorEnabled = value;
    },
    get privacyState() {
      return appState.privacyState;
    },
    set privacyState(value: PrivacySnapshot) {
      appState.privacyState = value;
    },
    get systemMediaActive() {
      return runtime.systemMediaActive;
    },
    set systemMediaActive(value: boolean) {
      runtime.systemMediaActive = value;
    },
    get clipboardSnapshot() {
      return appState.clipboardSnapshot;
    },
    set clipboardSnapshot(value: ClipboardSnapshot) {
      appState.clipboardSnapshot = value;
    },
    get clipboardAcceptedItem() {
      return runtime.clipboardAcceptedItem;
    },
    set clipboardAcceptedItem(value: ClipboardItem | undefined) {
      runtime.clipboardAcceptedItem = value;
    },
    get clipboardDeletePointerId() {
      return runtime.clipboardDeletePointerId;
    },
    set clipboardDeletePointerId(value: number | undefined) {
      runtime.clipboardDeletePointerId = value;
    },
    get settingsLongPressPointerId() {
      return runtime.settingsLongPressPointerId;
    },
    set settingsLongPressPointerId(value: number | undefined) {
      runtime.settingsLongPressPointerId = value;
    },
    get draggingProgress() {
      return runtime.draggingProgress;
    },
    set draggingProgress(value: boolean) {
      runtime.draggingProgress = value;
    },
    get pendingSeekSeconds() {
      return runtime.pendingSeekSeconds;
    },
    set pendingSeekSeconds(value: number | undefined) {
      runtime.pendingSeekSeconds = value;
    },
    get progressSeconds() {
      return appState.progressSeconds;
    },
    set progressSeconds(value: number) {
      appState.progressSeconds = value;
    },
    get track() {
      return appState.track;
    },
    set track(value: TrackState) {
      appState.track = value;
    },
    get playing() {
      return runtime.playing;
    },
    set playing(value: boolean) {
      runtime.playing = value;
    },
    get lastPlaybackSyncTime() {
      return runtime.lastPlaybackSyncTime;
    },
    set lastPlaybackSyncTime(value: number) {
      runtime.lastPlaybackSyncTime = value;
    },
    setSettingsPage,
    isGlassStyle,
    setGlassStyle,
    isGlassIntensity,
    setGlassIntensity,
    isLayout,
    setLayout,
    setSystemMonitorEnabled,
    closeSettings,
    closeSystemCard,
    togglePrivacyDetail,
    openClipboardCard,
    acceptClipboardPrompt,
    rejectClipboardPrompt,
    canUseClipboardCard,
    getPendingClipboardItem,
    clearAcceptedClipboardSurface,
    setMode,
    getClipboardFallbackMode,
    closeClipboardDeleteDialog,
    confirmClipboardDelete,
    getAcceptedClipboardItem,
    copyClipboardText,
    hasClipboardItems,
    isIdleSystemActive,
    openSystemCard,
    togglePlay,
    skipTrack,
    toggleFavorite,
    isCardMode,
    getAvailableCardModes,
    switchCardPage,
    collapsePrivacyDetail,
    scheduleSettingsLongPress,
    scheduleClipboardItemDelete,
    getProgressSecondsFromPointer,
    setRendererInteracting,
    setProgressPreview,
    queueSync,
    clearClipboardDeleteTimer,
    clearSettingsLongPress,
    commitProgress,
    setProgress
  };
}

registerRendererEvents(createRendererEventContext());

function handleModeRequest(requestedMode: IslandMode) {
  setMode(requestedMode, false);

}

function handleMediaUpdate(snapshot: MediaSnapshot) {
  if (!snapshot.active) {
    const hadVisibleMedia = runtime.systemMediaActive || runtime.mediaExiting;

    runtime.systemMediaActive = false;
    runtime.mediaControllable = false;
    runtime.playing = false;
    cancelMediaEnterTransition();

    if (runtime.privacyState.active && runtime.mode === "expanded") {
      setMode("privacy");
    } else if (!runtime.privacyState.active && (runtime.mode === "hover" || runtime.mode === "expanded")) {
      setMode(runtime.mode === "expanded" && hasClipboardCard() ? "clipboard" : "idle");
    }

    if (hadVisibleMedia && !runtime.privacyState.active) {
      startMediaExitTransition();
      runtime.lastPlaybackSyncTime = window.performance.now();
    } else {
      cancelMediaExitTransition();
      clearInactiveMediaState();
    }

    queueSync();
    return;
  }

  const shouldEnterMedia = !runtime.privacyState.active && (!runtime.systemMediaActive || runtime.mediaExiting);
  cancelMediaExitTransition();
  runtime.systemMediaActive = true;
  runtime.mediaControllable = snapshot.controllable !== false;
  runtime.track = {
    title: snapshot.title || "Unknown Title",
    artist: snapshot.artist || snapshot.sourceApp || "Unknown Artist",
    cover: snapshot.cover,
    durationSeconds: Math.max(1, snapshot.durationSeconds || runtime.track.durationSeconds)
  };
  runtime.playing = snapshot.playing;
  if (typeof snapshot.favorited === "boolean") {
    runtime.favorited = snapshot.favorited;
  }
  runtime.lyrics = Array.isArray(snapshot.lyrics) ? snapshot.lyrics : [];

  if (!runtime.draggingProgress) {
    runtime.progressSeconds = clampProgressSeconds(snapshot.positionSeconds || 0);
  }

  runtime.lastPlaybackSyncTime = window.performance.now();
  if (shouldEnterMedia) {
    startMediaEnterTransition();
  }
  queueSync();

}

function handlePrivacyUpdate(snapshot: PrivacySnapshot) {
  const previousPrivacyActive = runtime.wasPrivacyActive;
  const previousMode = runtime.mode;
  const nextPrivacyState: PrivacySnapshot = {
    available: Boolean(snapshot?.available),
    active: Boolean(snapshot?.active),
    kind: snapshot?.kind || "none",
    activeKinds: Array.isArray(snapshot?.activeKinds) ? snapshot.activeKinds : [],
    apps: Array.isArray(snapshot?.apps) ? snapshot.apps : [],
    updatedAt: Number(snapshot?.updatedAt || 0)
  };
  const shouldHandOffFromMedia =
    !previousPrivacyActive &&
    nextPrivacyState.active &&
    runtime.systemMediaActive &&
    (previousMode === "idle" || previousMode === "peek" || previousMode === "hover");
  const shouldHandBackToMedia =
    previousPrivacyActive &&
    !nextPrivacyState.active &&
    runtime.systemMediaActive &&
    (runtime.mode === "privacy" || runtime.mode === "privacy-expanded");

  if (shouldHandBackToMedia) {
    runtime.pendingPrivacySnapshot = nextPrivacyState;
    runtime.privacyExpanded = false;
    const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
    startPriorityTransition(PRIORITY_TRANSITION_PRIVACY_TO_MEDIA, PRIVACY_PRIORITY_TRANSITION_MS, () => {
      if (runtime.pendingPrivacySnapshot) {
        runtime.privacyState = runtime.pendingPrivacySnapshot;
        runtime.pendingPrivacySnapshot = undefined;
      }

      runtime.wasPrivacyActive = runtime.privacyState.active;
      runtime.privacyReturnMode = "idle";
      setMode(restoreMode || "idle");
    });
    setMode("privacy");
    queueSync();
    return;
  }

  runtime.pendingPrivacySnapshot = undefined;
  runtime.privacyState = nextPrivacyState;
  runtime.wasPrivacyActive = runtime.privacyState.active;

  if (runtime.privacyState.active) {
    const userSelectedForeground =
      runtime.mode === "clipboard" ||
      runtime.mode === "clipboard-prompt" ||
      (previousPrivacyActive && runtime.mode === "expanded");

    if (!previousPrivacyActive && runtime.mode !== "privacy" && runtime.mode !== "privacy-expanded" && runtime.mode !== "peek") {
      runtime.privacyReturnMode = runtime.mode;
    }

    if (shouldHandOffFromMedia) {
      startPriorityTransition(PRIORITY_TRANSITION_MEDIA_TO_PRIVACY);
    } else if (!previousPrivacyActive) {
      clearPriorityTransition();
    }

    if (!userSelectedForeground) {
      setMode(runtime.privacyExpanded ? "privacy-expanded" : "privacy");
    }
  } else {
    runtime.privacyExpanded = false;
    clearPriorityTransition();
    if (runtime.mode === "privacy" || runtime.mode === "privacy-expanded" || runtime.mode === "peek") {
      const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
      runtime.privacyReturnMode = "idle";
      setMode(restoreMode);
    }
  }

  queueSync();

}

function handleClipboardUpdate(snapshot: ClipboardSnapshot) {
  const previousPendingId = runtime.clipboardSnapshot.pending?.id || "";
  const nextClipboardSnapshot = normalizeClipboardSnapshot(snapshot);
  const nextPendingId = nextClipboardSnapshot.pending?.id || "";

  runtime.clipboardSnapshot = nextClipboardSnapshot;

  if (runtime.mode === "clipboard" && !hasClipboardItems() && !getPendingClipboardItem() && !runtime.clipboardAccepting && !runtime.clipboardAcceptedItem) {
    setMode(getClipboardFallbackMode());
    return;
  }

  if (runtime.mode === "clipboard") {
    queueSync();
    return;
  }

  if (nextPendingId && nextPendingId !== previousPendingId && canShowClipboardPrompt()) {
    showClipboardPrompt();
  } else {
    queueSync();
  }

}

function handleSystemUpdate(snapshot: SystemSnapshot) {
  runtime.systemSnapshot = normalizeSystemSnapshot(snapshot);
  queueSync();

}

function handlePlaybackTick() {
  const now = window.performance.now();

  if (runtime.systemMediaActive && runtime.playing && !runtime.draggingProgress) {
    const elapsedSeconds = Math.max(0, Math.min((now - runtime.lastPlaybackSyncTime) / 1000, 1));
    setProgress(runtime.progressSeconds + elapsedSeconds);
  }

  runtime.lastPlaybackSyncTime = now;

}

renderTemplate();
applyGlassIntensityToFilter();
syncUi();
prewarmExpandedLayer();

registerIslandApiListeners({
  app,
  island: window.island,
  onModeRequest: handleModeRequest,
  onMediaUpdate: handleMediaUpdate,
  onPrivacyUpdate: handlePrivacyUpdate,
  onClipboardUpdate: handleClipboardUpdate,
  onSystemUpdate: handleSystemUpdate,
  onLayoutChanged: applyUiSettings,
  onPlaybackTick: handlePlaybackTick
});
