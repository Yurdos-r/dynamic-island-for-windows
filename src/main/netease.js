const { runTextCommand: defaultRunTextCommand } = require("./commands");
const { createNeteaseHistoryReader } = require("./netease/cache-reader");
const {
  isCloudMusicMediaSnapshot,
  isNeteaseSnapshot
} = require("./netease/track-metadata");
const { createNeteaseRuntimeState } = require("./netease/runtime-state");
const { createNeteaseSnapshotFactory } = require("./netease/snapshot-factory");
const { createNeteaseProcessRuntime } = require("./netease/process-webcmd");
const { createNeteaseTrackSelector } = require("./netease/track-selector");

let SqliteDatabaseSync;
try {
  ({ DatabaseSync: SqliteDatabaseSync } = require("node:sqlite"));
} catch {
  SqliteDatabaseSync = undefined;
}

function createNeteaseProvider(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runTextCommand = options.runTextCommand || defaultRunTextCommand;
  const env = options.env || process.env;
  const sqliteDatabaseSync = options.sqliteDatabaseSync || SqliteDatabaseSync;
  const historyReader = createNeteaseHistoryReader({ sqliteDatabaseSync, logStartup });
  const runtime = createNeteaseRuntimeState();
  const snapshotFactory = createNeteaseSnapshotFactory({ runtime, logStartup });
  const processRuntime = createNeteaseProcessRuntime({ env, logStartup, runTextCommand });
  const trackSelector = createNeteaseTrackSelector({ env, historyReader });

  async function getSnapshot() {
    if (!(await processRuntime.isRunning())) {
      return { available: false, active: false };
    }

    const best = trackSelector.pickSnapshotCandidate();
    if (!best) {
      return { available: true, active: false, sourceApp: "cloudmusic.exe" };
    }

    const playback = runtime.getEstimatedPosition(best.track);
    snapshotFactory.logSnapshotIfChanged(best);

    return snapshotFactory.createSnapshotFromTrack(best.track, best.source, playback.positionSeconds, playback.playing);
  }

  async function enrichMediaSnapshot(mediaSnapshot) {
    if (!isCloudMusicMediaSnapshot(mediaSnapshot) && !(await processRuntime.isRunning())) {
      return undefined;
    }

    const idMatch = trackSelector.pickIdEnrichmentCandidate(mediaSnapshot);
    if (idMatch) {
      snapshotFactory.logInflinkIdMatch(idMatch.ncmId, idMatch);

      return snapshotFactory.createSnapshotFromTrack(
        idMatch.track,
        idMatch.source,
        Math.max(0, Math.round(mediaSnapshot.positionSeconds || 0)),
        mediaSnapshot.playing === true
      );
    }

    const match = trackSelector.pickTextEnrichmentCandidate(mediaSnapshot);

    if (!match) {
      return undefined;
    }

    return snapshotFactory.createSnapshotFromTrack(
      match.track,
      match.source,
      Math.max(0, Math.round(mediaSnapshot.positionSeconds || 0)),
      mediaSnapshot.playing === true
    );
  }

  return {
    isRunning: processRuntime.isRunning,
    getSnapshot,
    enrichMediaSnapshot,
    runWebCommand: processRuntime.runWebCommand,
    nudgePlaybackAfterControl: runtime.nudgePlaybackAfterControl,
    setPlaybackPosition: runtime.setPlaybackPosition
  };
}

module.exports = {
  createNeteaseProvider,
  isNeteaseSnapshot
};
