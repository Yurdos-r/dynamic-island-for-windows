import type { RendererRuntimeState } from "../runtime-state";
import {
  CAPSULE_APPEAR_TRANSITION_MS,
  MEDIA_ENTER_TRANSITION_MS,
  MEDIA_EXIT_TRANSITION_MS
} from "../state";

interface ModeTransitionTimerOptions {
  runtime: RendererRuntimeState;
  queueSync(): void;
}

export function createModeTransitionTimers(options: ModeTransitionTimerOptions) {
  const { runtime, queueSync } = options;

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

  return {
    cancelCapsuleAppearTransition,
    cancelCapsuleDisappearTransition,
    cancelMediaEnterTransition,
    cancelMediaExitTransition,
    clearInactiveMediaState,
    startCapsuleAppearTransition,
    startCapsuleDisappearTransition,
    startMediaEnterTransition,
    startMediaExitTransition
  };
}
