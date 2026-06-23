import { createClipboardUpdateHandler } from "./updates/clipboard-update-handler";
import { createKeyboardLockUpdateHandler } from "./updates/keyboard-lock-update-handler";
import { createMediaUpdateHandlers } from "./updates/media-update-handler";
import { createPrivacyUpdateHandler } from "./updates/privacy-update-handler";
import { createSystemUpdateHandler } from "./updates/system-update-handler";
import type { IslandUpdateHandlerOptions } from "./updates/update-handler-types";

export function createIslandUpdateHandlers(options: IslandUpdateHandlerOptions) {
  const { actions } = options;
  const { handleMediaUpdate, handlePlaybackTick } = createMediaUpdateHandlers(options);
  const handlePrivacyUpdate = createPrivacyUpdateHandler(options);
  const handleClipboardUpdate = createClipboardUpdateHandler(options);
  const handleKeyboardLockUpdate = createKeyboardLockUpdateHandler(options);
  const handleSystemUpdate = createSystemUpdateHandler(options);

  function handleModeRequest(requestedMode: IslandMode) {
    actions.setMode(requestedMode, false);
  }

  return {
    handleClipboardUpdate,
    handleKeyboardLockUpdate,
    handleMediaUpdate,
    handleModeRequest,
    handlePlaybackTick,
    handlePrivacyUpdate,
    handleSystemUpdate
  };
}
