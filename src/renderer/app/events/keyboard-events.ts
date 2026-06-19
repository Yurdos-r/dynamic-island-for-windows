import type { RendererEventContext } from "./event-context";

function registerClipboardAndPrivacyKeyboardEvents(context: RendererEventContext) {
  window.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement as HTMLElement | null;

    if (activeElement?.closest(".clipboard-prompt-layer") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      context.openClipboardCard();
      return;
    }

    if (!context.privacyState.active || !activeElement?.closest(".privacy-strip")) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      context.togglePrivacyDetail();
    }
  });
}

function registerMediaAndModeKeyboardEvents(context: RendererEventContext) {
  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;

    if (context.mode === "expanded" && target.closest(".progress-track")) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void context.commitProgress(context.progressSeconds - 5);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        void context.commitProgress(context.progressSeconds + 5);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        void context.commitProgress(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        void context.commitProgress(context.track.durationSeconds);
        return;
      }
    }

    if (event.key === "Escape") {
      context.setMode("idle");
    }
  });
}

export function registerKeyboardEvents(context: RendererEventContext) {
  registerClipboardAndPrivacyKeyboardEvents(context);
  registerMediaAndModeKeyboardEvents(context);
}
