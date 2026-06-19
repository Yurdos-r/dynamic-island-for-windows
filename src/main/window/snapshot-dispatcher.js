const { IPC_CHANNELS } = require("../../shared/island-contracts");

function canSendMain(state) {
  return Boolean(state.mainWindow && !state.mainWindow.isDestroyed() && state.rendererReady);
}

function canSendSystem(state) {
  return Boolean(state.systemWindow && !state.systemWindow.isDestroyed() && state.systemRendererReady);
}

function createWindowSnapshotDispatcher(options = {}) {
  const state = options.state;
  const applyTaskbarVisibility = options.applyTaskbarVisibility || (() => {});
  const repositionAllStageWindows = options.repositionAllStageWindows || (() => {});
  const requestIslandMode = options.requestIslandMode || (() => {});
  const sendAvoidScale = options.sendAvoidScale || (() => {});

  if (!state) {
    throw new Error("state is required to create window snapshot dispatcher.");
  }

  function handleMediaSnapshot(snapshot) {
    state.mediaActive = Boolean(snapshot?.active);
    if (canSendMain(state)) {
      state.mainWindow.webContents.send(IPC_CHANNELS.mediaUpdate, snapshot);
      if (!state.mediaActive && !state.privacyActive && (state.currentMode === "hover" || state.currentMode === "expanded")) {
        requestIslandMode("idle");
      }
    }
  }

  function handleClipboardSnapshot(snapshot) {
    if (canSendMain(state)) {
      state.mainWindow.webContents.send(IPC_CHANNELS.clipboardUpdate, snapshot);
    }
  }

  function handlePrivacySnapshot(snapshot) {
    const nextPrivacyActive = Boolean(snapshot?.active);
    const privacyJustActivated = !state.privacyActive && nextPrivacyActive;
    state.privacyActive = nextPrivacyActive;
    if (canSendMain(state)) {
      state.mainWindow.webContents.send(IPC_CHANNELS.privacyUpdate, snapshot);
      if (
        privacyJustActivated &&
        state.currentMode !== "privacy" &&
        state.currentMode !== "privacy-expanded" &&
        state.currentMode !== "clipboard" &&
        state.currentMode !== "clipboard-prompt"
      ) {
        requestIslandMode("privacy");
      }
    }
  }

  function handleSystemSnapshot(snapshot) {
    if (state.layout === "top-center") {
      if (canSendMain(state)) {
        state.mainWindow.webContents.send(IPC_CHANNELS.systemUpdate, snapshot);
      }
    } else if (canSendSystem(state)) {
      state.systemWindow.webContents.send(IPC_CHANNELS.systemUpdate, snapshot);
    }
  }

  function handleTaskbarSnapshot(snapshot) {
    applyTaskbarVisibility(snapshot?.visible);

    const nextLeft = snapshot?.available && Number.isFinite(snapshot.left) ? snapshot.left : 0;
    if (nextLeft === state.taskbarIconLeft) {
      return;
    }

    state.taskbarIconLeft = nextLeft;
    repositionAllStageWindows();
    sendAvoidScale();
  }

  return {
    handleClipboardSnapshot,
    handleMediaSnapshot,
    handlePrivacySnapshot,
    handleSystemSnapshot,
    handleTaskbarSnapshot
  };
}

module.exports = {
  createWindowSnapshotDispatcher
};
