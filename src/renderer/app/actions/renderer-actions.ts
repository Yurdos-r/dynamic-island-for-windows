import type { RendererRuntimeState } from "../runtime-state";
import { createClipboardActions } from "./clipboard-actions";
import { createMediaActions } from "./media-actions";
import { createModeTransitionActions } from "./mode-transition-actions";
import { createPrivacyActions } from "./privacy-actions";
import { createSettingsActions } from "./settings-actions";

interface RendererActionsOptions {
  app: HTMLElement;
  runtime: RendererRuntimeState;
  island?: Window["island"];
  queueSync(): void;
  syncUi(): void;
}

export function createRendererActions(options: RendererActionsOptions) {
  const { app, runtime, island, queueSync, syncUi } = options;
  let modeActions: ReturnType<typeof createModeTransitionActions>;
  const setMode = (mode: IslandMode, resizeWindow?: boolean) => modeActions.setMode(mode, resizeWindow);

  const clipboardActions = createClipboardActions({
    runtime,
    island,
    queueSync,
    setMode
  });

  modeActions = createModeTransitionActions({
    app,
    runtime,
    island,
    queueSync,
    syncUi,
    clipboard: {
      canUseClipboardCard: clipboardActions.canUseClipboardCard,
      hasClipboardItems: clipboardActions.hasClipboardItems,
      getPendingClipboardItem: clipboardActions.getPendingClipboardItem
    },
    onLeavingClipboard: clipboardActions.clearAcceptedClipboardSurface
  });

  const mediaActions = createMediaActions({ runtime, island, queueSync });
  const privacyActions = createPrivacyActions({
    runtime,
    queueSync,
    setMode: modeActions.setMode
  });
  const settingsActions = createSettingsActions({
    runtime,
    island,
    queueSync,
    setMode: modeActions.setMode,
    hasSystemCard: modeActions.hasSystemCard
  });

  return {
    ...clipboardActions,
    ...mediaActions,
    ...modeActions,
    ...privacyActions,
    ...settingsActions,
    queueSync
  };
}

export type RendererActions = ReturnType<typeof createRendererActions>;
