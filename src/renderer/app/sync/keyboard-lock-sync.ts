import { setText } from "./dom-text";
import type { ViewSyncContext } from "./view-sync-context";

export function syncKeyboardLockHint(context: ViewSyncContext) {
  const hint = context.keyboardLockHint;
  setText(context, '[data-field="keyboard-lock-label"]', hint?.label || "键盘状态");
  setText(context, '[data-field="keyboard-lock-state"]', hint?.statusText || "");

  context.app.querySelectorAll<HTMLElement>(".keyboard-lock-layer").forEach((layer) => {
    layer.setAttribute("aria-label", hint ? `${hint.label} ${hint.statusText}` : "键盘状态提示");
  });
}
