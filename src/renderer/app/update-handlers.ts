import { normalizeSystemSnapshot } from "../system-view";
import { normalizeClipboardSnapshot as normalizeClipboardSnapshotFromController } from "./controllers/clipboard-controller";
import type { RendererRuntimeState } from "./runtime-state";
import {
  PRIORITY_TRANSITION_MEDIA_TO_PRIVACY,
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_TRANSITION_MS,
  type ClipboardSnapshot,
  type PrivacySnapshot
} from "./state";

interface IslandUpdateActions {
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
  hasClipboardCard(): boolean;
  cancelMediaEnterTransition(): void;
  startMediaExitTransition(): void;
  cancelMediaExitTransition(): void;
  clearInactiveMediaState(): void;
  startMediaEnterTransition(): void;
  clampProgressSeconds(seconds: number): number;
  queueSync(): void;
  startPriorityTransition(name: string, duration?: number, onDone?: () => void): void;
  clearPriorityTransition(): void;
  hasClipboardItems(): boolean;
  getPendingClipboardItem(): unknown;
  getClipboardFallbackMode(): IslandMode;
  canShowClipboardPrompt(): boolean;
  showClipboardPrompt(): void;
  setProgress(seconds: number, syncSystem?: boolean): void;
}

interface IslandUpdateHandlerOptions {
  runtime: RendererRuntimeState;
  actions: IslandUpdateActions;
}

