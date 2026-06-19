import { syncSystemView } from "../system-view";
import { createElement } from "./dom";
import type { ClipboardItem, ClipboardSnapshot, LyricLine, PrivacySnapshot, SettingsPage, TrackState } from "./state";
import { createClipboardRow } from "./views/clipboard-view";

interface ViewSyncContext {
  [key: string]: any;
  app: HTMLElement;
  track: TrackState;
  progressSeconds: number;
  lyrics: LyricLine[];
  systemMediaActive: boolean;
  lastLyricsDataKey: string;
  lyricsCenterFrame: number;
  mode: IslandMode;
  glassStyle: GlassStyle;
  glassIntensity: GlassIntensity;
  playing: boolean;
  favorited: boolean;
  draggingProgress: boolean;
  mediaEntering: boolean;
  mediaExiting: boolean;
  capsuleAppearing: boolean;
  capsuleDisappearing: boolean;
  privacyState: PrivacySnapshot;
  priorityTransition: string;
  priorityTransitionStage: string;
  clipboardPromptVisible: boolean;
  settingsPage: SettingsPage;
  layout: IslandLayout;
  systemMonitorEnabled: boolean;
  systemSnapshot: SystemSnapshot;
  privacyExpanded: boolean;
  clipboardSnapshot: ClipboardSnapshot;
  clipboardAccepting: boolean;
  clipboardAcceptPreview: string;
  clipboardListRenderKey: string;
  clipboardDeleteDialogItemId: string;
  expandedLayerPrewarmed: boolean;
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

function setText(context: ViewSyncContext, selector: string, value: string) {
  context.app.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (element.textContent !== value) {
      element.textContent = value;
    }
  });
}

export function renderLyricsListView(context: ViewSyncContext) {
  const lyricsList = context.app.querySelector<HTMLElement>(".lyrics-list");
  if (!lyricsList) {
    return;
  }

  let lyricsInner = lyricsList.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsInner) {
    lyricsInner = createElement("div", { className: "context.lyrics-list-inner" });
    lyricsList.replaceChildren(lyricsInner);
  }

  const displayedLyrics = context.getDisplayedLyrics();
  const renderKey = displayedLyrics
    .map((line) => [line.timeMs, line.text, line.translation || ""].join("|"))
    .join("~");

  if (renderKey !== context.lastLyricsDataKey) {
    context.lastLyricsDataKey = renderKey;
    lyricsInner.replaceChildren(
      ...displayedLyrics.map((line, index) => {
        const lyricLine = createElement("div", {
          className: "lyric-line",
          attributes: {
            role: "listitem"
          },
          dataset: {
            lyricIndex: index.toString()
          }
        });
        const textWrap = createElement("strong");
        textWrap.append(createElement("span", { className: "lyric-text", text: line.text }));

        if (line.translation) {
          textWrap.append(createElement("small", { text: line.translation }));
        }

        lyricLine.append(textWrap);
        return lyricLine;
      })
    );
  }

  syncLyricsState(context);
}

function queueLyricsCentering(context: ViewSyncContext) {
  if (context.lyricsCenterFrame) {
    window.cancelAnimationFrame(context.lyricsCenterFrame);
  }

  context.lyricsCenterFrame = window.requestAnimationFrame(() => {
    context.lyricsCenterFrame = 0;
    centerActiveLyric(context);
  });
}

function centerActiveLyric(context: ViewSyncContext) {
  const lyricsList = context.app.querySelector<HTMLElement>(".lyrics-list");
  const lyricsInner = lyricsList?.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsList || !lyricsInner) {
    return;
  }

  const activeIndex = context.lyrics.length ? context.getActiveLyricIndex() : 0;
  const activeLine = lyricsInner.querySelector<HTMLElement>(`.lyric-line[data-lyric-index="${activeIndex}"]`);
  if (!activeLine) {
    lyricsInner.style.setProperty("--context.lyrics-shift", "0px");
    return;
  }

  const listCenter = lyricsList.clientHeight / 2;
  const activeCenter = activeLine.offsetTop + activeLine.offsetHeight / 2;
  lyricsInner.style.setProperty("--context.lyrics-shift", `${(listCenter - activeCenter).toFixed(2)}px`);
}

