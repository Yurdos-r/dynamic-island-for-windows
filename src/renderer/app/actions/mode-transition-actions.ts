import type { RendererRuntimeState } from "../runtime-state";
import {
  getAvailableCardModesForState,
  isCapsuleMode as isCapsuleModeFromController,
  isCardMode as isCardModeFromController,
  isTransparentIdleMode as isTransparentIdleModeFromController,
  resolveRendererModeForMediaState
} from "../controllers/mode-controller";
import {
  CAPSULE_APPEAR_TRANSITION_MS,
  MEDIA_ENTER_TRANSITION_MS,
  MEDIA_EXIT_TRANSITION_MS,
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_STAGE_SWITCH_MS,
  PRIVACY_PRIORITY_TRANSITION_MS,
  PRIVACY_TO_MEDIA_IDLE_DELAY_MS
} from "../state";

interface ClipboardAvailability {
  canUseClipboardCard(): boolean;
  hasClipboardItems(): boolean;
  getPendingClipboardItem(): unknown;
}

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

  function resolveModeForMediaState(nextMode: IslandMode) {
    return resolveRendererModeForMediaState(nextMode, {
      privacyActive: runtime.privacyState.active,
      systemMediaActive: runtime.systemMediaActive
    });
  }

  function hasMusicCard() {
    return runtime.systemMediaActive || runtime.mediaEntering || runtime.mediaExiting;
  }

  function hasPrivacyIsland() {
    return runtime.privacyState.active;
  }

  function hasClipboardCard() {
    return clipboard.canUseClipboardCard() && (clipboard.hasClipboardItems() || Boolean(clipboard.getPendingClipboardItem()));
  }

  function hasSystemCard() {
    return runtime.layout === "top-center" && runtime.systemMonitorEnabled;
  }

  function isIdleSystemActive() {
    return hasSystemCard() && !hasMusicCard() && !hasPrivacyIsland() && !clipboard.hasClipboardItems() && !clipboard.getPendingClipboardItem();
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

  function isCardMode(nextMode: IslandMode = runtime.mode) {
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
    commitModeChange(previousMode, resolvedMode, shouldResizeWindow);
  }

  return {
    cancelMediaEnterTransition,
    cancelMediaExitTransition,
    clearInactiveMediaState,
    clearPriorityTransition,
    getAvailableCardModes,
    hasClipboardCard,
    hasMusicCard,
    hasPrivacyIsland,
    hasSystemCard,
    isCardMode,
    isIdleSystemActive,
    resolveModeForMediaState,
    setMode,
    startMediaEnterTransition,
    startMediaExitTransition,
    startPriorityTransition,
    switchCardPage
  };
}
