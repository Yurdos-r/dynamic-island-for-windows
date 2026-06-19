import type { RendererEventContext } from "./event-context";

function handleSettingsClick(
  context: RendererEventContext,
  action: string | undefined,
  actionElement: HTMLElement | undefined,
  interactiveTarget: HTMLElement | null
) {
  if (action === "settings-nav") {
    const page = actionElement?.dataset.page;
    if (page === "appearance" || page === "layout" || page === "monitor") {
      context.setSettingsPage(page);
    }
    return;
  }

  if (action === "settings-back") {
    context.setSettingsPage("hub");
    return;
  }

  if (action === "set-glass") {
    const requested = actionElement?.dataset.glass;
    if (context.isGlassStyle(requested)) {
      context.setGlassStyle(requested);
    }
    return;
  }

  if (action === "set-intensity") {
    const requested = actionElement?.dataset.intensity;
    if (context.isGlassIntensity(requested)) {
      context.setGlassIntensity(requested);
    }
    return;
  }

  if (action === "set-layout") {
    const requested = actionElement?.dataset.layout;
    if (context.isLayout(requested)) {
      context.setLayout(requested);
    }
    return;
  }

  if (action === "toggle-system-monitor") {
    context.setSystemMonitorEnabled(!context.systemMonitorEnabled);
    return;
  }

  if (!interactiveTarget) {
    if (context.settingsPage === "hub") {
      context.closeSettings();
    } else {
      context.setSettingsPage("hub");
    }
  }
}

function handleClipboardClick(
  context: RendererEventContext,
  target: HTMLElement,
  action: string | undefined,
  actionElement: HTMLElement | undefined
) {
  if (action === "clipboard-open-card") {
    context.openClipboardCard();
    return true;
  }

  if (action === "clipboard-accept") {
    const fromPromptCapsule = Boolean(target.closest(".clipboard-prompt-layer"));
    void context.acceptClipboardPrompt(fromPromptCapsule && (context.systemMediaActive || context.privacyState.active));
    return true;
  }

  if (action === "clipboard-reject") {
    context.rejectClipboardPrompt();
    return true;
  }

  if (action === "clipboard-clear") {
    context.clearAcceptedClipboardSurface();
    void context.island?.clearClipboardItems();
    if (context.mode === "clipboard") {
      context.setMode(context.getClipboardFallbackMode());
    }
    return true;
  }

  if (action === "clipboard-delete-cancel") {
    context.closeClipboardDeleteDialog();
    return true;
  }

  if (action === "clipboard-delete-confirm") {
    context.confirmClipboardDelete();
    return true;
  }

  if (action === "clipboard-copy") {
    const item =
      context.clipboardSnapshot.items.find((clipboardItem) => clipboardItem.id === actionElement?.dataset.clipboardId) ||
      (actionElement?.classList.contains("clipboard-confirm-panel") ? context.getAcceptedClipboardItem() : undefined);
    void context.copyClipboardText(item?.text || "");
    return true;
  }

  return false;
}

function handleMediaAction(context: RendererEventContext, action: string | undefined) {
  if (action === "toggle-play") {
    context.togglePlay();
    return true;
  }

  if (action === "previous-track") {
    context.skipTrack("previous-track");
    return true;
  }

  if (action === "next-track") {
    context.skipTrack("next-track");
    return true;
  }

  if (action === "favorite-track") {
    void context.toggleFavorite();
    return true;
  }

  return false;
}

function handleModeAction(context: RendererEventContext, action: string | undefined) {
  if (action === "open-quick") {
    if (context.canUseClipboardCard() && context.hasClipboardItems() && !context.systemMediaActive && !context.privacyState.active) {
      context.openClipboardCard();
    } else if (context.systemMediaActive) {
      context.setMode("hover");
    } else if (context.isIdleSystemActive()) {
      context.openSystemCard();
    }
    return true;
  }

  if (action === "open-system") {
    context.openSystemCard();
    return true;
  }

  if (action === "expand") {
    context.setMode("expanded");
    return true;
  }

  if (action === "idle") {
    context.setMode("idle");
    return true;
  }

  return false;
}

export function registerClickEvents(context: RendererEventContext) {
  context.app.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (context.suppressNextClick) {
      context.suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const privacyTarget = target.closest<HTMLElement>(".privacy-strip");
    const interactiveTarget = target.closest<HTMLElement>(
      ".quick-media-controls, .expanded-media-controls, .media-control-button, .progress-track, .clipboard-row, .clipboard-confirm-panel[data-ready='true'], .clipboard-prompt-layer, .clipboard-delete-dialog"
    );
    const islandTarget = target.closest<HTMLElement>(".island-shell");
    const actionElement = target.closest<HTMLElement>("[data-action]") || undefined;
    const action = actionElement?.dataset.action;

    if (context.mode === "settings") {
      handleSettingsClick(context, action, actionElement, interactiveTarget);
      return;
    }

    if (context.mode === "system") {
      context.closeSystemCard();
      return;
    }

    if (privacyTarget && context.privacyState.active) {
      context.togglePrivacyDetail();
      return;
    }

    if (action === "set-glass") {
      const requested = actionElement?.dataset.glass;
      if (context.isGlassStyle(requested)) {
        context.setGlassStyle(requested);
      }
      return;
    }

    if (handleClipboardClick(context, target, action, actionElement)) {
      return;
    }

    if (context.mode === "clipboard-prompt" && islandTarget && context.canUseClipboardCard() && context.getPendingClipboardItem()) {
      context.openClipboardCard();
      return;
    }

    if (islandTarget && !interactiveTarget && context.privacyState.active && context.mode === "privacy") {
      context.togglePrivacyDetail();
      return;
    }

    if (islandTarget && !interactiveTarget && context.canUseClipboardCard() && context.getPendingClipboardItem() && !context.systemMediaActive) {
      context.openClipboardCard();
      return;
    }

    if (islandTarget && !interactiveTarget && context.canUseClipboardCard() && context.hasClipboardItems() && !context.systemMediaActive) {
      context.openClipboardCard();
      return;
    }

    if (islandTarget && !interactiveTarget && context.systemMediaActive) {
      if (context.mode === "idle" || context.mode === "peek") {
        context.setMode("hover");
        return;
      }

      if (context.mode === "hover") {
        context.setMode("expanded");
        return;
      }
    }

    if (!action) {
      if (context.mode === "hover" && target.closest(".hover-layer") && !target.closest(".quick-media-controls")) {
        context.setMode("expanded");
      }

      return;
    }

    handleModeAction(context, action);
    handleMediaAction(context, action);
  });
}
