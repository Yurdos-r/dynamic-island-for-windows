import "../styles.css";
import { EMPTY_SYSTEM_SNAPSHOT } from "../system-view";
import { createRendererRuntimeState } from "./runtime-state";
import {
  createRendererEventContext,
  createViewSyncContext
} from "./context-factories";
import { createRendererActions, type RendererActions } from "./actions/renderer-actions";
import { readInitialGlassIntensity, readInitialGlassStyle } from "./actions/settings-actions";
import { registerIslandApiListeners, registerRendererEvents } from "./event-binder";
import { createIslandUpdateHandlers } from "./update-handlers";
import { renderLyricsListView, prewarmExpandedLayerView, syncRendererView } from "./view-sync";
import { renderIslandTemplate } from "./views/template-view";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root not found");
}

const app = appRoot;
const runtime = createRendererRuntimeState({
  glassStyle: readInitialGlassStyle(),
  glassIntensity: readInitialGlassIntensity(),
  systemSnapshot: { ...EMPTY_SYSTEM_SNAPSHOT },
  lastPlaybackSyncTime: window.performance.now()
});
let actions: RendererActions;

function renderTemplate() {
  renderIslandTemplate({
    app,
    track: runtime.track,
    progressSeconds: runtime.progressSeconds,
    progressPercent: actions.progressPercent,
    formatTime: actions.formatTime,
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

function createCurrentViewSyncContext() {
  return createViewSyncContext({
    app,
    runtime,
    helpers: {
      getDisplayedLyrics: actions.getDisplayedLyrics,
      getActiveLyricIndex: actions.getActiveLyricIndex,
      getAvailableCardModes: actions.getAvailableCardModes,
      hasClipboardItems: actions.hasClipboardItems,
      isIdleSystemActive: actions.isIdleSystemActive,
      formatTime: actions.formatTime,
      progressPercent: actions.progressPercent,
      getClipboardPreviewText: actions.getClipboardPreviewText,
      getPendingClipboardItem: actions.getPendingClipboardItem,
      getAcceptedClipboardItem: actions.getAcceptedClipboardItem,
      formatClipboardTime: actions.formatClipboardTime,
      getClipboardItemById: actions.getClipboardItemById,
      isCardMode: actions.isCardMode,
      getPrivacyLabel: actions.getPrivacyLabel,
      getPrivacyDetailText: actions.getPrivacyDetailText
    }
  });
}

function renderLyricsList() {
  renderLyricsListView(createCurrentViewSyncContext());
}

function syncUi() {
  syncRendererView(createCurrentViewSyncContext());
}

function prewarmExpandedLayer() {
  prewarmExpandedLayerView(createCurrentViewSyncContext());
}

actions = createRendererActions({
  app,
  runtime,
  island: window.island,
  queueSync,
  syncUi
});

registerRendererEvents(
  createRendererEventContext({
    app,
    island: window.island,
    runtime,
    actions
  })
);

const islandUpdateHandlers = createIslandUpdateHandlers({
  runtime,
  actions
});

renderTemplate();
actions.applyGlassIntensityToFilter();
syncUi();
prewarmExpandedLayer();

registerIslandApiListeners({
  app,
  island: window.island,
  onModeRequest: islandUpdateHandlers.handleModeRequest,
  onMediaUpdate: islandUpdateHandlers.handleMediaUpdate,
  onPrivacyUpdate: islandUpdateHandlers.handlePrivacyUpdate,
  onClipboardUpdate: islandUpdateHandlers.handleClipboardUpdate,
  onSystemUpdate: islandUpdateHandlers.handleSystemUpdate,
  onKeyboardLockUpdate: islandUpdateHandlers.handleKeyboardLockUpdate,
  onLayoutChanged: actions.applyUiSettings,
  onPlaybackTick: islandUpdateHandlers.handlePlaybackTick
});
