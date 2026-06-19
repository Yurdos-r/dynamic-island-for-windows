import { createIcons } from "lucide";
import "../styles.css";
import {
  EMPTY_SYSTEM_SNAPSHOT,
  buildSystemCapsule,
  buildSystemCard,
  normalizeSystemSnapshot,
  renderSystemIcons
} from "../system-view";
import { createElement, createIcon } from "./dom";
import { lucideIcons } from "./icons";
import type { AppState, ClipboardItem, ClipboardSnapshot, LyricLine, PrivacySnapshot, SettingsPage, TrackState } from "./state";
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
import { appendMediaControls } from "./views/media-view";
import { buildSettingsLayer } from "./views/settings-view";
import {
  CAPSULE_APPEAR_TRANSITION_MS,
  DEFAULT_GLASS_INTENSITY,
  DEFAULT_GLASS_STYLE,
  GLASS_INTENSITY_DISPLACE_SCALE,
  GLASS_INTENSITY_STORAGE_KEY,
  GLASS_STYLE_STORAGE_KEY,
  ISLAND_STATE_NAMES,
  MEDIA_ENTER_TRANSITION_MS,
  MEDIA_EXIT_TRANSITION_MS,
  PRIORITY_TRANSITION_MEDIA_TO_PRIVACY,
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_STAGE_SWITCH_MS,
  PRIVACY_PRIORITY_TRANSITION_MS,
  PRIVACY_TO_MEDIA_IDLE_DELAY_MS,
  SETTINGS_LONG_PRESS_MS,
  createDefaultTrack,
  createEmptyClipboardSnapshot,
  createEmptyPrivacySnapshot
} from "./state";

let track: TrackState = createDefaultTrack();

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root not found");
}

const app = appRoot;
let mode: IslandMode = "idle";
let glassStyle: GlassStyle = readStoredGlassStyle();
let glassIntensity: GlassIntensity = readStoredGlassIntensity();
let settingsReturnMode: IslandMode = "idle";
let settingsLongPressTimer: number | undefined;
// 设置中心当前子页：hub=导航首页，其余三项为二级页。仅在 mode==="settings" 时有意义。
let settingsPage: SettingsPage = "hub";
// 胶囊布局 + 系统监控全局开关。权威值在主进程，启动时经 getUiSettings 拉取、
// 经 onLayoutChanged 同步。renderer 这份是镜像，用于决定内嵌系统卡/静息读数显隐。
let layout: IslandLayout = "classic";
let systemMonitorEnabled = true;
let systemSnapshot = { ...EMPTY_SYSTEM_SNAPSHOT };
let settingsLongPressPointerId: number | undefined;
let suppressNextClick = false;
let modeCommitToken = 0;
let playing = false;
let frameQueued = false;
let favorited = false;
let draggingProgress = false;
let pendingSeekSeconds: number | undefined;
let systemMediaActive = false;
let mediaControllable = false;
let mediaEntering = false;
let mediaExiting = false;
let mediaEnterTimer: number | undefined;
let mediaExitTimer: number | undefined;
let capsuleAppearing = false;
let capsuleDisappearing = false;
let capsuleAppearTimer: number | undefined;
let capsuleDisappearTimer: number | undefined;
let progressSeconds = 72;
let lyrics: LyricLine[] = [];
let lastLyricsDataKey = "";
let lyricsCenterFrame = 0;
let expandedLayerPrewarmed = false;
let expandedTransitionTimer: number | undefined;
let lastPlaybackSyncTime = window.performance.now();
let privacyExpanded = false;
let wasPrivacyActive = false;
let privacyReturnMode: IslandMode = "idle";
let clipboardSnapshot: ClipboardSnapshot = createEmptyClipboardSnapshot();
let clipboardPromptVisible = false;
let clipboardPromptTimer: number | undefined;
let clipboardReturnMode: IslandMode = "idle";
let clipboardTransitionTimer: number | undefined;
let clipboardAccepting = false;
let clipboardAcceptPreview = "";
let clipboardAcceptedItem: ClipboardItem | undefined;
let clipboardAcceptTimer: number | undefined;
let clipboardListRenderKey = "";
let clipboardDeleteTimer: number | undefined;
let clipboardDeletePointerId: number | undefined;
let clipboardDeleteItemId = "";
let clipboardDeleteDialogItemId = "";
let cardWheelLockedUntil = 0;
let priorityTransition = "";
let priorityTransitionStage = "";
let priorityTransitionTimer: number | undefined;
let priorityTransitionStageTimer: number | undefined;
let priorityTransitionSettleTimer: number | undefined;
let pendingPrivacySnapshot: PrivacySnapshot | undefined;
let privacyState: PrivacySnapshot = createEmptyPrivacySnapshot();

function createAppStateRuntime(): AppState {
  return {
    get mode() {
      return mode;
    },
    set mode(value: IslandMode) {
      mode = value;
    },
    get glassStyle() {
      return glassStyle;
    },
    set glassStyle(value: GlassStyle) {
      glassStyle = value;
    },
    get glassIntensity() {
      return glassIntensity;
    },
    set glassIntensity(value: GlassIntensity) {
      glassIntensity = value;
    },
    get settingsReturnMode() {
      return settingsReturnMode;
    },
    set settingsReturnMode(value: IslandMode) {
      settingsReturnMode = value;
    },
    get settingsPage() {
      return settingsPage;
    },
    set settingsPage(value: SettingsPage) {
      settingsPage = value;
    },
    get layout() {
      return layout;
    },
    set layout(value: IslandLayout) {
      layout = value;
    },
    get systemMonitorEnabled() {
      return systemMonitorEnabled;
    },
    set systemMonitorEnabled(value: boolean) {
      systemMonitorEnabled = value;
    },
    get track() {
      return track;
    },
    set track(value: TrackState) {
      track = value;
    },
    get progressSeconds() {
      return progressSeconds;
    },
    set progressSeconds(value: number) {
      progressSeconds = value;
    },
    get lyrics() {
      return lyrics;
    },
    set lyrics(value: LyricLine[]) {
      lyrics = value;
    },
    get privacyState() {
      return privacyState;
    },
    set privacyState(value: PrivacySnapshot) {
      privacyState = value;
    },
    get clipboardSnapshot() {
      return clipboardSnapshot;
    },
    set clipboardSnapshot(value: ClipboardSnapshot) {
      clipboardSnapshot = value;
    }
  };
}

