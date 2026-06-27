const fs = require("node:fs");
const path = require("node:path");
const { clipboard } = require("electron");
const { getUserDataPath } = require("./app-paths");
const { createNativeClipboardListener } = require("./native-clipboard");

const CLIPBOARD_FALLBACK_POLL_INTERVAL = 750;
const CLIPBOARD_HISTORY_FILE_NAME = "clipboard-history.json";
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

function normalizeClipboardHistoryItem(raw) {
  const text = normalizeClipboardText(raw?.text);

  if (!text) {
    return undefined;
  }

  const copiedAt = Number(raw?.copiedAt);
  return {
    id: typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 120) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    preview: createClipboardPreview(text),
    copiedAt: Number.isFinite(copiedAt) && copiedAt > 0 ? copiedAt : Date.now()
  };
}

function sanitizeClipboardHistoryItems(rawItems) {
  const deduped = [];
  const seenTexts = new Set();

  if (!Array.isArray(rawItems)) {
    return deduped;
  }

  for (const rawItem of rawItems) {
    const item = normalizeClipboardHistoryItem(rawItem);

    if (!item || seenTexts.has(item.text)) {
      continue;
    }

    deduped.push(item);
    seenTexts.add(item.text);

    if (deduped.length >= MAX_CLIPBOARD_ITEMS) {
      break;
    }
  }

  return deduped;
}

function createClipboardHistoryPayload(items) {
  return {
    version: 1,
    items: sanitizeClipboardHistoryItems(items).map((item) => ({
      id: item.id,
      text: item.text,
      copiedAt: item.copiedAt
    }))
  };
}

function getClipboardHistoryPath(historyPath) {
  if (typeof historyPath === "string" && historyPath.trim()) {
    return historyPath;
  }

  return path.join(getUserDataPath(), CLIPBOARD_HISTORY_FILE_NAME);
}

function readClipboardHistory(historyPath, logStartup = () => {}) {
  try {
    const payload = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const items = sanitizeClipboardHistoryItems(Array.isArray(payload) ? payload : payload?.items);

    if (items.length > 0) {
      logStartup("clipboard-history-loaded", { count: items.length });
    }

    return items;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logStartup("clipboard-history-read-failed", {
        message: error?.message || String(error)
      });
    }

    return [];
  }
}

function writeClipboardHistory(historyPath, items, logStartup = () => {}) {
  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    const tempPath = `${historyPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(createClipboardHistoryPayload(items), null, 2), "utf8");
    fs.renameSync(tempPath, historyPath);
  } catch (error) {
    logStartup("clipboard-history-write-failed", {
      message: error?.message || String(error)
    });
  }
}

function createClipboardMonitor(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const clipboardApi = options.clipboardApi || clipboard;
  const historyPath = getClipboardHistoryPath(options.historyPath);
  const platform = options.platform || process.platform;
  const nativeClipboardListenerFactory = options.createNativeClipboardListener || createNativeClipboardListener;
  let pollTimer;
  let nativeListener;
  let historyLoaded = false;
  let initialSnapshotEmitted = false;
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
    ensureHistoryLoaded();
    const normalizedText = normalizeClipboardText(text);

    if (!normalizedText) {
      return undefined;
    }

    items = [
      createClipboardItem(normalizedText),
      ...items.filter((item) => item.text !== normalizedText)
    ].slice(0, MAX_CLIPBOARD_ITEMS);

    writeClipboardHistory(historyPath, items, logStartup);
    return items[0];
  }

  function ensureHistoryLoaded() {
    if (historyLoaded) {
      return;
    }

    items = readClipboardHistory(historyPath, logStartup);
    historyLoaded = true;
  }

  function emitInitialSnapshot() {
    if (initialSnapshotEmitted) {
      return;
    }

    initialSnapshotEmitted = true;
    if (items.length > 0) {
      emitSnapshot(buildSnapshot(items[0]));
    }
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
    const text = normalizeClipboardText(clipboardApi.readText());

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

    ensureHistoryLoaded();
    emitInitialSnapshot();
    lastText = normalizeClipboardText(clipboardApi.readText());

    if (platform === "win32") {
      nativeListener = nativeClipboardListenerFactory({
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

    clipboardApi.writeText(normalizedText);
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
    ensureHistoryLoaded();
    items = [];
    writeClipboardHistory(historyPath, items, logStartup);
    emitSnapshot(buildSnapshot(undefined));
    return { ok: true };
  }

  function removeItem(id) {
    if (!id) {
      return { ok: false, error: "Clipboard item id is required." };
    }

    ensureHistoryLoaded();
    const previousLength = items.length;
    items = items.filter((item) => item.id !== id);

    if (items.length !== previousLength) {
      writeClipboardHistory(historyPath, items, logStartup);
      emitSnapshot(buildSnapshot(items[0]));
    }

    return { ok: true };
  }

  function getSnapshot() {
    ensureHistoryLoaded();
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
  createClipboardMonitor,
  readClipboardHistory,
  sanitizeClipboardHistoryItems,
  writeClipboardHistory
};
