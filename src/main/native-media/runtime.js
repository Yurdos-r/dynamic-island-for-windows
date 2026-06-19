function createNativeMediaRuntime() {
  const state = {
    child: undefined,
    lineReader: undefined,
    restartTimer: undefined,
    stopped: false,
    ready: false,
    lastSnapshot: undefined,
    nextCommandId: 1,
    commandDirPrepared: false,
    pendingCommands: new Map()
  };

  function clearRestartTimer() {
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = undefined;
    }
  }

  function createCommandId() {
    const id = `${Date.now()}-${state.nextCommandId}`;
    state.nextCommandId += 1;
    return id;
  }

  function setReady(value) {
    state.ready = Boolean(value);
  }

  function updateSnapshot(payload) {
    state.lastSnapshot = {
      ...payload,
      updatedAt: Date.now()
    };
  }

  function getSnapshot(maxAgeMs) {
    if (!state.lastSnapshot || Date.now() - state.lastSnapshot.updatedAt > maxAgeMs) {
      return {
        available: false,
        active: false,
        waitingForNative: Boolean(state.child),
        nativeReady: state.ready,
        source: "windows-media-session",
        transport: "native-gsmtc-helper"
      };
    }

    return state.lastSnapshot;
  }

  function registerPendingCommand(id, pending) {
    state.pendingCommands.set(id, pending);
  }

  function resolvePendingCommand(id, result) {
    const pending = state.pendingCommands.get(id);
    if (!pending) {
      return;
    }

    state.pendingCommands.delete(id);
    clearTimeout(pending.timeout);
    pending.resolve(result);
  }

  function rejectPendingCommands(error) {
    for (const [id, pending] of state.pendingCommands.entries()) {
      clearTimeout(pending.timeout);
      pending.resolve({
        ok: false,
        available: false,
        active: false,
        action: pending.action,
        transport: "native-gsmtc-helper",
        error
      });
      state.pendingCommands.delete(id);
    }
  }

  return {
    state,
    clearRestartTimer,
    createCommandId,
    getSnapshot,
    registerPendingCommand,
    rejectPendingCommands,
    resolvePendingCommand,
    setReady,
    updateSnapshot
  };
}

module.exports = {
  createNativeMediaRuntime
};