const appState = createAppStateRuntime();

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
  if (!isGlassStyle(style) || style === glassStyle) {
    return;
  }

  glassStyle = style;
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
    node.setAttribute("scale", String(GLASS_INTENSITY_DISPLACE_SCALE[glassIntensity]));
  }
}

function setGlassIntensity(intensity: GlassIntensity) {
  if (!isGlassIntensity(intensity) || intensity === glassIntensity) {
    return;
  }

  glassIntensity = intensity;
  persistGlassIntensity(intensity);
  applyGlassIntensityToFilter();
  queueSync();
}

function isLayout(value: unknown): value is IslandLayout {
  return isLayoutValue(value);
}

// 布局/开关变化后，如果当前正停在已失效的内嵌系统卡（切回经典或关闭监控），退回静息态。
function ensureSystemModeValid() {
  if (mode === "system" && !hasSystemCard()) {
    setMode("idle");
  }
}

// 切换布局：乐观更新本地镜像并立即重绘，再把权威值交给主进程持久化/重定位窗口。
// 主进程随后回推 onLayoutChanged，与此处保持一致。
function setLayout(nextLayout: IslandLayout) {
  if (!isLayout(nextLayout) || nextLayout === layout) {
    return;
  }

  layout = nextLayout;
  ensureSystemModeValid();
  queueSync();
  void window.island?.setLayout(nextLayout);
}

function setSystemMonitorEnabled(enabled: boolean) {
  if (enabled === systemMonitorEnabled) {
    return;
  }

  systemMonitorEnabled = enabled;
  ensureSystemModeValid();
  queueSync();
  void window.island?.setSystemMonitor(enabled);
}

// 主进程推送的最新 UI 设置（启动首帧 + 每次运行时切换）。只更新镜像并重绘，不回写主进程。
function applyUiSettings(settings: UiSettings | undefined) {
  if (settings && isLayout(settings.layout)) {
    layout = settings.layout;
  }
  if (settings && typeof settings.systemMonitorEnabled === "boolean") {
    systemMonitorEnabled = settings.systemMonitorEnabled;
  }
  ensureSystemModeValid();
  queueSync();
}

function setSettingsPage(page: "hub" | "appearance" | "layout" | "monitor") {
  if (settingsPage === page) {
    return;
  }

  settingsPage = page;
  queueSync();
}

function openSettings() {
  if (mode === "settings") {
    return;
  }

  // Only reachable from the resting capsule states; never hijack media /
  // privacy / clipboard foreground surfaces.
  if (mode !== "idle" && mode !== "peek") {
    return;
  }

  settingsReturnMode = "idle";
  settingsPage = "hub";
  suppressNextClick = true;
  setMode("settings");
}

function closeSettings() {
  if (mode !== "settings") {
    return;
  }

  settingsPage = "hub";
  setMode(settingsReturnMode || "idle");
}

// 从静息系统读数胶囊展开到系统监控卡片。
function openSystemCard() {
  if (mode === "system" || !hasSystemCard()) {
    return;
  }

  if (mode !== "idle" && mode !== "peek") {
    return;
  }

  suppressNextClick = true;
  setMode("system");
}

// 退出系统卡片：回到静息态（随后静息读数胶囊会再次常驻显示）。
function closeSystemCard() {
  if (mode !== "system") {
    return;
  }

  setMode("idle");
}

function clearSettingsLongPress() {
  if (settingsLongPressTimer !== undefined) {
    window.clearTimeout(settingsLongPressTimer);
    settingsLongPressTimer = undefined;
  }

  settingsLongPressPointerId = undefined;
}

function scheduleSettingsLongPress(pointerId: number) {
  clearSettingsLongPress();

  if (mode !== "idle" && mode !== "peek") {
    return;
  }

  settingsLongPressPointerId = pointerId;
  settingsLongPressTimer = window.setTimeout(() => {
    settingsLongPressTimer = undefined;
    settingsLongPressPointerId = undefined;
    openSettings();
  }, SETTINGS_LONG_PRESS_MS);
}

function resolveModeForMediaState(nextMode: IslandMode) {
  return resolveRendererModeForMediaState(nextMode, {
    privacyActive: privacyState.active,
    systemMediaActive
  });
}

function formatTime(totalSeconds: number) {
  return formatMediaTime(totalSeconds);
}

function progressPercent() {
  return getProgressPercent(progressSeconds, track.durationSeconds);
}

function clampProgressSeconds(seconds: number) {
  return clampProgressSecondsForTrack(seconds, track);
}

function getProgressSecondsFromPointer(event: PointerEvent, progressTrack: HTMLElement) {
  return getProgressSecondsFromPointerPosition(event, progressTrack, track);
}

function setProgressPreview(seconds: number) {
  progressSeconds = clampProgressSeconds(seconds);
  queueSync();
}

function getActiveLyricIndex() {
  return getActiveLyricIndexForProgress(lyrics, progressSeconds);
}

function getDisplayedLyrics() {
  return getDisplayedLyricsForState(lyrics, systemMediaActive);
}

function getPrivacyLabel(kind: PrivacySnapshot["kind"]) {
  return getPrivacyLabelForKind(kind);
}

function getPrivacyApps(kind: PrivacySnapshot["kind"]) {
  return getPrivacyAppsForKind(privacyState, kind);
}

function getPrivacyDisplayName(app: string) {
  return getPrivacyDisplayNameFromController(app);
}

