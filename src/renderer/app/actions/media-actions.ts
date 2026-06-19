import type { RendererRuntimeState } from "../runtime-state";
import {
  clampProgressSecondsForTrack,
  formatMediaTime,
  getActiveLyricIndexForProgress,
  getDisplayedLyricsForState,
  getProgressPercent,
  getProgressSecondsFromPointerPosition
} from "../controllers/media-controller";

interface MediaActionsOptions {
  runtime: RendererRuntimeState;
  island?: Window["island"];
  queueSync(): void;
}

export function createMediaActions(options: MediaActionsOptions) {
  const { runtime, island, queueSync } = options;

  function formatTime(totalSeconds: number) {
    return formatMediaTime(totalSeconds);
  }

  function progressPercent() {
    return getProgressPercent(runtime.progressSeconds, runtime.track.durationSeconds);
  }

  function clampProgressSeconds(seconds: number) {
    return clampProgressSecondsForTrack(seconds, runtime.track);
  }

  function getProgressSecondsFromPointer(event: PointerEvent, progressTrack: HTMLElement) {
    return getProgressSecondsFromPointerPosition(event, progressTrack, runtime.track);
  }

  function setProgressPreview(seconds: number) {
    runtime.progressSeconds = clampProgressSeconds(seconds);
    queueSync();
  }

  function getActiveLyricIndex() {
    return getActiveLyricIndexForProgress(runtime.lyrics, runtime.progressSeconds);
  }

  function getDisplayedLyrics() {
    return getDisplayedLyricsForState(runtime.lyrics, runtime.systemMediaActive);
  }

  async function setRendererInteracting(interacting: boolean) {
    try {
      await island?.setInteracting(interacting);
    } catch {
      // Best effort only.
    }
  }

  async function commitProgress(seconds: number) {
    const nextSeconds = clampProgressSeconds(seconds);
    setProgressPreview(nextSeconds);

    if (runtime.systemMediaActive && runtime.mediaControllable) {
      return island?.seekMedia(nextSeconds);
    }

    return undefined;
  }

  function togglePlay() {
    if (!runtime.systemMediaActive || !runtime.mediaControllable) {
      return;
    }

    runtime.playing = !runtime.playing;
    queueSync();
    void island?.controlMedia("toggle-play");
  }

  function skipTrack(action: "previous-track" | "next-track") {
    if (!runtime.systemMediaActive || !runtime.mediaControllable) {
      return;
    }

    runtime.playing = true;
    runtime.progressSeconds = 0;
    queueSync();
    void island?.controlMedia(action);
  }

  async function toggleFavorite() {
    if (!runtime.systemMediaActive || !runtime.mediaControllable) {
      return;
    }

    const previousFavorited = runtime.favorited;
    runtime.favorited = !runtime.favorited;
    queueSync();

    const result = await island?.controlMedia("favorite-track");
    if (typeof result?.favorited === "boolean") {
      runtime.favorited = result.favorited;
      queueSync();
      return;
    }

    if (result?.ok === false) {
      runtime.favorited = previousFavorited;
      queueSync();
    }
  }

  function setProgress(seconds: number, syncSystem = false) {
    setProgressPreview(seconds);

    if (syncSystem && runtime.systemMediaActive && runtime.mediaControllable) {
      void island?.seekMedia(runtime.progressSeconds);
    }
  }

  return {
    clampProgressSeconds,
    commitProgress,
    formatTime,
    getActiveLyricIndex,
    getDisplayedLyrics,
    getProgressSecondsFromPointer,
    progressPercent,
    setProgress,
    setProgressPreview,
    setRendererInteracting,
    skipTrack,
    toggleFavorite,
    togglePlay
  };
}
