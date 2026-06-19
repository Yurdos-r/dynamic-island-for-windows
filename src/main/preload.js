const { contextBridge, ipcRenderer } = require("electron");

const ISLAND_MODES = new Set(["idle", "peek", "clipboard-prompt", "privacy", "privacy-expanded", "hover", "expanded", "clipboard", "settings", "system"]);
const MEDIA_ACTIONS = new Set(["toggle-play", "previous-track", "next-track", "favorite-track"]);
const LAYOUTS = new Set(["classic", "top-center"]);

function safeMode(mode) {
  return ISLAND_MODES.has(mode) ? mode : "idle";
}

function safeMediaAction(action) {
  return MEDIA_ACTIONS.has(action) ? action : "";
}

function safeLayout(layout) {
  return LAYOUTS.has(layout) ? layout : "classic";
}

contextBridge.exposeInMainWorld("island", {
  ready: () => ipcRenderer.send("island:renderer-ready"),
  resize: (mode) => ipcRenderer.invoke("island:resize", safeMode(mode)),
  setInteracting: (interacting) => ipcRenderer.invoke("island:set-interacting", Boolean(interacting)),
  controlMedia: (action) => {
    const safeAction = safeMediaAction(action);
    return safeAction ? ipcRenderer.invoke("media:control", safeAction) : Promise.resolve({ ok: false, available: false });
  },
  seekMedia: (seconds) => ipcRenderer.invoke("media:seek", Number(seconds)),
  getUiSettings: () => ipcRenderer.invoke("island:get-ui-settings"),
  setLayout: (layout) => ipcRenderer.invoke("island:set-layout", safeLayout(layout)),
  setSystemMonitor: (enabled) => ipcRenderer.invoke("island:set-system-monitor", Boolean(enabled)),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write", typeof text === "string" ? text : ""),
  acceptClipboardPending: (id) => ipcRenderer.invoke("clipboard:accept-pending", typeof id === "string" ? id : ""),
  dismissClipboardPending: (id) => ipcRenderer.invoke("clipboard:dismiss-pending", typeof id === "string" ? id : ""),
  clearClipboardItems: () => ipcRenderer.invoke("clipboard:clear"),
  removeClipboardItem: (id) => ipcRenderer.invoke("clipboard:remove", typeof id === "string" ? id : ""),
  onModeRequest: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, mode) => callback(safeMode(mode));
    ipcRenderer.on("island:set-mode", listener);

    return () => {
      ipcRenderer.removeListener("island:set-mode", listener);
    };
  },
  onAvoidScale: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, scale) => callback(Number(scale));
    ipcRenderer.on("island:avoid-scale", listener);

    return () => {
      ipcRenderer.removeListener("island:avoid-scale", listener);
    };
  },
  onMediaUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("media:update", listener);

    return () => {
      ipcRenderer.removeListener("media:update", listener);
    };
  },
  onPrivacyUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("privacy:update", listener);

    return () => {
      ipcRenderer.removeListener("privacy:update", listener);
    };
  },
  onClipboardUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("clipboard:update", listener);

    return () => {
      ipcRenderer.removeListener("clipboard:update", listener);
    };
  },
  onSystemUpdate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("system:update", listener);

    return () => {
      ipcRenderer.removeListener("system:update", listener);
    };
  },
  onLayoutChanged: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("island:layout-changed", listener);

    return () => {
      ipcRenderer.removeListener("island:layout-changed", listener);
    };
  }
});
