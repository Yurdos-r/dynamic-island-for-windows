function createBridgeRuntime(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const onSnapshot = typeof options.onSnapshot === "function" ? options.onSnapshot : () => {};

  const state = {
    server: undefined,
    startPromise: undefined,
    pendingCommand: undefined,
    lastResult: undefined,
    lastSnapshot: undefined,
    lastSnapshotLogKey: "",
    lastSnapshotPushKey: "",
    fileResultTimer: undefined,
    nextCommandId: 1
  };

  function setLastSnapshot(snapshot, transport) {
    state.lastSnapshot = snapshot;
    const pushKey = [
      snapshot.active,
      snapshot.title,
      snapshot.artist,
      snapshot.playing,
      snapshot.positionSeconds,
      snapshot.durationSeconds,
      snapshot.cover,
      snapshot.ncmId,
      snapshot.favorited
    ].join("|");

    if (transport === "http" && pushKey !== state.lastSnapshotPushKey) {
      state.lastSnapshotPushKey = pushKey;
      onSnapshot({
        ...snapshot,
        updatedAt: Date.now()
      });
    }

    const logKey = [
      transport,
      snapshot.active,
      snapshot.title,
      snapshot.artist,
      snapshot.playing,
      snapshot.durationSeconds,
      snapshot.bridgeStatus
    ].join("|");

    if (logKey !== state.lastSnapshotLogKey) {
      state.lastSnapshotLogKey = logKey;
      logStartup("inflink-bridge-snapshot", {
        transport,
        active: snapshot.active,
        title: snapshot.title,
        artist: snapshot.artist,
        playing: snapshot.playing,
        durationSeconds: snapshot.durationSeconds,
        ncmId: snapshot.ncmId || "",
        bridgeStatus: snapshot.bridgeStatus
      });
    }
  }

  function clearPendingCommand(result) {
    if (!state.pendingCommand) {
      return;
    }

    const command = state.pendingCommand;
    state.pendingCommand = undefined;
    clearTimeout(command.timeout);
    command.resolve(result);
  }

  function allocateCommandId() {
    return `${Date.now()}-${state.nextCommandId++}`;
  }

  return {
    state,
    allocateCommandId,
    clearPendingCommand,
    setLastSnapshot
  };
}

module.exports = {
  createBridgeRuntime
};
