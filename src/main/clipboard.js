const { clipboard } = require("electron");
const { createNativeClipboardListener } = require("./native-clipboard");

const CLIPBOARD_FALLBACK_POLL_INTERVAL = 750;
const MAX_CLIPBOARD_ITEMS = 12;
const MAX_CLIPBOARD_TEXT_LENGTH = 6000;
const MAX_CLIPBOARD_PREVIEW_LENGTH = 160;

function normalizeClipboardText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_CLIPBOARD_TEXT_LENGTH);
}

function createClipboardPreview(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CLIPBOARD_PREVIEW_LENGTH);
}

function createClipboardItem(text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    preview: createClipboardPreview(text),
    copiedAt: Date.now()
  };
}

function createClipboardMonitor(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  let pollTimer;
  let nativeListener;
  let lastText = "";
  let pendingItem;
  let items = [];

  function buildSnapshot(item) {
    return {
      active: Boolean(item),
      text: item?.text || "",
      preview: item?.preview || "",
      pending: pendingItem,
      items,
      updatedAt: Date.now()
    };
  }

  function rememberText(text) {
    const normalizedText = normalizeClipboardText(text);

    if (!normalizedText) {
      return undefined;
    }

    items = [
      createClipboardItem(normalizedText),
      ...items.filter((item) => item.text !== normalizedText)
    ].slice(0, MAX_CLIPBOARD_ITEMS);

    return items[0];
  }

  function commitText(text) {
    const item = rememberText(text);
    if (!item) {
      return;
    }

    pendingItem = undefined;
    logStartup("clipboard-commit", {
      length: item.text.length,
      preview: item.preview
    });
    emitSnapshot(buildSnapshot(item));
  }

  function emitPendingText(text, source) {
    const normalizedText = normalizeClipboardText(text);

    if (!normalizedText) {
      return;
    }

    pendingItem = createClipboardItem(normalizedText);
    logStartup("clipboard-pending", {
      source,
      length: pendingItem.text.length,
      preview: pendingItem.preview
    });
    emitSnapshot(buildSnapshot(pendingItem));
  }

  function handleIncomingText(text, source) {
    const normalizedText = normalizeClipboardText(text);

    if (!normalizedText || normalizedText === lastText) {
      return;
    }

    lastText = normalizedText;
    emitPendingText(normalizedText, source);
  }

  function poll() {
    const text = normalizeClipboardText(clipboard.readText());

    handleIncomingText(text, "fallback-poll");
  }

  function startFallbackPolling() {
    if (pollTimer) {
      return;
    }

    pollTimer = setInterval(poll, CLIPBOARD_FALLBACK_POLL_INTERVAL);
    logStartup("clipboard-fallback-polling", {
      interval: CLIPBOARD_FALLBACK_POLL_INTERVAL
    });
  }

  function stopFallbackPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function start() {
    if (nativeListener || pollTimer) {
      return;
    }

    lastText = normalizeClipboardText(clipboard.readText());

    if (process.platform === "win32") {
      nativeListener = createNativeClipboardListener({
        logStartup,
        onText: handleIncomingText,
        onReady: stopFallbackPolling,
        onUnavailable: startFallbackPolling
      });

      const nativeStarted = nativeListener.start();
      if (nativeStarted) {
        return;
      }
    }

    startFallbackPolling();
  }

  function stop() {
    stopFallbackPolling();
    nativeListener?.stop();
    nativeListener = undefined;
  }

  function writeText(text) {
    const normalizedText = normalizeClipboardText(text);

    if (!normalizedText) {
      return { ok: false, error: "Clipboard text is empty." };
    }

    clipboard.writeText(normalizedText);
    lastText = normalizedText;
    commitText(normalizedText);
    return { ok: true };
  }

  function acceptPending(id) {
    if (!pendingItem || (id && pendingItem.id !== id)) {
      return { ok: false, error: "No pending clipboard item." };
    }

    commitText(pendingItem.text);
    return { ok: true };
  }

  function dismissPending(id) {
    if (!pendingItem || (id && pendingItem.id !== id)) {
      return { ok: true };
    }

    pendingItem = undefined;
    emitSnapshot(buildSnapshot(items[0]));
    return { ok: true };
  }

  function clearItems() {
    items = [];
    emitSnapshot(buildSnapshot(undefined));
    return { ok: true };
  }

  function removeItem(id) {
    if (!id) {
      return { ok: false, error: "Clipboard item id is required." };
    }

    const previousLength = items.length;
    items = items.filter((item) => item.id !== id);

    if (items.length !== previousLength) {
      emitSnapshot(buildSnapshot(items[0]));
    }

    return { ok: true };
  }

  function getSnapshot() {
    return buildSnapshot(items[0]);
  }

  return {
    start,
    stop,
    writeText,
    acceptPending,
    dismissPending,
    clearItems,
    removeItem,
    getSnapshot
  };
}

module.exports = {
  createClipboardMonitor
};