function getPrivacyDetailText(kind: PrivacySnapshot["kind"]) {
  return getPrivacyDetailTextForKind(privacyState, kind);
}

function canUseClipboardCard() {
  return true;
}

function canShowClipboardPrompt() {
  return (
    mode === "idle" ||
    mode === "peek" ||
    mode === "hover" ||
    mode === "privacy" ||
    mode === "privacy-expanded" ||
    mode === "clipboard-prompt"
  );
}

function hasClipboardItems() {
  return clipboardSnapshot.items.length > 0;
}

function getPendingClipboardItem() {
  return clipboardSnapshot.pending;
}

function getClipboardPreviewText() {
  const pendingItem = getPendingClipboardItem();
  return pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
}

function clearClipboardPromptTimer() {
  if (clipboardPromptTimer !== undefined) {
    window.clearTimeout(clipboardPromptTimer);
    clipboardPromptTimer = undefined;
  }
}

function getClipboardPromptRestoreMode() {
  if (privacyState.active) {
    return "privacy";
  }

  if (systemMediaActive && !privacyState.active) {
    return "idle";
  }

  if (
    clipboardReturnMode === "clipboard-prompt" ||
    clipboardReturnMode === "clipboard" ||
    clipboardReturnMode === "expanded"
  ) {
    return "idle";
  }

  return clipboardReturnMode || "idle";
}

function getClipboardFallbackMode() {
  return privacyState.active ? "privacy" : "idle";
}

