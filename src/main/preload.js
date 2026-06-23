const { contextBridge, ipcRenderer } = require("electron");

const ISLAND_MODE_SET = new Set([
  "idle",
  "peek",
  "clipboard-prompt",
  "privacy",
  "privacy-expanded",
  "hover",
  "keyboard-lock",
  "expanded",
  "clipboard",
  "settings",
  "system"
]);
const MEDIA_CONTROL_ACTION_SET = new Set(["toggle-play", "previous-track", "next-track", "favorite-track"]);
const ISLAND_LAYOUT_SET = new Set(["classic", "top-center"]);
const IPC_CHANNELS = Object.freeze({
  rendererReady: "island:renderer-ready",
  resize: "island:resize",
  getUiSettings: "island:get-ui-settings",
  setLayout: "island:set-layout",
  setSystemMonitor: "island:set-system-monitor",
  setKeyboardLockHints: "island:set-keyboard-lock-hints",
  setStartup: "island:set-startup",
  setInteracting: "island:set-interacting",
  setMode: "island:set-mode",
  avoidScale: "island:avoid-scale",
  layoutChanged: "island:layout-changed",
  mediaControl: "media:control",
  mediaSeek: "media:seek",
  mediaUpdate: "media:update",
  privacyUpdate: "privacy:update",
  clipboardWrite: "clipboard:write",
  clipboardAcceptPending: "clipboard:accept-pending",
  clipboardDismissPending: "clipboard:dismiss-pending",
  clipboardClear: "clipboard:clear",
  clipboardRemove: "clipboard:remove",
  clipboardUpdate: "clipboard:update",
  keyboardLockUpdate: "keyboard-lock:update",
  systemUpdate: "system:update"
});

function safeMode(mode) {
  return ISLAND_MODE_SET.has(mode) ? mode : "idle";
}

function safeMediaAction(action) {
  return MEDIA_CONTROL_ACTION_SET.has(action) ? action : "";
}

function safeLayout(layout) {
  return ISLAND_LAYOUT_SET.has(layout) ? layout : "top-center";
}

contextBridge.exposeInMainWorld("island", {
  ready: () => ipcRenderer.send(IPC_CHANNELS.rendererReady),
  resize: (mode) => ipcRenderer.invoke(IPC_CHANNELS.resize, safeMode(mode)),
  setInteracting: (interacting) => ipcRenderer.invoke(IPC_CHANNELS.setInteracting, Boolean(interacting)),
  controlMedia: (action) => {
    const safeAction = safeMediaAction(action);
    return safeAction ? ipcRenderer.invoke(IPC_CHANNELS.mediaControl, safeAction) : Promise.resolve({ ok: false, available: false });
  },
  seekMedia: (seconds) => ipcRenderer.invoke(IPC_CHANNELS.mediaSeek, Number(seconds)),
  getUiSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getUiSettings),
  setLayout: (layout) => ipcRenderer.invoke(IPC_CHANNELS.setLayout, safeLayout(layout)),
  setSystemMonitor: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setSystemMonitor, Boolean(enabled)),
  setKeyboardLockHints: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setKeyboardLockHints, Boolean(enabled)),
  setStartup: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setStartup, Boolean(enabled)),
  writeClipboardText: (text) => ipcRenderer.invoke(IPC_CHANNELS.clipboardWrite, typeof text === "string" ? text : ""),
  acceptClipboardPending: (id) => ipcRenderer.invoke(IPC_CHANNELS.clipboardAcceptPending, typeof id === "string" ? id : ""),
  dismissClipboardPending: (id) => ipcRenderer.invoke(IPC_CHANNELS.clipboardDismissPending, typeof id === "string" ? id : ""),
  clearClipboardItems: () => ipcRenderer.invoke(IPC_CHANNELS.clipboardClear),
  removeClipboardItem: (id) => ipcRenderer.invoke(IPC_CHANNELS.clipboardRemove, typeof id === "string" ? id : ""),
  onModeRequest: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, mode) => callback(safeMode(mode));
    ipcRenderer.on(IPC_CHANNELS.setMode, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.setMode, listener);
    };
  },
  onAvoidScale: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, scale) => callback(Number(scale));
    ipcRenderer.on(IPC_CHANNELS.avoidScale, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.avoidScale, listener);
    };
  },
  onMediaUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.mediaUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.mediaUpdate, listener);
    };
  },
  onPrivacyUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.privacyUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.privacyUpdate, listener);
    };
  },
  onClipboardUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.clipboardUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.clipboardUpdate, listener);
    };
  },
  onSystemUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.systemUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.systemUpdate, listener);
    };
  },
  onKeyboardLockUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.keyboardLockUpdate, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.keyboardLockUpdate, listener);
    };
  },
  onLayoutChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.layoutChanged, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.layoutChanged, listener);
    };
  }
});
