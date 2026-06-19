import type { RendererEventContext } from "./event-context";

export function registerPointerEvents(context: RendererEventContext) {
  const app = context.app;

  app.addEventListener("pointerout", (event) => {
    const target = event.target as HTMLElement;
    const privacyTarget = target.closest<HTMLElement>(".privacy-strip");
    if (!privacyTarget) {
      return;
    }

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && privacyTarget.contains(relatedTarget)) {
      return;
    }

    context.collapsePrivacyDetail();
  });

  app.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;

    if ((context.mode === "idle" || context.mode === "peek") && target.closest(".island-shell")) {
      context.scheduleSettingsLongPress(event.pointerId);
    }

    const clipboardRow = target.closest<HTMLElement>(".clipboard-row, .clipboard-confirm-panel[data-ready='true']");
    if (clipboardRow && context.mode === "clipboard") {
      context.scheduleClipboardItemDelete(clipboardRow.dataset.clipboardId || "", event.pointerId);
    }

    const progressTrack = target.closest<HTMLElement>(".progress-track");

    if (context.mode !== "expanded" || !progressTrack) {
      return;
    }

    event.preventDefault();
    context.draggingProgress = true;
    context.pendingSeekSeconds = context.getProgressSecondsFromPointer(event, progressTrack);
    progressTrack.setPointerCapture(event.pointerId);
    void context.setRendererInteracting(true);
    context.setProgressPreview(context.pendingSeekSeconds);
    context.queueSync();
  });

  app.addEventListener("pointermove", (event) => {
    if (context.clipboardDeletePointerId === event.pointerId) {
      context.clearClipboardDeleteTimer();
    }

    if (!context.draggingProgress) {
      return;
    }

    const progressTrack = app.querySelector<HTMLElement>(".progress-track");

    if (!progressTrack) {
      return;
    }

    event.preventDefault();
    context.pendingSeekSeconds = context.getProgressSecondsFromPointer(event, progressTrack);
    context.setProgressPreview(context.pendingSeekSeconds);
  });

  app.addEventListener("pointerup", (event) => {
    if (context.settingsLongPressPointerId === event.pointerId) {
      context.clearSettingsLongPress();
    }

    if (context.clipboardDeletePointerId === event.pointerId) {
      context.clearClipboardDeleteTimer();
    }

    if (!context.draggingProgress) {
      return;
    }

    const progressTrack = app.querySelector<HTMLElement>(".progress-track");
    if (progressTrack?.hasPointerCapture(event.pointerId)) {
      progressTrack.releasePointerCapture(event.pointerId);
    }

    context.draggingProgress = false;
    const commitSeconds = context.pendingSeekSeconds ?? context.progressSeconds;
    context.pendingSeekSeconds = undefined;
    void context.commitProgress(commitSeconds);
    void context.setRendererInteracting(false);
    context.queueSync();
  });

  app.addEventListener("pointercancel", (event) => {
    if (context.settingsLongPressPointerId === event.pointerId) {
      context.clearSettingsLongPress();
    }

    if (context.clipboardDeletePointerId === event.pointerId) {
      context.clearClipboardDeleteTimer();
    }

    if (!context.draggingProgress) {
      return;
    }

    const progressTrack = app.querySelector<HTMLElement>(".progress-track");
    if (progressTrack?.hasPointerCapture(event.pointerId)) {
      progressTrack.releasePointerCapture(event.pointerId);
    }

    context.draggingProgress = false;
    context.pendingSeekSeconds = undefined;
    void context.setRendererInteracting(false);
    context.queueSync();
  });
}
