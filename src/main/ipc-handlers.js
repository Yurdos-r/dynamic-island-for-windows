const { IPC_CHANNELS, MEDIA_CONTROL_ACTION_SET } = require("../shared/island-contracts");

function registerIslandIpcHandlers(options = {}) {
  const ipcMain = options.ipcMain;

  if (!ipcMain) {
    throw new Error("ipcMain is required to register island IPC handlers.");
  }

  const assertMainFrameSender = options.assertMainFrameSender || (() => false);
  const assertSystemFrameSender = options.assertSystemFrameSender || (() => false);
  const getCurrentMode = options.getCurrentMode || (() => "idle");
  const getUiSettings = options.getUiSettings || (() => ({ layout: "classic", systemMonitorEnabled: true }));
  const onMainRendererReady = options.onMainRendererReady || (() => {});
  const onSystemRendererReady = options.onSystemRendererReady || (() => {});

  ipcMain.on(IPC_CHANNELS.rendererReady, (event) => {
    if (assertSystemFrameSender(event)) {
      onSystemRendererReady(event);
      return;
    }

    if (assertMainFrameSender(event)) {
      onMainRendererReady(event);
    }
  });

  ipcMain.handle(IPC_CHANNELS.resize, (event, mode) => {
    if (assertSystemFrameSender(event)) {
      return options.resizeSystemIsland?.(mode);
    }

    if (!assertMainFrameSender(event)) {
      return getCurrentMode();
    }

    return options.resizeIsland?.(mode);
  });

  ipcMain.handle(IPC_CHANNELS.getUiSettings, (event) => {
    return assertMainFrameSender(event) ? getUiSettings() : getUiSettings();
  });

  ipcMain.handle(IPC_CHANNELS.setLayout, (event, nextLayout) => {
    if (!assertMainFrameSender(event)) {
      return getUiSettings().layout;
    }

    return options.applyLayout?.(nextLayout);
  });

  ipcMain.handle(IPC_CHANNELS.setSystemMonitor, (event, enabled) => {
    if (!assertMainFrameSender(event)) {
      return getUiSettings().systemMonitorEnabled;
    }

    return options.applySystemMonitorEnabled?.(enabled);
  });

  ipcMain.handle(IPC_CHANNELS.setInteracting, (event, interacting) => {
    if (assertSystemFrameSender(event)) {
      return options.setSystemInteracting?.(Boolean(interacting));
    }

    if (!assertMainFrameSender(event)) {
      return false;
    }

    return options.setMainInteracting?.(Boolean(interacting));
  });

  ipcMain.handle(IPC_CHANNELS.mediaControl, (event, action) => {
    if (!assertMainFrameSender(event) || !MEDIA_CONTROL_ACTION_SET.has(action)) {
      return { ok: false, available: false };
    }

    return options.controlMedia?.(action) ?? { ok: false, available: false };
  });

  ipcMain.handle(IPC_CHANNELS.mediaSeek, (event, seconds) => {
    if (!assertMainFrameSender(event) || !Number.isFinite(seconds)) {
      return { ok: false, available: false };
    }

    return options.seekMedia?.(Math.max(0, Math.round(seconds))) ?? { ok: false, available: false };
  });

  ipcMain.handle(IPC_CHANNELS.clipboardWrite, (event, text) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return options.writeClipboardText?.(text) ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle(IPC_CHANNELS.clipboardAcceptPending, (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return options.acceptClipboardPending?.(typeof id === "string" ? id : "") ?? {
      ok: false,
      error: "Clipboard monitor is not available."
    };
  });

  ipcMain.handle(IPC_CHANNELS.clipboardDismissPending, (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return options.dismissClipboardPending?.(typeof id === "string" ? id : "") ?? {
      ok: false,
      error: "Clipboard monitor is not available."
    };
  });

  ipcMain.handle(IPC_CHANNELS.clipboardClear, (event) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return options.clearClipboardItems?.() ?? { ok: false, error: "Clipboard monitor is not available." };
  });

  ipcMain.handle(IPC_CHANNELS.clipboardRemove, (event, id) => {
    if (!assertMainFrameSender(event)) {
      return { ok: false, error: "Invalid sender." };
    }

    return options.removeClipboardItem?.(typeof id === "string" ? id : "") ?? {
      ok: false,
      error: "Clipboard monitor is not available."
    };
  });
}

module.exports = {
  registerIslandIpcHandlers
};
