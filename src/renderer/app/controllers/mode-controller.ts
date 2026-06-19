interface ModeResolutionState {
  privacyActive: boolean;
  systemMediaActive: boolean;
}

interface CardAvailability {
  hasClipboardCard: boolean;
  hasMusicCard: boolean;
  hasPrivacyIsland: boolean;
  hasSystemCard: boolean;
  systemMediaActive: boolean;
}

export function resolveRendererModeForMediaState(nextMode: IslandMode, state: ModeResolutionState) {
  if (nextMode === "clipboard" || nextMode === "clipboard-prompt" || nextMode === "settings" || nextMode === "system") {
    return nextMode;
  }

  if (nextMode === "privacy" || nextMode === "privacy-expanded") {
    return state.privacyActive ? nextMode : "idle";
  }

  if (nextMode === "hover" || nextMode === "expanded") {
    return state.systemMediaActive ? nextMode : "idle";
  }

  return nextMode;
}

export function getAvailableCardModesForState(availability: CardAvailability): IslandMode[] {
  const modes: IslandMode[] = [];

  if (availability.hasMusicCard) {
    modes.push("expanded");
  }

  if (availability.hasPrivacyIsland) {
    modes.push("privacy-expanded");
  }

  if (availability.hasClipboardCard) {
    modes.push("clipboard");
  }

  if (availability.hasSystemCard && !availability.systemMediaActive) {
    modes.push("system");
  }

  return modes;
}

export function isCardMode(mode: IslandMode) {
  return mode === "expanded" || mode === "privacy-expanded" || mode === "clipboard" || mode === "settings" || mode === "system";
}

export function isTransparentIdleMode(mode: IslandMode) {
  return mode === "idle" || mode === "peek" || mode === "clipboard-prompt";
}

export function isCapsuleMode(mode: IslandMode) {
  return mode === "idle" || mode === "peek" || mode === "hover" || mode === "privacy" || mode === "clipboard-prompt";
}
