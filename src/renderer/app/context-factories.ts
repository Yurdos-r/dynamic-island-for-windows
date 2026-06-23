import type { RendererEventContext } from "./event-binder";
import type { RendererRuntimeState } from "./runtime-state";
import type { ClipboardItem, ClipboardSnapshot, KeyboardLockHint, LyricLine, PrivacySnapshot, SettingsPage, TrackState } from "./state";
import type { ViewSyncContext } from "./view-sync";

interface ViewSyncHelpers {
  getDisplayedLyrics(): LyricLine[];
  getActiveLyricIndex(): number;
  getAvailableCardModes(): IslandMode[];
  hasClipboardItems(): boolean;
  isIdleSystemActive(): boolean;
  formatTime(seconds: number): string;
  progressPercent(): string;
  getClipboardPreviewText(): string;
  getPendingClipboardItem(): ClipboardItem | undefined;
  getAcceptedClipboardItem(): ClipboardItem | undefined;
  formatClipboardTime(timestamp: number): string;
  getClipboardItemById(itemId: string): ClipboardItem | undefined;
  isCardMode(mode?: IslandMode): boolean;
  getPrivacyLabel(kind: PrivacySnapshot["kind"]): string;
  getPrivacyDetailText(kind: PrivacySnapshot["kind"]): string;
}

interface ViewSyncContextOptions {
  app: HTMLElement;
  runtime: RendererRuntimeState;
  helpers: ViewSyncHelpers;
}

export function createViewSyncContext(options: ViewSyncContextOptions): ViewSyncContext {
  const { app, runtime, helpers } = options;

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
    get keyboardLockHintsEnabled() { return runtime.keyboardLockHintsEnabled; },
    set keyboardLockHintsEnabled(value: boolean) { runtime.keyboardLockHintsEnabled = value; },
    get startupEnabled() { return runtime.startupEnabled; },
    set startupEnabled(value: boolean) { runtime.startupEnabled = value; },
    get keyboardLockHint() { return runtime.keyboardLockHint; },
    set keyboardLockHint(value: KeyboardLockHint | undefined) { runtime.keyboardLockHint = value; },
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
    ...helpers
  };
}

interface RendererEventActions {
  setSettingsPage(page: SettingsPage): void;
  isGlassStyle(value: unknown): value is GlassStyle;
  setGlassStyle(style: GlassStyle): void;
  isGlassIntensity(value: unknown): value is GlassIntensity;
  setGlassIntensity(intensity: GlassIntensity): void;
  isLayout(value: unknown): value is IslandLayout;
  setLayout(layout: IslandLayout): void;
  setSystemMonitorEnabled(enabled: boolean): void;
  setKeyboardLockHintsEnabled(enabled: boolean): void;
  setStartupEnabled(enabled: boolean): void;
  closeSettings(): void;
  closeSystemCard(): void;
  togglePrivacyDetail(): void;
  openClipboardCard(): void;
  acceptClipboardPrompt(restoreAfterAccept?: boolean): Promise<void>;
  rejectClipboardPrompt(): void;
  canUseClipboardCard(): boolean;
  getPendingClipboardItem(): ClipboardItem | undefined;
  clearAcceptedClipboardSurface(): void;
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
  getClipboardFallbackMode(): IslandMode;
  closeClipboardDeleteDialog(): void;
  confirmClipboardDelete(): void;
  getAcceptedClipboardItem(): ClipboardItem | undefined;
  copyClipboardText(text: string): Promise<void>;
  hasClipboardItems(): boolean;
  isIdleSystemActive(): boolean;
  openSystemCard(): void;
  togglePlay(): void;
  skipTrack(action: "previous-track" | "next-track"): void;
  toggleFavorite(): Promise<void>;
  isCardMode(mode?: IslandMode): boolean;
  getAvailableCardModes(): IslandMode[];
  switchCardPage(direction: number): boolean;
  collapsePrivacyDetail(): void;
  scheduleSettingsLongPress(pointerId: number): void;
  scheduleClipboardItemDelete(itemId: string, pointerId: number): void;
  getProgressSecondsFromPointer(event: PointerEvent, progressTrack: HTMLElement): number;
  setRendererInteracting(interacting: boolean): Promise<void>;
  setProgressPreview(seconds: number): void;
  queueSync(): void;
  clearClipboardDeleteTimer(): void;
  clearSettingsLongPress(): void;
  commitProgress(seconds: number): Promise<unknown>;
  setProgress(seconds: number, syncSystem?: boolean): void;
}

interface RendererEventContextOptions {
  app: HTMLElement;
  island?: Window["island"];
  runtime: RendererRuntimeState;
  actions: RendererEventActions;
}

export function createRendererEventContext(options: RendererEventContextOptions): RendererEventContext {
  const { app, island, runtime, actions } = options;

  return {
    app,
    island,
    get suppressNextClick() { return runtime.suppressNextClick; },
    set suppressNextClick(value: boolean) { runtime.suppressNextClick = value; },
    get mode() { return runtime.mode; },
    set mode(value: IslandMode) { runtime.mode = value; },
    get settingsPage() { return runtime.settingsPage; },
    set settingsPage(value: SettingsPage) { runtime.settingsPage = value; },
    get systemMonitorEnabled() { return runtime.systemMonitorEnabled; },
    set systemMonitorEnabled(value: boolean) { runtime.systemMonitorEnabled = value; },
    get keyboardLockHintsEnabled() { return runtime.keyboardLockHintsEnabled; },
    set keyboardLockHintsEnabled(value: boolean) { runtime.keyboardLockHintsEnabled = value; },
    get startupEnabled() { return runtime.startupEnabled; },
    set startupEnabled(value: boolean) { runtime.startupEnabled = value; },
    get privacyState() { return runtime.privacyState; },
    set privacyState(value: PrivacySnapshot) { runtime.privacyState = value; },
    get systemMediaActive() { return runtime.systemMediaActive; },
    set systemMediaActive(value: boolean) { runtime.systemMediaActive = value; },
    get clipboardSnapshot() { return runtime.clipboardSnapshot; },
    set clipboardSnapshot(value: ClipboardSnapshot) { runtime.clipboardSnapshot = value; },
    get clipboardAcceptedItem() { return runtime.clipboardAcceptedItem; },
    set clipboardAcceptedItem(value: ClipboardItem | undefined) { runtime.clipboardAcceptedItem = value; },
    get clipboardDeletePointerId() { return runtime.clipboardDeletePointerId; },
    set clipboardDeletePointerId(value: number | undefined) { runtime.clipboardDeletePointerId = value; },
    get settingsLongPressPointerId() { return runtime.settingsLongPressPointerId; },
    set settingsLongPressPointerId(value: number | undefined) { runtime.settingsLongPressPointerId = value; },
    get draggingProgress() { return runtime.draggingProgress; },
    set draggingProgress(value: boolean) { runtime.draggingProgress = value; },
    get pendingSeekSeconds() { return runtime.pendingSeekSeconds; },
    set pendingSeekSeconds(value: number | undefined) { runtime.pendingSeekSeconds = value; },
    get progressSeconds() { return runtime.progressSeconds; },
    set progressSeconds(value: number) { runtime.progressSeconds = value; },
    get track() { return runtime.track; },
    set track(value: TrackState) { runtime.track = value; },
    get playing() { return runtime.playing; },
    set playing(value: boolean) { runtime.playing = value; },
    get lastPlaybackSyncTime() { return runtime.lastPlaybackSyncTime; },
    set lastPlaybackSyncTime(value: number) { runtime.lastPlaybackSyncTime = value; },
    ...actions
  };
}
