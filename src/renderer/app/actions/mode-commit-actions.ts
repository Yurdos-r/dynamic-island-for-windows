import type { RendererRuntimeState } from "../runtime-state";
import {
  isCapsuleMode as isCapsuleModeFromController,
  isTransparentIdleMode as isTransparentIdleModeFromController
} from "../controllers/mode-controller";

interface CapsuleTransitionActions {
  cancelCapsuleAppearTransition(): void;
  cancelCapsuleDisappearTransition(): void;
  startCapsuleAppearTransition(): void;
  startCapsuleDisappearTransition(): void;
}

interface ModeCommitActionsOptions {
  app: HTMLElement;
  runtime: RendererRuntimeState;
  island?: Window["island"];
  transitionTimers: CapsuleTransitionActions;
  onLeavingClipboard(): void;
  queueSync(): void;
  syncUi(): void;
}

export function createModeCommitActions(options: ModeCommitActionsOptions) {
  const { app, runtime, island, transitionTimers, onLeavingClipboard, queueSync, syncUi } = options;

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
      transitionTimers.cancelCapsuleDisappearTransition();
      transitionTimers.startCapsuleAppearTransition();
    } else if (shouldAnimateCapsuleDisappear) {
      transitionTimers.cancelCapsuleAppearTransition();
      transitionTimers.startCapsuleDisappearTransition();
    } else if (resolvedMode === "expanded" || resolvedMode === "clipboard" || resolvedMode === "idle") {
      transitionTimers.cancelCapsuleAppearTransition();
      transitionTimers.cancelCapsuleDisappearTransition();
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
      onLeavingClipboard();
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
      void island?.resize(resolvedMode);
    }

    if (resolvedMode === "expanded" && previousMode !== "expanded") {
      runtime.frameQueued = false;
      syncUi();
      return;
    }

    queueSync();
  }

  return {
    commitModeChange
  };
}
