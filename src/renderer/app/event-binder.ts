import type { ClipboardItem, ClipboardSnapshot, PrivacySnapshot, SettingsPage, TrackState } from "./state";

export interface RendererEventContext {
  app: HTMLElement;
  island?: Window["island"];
  suppressNextClick: boolean;
  mode: IslandMode;
  settingsPage: SettingsPage;
  systemMonitorEnabled: boolean;
  privacyState: PrivacySnapshot;
  systemMediaActive: boolean;
  clipboardSnapshot: ClipboardSnapshot;
  clipboardAcceptedItem: ClipboardItem | undefined;
  clipboardDeletePointerId: number | undefined;
  settingsLongPressPointerId: number | undefined;
  draggingProgress: boolean;
  pendingSeekSeconds: number | undefined;
  progressSeconds: number;
  track: TrackState;
  playing: boolean;
  lastPlaybackSyncTime: number;
  setSettingsPage(page: SettingsPage): void;
  isGlassStyle(value: unknown): value is GlassStyle;
  setGlassStyle(style: GlassStyle): void;
  isGlassIntensity(value: unknown): value is GlassIntensity;
  setGlassIntensity(intensity: GlassIntensity): void;
  isLayout(value: unknown): value is IslandLayout;
  setLayout(layout: IslandLayout): void;
  setSystemMonitorEnabled(enabled: boolean): void;
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

export function registerRendererEvents(context: RendererEventContext) {
  const app = context.app;

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;

  // 长按刚触发设置卡片时，吞掉随之而来的这一次 click，避免误触 idle 的点击逻辑。
  if (context.suppressNextClick) {
    context.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const privacyTarget = target.closest<HTMLElement>(".privacy-strip");
  const interactiveTarget = target.closest<HTMLElement>(
    ".quick-media-controls, .expanded-media-controls, .media-control-button, .progress-track, .clipboard-row, .clipboard-confirm-panel[data-ready='true'], .clipboard-prompt-layer, .clipboard-delete-dialog"
  );
  const islandTarget = target.closest<HTMLElement>(".island-shell");
  const actionElement = target.closest<HTMLElement>("[data-action]");
  const action = actionElement?.dataset.action;

  // 设置卡片：中心（hub）+ 三个二级页。点击导航进入子页，返回回中心；
  // 空白处在 hub 退出回胶囊，在子页则返回 hub。
  if (context.mode === "settings") {
    if (action === "settings-nav") {
      const page = actionElement?.dataset.page;
      if (page === "appearance" || page === "layout" || page === "monitor") {
        context.setSettingsPage(page);
      }
      return;
    }

    if (action === "settings-back") {
      context.setSettingsPage("hub");
      return;
    }

    if (action === "set-glass") {
      const requested = actionElement?.dataset.glass;
      if (context.isGlassStyle(requested)) {
        context.setGlassStyle(requested);
      }
      return;
    }

    if (action === "set-intensity") {
      const requested = actionElement?.dataset.intensity;
      if (context.isGlassIntensity(requested)) {
        context.setGlassIntensity(requested);
      }
      return;
    }

    if (action === "set-layout") {
      const requested = actionElement?.dataset.layout;
      if (context.isLayout(requested)) {
        context.setLayout(requested);
      }
      return;
    }

    if (action === "toggle-system-monitor") {
      context.setSystemMonitorEnabled(!context.systemMonitorEnabled);
      return;
    }

    // 点击控件以外的空白：子页返回 hub，hub 退出设置。
    if (!interactiveTarget) {
      if (context.settingsPage === "hub") {
        context.closeSettings();
      } else {
        context.setSettingsPage("hub");
      }
    }
    return;
  }

  // 系统监控卡片：点击空白处退出回胶囊（静息态会再次显示系统读数）。
  if (context.mode === "system") {
    context.closeSystemCard();
    return;
  }

  if (privacyTarget && context.privacyState.active) {
    context.togglePrivacyDetail();
    return;
  }

  if (action === "set-glass") {
    const requested = actionElement?.dataset.glass;
    if (context.isGlassStyle(requested)) {
      context.setGlassStyle(requested);
    }
    return;
  }

  if (action === "clipboard-open-card") {
    context.openClipboardCard();
    return;
  }

  if (action === "clipboard-accept") {
    const fromPromptCapsule = Boolean(target.closest(".clipboard-prompt-layer"));
    void context.acceptClipboardPrompt(fromPromptCapsule && (context.systemMediaActive || context.privacyState.active));
    return;
  }

  if (action === "clipboard-reject") {
    context.rejectClipboardPrompt();
    return;
  }

  if (context.mode === "clipboard-prompt" && islandTarget && context.canUseClipboardCard() && context.getPendingClipboardItem()) {
    context.openClipboardCard();
    return;
  }

  if (action === "clipboard-clear") {
    context.clearAcceptedClipboardSurface();
    void context.island?.clearClipboardItems();
    if (context.mode === "clipboard") {
      context.setMode(context.getClipboardFallbackMode());
    }
    return;
  }

  if (action === "clipboard-delete-cancel") {
    context.closeClipboardDeleteDialog();
    return;
  }

  if (action === "clipboard-delete-confirm") {
    context.confirmClipboardDelete();
    return;
  }

  if (action === "clipboard-copy") {
    const item =
      context.clipboardSnapshot.items.find((clipboardItem) => clipboardItem.id === actionElement?.dataset.clipboardId) ||
      (actionElement?.classList.contains("clipboard-confirm-panel") ? context.getAcceptedClipboardItem() : undefined);
    void context.copyClipboardText(item?.text || "");
    return;
  }

  if (islandTarget && !interactiveTarget && context.privacyState.active && context.mode === "privacy") {
    context.togglePrivacyDetail();
    return;
  }

  if (islandTarget && !interactiveTarget && context.canUseClipboardCard() && context.getPendingClipboardItem() && !context.systemMediaActive) {
    context.openClipboardCard();
    return;
  }

  if (islandTarget && !interactiveTarget && context.canUseClipboardCard() && context.hasClipboardItems() && !context.systemMediaActive) {
    context.openClipboardCard();
    return;
  }

  if (islandTarget && !interactiveTarget && context.systemMediaActive) {
    if (context.mode === "idle" || context.mode === "peek") {
      context.setMode("hover");
      return;
    }

    if (context.mode === "hover") {
      context.setMode("expanded");
      return;
    }
  }

  if (!action) {
    if (context.mode === "hover" && target.closest(".hover-layer") && !target.closest(".quick-media-controls")) {
      context.setMode("expanded");
    }

    return;
  }

  if (action === "open-quick") {
    if (context.canUseClipboardCard() && context.hasClipboardItems() && !context.systemMediaActive && !context.privacyState.active) {
      context.openClipboardCard();
    } else if (context.systemMediaActive) {
      context.setMode("hover");
    } else if (context.isIdleSystemActive()) {
      context.openSystemCard();
    }
  }

  if (action === "open-system") {
    context.openSystemCard();
  }

  if (action === "expand") {
    context.setMode("expanded");
  }

  if (action === "idle") {
    context.setMode("idle");
  }

  if (action === "toggle-play") {
    context.togglePlay();
  }

  if (action === "previous-track") {
    context.skipTrack("previous-track");
  }

  if (action === "next-track") {
    context.skipTrack("next-track");
  }

  if (action === "favorite-track") {
    void context.toggleFavorite();
  }
});

app.addEventListener(
  "wheel",
  (event) => {
    if (!context.isCardMode() || context.getAvailableCardModes().length < 2) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    context.switchCardPage(event.deltaY || event.deltaX || 1);
  },
  { passive: false }
);

app.addEventListener("pointerout", (event) => {
  const target = event.target as HTMLElement;
  const privacyTarget = target.closest<HTMLElement>(".privacy-strip");
  if (!privacyTarget) {
    return;
  }

  const relatedTarget = event.relatedTarget as Node | null;
  if (relatedTarget && privacyTarget.contains(relatedTarget)) {
    return;
  }

  context.collapsePrivacyDetail();
});

window.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement as HTMLElement | null;