function syncLyricsState(context: ViewSyncContext) {
  const lyricsInner = context.app.querySelector<HTMLElement>(".lyrics-list-inner");
  if (!lyricsInner) {
    return;
  }

  const activeIndex = context.lyrics.length ? context.getActiveLyricIndex() : 0;
  lyricsInner.querySelectorAll<HTMLElement>(".lyric-line").forEach((line, index) => {
    const isActive = index === activeIndex;
    const distance = Math.abs(index - activeIndex);
    const depth = Math.min(distance, 5);
    const scale = Math.max(0.78, 1.08 - depth * 0.055);
    const opacity = isActive ? 1 : Math.max(0.16, 0.78 - depth * 0.13);
    const blur = isActive ? 0 : Math.min(4.8, 0.85 + depth * 0.68);

    line.classList.toggle("active", isActive);
    line.dataset.active = isActive ? "true" : "false";
    line.dataset.distance = depth.toString();
    line.style.setProperty("--lyric-scale", scale.toFixed(3));
    line.style.setProperty("--lyric-opacity", opacity.toFixed(3));
    line.style.setProperty("--lyric-blur", `${blur.toFixed(2)}px`);

    if (isActive) {
      line.setAttribute("aria-current", "true");
    } else {
      line.removeAttribute("aria-current");
    }
  });

  queueLyricsCentering(context);
}

export function syncRendererView(context: ViewSyncContext) {
  const cardModes = context.getAvailableCardModes();
  const cardIndex = cardModes.indexOf(context.mode);
  context.app.dataset.mode = context.mode;
  context.app.dataset.glass = context.glassStyle;
  context.app.dataset.glassIntensity = context.glassIntensity;
  context.app.dataset.playing = context.playing ? "true" : "false";
  context.app.dataset.favorited = context.favorited ? "true" : "false";
  context.app.dataset.progressDragging = context.draggingProgress ? "true" : "false";
  context.app.dataset.mediaActive = context.systemMediaActive || context.mediaEntering || context.mediaExiting ? "true" : "false";
  context.app.dataset.mediaEntering = context.mediaEntering ? "true" : "false";
  context.app.dataset.mediaExiting = context.mediaExiting ? "true" : "false";
  context.app.dataset.capsuleAppearing = context.capsuleAppearing ? "true" : "false";
  context.app.dataset.capsuleDisappearing = context.capsuleDisappearing ? "true" : "false";
  context.app.dataset.privacyActive = context.privacyState.active ? "true" : "false";
  context.app.dataset.privacyKind = context.privacyState.kind;
  context.app.dataset.priorityTransition = context.priorityTransition;
  context.app.dataset.priorityStage = context.priorityTransitionStage;
  context.app.dataset.clipboardPrompt = context.clipboardPromptVisible ? "true" : "false";
  context.app.dataset.clipboardHasItems = context.hasClipboardItems() ? "true" : "false";
  context.app.dataset.cardCount = cardModes.length.toString();
  context.app.dataset.cardIndex = cardIndex >= 0 ? cardIndex.toString() : "-1";
  context.app.dataset.settingsPage = context.settingsPage;
  context.app.dataset.layout = context.layout;
  context.app.dataset.systemMonitor = context.systemMonitorEnabled ? "true" : "false";
  context.app.dataset.idleSystem = context.isIdleSystemActive() ? "true" : "false";
  context.app.dataset.systemState = context.systemSnapshot.state;

  setText(context, '[data-field="track-title"]', context.track.title);
  setText(context, '[data-field="track-artist"]', context.track.artist);
  setText(context, '[data-field="elapsed-time"]', context.formatTime(context.progressSeconds));
  setText(context, '[data-field="duration-time"]', context.formatTime(context.track.durationSeconds));
  renderLyricsListView(context);

  const progressTrack = context.app.querySelector<HTMLElement>(".progress-track");
  progressTrack?.setAttribute("aria-valuemax", context.track.durationSeconds.toString());
  progressTrack?.setAttribute("aria-valuenow", Math.round(context.progressSeconds).toString());
  progressTrack?.setAttribute("aria-valuetext", `${context.formatTime(context.progressSeconds)} / ${context.formatTime(context.track.durationSeconds)}`);

  const progressFill = context.app.querySelector<HTMLElement>('[data-field="progress-fill"]');
  if (progressFill) {
    progressFill.style.width = context.progressPercent();
  }

  const albumArt = context.app.querySelector<HTMLElement>(".shared-album-art");
  if (albumArt) {
    albumArt.dataset.hasCover = context.track.cover ? "true" : "false";
    albumArt.style.backgroundImage = context.track.cover ? `url("${context.track.cover}")` : "";
  }

  context.app.querySelectorAll<HTMLButtonElement>(".play-toggle").forEach((button) => {
    button.setAttribute("aria-label", context.playing ? "鏆傚仠" : "鎾斁");
  });

  context.app.querySelectorAll<HTMLButtonElement>('[data-action="favorite-track"]').forEach((button) => {
    button.setAttribute("aria-pressed", context.favorited ? "true" : "false");
  });

  syncPrivacyStrip(context);
  syncClipboardSurface(context);
  syncSettingsSurface(context);
  syncSystemView(context.app, context.systemSnapshot);
  syncCardPager(context, cardModes, cardIndex);
}

