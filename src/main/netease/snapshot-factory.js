function createSnapshotFromTrack(track, source, positionSeconds = 0, playing = true) {
  return {
    available: true,
    active: true,
    playing,
    status: playing ? "Playing" : "Paused",
    title: track.title,
    artist: track.artist,
    albumTitle: track.albumTitle,
    cover: track.cover,
    sourceApp: "cloudmusic.exe",
    source,
    controllable: true,
    durationSeconds: track.durationSeconds,
    positionSeconds,
    updatedAt: Date.now()
  };
}

function createNeteaseSnapshotFactory(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runtime = options.runtime;

  function logSnapshotIfChanged(candidate) {
    const logKey = [candidate.source, candidate.track.id, candidate.track.title, candidate.track.artist].join("|");
    if (!runtime.shouldLogSnapshot(logKey)) {
      return;
    }

    logStartup("netease-snapshot", {
      source: candidate.source,
      title: candidate.track.title,
      artist: candidate.track.artist
    });
  }

  function logInflinkIdMatch(ncmId, candidate) {
    logStartup("netease-inflink-id-match", {
      ncmId,
      source: candidate.source,
      title: candidate.track.title,
      artist: candidate.track.artist
    });
  }

  return {
    createSnapshotFromTrack,
    logInflinkIdMatch,
    logSnapshotIfChanged
  };
}

module.exports = {
  createNeteaseSnapshotFactory,
  createSnapshotFromTrack
};