  if (activeElement?.closest(".clipboard-prompt-layer") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    context.openClipboardCard();
    return;
  }

  if (!context.privacyState.active || !activeElement?.closest(".privacy-strip")) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    context.togglePrivacyDetail();
  }
});

app.addEventListener("pointerdown", (event) => {
  const target = event.target as HTMLElement;

  // 长按 idle/peek 胶囊进入外观设置。只在静息胶囊态触发，避开媒体/隐私/剪贴板前台。
  if ((context.mode === "idle" || context.mode === "peek") && target.closest(".island-shell")) {
    context.scheduleSettingsLongPress(event.pointerId);
  }

  const clipboardRow = target.closest<HTMLElement>(".clipboard-row, .clipboard-confirm-panel[data-ready='true']");
  if (clipboardRow && context.mode === "clipboard") {
    context.scheduleClipboardItemDelete(clipboardRow.dataset.clipboardId || "", event.pointerId);
  }

  const progressTrack = target.closest<HTMLElement>(".progress-track");

  if (context.mode !== "expanded" || !progressTrack) {
    return;
  }

  event.preventDefault();
  context.draggingProgress = true;
  context.pendingSeekSeconds = context.getProgressSecondsFromPointer(event, progressTrack);
  progressTrack.setPointerCapture(event.pointerId);
  void context.setRendererInteracting(true);
  context.setProgressPreview(context.pendingSeekSeconds);
  context.queueSync();
});