function syncSettingsSurface(context: ViewSyncContext) {
  context.app.querySelectorAll<HTMLButtonElement>('.settings-option[data-action="set-glass"]').forEach((option) => {
    const isActive = option.dataset.glass === context.glassStyle;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>(".settings-intensity-option").forEach((option) => {
    const isActive = option.dataset.intensity === context.glassIntensity;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>('.settings-option[data-action="set-layout"]').forEach((option) => {
    const isActive = option.dataset.layout === context.layout;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-system-monitor"]').forEach((toggle) => {
    toggle.setAttribute("aria-checked", context.systemMonitorEnabled ? "true" : "false");
  });
}

function syncCardPager(context: ViewSyncContext, cardModes: IslandMode[], cardIndex: number) {
  const pager = context.app.querySelector<HTMLElement>(".card-pager");
  if (!pager) {
    return;
  }

  const shouldShow = cardModes.length > 1 && context.isCardMode();
  pager.hidden = !shouldShow;
  pager.replaceChildren(
    ...cardModes.map((cardMode, index) =>
      createElement("span", {
        className: "card-pager-dot",
        dataset: {
          cardMode,
          active: index === cardIndex ? "true" : "false"
        }
      })
    )
  );
}

function syncPrivacyStrip(context: ViewSyncContext) {
  const privacyStrip = context.app.querySelector<HTMLButtonElement>(".privacy-strip");
  if (!privacyStrip) {
    return;
  }

  privacyStrip.replaceChildren();

  if (!context.privacyState.active) {
    privacyStrip.hidden = true;
    context.privacyExpanded = false;
    return;
  }

  privacyStrip.hidden = false;
  const kind = context.privacyState.kind;
  const labelText = context.getPrivacyLabel(kind);
  const detailText = context.getPrivacyDetailText(kind);
  const icon = createElement("span", {
    className: `privacy-indicator privacy-${kind}`,
    attributes: {
      "aria-hidden": "true"
    }
  });
  const copy = createElement("span", {
    className: "privacy-copy"
  });
  const label = createElement("span", {
    className: "privacy-label",
    text: labelText
  });
  const detail = createElement("span", {
    className: "privacy-detail",
    text: detailText
  });

  if (kind === "microphone") {
    icon.classList.add("privacy-dot", "privacy-dot-microphone");
  } else if (kind === "camera") {
    icon.classList.add("privacy-dot", "privacy-dot-camera");
  } else if (kind === "location") {
    icon.classList.add("privacy-location");
  }

  privacyStrip.setAttribute("aria-expanded", context.privacyExpanded ? "true" : "false");
  privacyStrip.setAttribute("aria-label", context.privacyExpanded ? `${labelText}锛?{detailText}` : labelText);
  privacyStrip.title = context.privacyExpanded ? `${labelText} - ${detailText}` : labelText;
  copy.append(label, detail);
  privacyStrip.append(icon, copy);
}

function syncClipboardSurface(context: ViewSyncContext) {
  const promptLayer = context.app.querySelector<HTMLButtonElement>(".clipboard-prompt-layer");
  const promptText = context.app.querySelector<HTMLElement>(".clipboard-prompt-text");
  const clipboardLayer = context.app.querySelector<HTMLElement>(".clipboard-layer");
  const clipboardList = context.app.querySelector<HTMLElement>(".clipboard-list");
  const clipboardConfirmPanel = context.app.querySelector<HTMLElement>(".clipboard-confirm-panel");
  const clipboardConfirmPreview = context.app.querySelector<HTMLElement>(".clipboard-confirm-preview");
  const clipboardConfirmTime = context.app.querySelector<HTMLElement>(".clipboard-confirm-time");
  const clipboardClearButton = context.app.querySelector<HTMLButtonElement>(".clipboard-clear-button");
  const deleteDialog = context.app.querySelector<HTMLElement>(".clipboard-delete-dialog");
  const deletePreview = context.app.querySelector<HTMLElement>(".clipboard-delete-preview");

  if (
    !promptLayer ||
    !promptText ||
    !clipboardLayer ||
    !clipboardList ||
    !clipboardConfirmPanel ||
    !clipboardConfirmPreview ||
    !clipboardConfirmTime ||
    !clipboardClearButton ||
    !deleteDialog ||
    !deletePreview
  ) {
    return;
  }

  promptText.textContent = context.getClipboardPreviewText();
  promptLayer.hidden = !context.clipboardPromptVisible || context.mode !== "clipboard-prompt";
  clipboardLayer.hidden = context.mode !== "clipboard" && context.app.dataset.returningFromClipboard !== "true";
  const pendingItem = context.getPendingClipboardItem();
  const acceptedItem = context.getAcceptedClipboardItem();
  const acceptedReady = Boolean(acceptedItem && !context.clipboardAccepting);
  const showClipboardConfirmPanel = Boolean(pendingItem || context.clipboardAccepting || acceptedItem) && context.mode === "clipboard";
  const visibleClipboardItems = acceptedItem
    ? context.clipboardSnapshot.items.filter((item) => item.id !== acceptedItem.id && item.text !== acceptedItem.text)
    : context.clipboardSnapshot.items;
  const shouldMoveListWithContractingPanel = context.clipboardAccepting && visibleClipboardItems.length > 0;
  clipboardConfirmPanel.hidden = !showClipboardConfirmPanel;
  clipboardConfirmPreview.textContent = pendingItem?.preview || acceptedItem?.preview || context.clipboardAcceptPreview || "";
  clipboardConfirmTime.textContent = acceptedItem || pendingItem ? context.formatClipboardTime((acceptedItem || pendingItem)?.copiedAt || Date.now()) : "";
  clipboardConfirmPanel.dataset.accepting = context.clipboardAccepting || acceptedReady ? "true" : "false";
  clipboardConfirmPanel.dataset.contracting = context.clipboardAccepting ? "true" : "false";
  clipboardConfirmPanel.dataset.ready = acceptedReady ? "true" : "false";
  if (acceptedReady) {
    clipboardConfirmPanel.dataset.action = "clipboard-copy";
    clipboardConfirmPanel.dataset.clipboardId = acceptedItem?.id || "";
  } else {
    delete clipboardConfirmPanel.dataset.action;
    delete clipboardConfirmPanel.dataset.clipboardId;
  }
  clipboardList.dataset.accepting = context.clipboardAccepting && !shouldMoveListWithContractingPanel ? "true" : "false";
  clipboardList.dataset.contractingBelow = shouldMoveListWithContractingPanel ? "true" : "false";
  clipboardList.hidden =
    (context.clipboardAccepting && !shouldMoveListWithContractingPanel) ||
    (Boolean(pendingItem) && context.mode === "clipboard" && !acceptedReady && !shouldMoveListWithContractingPanel);
  clipboardClearButton.hidden = (Boolean(pendingItem) && context.mode === "clipboard") || context.clipboardAccepting;

  const clipboardListNextKey = [
    acceptedItem ? "with-accepted-row" : "normal",
    visibleClipboardItems.map((item) => `${item.id}:${item.copiedAt}:${item.preview}`).join("|"),
    !visibleClipboardItems.length && !context.clipboardAccepting && !acceptedReady ? "empty" : ""
  ].join("::");

  if (context.clipboardListRenderKey !== clipboardListNextKey) {
    context.clipboardListRenderKey = clipboardListNextKey;
    clipboardList.replaceChildren(
      ...visibleClipboardItems.map((item, index) => createClipboardRow(item, index + (acceptedItem ? 1 : 0), context.formatClipboardTime))
    );

    if (!visibleClipboardItems.length && !context.clipboardAccepting && !acceptedReady) {
      clipboardList.append(
        createElement("div", {
          className: "clipboard-empty",
          text: "No clipboard records"
        })
      );
    }
  }
  if (context.mode !== "clipboard" || (context.clipboardDeleteDialogItemId && !context.getClipboardItemById(context.clipboardDeleteDialogItemId))) {
    context.clipboardDeleteDialogItemId = "";
  }

  const deleteItem = context.getClipboardItemById(context.clipboardDeleteDialogItemId);
  deleteDialog.hidden = !deleteItem || context.mode !== "clipboard";
  deletePreview.textContent = deleteItem?.preview || "";
}

export function prewarmExpandedLayerView(context: ViewSyncContext) {
  if (context.expandedLayerPrewarmed) {
    return;
  }

  context.expandedLayerPrewarmed = true;
  window.requestAnimationFrame(() => {
    context.app.querySelector<HTMLElement>(".expanded-layer")?.getBoundingClientRect();
  });
}