function hideClipboardPrompt(restoreMode = true) {
  clearClipboardPromptTimer();

  if (!clipboardPromptVisible && mode !== "clipboard-prompt") {
    return;
  }

  clipboardPromptVisible = false;

  if (restoreMode && mode === "clipboard-prompt") {
    const nextMode = getClipboardPromptRestoreMode();
    clipboardReturnMode = "idle";
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
  if (!canShowClipboardPrompt() || !getPendingClipboardItem() || mode === "clipboard") {
    return;
  }

  clearClipboardPromptTimer();
  clipboardPromptVisible = true;
  clipboardReturnMode = mode === "clipboard-prompt" ? clipboardReturnMode : mode;
  setMode("clipboard-prompt");
  clipboardPromptTimer = window.setTimeout(() => {
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

  if (mode !== "clipboard") {
    await window.island?.acceptClipboardPending(pendingId);
    clipboardReturnMode = "idle";
    setMode(restoreAfterAccept ? restoreMode : "clipboard");
    return;
  }

  if (clipboardAccepting || clipboardAcceptedItem) {
    return;
  }

  clipboardAccepting = true;
  clipboardAcceptPreview = pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
  clipboardAcceptedItem = pendingItem;
  queueSync();

  if (clipboardAcceptTimer !== undefined) {
    window.clearTimeout(clipboardAcceptTimer);
  }

  await window.island?.acceptClipboardPending(pendingId);
  clipboardReturnMode = "idle";

  if (restoreAfterAccept) {
    clipboardAccepting = false;
    clipboardAcceptPreview = "";
    clipboardAcceptedItem = undefined;
    setMode(restoreMode);
    return;
  }

  clipboardAcceptTimer = window.setTimeout(() => {
    clipboardAcceptTimer = undefined;
    clipboardAccepting = false;
    clipboardAcceptPreview = "";
    queueSync();
  }, 540);
}

function rejectClipboardPrompt() {
  const restoreMode = getClipboardPromptRestoreMode();
  dismissClipboardPrompt(false);
  clipboardReturnMode = "idle";
  setMode(restoreMode);
}

function normalizeClipboardSnapshot(snapshot: ClipboardSnapshot | undefined): ClipboardSnapshot {
  return normalizeClipboardSnapshotFromController(snapshot);
}

function formatClipboardTime(timestamp: number) {
  return formatClipboardTimestamp(timestamp);
}

function hasMusicCard() {
  return systemMediaActive || mediaEntering || mediaExiting;
}

function hasPrivacyIsland() {
  return privacyState.active;
}

function hasClipboardCard() {
  return canUseClipboardCard() && (hasClipboardItems() || Boolean(getPendingClipboardItem()));
}

// 系统监控卡片仅在顶部居中布局 + 监控开启时可用（经典布局走独立系统窗口）。
function hasSystemCard() {
  return layout === "top-center" && systemMonitorEnabled;
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
    systemMediaActive
  });
}

function isCardMode(nextMode = mode) {
  return isCardModeFromController(nextMode);
}

function switchCardPage(direction: number) {
  if (!isCardMode() || clipboardDeleteDialogItemId || draggingProgress) {
    return false;
  }

  const now = window.performance.now();
  if (now < cardWheelLockedUntil) {
    return true;
  }

  const cardModes = getAvailableCardModes();
  if (cardModes.length < 2) {
    return false;
  }

  const currentIndex = Math.max(0, cardModes.indexOf(mode));
  const offset = direction > 0 ? 1 : -1;
  const nextIndex = (currentIndex + offset + cardModes.length) % cardModes.length;
  cardWheelLockedUntil = now + 420;
  setMode(cardModes[nextIndex]);
  return true;
}

function clearPriorityTransition() {
  if (priorityTransitionStageTimer !== undefined) {
    window.clearTimeout(priorityTransitionStageTimer);
    priorityTransitionStageTimer = undefined;
  }

  if (priorityTransitionTimer !== undefined) {
    window.clearTimeout(priorityTransitionTimer);
    priorityTransitionTimer = undefined;
  }

  if (priorityTransitionSettleTimer !== undefined) {
    window.clearTimeout(priorityTransitionSettleTimer);
    priorityTransitionSettleTimer = undefined;
  }

  if (!priorityTransition) {
    return;
  }

  priorityTransition = "";
  priorityTransitionStage = "";
  queueSync();
}

function clearInactiveMediaState() {
  favorited = false;
  progressSeconds = 0;
  lyrics = [];
  lastLyricsDataKey = "";
  lastPlaybackSyncTime = window.performance.now();
}

function cancelMediaExitTransition() {
  if (mediaExitTimer !== undefined) {
    window.clearTimeout(mediaExitTimer);
    mediaExitTimer = undefined;
  }

  if (mediaExiting) {
    mediaExiting = false;
    queueSync();
  }
}

function cancelMediaEnterTransition() {
  if (mediaEnterTimer !== undefined) {
    window.clearTimeout(mediaEnterTimer);
    mediaEnterTimer = undefined;
  }

  if (mediaEntering) {
    mediaEntering = false;
    queueSync();
  }
}

function cancelCapsuleAppearTransition() {
  if (capsuleAppearTimer !== undefined) {
    window.clearTimeout(capsuleAppearTimer);
    capsuleAppearTimer = undefined;
  }

  if (capsuleAppearing) {
    capsuleAppearing = false;
    queueSync();
  }
}

function cancelCapsuleDisappearTransition() {
  if (capsuleDisappearTimer !== undefined) {
    window.clearTimeout(capsuleDisappearTimer);
    capsuleDisappearTimer = undefined;
  }

  if (capsuleDisappearing) {
    capsuleDisappearing = false;
    queueSync();
  }
}

function startCapsuleAppearTransition() {
  if (capsuleAppearing) {
    return;
  }

  capsuleAppearing = true;
  queueSync();
  capsuleAppearTimer = window.setTimeout(() => {
    capsuleAppearTimer = undefined;
    capsuleAppearing = false;
    queueSync();
  }, CAPSULE_APPEAR_TRANSITION_MS);
}

function startCapsuleDisappearTransition() {
  if (capsuleDisappearing) {
    return;
  }

  capsuleDisappearing = true;
  queueSync();
  capsuleDisappearTimer = window.setTimeout(() => {
    capsuleDisappearTimer = undefined;
    capsuleDisappearing = false;
    queueSync();
  }, MEDIA_EXIT_TRANSITION_MS);
}

function startMediaEnterTransition() {
  if (mediaEntering) {
    return;
  }

  mediaEntering = true;
  mediaEnterTimer = window.setTimeout(() => {
    mediaEnterTimer = undefined;
    mediaEntering = false;
    queueSync();
  }, MEDIA_ENTER_TRANSITION_MS);
}

function startMediaExitTransition() {
  if (mediaExiting) {
    return;
  }

  mediaExiting = true;
  mediaExitTimer = window.setTimeout(() => {
    mediaExitTimer = undefined;
    mediaExiting = false;
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

  if (priorityTransitionStageTimer !== undefined) {
    window.clearTimeout(priorityTransitionStageTimer);
    priorityTransitionStageTimer = undefined;
  }

  if (priorityTransitionTimer !== undefined) {
    window.clearTimeout(priorityTransitionTimer);
    priorityTransitionTimer = undefined;
  }

  if (priorityTransitionSettleTimer !== undefined) {
    window.clearTimeout(priorityTransitionSettleTimer);
    priorityTransitionSettleTimer = undefined;
  }

  const [firstStage, secondStage] = getPriorityTransitionStages(name);
  priorityTransition = name;
  priorityTransitionStage = firstStage;
  priorityTransitionStageTimer = window.setTimeout(() => {
    priorityTransitionStageTimer = undefined;

    if (priorityTransition === name) {
      priorityTransitionStage = secondStage;
      queueSync();
    }
  }, Math.min(stageSwitchDuration, Math.max(0, transitionDuration - 40)));
  priorityTransitionTimer = window.setTimeout(() => {
    priorityTransitionTimer = undefined;

    if (priorityTransition === name) {
      const finishTransition = () => {
        if (priorityTransition !== name) {
          return;
        }

        priorityTransition = "";
        priorityTransitionStage = "";
        onDone?.();
        queueSync();
      };

      if (settleDelay > 0) {
        priorityTransitionSettleTimer = window.setTimeout(() => {
          priorityTransitionSettleTimer = undefined;
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

  if (systemMediaActive && mediaControllable) {
    const result = await window.island?.seekMedia(nextSeconds);
    return result;
  }

  return undefined;
}

function renderTemplate() {
  app.replaceChildren();

  const shell = createElement("section", {
    className: "island-shell",
    attributes: { "aria-label": "灵动岛" }
  });

  const albumArt = createElement("div", {
    className: "shared-album-art",
    attributes: { "aria-hidden": "true" }
  });
  albumArt.append(createIcon("music-2", "音乐"));

  const trackCopy = createElement("div", {
    className: "shared-track-copy",
    attributes: { "aria-hidden": "true" }
  });
  trackCopy.append(
    createElement("strong", {
      className: "shared-track-title",
      text: track.title,
      dataset: { field: "track-title" }
    }),
    createElement("span", {
      className: "shared-track-artist",
      text: track.artist,
      dataset: { field: "track-artist" }
    })
  );

  const idleLayer = createElement("button", {
    className: "island-layer idle-layer",
    attributes: {
      type: "button",
      "aria-label": `打开${ISLAND_STATE_NAMES.island}`
    },
    dataset: { action: "open-quick" }
  });

  const hoverLayer = createElement("div", {
    className: "island-layer hover-layer",
    attributes: { "aria-label": `音乐${ISLAND_STATE_NAMES.island}` }
  });
  const compactButton = createElement("button", {
    className: "media-compact",
    attributes: {
      type: "button",
      "aria-label": `打开音乐${ISLAND_STATE_NAMES.card}`
    },
    dataset: { action: "expand" }
  });
  const quickControls = createElement("div", {
    className: "quick-media-controls",
    attributes: { "aria-label": "小岛媒体控制" }
  });
  appendMediaControls(quickControls, "compact");
  hoverLayer.append(compactButton, quickControls);

  const privacyStrip = createElement("button", {
    className: "island-layer privacy-strip",
    attributes: {
      type: "button",
      "aria-live": "polite",
      "aria-expanded": "false",
      "aria-label": `权限监控${ISLAND_STATE_NAMES.capsule}`
    },
    dataset: { action: "privacy-toggle" }
  });

  const clipboardPromptLayer = createElement("div", {
    className: "island-layer clipboard-prompt-layer",
    attributes: {
      role: "button",
      tabindex: "0",
      "aria-label": "进入剪贴板"
    },
    dataset: { action: "clipboard-open-card" }
  });
  const clipboardPromptCopy = createElement("span", { className: "clipboard-prompt-copy" });
  clipboardPromptCopy.append(
    createElement("strong", { className: "clipboard-prompt-text", text: "" }),
    createElement("small", { className: "clipboard-prompt-question", text: "进入剪贴板？" })
  );
  clipboardPromptLayer.append(
    createElement("span", {
      className: "clipboard-prompt-icon",
      attributes: { "aria-hidden": "true" }
    }),
    clipboardPromptCopy,
    createElement("button", {
      className: "clipboard-prompt-action",
      text: "是",
      attributes: {
        type: "button"
      },
      dataset: { action: "clipboard-accept" }
    })
  );

  const clipboardLayer = createElement("main", {
    className: "island-layer clipboard-layer",
    attributes: { "aria-label": "剪贴板" }
  });
  const clipboardHeader = createElement("header", { className: "clipboard-header" });
  const clipboardHeaderCopy = createElement("div", { className: "clipboard-header-copy" });
  clipboardHeaderCopy.append(
    createElement("div", { className: "clipboard-title", text: "剪贴板" }),
    createElement("div", { className: "clipboard-subtitle", text: "最近复制" })
  );
  clipboardHeader.append(
    clipboardHeaderCopy,
    createElement("button", {
      className: "clipboard-clear-button",
      text: "清理",
      attributes: {
        type: "button",
        "aria-label": "一键清理剪贴板历史"
      },
      dataset: { action: "clipboard-clear" }
    })
  );
  const clipboardList = createElement("div", {
    className: "clipboard-list",
    attributes: { role: "list" }
  });
  const clipboardConfirmPanel = createElement("section", {
    className: "clipboard-confirm-panel",
    attributes: { "aria-label": "确认加入剪贴板" }
  });
  clipboardConfirmPanel.append(
    createElement("span", {
      className: "clipboard-confirm-icon clipboard-row-icon",
      attributes: { "aria-hidden": "true" }
    }),
    createElement("span", { className: "clipboard-confirm-kicker", text: "是否加入剪贴板" }),
    createElement("strong", { className: "clipboard-confirm-preview", text: "" }),
    createElement("small", { className: "clipboard-confirm-time", text: "" }),
    createElement("div", { className: "clipboard-confirm-actions" })
  );
  const clipboardConfirmActions = clipboardConfirmPanel.querySelector<HTMLElement>(".clipboard-confirm-actions");
  clipboardConfirmActions?.append(
    createElement("button", {
      className: "clipboard-confirm-no",
      text: "否",
      attributes: { type: "button" },
      dataset: { action: "clipboard-reject" }
    }),
    createElement("button", {
      className: "clipboard-confirm-yes",
      text: "是",
      attributes: { type: "button" },
      dataset: { action: "clipboard-accept" }
    })
  );
  const clipboardDeleteDialog = createElement("div", {
    className: "clipboard-delete-dialog",
    attributes: {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "删除剪贴板记录"
    }
  });
  const clipboardDeletePanel = createElement("div", { className: "clipboard-delete-panel" });
  clipboardDeletePanel.append(
    createElement("strong", { className: "clipboard-delete-title", text: "删除这条记录？" }),
    createElement("span", { className: "clipboard-delete-preview", text: "" }),
    createElement("div", { className: "clipboard-delete-actions" })
  );
  const clipboardDeleteActions = clipboardDeletePanel.querySelector<HTMLElement>(".clipboard-delete-actions");
  clipboardDeleteActions?.append(
    createElement("button", {
      className: "clipboard-delete-cancel",
      text: "取消",
      attributes: { type: "button" },
      dataset: { action: "clipboard-delete-cancel" }
    }),
    createElement("button", {
      className: "clipboard-delete-confirm",
      text: "删除",
      attributes: { type: "button" },
      dataset: { action: "clipboard-delete-confirm" }
    })
  );
  clipboardDeleteDialog.append(clipboardDeletePanel);
  clipboardLayer.append(clipboardHeader, clipboardConfirmPanel, clipboardList, clipboardDeleteDialog);

  const expandedLayer = createElement("main", {
    className: "island-layer expanded-layer",
    attributes: { "aria-label": `音乐${ISLAND_STATE_NAMES.card}` }
  });
  const mediaPanel = createElement("section", {
    className: "media-panel",
    attributes: { "aria-label": "当前播放" }
  });
  const mediaCopy = createElement("div", { className: "media-copy" });
  const progressTrack = createElement("div", {
    className: "progress-track",
    attributes: {
      role: "slider",
      tabindex: "0",
      "aria-label": "播放进度",
      "aria-valuemin": "0",
      "aria-valuemax": track.durationSeconds.toString(),
      "aria-valuenow": progressSeconds.toString()
    }
  });
  const progressFill = createElement("span", { dataset: { field: "progress-fill" } });
  progressFill.style.width = progressPercent();
  progressTrack.append(progressFill);

  const timeRow = createElement("div", { className: "media-time-row" });
  timeRow.append(
    createElement("span", { text: formatTime(progressSeconds), dataset: { field: "elapsed-time" } }),
    createElement("span", { text: formatTime(track.durationSeconds), dataset: { field: "duration-time" } })
  );
  mediaCopy.append(progressTrack, timeRow);

  const expandedControls = createElement("div", {
    className: "expanded-media-controls",
    attributes: { "aria-label": "卡片媒体控制" }
  });
  appendMediaControls(expandedControls, "expanded");
  mediaPanel.append(mediaCopy, expandedControls);

  const lyricsPanel = createElement("section", {
    className: "lyrics-panel",
    attributes: { "aria-label": "歌词" }
  });
  const lyricsList = createElement("div", { className: "lyrics-list" });
  lyricsList.append(createElement("div", { className: "lyrics-list-inner" }));
  lyricsPanel.append(lyricsList);
  expandedLayer.append(mediaPanel, lyricsPanel);

  const settingsLayer = buildSettingsLayer();

  const systemCardLayer = buildSystemCard();
  systemCardLayer.classList.add("island-layer");
  // 静息态（无音乐/权限/剪贴板）时，胶囊常驻系统紧凑读数，点击展开到系统卡。
  const systemCapsuleLayer = buildSystemCapsule();
  systemCapsuleLayer.dataset.action = "open-system";

  const cardPager = createElement("div", {
    className: "card-pager",
    attributes: { "aria-hidden": "true" }
  });

  shell.append(
    albumArt,
    trackCopy,
    idleLayer,
    hoverLayer,
    privacyStrip,
    clipboardPromptLayer,
    clipboardLayer,
    expandedLayer,
    settingsLayer,
    systemCapsuleLayer,
    systemCardLayer,
    cardPager
  );
  app.append(shell);

  lastLyricsDataKey = "";
  renderLyricsList();
  createIcons({ icons: lucideIcons });
  renderSystemIcons(app);
}

function queueSync() {
  if (frameQueued) {
    return;
  }

  frameQueued = true;
  window.requestAnimationFrame(() => {
    frameQueued = false;
    syncUi();
  });
}

function createViewSyncContext() {
  return {
    app,
    get track() { return track; },
    set track(value: TrackState) { track = value; },
    get progressSeconds() { return progressSeconds; },
    set progressSeconds(value: number) { progressSeconds = value; },
    get lyrics() { return lyrics; },
    set lyrics(value: LyricLine[]) { lyrics = value; },
    get systemMediaActive() { return systemMediaActive; },
    set systemMediaActive(value: boolean) { systemMediaActive = value; },
    get lastLyricsDataKey() { return lastLyricsDataKey; },
    set lastLyricsDataKey(value: string) { lastLyricsDataKey = value; },
    get lyricsCenterFrame() { return lyricsCenterFrame; },
    set lyricsCenterFrame(value: number) { lyricsCenterFrame = value; },
    get mode() { return mode; },
    set mode(value: IslandMode) { mode = value; },
    get glassStyle() { return glassStyle; },
    set glassStyle(value: GlassStyle) { glassStyle = value; },
    get glassIntensity() { return glassIntensity; },
    set glassIntensity(value: GlassIntensity) { glassIntensity = value; },
    get playing() { return playing; },
    set playing(value: boolean) { playing = value; },
    get favorited() { return favorited; },
    set favorited(value: boolean) { favorited = value; },
    get draggingProgress() { return draggingProgress; },
    set draggingProgress(value: boolean) { draggingProgress = value; },
    get mediaEntering() { return mediaEntering; },
    set mediaEntering(value: boolean) { mediaEntering = value; },
    get mediaExiting() { return mediaExiting; },
    set mediaExiting(value: boolean) { mediaExiting = value; },
    get capsuleAppearing() { return capsuleAppearing; },
    set capsuleAppearing(value: boolean) { capsuleAppearing = value; },
    get capsuleDisappearing() { return capsuleDisappearing; },
    set capsuleDisappearing(value: boolean) { capsuleDisappearing = value; },
    get privacyState() { return privacyState; },
    set privacyState(value: PrivacySnapshot) { privacyState = value; },
    get priorityTransition() { return priorityTransition; },
    set priorityTransition(value: string) { priorityTransition = value; },
    get priorityTransitionStage() { return priorityTransitionStage; },
    set priorityTransitionStage(value: string) { priorityTransitionStage = value; },
    get clipboardPromptVisible() { return clipboardPromptVisible; },
    set clipboardPromptVisible(value: boolean) { clipboardPromptVisible = value; },
    get settingsPage() { return settingsPage; },
    set settingsPage(value: SettingsPage) { settingsPage = value; },
    get layout() { return layout; },
    set layout(value: IslandLayout) { layout = value; },
    get systemMonitorEnabled() { return systemMonitorEnabled; },
    set systemMonitorEnabled(value: boolean) { systemMonitorEnabled = value; },
    get systemSnapshot() { return systemSnapshot; },
    set systemSnapshot(value: SystemSnapshot) { systemSnapshot = value; },
    get privacyExpanded() { return privacyExpanded; },
    set privacyExpanded(value: boolean) { privacyExpanded = value; },
    get clipboardSnapshot() { return clipboardSnapshot; },
    set clipboardSnapshot(value: ClipboardSnapshot) { clipboardSnapshot = value; },
    get clipboardAccepting() { return clipboardAccepting; },
    set clipboardAccepting(value: boolean) { clipboardAccepting = value; },
    get clipboardAcceptPreview() { return clipboardAcceptPreview; },
    set clipboardAcceptPreview(value: string) { clipboardAcceptPreview = value; },
    get clipboardListRenderKey() { return clipboardListRenderKey; },
    set clipboardListRenderKey(value: string) { clipboardListRenderKey = value; },
    get clipboardDeleteDialogItemId() { return clipboardDeleteDialogItemId; },
    set clipboardDeleteDialogItemId(value: string) { clipboardDeleteDialogItemId = value; },
    get expandedLayerPrewarmed() { return expandedLayerPrewarmed; },
    set expandedLayerPrewarmed(value: boolean) { expandedLayerPrewarmed = value; },
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
  mode = resolvedMode;

  if (clipboardTransitionTimer !== undefined) {
    window.clearTimeout(clipboardTransitionTimer);
    clipboardTransitionTimer = undefined;
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

  if (expandedTransitionTimer !== undefined) {
    window.clearTimeout(expandedTransitionTimer);
    expandedTransitionTimer = undefined;
  }

  if (resolvedMode === "expanded" && previousMode !== "expanded") {
    app.dataset.enteringExpanded = "true";
    expandedTransitionTimer = window.setTimeout(() => {
      expandedTransitionTimer = undefined;
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
    clipboardTransitionTimer = window.setTimeout(() => {
      clipboardTransitionTimer = undefined;
      if (app.dataset.enteringClipboard === "true") {
        app.dataset.enteringClipboard = "false";
      }
    }, 520);
  } else if (previousMode === "clipboard") {
    clearAcceptedClipboardSurface();
    app.dataset.enteringClipboard = "false";
    app.dataset.returningFromClipboard = "true";
    clipboardTransitionTimer = window.setTimeout(() => {
      clipboardTransitionTimer = undefined;
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
    frameQueued = false;
    syncUi();
    return;
  }

  queueSync();
}

function setMode(nextMode: IslandMode, resizeWindow = true) {
  const resolvedMode = resolveModeForMediaState(nextMode);
  const shouldResizeWindow = resizeWindow || resolvedMode !== nextMode;

  if (mode === resolvedMode) {
    if (shouldResizeWindow) {
      void window.island?.resize(resolvedMode);
    }

    return;
  }

  const previousMode = mode;
  modeCommitToken += 1;
  commitModeChange(previousMode, resolvedMode, shouldResizeWindow);
}

function togglePrivacyDetail() {
  if (!privacyState.active) {
    return;
  }

  privacyExpanded = !privacyExpanded;
  setMode(privacyExpanded ? "privacy-expanded" : "privacy");
  queueSync();
}

function collapsePrivacyDetail() {
  if (!privacyExpanded) {
    return;
  }

  privacyExpanded = false;
  setMode("privacy");
  queueSync();
}

function togglePlay() {
  if (!systemMediaActive || !mediaControllable) {
    return;
  }

  playing = !playing;
  queueSync();
  void window.island?.controlMedia("toggle-play");
}

function skipTrack(action: "previous-track" | "next-track") {
  if (!systemMediaActive || !mediaControllable) {
    return;
  }

  playing = true;
  progressSeconds = 0;
  queueSync();
  void window.island?.controlMedia(action);
}

async function toggleFavorite() {
  if (!systemMediaActive || !mediaControllable) {
    return;
  }

  const previousFavorited = favorited;
  favorited = !favorited;
  queueSync();

  const result = await window.island?.controlMedia("favorite-track");
  if (typeof result?.favorited === "boolean") {
    favorited = result.favorited;
    queueSync();
    return;
  }

  if (result?.ok === false) {
    favorited = previousFavorited;
    queueSync();
  }
}

function setProgress(seconds: number, syncSystem = false) {
  setProgressPreview(seconds);

  if (syncSystem && systemMediaActive && mediaControllable) {
    void window.island?.seekMedia(progressSeconds);
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
  if (clipboardDeleteTimer !== undefined) {
    window.clearTimeout(clipboardDeleteTimer);
    clipboardDeleteTimer = undefined;
  }

  clipboardDeletePointerId = undefined;
  clipboardDeleteItemId = "";
}

function getClipboardItemById(itemId: string) {
  return clipboardSnapshot.items.find((item) => item.id === itemId);
}

function getAcceptedClipboardItem() {
  if (!clipboardAcceptedItem) {
    return undefined;
  }

  return (
    clipboardSnapshot.items.find((item) => item.id === clipboardAcceptedItem?.id) ||
    clipboardSnapshot.items.find((item) => item.text === clipboardAcceptedItem?.text) ||
    clipboardAcceptedItem
  );
}

function clearAcceptedClipboardSurface() {
  if (clipboardAcceptTimer !== undefined) {
    window.clearTimeout(clipboardAcceptTimer);
    clipboardAcceptTimer = undefined;
  }

  clipboardAccepting = false;
  clipboardAcceptPreview = "";
  clipboardAcceptedItem = undefined;
}

function openClipboardDeleteDialog(itemId: string) {
  if (!getClipboardItemById(itemId)) {
    return;
  }

  clipboardDeleteDialogItemId = itemId;
  queueSync();
}

function closeClipboardDeleteDialog() {
  if (!clipboardDeleteDialogItemId) {
    return;
  }

  clipboardDeleteDialogItemId = "";
  queueSync();
}

function confirmClipboardDelete() {
  const deleteId = clipboardDeleteDialogItemId;
  clipboardDeleteDialogItemId = "";

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

  clipboardDeleteItemId = itemId;
  clipboardDeletePointerId = pointerId;
  clipboardDeleteTimer = window.setTimeout(() => {
    const deleteId = clipboardDeleteItemId;
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
      return suppressNextClick;
    },
    set suppressNextClick(value: boolean) {
      suppressNextClick = value;
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
      return systemMonitorEnabled;
    },
    set systemMonitorEnabled(value: boolean) {
      systemMonitorEnabled = value;
    },
    get privacyState() {
      return appState.privacyState;
    },
    set privacyState(value: PrivacySnapshot) {
      appState.privacyState = value;
    },
    get systemMediaActive() {
      return systemMediaActive;
    },
    set systemMediaActive(value: boolean) {
      systemMediaActive = value;
    },
    get clipboardSnapshot() {
      return appState.clipboardSnapshot;
    },
    set clipboardSnapshot(value: ClipboardSnapshot) {
      appState.clipboardSnapshot = value;
    },
    get clipboardAcceptedItem() {
      return clipboardAcceptedItem;
    },
    set clipboardAcceptedItem(value: ClipboardItem | undefined) {
      clipboardAcceptedItem = value;
    },
    get clipboardDeletePointerId() {
      return clipboardDeletePointerId;
    },
    set clipboardDeletePointerId(value: number | undefined) {
      clipboardDeletePointerId = value;
    },
    get settingsLongPressPointerId() {
      return settingsLongPressPointerId;
    },
    set settingsLongPressPointerId(value: number | undefined) {
      settingsLongPressPointerId = value;
    },
    get draggingProgress() {
      return draggingProgress;
    },
    set draggingProgress(value: boolean) {
      draggingProgress = value;
    },
    get pendingSeekSeconds() {
      return pendingSeekSeconds;
    },
    set pendingSeekSeconds(value: number | undefined) {
      pendingSeekSeconds = value;
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
      return playing;
    },
    set playing(value: boolean) {
      playing = value;
    },
    get lastPlaybackSyncTime() {
      return lastPlaybackSyncTime;
    },
    set lastPlaybackSyncTime(value: number) {
      lastPlaybackSyncTime = value;
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
    const hadVisibleMedia = systemMediaActive || mediaExiting;

    systemMediaActive = false;
    mediaControllable = false;
    playing = false;
    cancelMediaEnterTransition();

    if (privacyState.active && mode === "expanded") {
      setMode("privacy");
    } else if (!privacyState.active && (mode === "hover" || mode === "expanded")) {
      setMode(mode === "expanded" && hasClipboardCard() ? "clipboard" : "idle");
    }

    if (hadVisibleMedia && !privacyState.active) {
      startMediaExitTransition();
      lastPlaybackSyncTime = window.performance.now();
    } else {
      cancelMediaExitTransition();
      clearInactiveMediaState();
    }

    queueSync();
    return;
  }

  const shouldEnterMedia = !privacyState.active && (!systemMediaActive || mediaExiting);
  cancelMediaExitTransition();
  systemMediaActive = true;
  mediaControllable = snapshot.controllable !== false;
  track = {
    title: snapshot.title || "Unknown Title",
    artist: snapshot.artist || snapshot.sourceApp || "Unknown Artist",
    cover: snapshot.cover,
    durationSeconds: Math.max(1, snapshot.durationSeconds || track.durationSeconds)
  };
  playing = snapshot.playing;
  if (typeof snapshot.favorited === "boolean") {
    favorited = snapshot.favorited;
  }
  lyrics = Array.isArray(snapshot.lyrics) ? snapshot.lyrics : [];

  if (!draggingProgress) {
    progressSeconds = clampProgressSeconds(snapshot.positionSeconds || 0);
  }

  lastPlaybackSyncTime = window.performance.now();
  if (shouldEnterMedia) {
    startMediaEnterTransition();
  }
  queueSync();

}

function handlePrivacyUpdate(snapshot: PrivacySnapshot) {
  const previousPrivacyActive = wasPrivacyActive;
  const previousMode = mode;
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
    systemMediaActive &&
    (previousMode === "idle" || previousMode === "peek" || previousMode === "hover");
  const shouldHandBackToMedia =
    previousPrivacyActive &&
    !nextPrivacyState.active &&
    systemMediaActive &&
    (mode === "privacy" || mode === "privacy-expanded");

  if (shouldHandBackToMedia) {
    pendingPrivacySnapshot = nextPrivacyState;
    privacyExpanded = false;
    const restoreMode = privacyReturnMode === "privacy" ? "idle" : privacyReturnMode;
    startPriorityTransition(PRIORITY_TRANSITION_PRIVACY_TO_MEDIA, PRIVACY_PRIORITY_TRANSITION_MS, () => {
      if (pendingPrivacySnapshot) {
        privacyState = pendingPrivacySnapshot;
        pendingPrivacySnapshot = undefined;
      }

      wasPrivacyActive = privacyState.active;
      privacyReturnMode = "idle";
      setMode(restoreMode || "idle");
    });
    setMode("privacy");
    queueSync();
    return;
  }

  pendingPrivacySnapshot = undefined;
  privacyState = nextPrivacyState;
  wasPrivacyActive = privacyState.active;

  if (privacyState.active) {
    const userSelectedForeground =
      mode === "clipboard" ||
      mode === "clipboard-prompt" ||
      (previousPrivacyActive && mode === "expanded");

    if (!previousPrivacyActive && mode !== "privacy" && mode !== "privacy-expanded" && mode !== "peek") {
      privacyReturnMode = mode;
    }

    if (shouldHandOffFromMedia) {
      startPriorityTransition(PRIORITY_TRANSITION_MEDIA_TO_PRIVACY);
    } else if (!previousPrivacyActive) {
      clearPriorityTransition();
    }

    if (!userSelectedForeground) {
      setMode(privacyExpanded ? "privacy-expanded" : "privacy");
    }
  } else {
    privacyExpanded = false;
    clearPriorityTransition();
    if (mode === "privacy" || mode === "privacy-expanded" || mode === "peek") {
      const restoreMode = privacyReturnMode === "privacy" ? "idle" : privacyReturnMode;
      privacyReturnMode = "idle";
      setMode(restoreMode);
    }
  }

  queueSync();

}

function handleClipboardUpdate(snapshot: ClipboardSnapshot) {
  const previousPendingId = clipboardSnapshot.pending?.id || "";
  const nextClipboardSnapshot = normalizeClipboardSnapshot(snapshot);
  const nextPendingId = nextClipboardSnapshot.pending?.id || "";

  clipboardSnapshot = nextClipboardSnapshot;

  if (mode === "clipboard" && !hasClipboardItems() && !getPendingClipboardItem() && !clipboardAccepting && !clipboardAcceptedItem) {
    setMode(getClipboardFallbackMode());
    return;
  }

  if (mode === "clipboard") {
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
  systemSnapshot = normalizeSystemSnapshot(snapshot);
  queueSync();

}

function handlePlaybackTick() {
  const now = window.performance.now();

  if (systemMediaActive && playing && !draggingProgress) {
    const elapsedSeconds = Math.max(0, Math.min((now - lastPlaybackSyncTime) / 1000, 1));
    setProgress(progressSeconds + elapsedSeconds);
  }

  lastPlaybackSyncTime = now;

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
