import type { KeyboardLockHint } from "../state";

const KEYBOARD_LOCK_LABELS: Record<KeyboardLockSnapshot["key"], string> = {
  capsLock: "大写锁定",
  numLock: "数字键盘"
};

const KEYBOARD_LOCK_ALLOWED_MODES = new Set<IslandMode>(["idle", "peek", "hover", "keyboard-lock"]);

export function canShowKeyboardLockHint(mode: IslandMode) {
  return KEYBOARD_LOCK_ALLOWED_MODES.has(mode);
}

export function normalizeKeyboardLockSnapshot(snapshot: KeyboardLockSnapshot | undefined): KeyboardLockHint | undefined {
  if (!snapshot || (snapshot.key !== "capsLock" && snapshot.key !== "numLock")) {
    return undefined;
  }

  return {
    key: snapshot.key,
    enabled: Boolean(snapshot.enabled),
    label: KEYBOARD_LOCK_LABELS[snapshot.key],
    statusText: snapshot.enabled ? "已开启" : "已关闭",
    changedAt: Number(snapshot.changedAt || Date.now())
  };
}
