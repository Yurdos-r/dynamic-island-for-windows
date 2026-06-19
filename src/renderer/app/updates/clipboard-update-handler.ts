import { normalizeClipboardSnapshot as normalizeClipboardSnapshotFromController } from "../controllers/clipboard-controller";
import type { ClipboardSnapshot } from "../state";
import type { IslandUpdateHandlerOptions } from "./update-handler-types";

export function createClipboardUpdateHandler(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

  function handleClipboardUpdate(snapshot: ClipboardSnapshot) {
    const previousPendingId = runtime.clipboardSnapshot.pending?.id || "";
    const nextClipboardSnapshot = normalizeClipboardSnapshotFromController(snapshot);
    const nextPendingId = nextClipboardSnapshot.pending?.id || "";

    runtime.clipboardSnapshot = nextClipboardSnapshot;

    if (
      runtime.mode === "clipboard" &&
      !actions.hasClipboardItems() &&
      !actions.getPendingClipboardItem() &&
      !runtime.clipboardAccepting &&
      !runtime.clipboardAcceptedItem
    ) {
      actions.setMode(actions.getClipboardFallbackMode());
      return;
    }

    if (runtime.mode === "clipboard") {
      actions.queueSync();
      return;
    }

    if (nextPendingId && nextPendingId !== previousPendingId && actions.canShowClipboardPrompt()) {
      actions.showClipboardPrompt();
    } else {
      actions.queueSync();
    }
  }

  return handleClipboardUpdate;
}
