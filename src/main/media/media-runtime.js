function createMediaRuntime(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const state = {
    pollTimer: undefined,
    pollInFlight: false,
    lastPayload: "",
    lastLogKey: "",
    lastActiveSnapshot: undefined,
    fallbackMediaQueryLogged: false
  };

  function sendMediaSnapshot(snapshot) {
    if (snapshot?.active) {
      state.lastActiveSnapshot = snapshot;
    }

    const payload = JSON.stringify({ ...snapshot, updatedAt: 0 });
    if (payload === state.lastPayload) {
      return;
    }

    state.lastPayload = payload;

    const logKey = [
      snapshot.active,
      snapshot.source,
      snapshot.sourceApp,
      snapshot.title,
      snapshot.artist,
      snapshot.status,
      snapshot.playing,
      snapshot.durationSeconds
    ].join("|");

    if (logKey !== state.lastLogKey) {
      state.lastLogKey = logKey;
      logStartup("media-update", {
        source: snapshot.source,
        sourceApp: snapshot.sourceApp,
        title: snapshot.title,
        artist: snapshot.artist,
        active: snapshot.active,
        hasCover: Boolean(snapshot.cover),
        ncmId: snapshot.ncmId || "",
        durationSeconds: snapshot.durationSeconds
      });
    }

    emitSnapshot(snapshot);
  }

  function getLastActiveSnapshot() {
    return state.lastActiveSnapshot;
  }

  function setLastActiveSnapshot(snapshot) {
    state.lastActiveSnapshot = snapshot;
  }

  return {
    state,
    getLastActiveSnapshot,
    sendMediaSnapshot,
    setLastActiveSnapshot
  };
}

module.exports = {
  createMediaRuntime
};
