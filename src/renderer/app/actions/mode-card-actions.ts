import type { RendererRuntimeState } from "../runtime-state";
import {
  getAvailableCardModesForState,
  isCardMode as isCardModeFromController
} from "../controllers/mode-controller";

export interface ClipboardAvailability {
  canUseClipboardCard(): boolean;
  hasClipboardItems(): boolean;
  getPendingClipboardItem(): unknown;
}

interface ModeCardActionsOptions {
  runtime: RendererRuntimeState;
  clipboard: ClipboardAvailability;
  setMode(mode: IslandMode): void;
}

export function createModeCardActions(options: ModeCardActionsOptions) {
  const { runtime, clipboard, setMode } = options;

  function hasMusicCard() {
    return runtime.systemMediaActive || runtime.mediaEntering || runtime.mediaExiting;
  }

  function hasPrivacyIsland() {
    return runtime.privacyState.active;
  }

  function hasClipboardCard() {
    return clipboard.canUseClipboardCard() && (clipboard.hasClipboardItems() || Boolean(clipboard.getPendingClipboardItem()));
  }

  function hasSystemCard() {
    return runtime.layout === "top-center" && runtime.systemMonitorEnabled;
  }

  function isIdleSystemActive() {
    return hasSystemCard() && !hasMusicCard() && !hasPrivacyIsland() && !clipboard.hasClipboardItems() && !clipboard.getPendingClipboardItem();
  }

  function getAvailableCardModes(): IslandMode[] {
    return getAvailableCardModesForState({
      hasClipboardCard: hasClipboardCard(),
      hasMusicCard: hasMusicCard(),
      hasPrivacyIsland: hasPrivacyIsland(),
      hasSystemCard: hasSystemCard(),
      systemMediaActive: runtime.systemMediaActive
    });
  }

  function isCardMode(nextMode: IslandMode = runtime.mode) {
    return isCardModeFromController(nextMode);
  }

  function switchCardPage(direction: number) {
    if (!isCardMode() || runtime.clipboardDeleteDialogItemId || runtime.draggingProgress) {
      return false;
    }

    const now = window.performance.now();
    if (now < runtime.cardWheelLockedUntil) {
      return true;
    }

    const cardModes = getAvailableCardModes();
    if (cardModes.length < 2) {
      return false;
    }

    const currentIndex = Math.max(0, cardModes.indexOf(runtime.mode));
    const offset = direction > 0 ? 1 : -1;
    const nextIndex = (currentIndex + offset + cardModes.length) % cardModes.length;
    runtime.cardWheelLockedUntil = now + 420;
    setMode(cardModes[nextIndex]);
    return true;
  }

  return {
    getAvailableCardModes,
    hasClipboardCard,
    hasMusicCard,
    hasPrivacyIsland,
    hasSystemCard,
    isCardMode,
    isIdleSystemActive,
    switchCardPage
  };
}
