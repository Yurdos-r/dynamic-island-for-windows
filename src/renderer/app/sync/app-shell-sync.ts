import type { ViewSyncContext } from "./view-sync-context";

export function syncAppShellDataset(context: ViewSyncContext, cardModes: IslandMode[], cardIndex: number) {
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
  context.app.dataset.startup = context.startupEnabled ? "true" : "false";
  context.app.dataset.idleSystem = context.isIdleSystemActive() ? "true" : "false";
  context.app.dataset.systemState = context.systemSnapshot.state;
}
