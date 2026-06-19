import type { RendererRuntimeState } from "../runtime-state";
import { formatClipboardTimestamp } from "../controllers/clipboard-controller";

interface ClipboardActionsOptions {
  runtime: RendererRuntimeState;
  island?: Window["island"];
  queueSync(): void;
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
}

export function createClipboardActions(options: ClipboardActionsOptions) {
  const { runtime, island, queueSync, setMode } = options;

  function canUseClipboardCard() {
    return true;
  }

  function canShowClipboardPrompt() {
    return (
      runtime.mode === "idle" ||
      runtime.mode === "peek" ||
      runtime.mode === "hover" ||
      runtime.mode === "privacy" ||
      runtime.mode === "privacy-expanded" ||
      runtime.mode === "clipboard-prompt"
    );
  }

  function hasClipboardItems() {
    return runtime.clipboardSnapshot.items.length > 0;
  }

  function getPendingClipboardItem() {
    return runtime.clipboardSnapshot.pending;
  }

  function getClipboardPreviewText() {
    const pendingItem = getPendingClipboardItem();
    return pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
  }

  function clearClipboardPromptTimer() {
    if (runtime.clipboardPromptTimer !== undefined) {
      window.clearTimeout(runtime.clipboardPromptTimer);
      runtime.clipboardPromptTimer = undefined;
    }
  }

  function getClipboardPromptRestoreMode() {
    if (runtime.privacyState.active) {
      return "privacy";
    }

    if (runtime.systemMediaActive && !runtime.privacyState.active) {
      return "idle";
    }

    if (
      runtime.clipboardReturnMode === "clipboard-prompt" ||
      runtime.clipboardReturnMode === "clipboard" ||
      runtime.clipboardReturnMode === "expanded"
    ) {
      return "idle";
    }

    return runtime.clipboardReturnMode || "idle";
  }

  function getClipboardFallbackMode() {
    return runtime.privacyState.active ? "privacy" : "idle";
  }

  function hideClipboardPrompt(restoreMode = true) {
    clearClipboardPromptTimer();

    if (!runtime.clipboardPromptVisible && runtime.mode !== "clipboard-prompt") {
      return;
    }

    runtime.clipboardPromptVisible = false;

    if (restoreMode && runtime.mode === "clipboard-prompt") {
      const nextMode = getClipboardPromptRestoreMode();
      runtime.clipboardReturnMode = "idle";
      setMode(nextMode);
    } else {
      queueSync();
    }
  }

  function dismissClipboardPrompt(restoreMode = true) {
    const pendingId = getPendingClipboardItem()?.id || "";
    hideClipboardPrompt(restoreMode);
    void island?.dismissClipboardPending(pendingId);
  }

  function showClipboardPrompt() {
    if (!canShowClipboardPrompt() || !getPendingClipboardItem() || runtime.mode === "clipboard") {
      return;
    }

    clearClipboardPromptTimer();
    runtime.clipboardPromptVisible = true;
    runtime.clipboardReturnMode = runtime.mode === "clipboard-prompt" ? runtime.clipboardReturnMode : runtime.mode;
    setMode("clipboard-prompt");
    runtime.clipboardPromptTimer = window.setTimeout(() => {
      dismissClipboardPrompt(true);
    }, 3000);
    queueSync();
  }

  function openClipboardCard() {
    if (!canUseClipboardCard() || (!hasClipboardItems() && !getPendingClipboardItem())) {
      return;
    }

    hideClipboardPrompt(false);
    setMode("clipboard");
  }

  async function acceptClipboardPrompt(restoreAfterAccept = false) {
    const pendingItem = getPendingClipboardItem();
    const pendingId = pendingItem?.id || "";
    if (!pendingId) {
      dismissClipboardPrompt(true);
      return;
    }

    const restoreMode = getClipboardPromptRestoreMode();
    hideClipboardPrompt(false);

    if (runtime.mode !== "clipboard") {
      await island?.acceptClipboardPending(pendingId);
      runtime.clipboardReturnMode = "idle";
      setMode(restoreAfterAccept ? restoreMode : "clipboard");
      return;
    }

    if (runtime.clipboardAccepting || runtime.clipboardAcceptedItem) {
      return;
    }

    runtime.clipboardAccepting = true;
    runtime.clipboardAcceptPreview = pendingItem?.preview || pendingItem?.text.replace(/\s+/g, " ").trim() || "";
    runtime.clipboardAcceptedItem = pendingItem;
    queueSync();

    if (runtime.clipboardAcceptTimer !== undefined) {
      window.clearTimeout(runtime.clipboardAcceptTimer);
    }

    await island?.acceptClipboardPending(pendingId);
    runtime.clipboardReturnMode = "idle";

    if (restoreAfterAccept) {
      runtime.clipboardAccepting = false;
      runtime.clipboardAcceptPreview = "";
      runtime.clipboardAcceptedItem = undefined;
      setMode(restoreMode);
      return;
    }

    runtime.clipboardAcceptTimer = window.setTimeout(() => {
      runtime.clipboardAcceptTimer = undefined;
      runtime.clipboardAccepting = false;
      runtime.clipboardAcceptPreview = "";
      queueSync();
    }, 540);
  }

  function rejectClipboardPrompt() {
    const restoreMode = getClipboardPromptRestoreMode();
    dismissClipboardPrompt(false);
    runtime.clipboardReturnMode = "idle";
    setMode(restoreMode);
  }

  function formatClipboardTime(timestamp: number) {
    return formatClipboardTimestamp(timestamp);
  }

  async function copyClipboardText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    await island?.writeClipboardText(trimmed);
  }

  function clearClipboardDeleteTimer() {
    if (runtime.clipboardDeleteTimer !== undefined) {
      window.clearTimeout(runtime.clipboardDeleteTimer);
      runtime.clipboardDeleteTimer = undefined;
    }

    runtime.clipboardDeletePointerId = undefined;
    runtime.clipboardDeleteItemId = "";
  }

  function getClipboardItemById(itemId: string) {
    return runtime.clipboardSnapshot.items.find((item) => item.id === itemId);
  }

  function getAcceptedClipboardItem() {
    if (!runtime.clipboardAcceptedItem) {
      return undefined;
    }

    return (
      runtime.clipboardSnapshot.items.find((item) => item.id === runtime.clipboardAcceptedItem?.id) ||
      runtime.clipboardSnapshot.items.find((item) => item.text === runtime.clipboardAcceptedItem?.text) ||
      runtime.clipboardAcceptedItem
    );
  }

  function clearAcceptedClipboardSurface() {
    if (runtime.clipboardAcceptTimer !== undefined) {
      window.clearTimeout(runtime.clipboardAcceptTimer);
      runtime.clipboardAcceptTimer = undefined;
    }

    runtime.clipboardAccepting = false;
    runtime.clipboardAcceptPreview = "";
    runtime.clipboardAcceptedItem = undefined;
  }

  function openClipboardDeleteDialog(itemId: string) {
    if (!getClipboardItemById(itemId)) {
      return;
    }

    runtime.clipboardDeleteDialogItemId = itemId;
    queueSync();
  }

  function closeClipboardDeleteDialog() {
    if (!runtime.clipboardDeleteDialogItemId) {
      return;
    }

    runtime.clipboardDeleteDialogItemId = "";
    queueSync();
  }

  function confirmClipboardDelete() {
    const deleteId = runtime.clipboardDeleteDialogItemId;
    runtime.clipboardDeleteDialogItemId = "";

    if (deleteId) {
      const acceptedItem = getAcceptedClipboardItem();
      if (acceptedItem?.id === deleteId) {
        clearAcceptedClipboardSurface();
      }
      void island?.removeClipboardItem(deleteId);
    }

    queueSync();
  }

  function scheduleClipboardItemDelete(itemId: string, pointerId: number) {
    clearClipboardDeleteTimer();

    if (!itemId) {
      return;
    }

    runtime.clipboardDeleteItemId = itemId;
    runtime.clipboardDeletePointerId = pointerId;
    runtime.clipboardDeleteTimer = window.setTimeout(() => {
      const deleteId = runtime.clipboardDeleteItemId;
      clearClipboardDeleteTimer();
      if (deleteId) {
        openClipboardDeleteDialog(deleteId);
      }
    }, 650);
  }

  return {
    acceptClipboardPrompt,
    canShowClipboardPrompt,
    canUseClipboardCard,
    clearAcceptedClipboardSurface,
    clearClipboardDeleteTimer,
    closeClipboardDeleteDialog,
    confirmClipboardDelete,
    copyClipboardText,
    dismissClipboardPrompt,
    formatClipboardTime,
    getAcceptedClipboardItem,
    getClipboardFallbackMode,
    getClipboardItemById,
    getClipboardPreviewText,
    getPendingClipboardItem,
    hasClipboardItems,
    hideClipboardPrompt,
    openClipboardCard,
    openClipboardDeleteDialog,
    rejectClipboardPrompt,
    scheduleClipboardItemDelete,
    showClipboardPrompt
  };
}