app.addEventListener("pointermove", (event) => {
  if (context.clipboardDeletePointerId === event.pointerId) {
    context.clearClipboardDeleteTimer();
  }

  if (!context.draggingProgress) {
    return;
  }

  const progressTrack = app.querySelector<HTMLElement>(".progress-track");

  if (!progressTrack) {
    return;
  }

  event.preventDefault();
  context.pendingSeekSeconds = context.getProgressSecondsFromPointer(event, progressTrack);
  context.setProgressPreview(context.pendingSeekSeconds);
});

app.addEventListener("pointerup", (event) => {
  if (context.settingsLongPressPointerId === event.pointerId) {
    context.clearSettingsLongPress();
  }

  if (context.clipboardDeletePointerId === event.pointerId) {
    context.clearClipboardDeleteTimer();
  }

  if (!context.draggingProgress) {
    return;
  }

  const progressTrack = app.querySelector<HTMLElement>(".progress-track");
  if (progressTrack?.hasPointerCapture(event.pointerId)) {
    progressTrack.releasePointerCapture(event.pointerId);
  }

  context.draggingProgress = false;
  const commitSeconds = context.pendingSeekSeconds ?? context.progressSeconds;
  context.pendingSeekSeconds = undefined;
  void context.commitProgress(commitSeconds);
  void context.setRendererInteracting(false);
  context.queueSync();
});

app.addEventListener("pointercancel", (event) => {
  if (context.settingsLongPressPointerId === event.pointerId) {
    context.clearSettingsLongPress();
  }

  if (context.clipboardDeletePointerId === event.pointerId) {
    context.clearClipboardDeleteTimer();
  }

  if (!context.draggingProgress) {
    return;
  }

  const progressTrack = app.querySelector<HTMLElement>(".progress-track");
  if (progressTrack?.hasPointerCapture(event.pointerId)) {
    progressTrack.releasePointerCapture(event.pointerId);
  }

  context.draggingProgress = false;
  context.pendingSeekSeconds = undefined;
  void context.setRendererInteracting(false);
  context.queueSync();
});

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;

  if (context.mode === "expanded" && target.closest(".progress-track")) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void context.commitProgress(context.progressSeconds - 5);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      void context.commitProgress(context.progressSeconds + 5);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      void context.commitProgress(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      void context.commitProgress(context.track.durationSeconds);
      return;
    }
  }

  if (event.key === "Escape") {
    context.setMode("idle");
  }
});


}

interface IslandApiListenerContext {
  app: HTMLElement;
  island?: Window["island"];
  onModeRequest(mode: IslandMode): void;
  onMediaUpdate(snapshot: MediaSnapshot): void;
  onPrivacyUpdate(snapshot: PrivacySnapshot): void;
  onClipboardUpdate(snapshot: ClipboardSnapshot): void;
  onSystemUpdate(snapshot: SystemSnapshot): void;
  onLayoutChanged(settings: UiSettings): void;
  onPlaybackTick(): void;
}

export function registerIslandApiListeners(context: IslandApiListenerContext) {
  const { app, island } = context;

  island?.onModeRequest((requestedMode) => {
    context.onModeRequest(requestedMode);
  });

  island?.onAvoidScale((scale) => {
    const safeScale = Number.isFinite(scale) ? Math.max(0.5, Math.min(1, scale)) : 1;
    app.style.setProperty("--avoid-scale", safeScale.toFixed(4));
    app.dataset.avoiding = safeScale < 0.999 ? "true" : "false";
  });

  island?.onMediaUpdate((snapshot) => {
    context.onMediaUpdate(snapshot);
  });

  island?.onPrivacyUpdate((snapshot) => {
    context.onPrivacyUpdate(snapshot);
  });

  island?.onClipboardUpdate((snapshot) => {
    context.onClipboardUpdate(snapshot);
  });

  island?.onSystemUpdate((snapshot) => {
    context.onSystemUpdate(snapshot);
  });

  island?.onLayoutChanged((settings) => {
    context.onLayoutChanged(settings);
  });

  void island?.getUiSettings().then((settings) => {
    context.onLayoutChanged(settings);
  });

  window.setInterval(() => {
    context.onPlaybackTick();
  }, 250);

  island?.ready();
}
