import { renderLyricsListView } from "./lyrics-sync";
import { setText } from "./dom-text";
import type { ViewSyncContext } from "./view-sync-context";

export function syncMediaSurface(context: ViewSyncContext) {
  setText(context, '[data-field="track-title"]', context.track.title);
  setText(context, '[data-field="track-artist"]', context.track.artist);
  setText(context, '[data-field="elapsed-time"]', context.formatTime(context.progressSeconds));
  setText(context, '[data-field="duration-time"]', context.formatTime(context.track.durationSeconds));
  renderLyricsListView(context);

  const progressTrack = context.app.querySelector<HTMLElement>(".progress-track");
  progressTrack?.setAttribute("aria-valuemax", context.track.durationSeconds.toString());
  progressTrack?.setAttribute("aria-valuenow", Math.round(context.progressSeconds).toString());
  progressTrack?.setAttribute("aria-valuetext", `${context.formatTime(context.progressSeconds)} / ${context.formatTime(context.track.durationSeconds)}`);

  const progressFill = context.app.querySelector<HTMLElement>('[data-field="progress-fill"]');
  if (progressFill) {
    progressFill.style.width = context.progressPercent();
  }

  const albumArt = context.app.querySelector<HTMLElement>(".shared-album-art");
  if (albumArt) {
    albumArt.dataset.hasCover = context.track.cover ? "true" : "false";
    albumArt.style.backgroundImage = context.track.cover ? `url("${context.track.cover}")` : "";
  }

  context.app.querySelectorAll<HTMLButtonElement>(".play-toggle").forEach((button) => {
    button.setAttribute("aria-label", context.playing ? "鏆傚仠" : "鎾斁");
  });

  context.app.querySelectorAll<HTMLButtonElement>('[data-action="favorite-track"]').forEach((button) => {
    button.setAttribute("aria-pressed", context.favorited ? "true" : "false");
  });
}