export function createIslandUpdateHandlers(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

  function handleModeRequest(requestedMode: IslandMode) {
    actions.setMode(requestedMode, false);
  }

  function handleMediaUpdate(snapshot: MediaSnapshot) {
    if (!snapshot.active) {
      const hadVisibleMedia = runtime.systemMediaActive || runtime.mediaExiting;

      runtime.systemMediaActive = false;
      runtime.mediaControllable = false;
      runtime.playing = false;
      actions.cancelMediaEnterTransition();

      if (runtime.privacyState.active && runtime.mode === "expanded") {
        actions.setMode("privacy");
      } else if (!runtime.privacyState.active && (runtime.mode === "hover" || runtime.mode === "expanded")) {
        actions.setMode(runtime.mode === "expanded" && actions.hasClipboardCard() ? "clipboard" : "idle");
      }

      if (hadVisibleMedia && !runtime.privacyState.active) {
        actions.startMediaExitTransition();
        runtime.lastPlaybackSyncTime = window.performance.now();
      } else {
        actions.cancelMediaExitTransition();
        actions.clearInactiveMediaState();
      }

      actions.queueSync();
      return;
    }

    const shouldEnterMedia = !runtime.privacyState.active && (!runtime.systemMediaActive || runtime.mediaExiting);
    actions.cancelMediaExitTransition();
    runtime.systemMediaActive = true;
    runtime.mediaControllable = snapshot.controllable !== false;
    runtime.track = {
      title: snapshot.title || "Unknown Title",
      artist: snapshot.artist || snapshot.sourceApp || "Unknown Artist",
      cover: snapshot.cover,
      durationSeconds: Math.max(1, snapshot.durationSeconds || runtime.track.durationSeconds)
    };
    runtime.playing = snapshot.playing;
    if (typeof snapshot.favorited === "boolean") {
      runtime.favorited = snapshot.favorited;
    }
    runtime.lyrics = Array.isArray(snapshot.lyrics) ? snapshot.lyrics : [];

    if (!runtime.draggingProgress) {
      runtime.progressSeconds = actions.clampProgressSeconds(snapshot.positionSeconds || 0);
    }

    runtime.lastPlaybackSyncTime = window.performance.now();
    if (shouldEnterMedia) {
      actions.startMediaEnterTransition();
    }
    actions.queueSync();
  }

  function handlePrivacyUpdate(snapshot: PrivacySnapshot) {
    const previousPrivacyActive = runtime.wasPrivacyActive;
    const previousMode = runtime.mode;
    const nextPrivacyState: PrivacySnapshot = {
      available: Boolean(snapshot?.available),
      active: Boolean(snapshot?.active),
      kind: snapshot?.kind || "none",
      activeKinds: Array.isArray(snapshot?.activeKinds) ? snapshot.activeKinds : [],
      apps: Array.isArray(snapshot?.apps) ? snapshot.apps : [],
      updatedAt: Number(snapshot?.updatedAt || 0)
    };
    const shouldHandOffFromMedia =
      !previousPrivacyActive &&
      nextPrivacyState.active &&
      runtime.systemMediaActive &&
      (previousMode === "idle" || previousMode === "peek" || previousMode === "hover");
    const shouldHandBackToMedia =
      previousPrivacyActive &&
      !nextPrivacyState.active &&
      runtime.systemMediaActive &&
      (runtime.mode === "privacy" || runtime.mode === "privacy-expanded");

    if (shouldHandBackToMedia) {
      runtime.pendingPrivacySnapshot = nextPrivacyState;
      runtime.privacyExpanded = false;
      const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
      actions.startPriorityTransition(PRIORITY_TRANSITION_PRIVACY_TO_MEDIA, PRIVACY_PRIORITY_TRANSITION_MS, () => {
        if (runtime.pendingPrivacySnapshot) {
          runtime.privacyState = runtime.pendingPrivacySnapshot;
          runtime.pendingPrivacySnapshot = undefined;
        }

        runtime.wasPrivacyActive = runtime.privacyState.active;
        runtime.privacyReturnMode = "idle";
        actions.setMode(restoreMode || "idle");
      });
      actions.setMode("privacy");
      actions.queueSync();
      return;
    }

    runtime.pendingPrivacySnapshot = undefined;
    runtime.privacyState = nextPrivacyState;
    runtime.wasPrivacyActive = runtime.privacyState.active;

    if (runtime.privacyState.active) {
      const userSelectedForeground =
        runtime.mode === "clipboard" ||
        runtime.mode === "clipboard-prompt" ||
        (previousPrivacyActive && runtime.mode === "expanded");

      if (!previousPrivacyActive && runtime.mode !== "privacy" && runtime.mode !== "privacy-expanded" && runtime.mode !== "peek") {
        runtime.privacyReturnMode = runtime.mode;
      }

      if (shouldHandOffFromMedia) {
        actions.startPriorityTransition(PRIORITY_TRANSITION_MEDIA_TO_PRIVACY);
      } else if (!previousPrivacyActive) {
        actions.clearPriorityTransition();
      }

      if (!userSelectedForeground) {
        actions.setMode(runtime.privacyExpanded ? "privacy-expanded" : "privacy");
      }
    } else {
      runtime.privacyExpanded = false;
      actions.clearPriorityTransition();
      if (runtime.mode === "privacy" || runtime.mode === "privacy-expanded" || runtime.mode === "peek") {
        const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
        runtime.privacyReturnMode = "idle";
        actions.setMode(restoreMode);
      }
    }

    actions.queueSync();
  }

  function handleClipboardUpdate(snapshot: ClipboardSnapshot) {
    const previousPendingId = runtime.clipboardSnapshot.pending?.id || "";
    const nextClipboardSnapshot = normalizeClipboardSnapshotFromController(snapshot);
    const nextPendingId = nextClipboardSnapshot.pending?.id || "";

    runtime.clipboardSnapshot = nextClipboardSnapshot;

    if (
      runtime.mode === "clipboard" &&
      !actions.hasClipboardItems() &&
      !actions.getPendingClipboardItem() &&
      !runtime.clipboardAccepting &&
      !runtime.clipboardAcceptedItem
    ) {
      actions.setMode(actions.getClipboardFallbackMode());
      return;
    }

    if (runtime.mode === "clipboard") {
      actions.queueSync();
      return;
    }

    if (nextPendingId && nextPendingId !== previousPendingId && actions.canShowClipboardPrompt()) {
      actions.showClipboardPrompt();
    } else {
      actions.queueSync();
    }
  }

  function handleSystemUpdate(snapshot: SystemSnapshot) {
    runtime.systemSnapshot = normalizeSystemSnapshot(snapshot);
    actions.queueSync();
  }

  function handlePlaybackTick() {
    const now = window.performance.now();

    if (runtime.systemMediaActive && runtime.playing && !runtime.draggingProgress) {
      const elapsedSeconds = Math.max(0, Math.min((now - runtime.lastPlaybackSyncTime) / 1000, 1));
      actions.setProgress(runtime.progressSeconds + elapsedSeconds);
    }

    runtime.lastPlaybackSyncTime = now;
  }

  return {
    handleClipboardUpdate,
    handleMediaUpdate,
    handleModeRequest,
    handlePlaybackTick,
    handlePrivacyUpdate,
    handleSystemUpdate
  };
}
