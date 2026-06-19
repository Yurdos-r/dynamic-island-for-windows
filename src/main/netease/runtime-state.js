function getTrackKey(track) {
  return [track?.id, track?.title, track?.artist, track?.durationSeconds].filter(Boolean).join("|");
}

function createNeteaseRuntimeState() {
  let playbackState;
  let lastSnapshotLogKey = "";

  function getEstimatedPosition(track) {
    const now = Date.now();
    const trackKey = getTrackKey(track);
    const durationSeconds = Math.max(1, Math.round(track.durationSeconds || 1));
    const previous = playbackState;

    if (!previous || previous.trackKey !== trackKey) {
      const startedPositionSeconds = Number.isFinite(track.startedAtMs)
        ? Math.max(0, Math.min(durationSeconds, (now - track.startedAtMs) / 1000))
        : 0;

      playbackState = {
        trackKey,
        positionSeconds: startedPositionSeconds,
        playing: true,
        updatedAt: now
      };

      return { positionSeconds: Math.round(startedPositionSeconds), playing: true };
    }

    const elapsedSeconds = previous.playing ? Math.max(0, (now - previous.updatedAt) / 1000) : 0;
    const positionSeconds = Math.min(durationSeconds, previous.positionSeconds + elapsedSeconds);

    playbackState = {
      ...previous,
      positionSeconds,
      updatedAt: now
    };

    return {
      positionSeconds: Math.round(positionSeconds),
      playing: previous.playing
    };
  }

  function nudgePlaybackAfterControl(action) {
    if (!playbackState) {
      return;
    }

    if (action === "toggle-play") {
      playbackState = {
        ...playbackState,
        playing: !playbackState.playing,
        updatedAt: Date.now()
      };
      return;
    }

    if (action === "previous-track" || action === "next-track") {
      playbackState = {
        ...playbackState,
        positionSeconds: 0,
        playing: true,
        updatedAt: Date.now()
      };
    }
  }

  function setPlaybackPosition(positionSeconds) {
    if (!playbackState) {
      return false;
    }

    playbackState = {
      ...playbackState,
      positionSeconds: Math.max(0, Number(positionSeconds) || 0),
      updatedAt: Date.now()
    };

    return true;
  }

  function shouldLogSnapshot(logKey) {
    if (logKey === lastSnapshotLogKey) {
      return false;
    }

    lastSnapshotLogKey = logKey;
    return true;
  }

  return {
    getEstimatedPosition,
    nudgePlaybackAfterControl,
    setPlaybackPosition,
    shouldLogSnapshot
  };
}

module.exports = {
  createNeteaseRuntimeState,
  getTrackKey
};
