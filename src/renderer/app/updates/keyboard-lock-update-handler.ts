import { canShowKeyboardLockHint, normalizeKeyboardLockSnapshot } from "../controllers/keyboard-lock-controller";
import { KEYBOARD_LOCK_HINT_DURATION_MS } from "../state";
import type { IslandUpdateHandlerOptions } from "./update-handler-types";

export function createKeyboardLockUpdateHandler(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

  function clearKeyboardLockTimer() {
    if (runtime.keyboardLockTimer !== undefined) {
      window.clearTimeout(runtime.keyboardLockTimer);
      runtime.keyboardLockTimer = undefined;
    }
  }

  function restorePreviousMode() {
    runtime.keyboardLockTimer = undefined;
    runtime.keyboardLockHint = undefined;

    if (runtime.mode === "keyboard-lock") {
      actions.setMode(runtime.keyboardLockReturnMode || "idle");
    } else {
      actions.queueSync();
    }
  }

  function handleKeyboardLockUpdate(snapshot: KeyboardLockSnapshot) {
    const hint = normalizeKeyboardLockSnapshot(snapshot);

    if (!hint || snapshot.initial || !runtime.keyboardLockHintsEnabled || !canShowKeyboardLockHint(runtime.mode)) {
      return;
    }

    if (runtime.mode !== "keyboard-lock") {
      runtime.keyboardLockReturnMode = runtime.mode;
    }

    runtime.keyboardLockHint = hint;
    clearKeyboardLockTimer();
    actions.setMode("keyboard-lock");
    runtime.keyboardLockTimer = window.setTimeout(restorePreviousMode, KEYBOARD_LOCK_HINT_DURATION_MS);
    actions.queueSync();
  }

  return handleKeyboardLockUpdate;
}
