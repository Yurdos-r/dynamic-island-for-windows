import type { LyricLine, TrackState } from "../state";

export function formatMediaTime(totalSeconds: number) {
  const clampedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function getProgressPercent(progressSeconds: number, durationSeconds: number) {
  return `${Math.round((progressSeconds / Math.max(1, durationSeconds)) * 1000) / 10}%`;
}

export function clampProgressSecondsForTrack(seconds: number, track: TrackState) {
  const numericSeconds = Number.isFinite(seconds) ? seconds : 0;
  return Math.max(0, Math.min(track.durationSeconds, numericSeconds));
}

export function getProgressSecondsFromPointerPosition(event: PointerEvent, progressTrack: HTMLElement, track: TrackState) {
  const rect = progressTrack.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / width));
  return clampProgressSecondsForTrack(ratio * track.durationSeconds, track);
}

export function getActiveLyricIndexForProgress(lyrics: LyricLine[], progressSeconds: number) {
  if (!lyrics.length) {
    return -1;
  }

  const nowMs = progressSeconds * 1000 + 250;
  const nextIndex = lyrics.findIndex((line) => line.timeMs > nowMs);
  return Math.max(0, nextIndex === -1 ? lyrics.length - 1 : nextIndex - 1);
}

export function getDisplayedLyricsForState(lyrics: LyricLine[], systemMediaActive: boolean): LyricLine[] {
  if (lyrics.length) {
    return lyrics;
  }

  return [
    {
      timeMs: 0,
      text: systemMediaActive ? "No synced lyrics" : "Waiting for music",
      translation: ""
    }
  ];
}
