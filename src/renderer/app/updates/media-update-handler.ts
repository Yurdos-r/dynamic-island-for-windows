import type { IslandUpdateHandlerOptions } from "./update-handler-types";

export function createMediaUpdateHandlers(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

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

  function handlePlaybackTick() {
    const now = window.performance.now();

    if (runtime.systemMediaActive && runtime.playing && !runtime.draggingProgress) {
      const elapsedSeconds = Math.max(0, Math.min((now - runtime.lastPlaybackSyncTime) / 1000, 1));
      actions.setProgress(runtime.progressSeconds + elapsedSeconds);
    }

    runtime.lastPlaybackSyncTime = now;
  }

  return {
    handleMediaUpdate,
    handlePlaybackTick
  };
}
