import { syncSystemView } from "../system-view";
import { syncAppShellDataset } from "./sync/app-shell-sync";
import { syncCardPager } from "./sync/card-pager-sync";
import { syncClipboardSurface } from "./sync/clipboard-sync";
import { syncKeyboardLockHint } from "./sync/keyboard-lock-sync";
import { renderLyricsListView } from "./sync/lyrics-sync";
import { syncMediaSurface } from "./sync/media-sync";
import { syncPrivacyStrip } from "./sync/privacy-sync";
import { syncSettingsSurface } from "./sync/settings-sync";
import type { ViewSyncContext } from "./sync/view-sync-context";

export { renderLyricsListView } from "./sync/lyrics-sync";
export type { ViewSyncContext } from "./sync/view-sync-context";

export function syncRendererView(context: ViewSyncContext) {
  const cardModes = context.getAvailableCardModes();
  const cardIndex = cardModes.indexOf(context.mode);

  syncAppShellDataset(context, cardModes, cardIndex);
  syncMediaSurface(context);
  syncPrivacyStrip(context);
  syncClipboardSurface(context);
  syncKeyboardLockHint(context);
  syncSettingsSurface(context);
  syncSystemView(context.app, context.systemSnapshot);
  syncCardPager(context, cardModes, cardIndex);
}

export function prewarmExpandedLayerView(context: ViewSyncContext) {
  if (context.expandedLayerPrewarmed) {
    return;
  }

  context.expandedLayerPrewarmed = true;
  window.requestAnimationFrame(() => {
    context.app.querySelector<HTMLElement>(".expanded-layer")?.getBoundingClientRect();
  });
}
