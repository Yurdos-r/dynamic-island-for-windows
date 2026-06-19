import type { RendererRuntimeState } from "../runtime-state";
import {
  resolveRendererModeForMediaState
} from "../controllers/mode-controller";
import { createModeCommitActions } from "./mode-commit-actions";
import { createModeCardActions, type ClipboardAvailability } from "./mode-card-actions";
import { createModePriorityTransition } from "./mode-priority-transition";
import { createModeTransitionTimers } from "./mode-transition-timers";

interface ModeTransitionActionsOptions {
  app: HTMLElement;
  runtime: RendererRuntimeState;
  island?: Window["island"];
  clipboard: ClipboardAvailability;
  onLeavingClipboard(): void;
  queueSync(): void;
  syncUi(): void;
}

export function createModeTransitionActions(options: ModeTransitionActionsOptions) {
  const { app, runtime, island, clipboard, onLeavingClipboard, queueSync, syncUi } = options;
  const cardActions = createModeCardActions({ runtime, clipboard, setMode });
  const transitionTimers = createModeTransitionTimers({ runtime, queueSync });
  const priorityTransition = createModePriorityTransition({ runtime, queueSync });
  const commitActions = createModeCommitActions({
    app,
    runtime,
    island,
    transitionTimers,
    onLeavingClipboard,
    queueSync,
    syncUi
  });

  function resolveModeForMediaState(nextMode: IslandMode) {
    return resolveRendererModeForMediaState(nextMode, {
      privacyActive: runtime.privacyState.active,
      systemMediaActive: runtime.systemMediaActive
    });
  }

  function setMode(nextMode: IslandMode, resizeWindow = true) {
    const resolvedMode = resolveModeForMediaState(nextMode);
    const shouldResizeWindow = resizeWindow || resolvedMode !== nextMode;

    if (runtime.mode === resolvedMode) {
      if (shouldResizeWindow) {
        void island?.resize(resolvedMode);
      }

      return;
    }

    const previousMode = runtime.mode;
    runtime.modeCommitToken += 1;
    commitActions.commitModeChange(previousMode, resolvedMode, shouldResizeWindow);
  }

  return {
    cancelMediaEnterTransition: transitionTimers.cancelMediaEnterTransition,
    cancelMediaExitTransition: transitionTimers.cancelMediaExitTransition,
    clearInactiveMediaState: transitionTimers.clearInactiveMediaState,
    clearPriorityTransition: priorityTransition.clearPriorityTransition,
    getAvailableCardModes: cardActions.getAvailableCardModes,
    hasClipboardCard: cardActions.hasClipboardCard,
    hasMusicCard: cardActions.hasMusicCard,
    hasPrivacyIsland: cardActions.hasPrivacyIsland,
    hasSystemCard: cardActions.hasSystemCard,
    isCardMode: cardActions.isCardMode,
    isIdleSystemActive: cardActions.isIdleSystemActive,
    resolveModeForMediaState,
    setMode,
    startMediaEnterTransition: transitionTimers.startMediaEnterTransition,
    startMediaExitTransition: transitionTimers.startMediaExitTransition,
    startPriorityTransition: priorityTransition.startPriorityTransition,
    switchCardPage: cardActions.switchCardPage
  };
}
