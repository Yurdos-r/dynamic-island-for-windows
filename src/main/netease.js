const path = require("node:path");
const { runTextCommand: defaultRunTextCommand } = require("./commands");
const {
  createNeteaseHistoryReader,
  fileExists,
  getFileModifiedTime,
  parseNeteaseExecutableFromCommand,
  parseRegistryCommandValue,
  safeReadJson
} = require("./netease/cache-reader");
const {
  extractNcmIdFromMediaSnapshot,
  isCloudMusicMediaSnapshot,
  isNeteaseSnapshot,
  pickMatchingTrack,
  pickNeteaseFmTrack,
  pickNeteasePlaylistTrack,
  pickTrackById
} = require("./netease/track-metadata");

let SqliteDatabaseSync;
try {
  ({ DatabaseSync: SqliteDatabaseSync } = require("node:sqlite"));
} catch {
  SqliteDatabaseSync = undefined;
}

const NETEASE_STATIC_CACHE_MAX_AGE = 1000 * 60 * 5;
const NETEASE_HISTORY_GRACE_MS = 1000 * 60 * 10;

function createNeteaseProvider(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runTextCommand = options.runTextCommand || defaultRunTextCommand;
  const env = options.env || process.env;
  const sqliteDatabaseSync = options.sqliteDatabaseSync || SqliteDatabaseSync;
  const historyReader = createNeteaseHistoryReader({ sqliteDatabaseSync, logStartup });
  let playbackState;
  let executablePath;
  let lastSnapshotLogKey = "";

  async function readRegistryDefaultValue(keyPath) {
    const result = await runTextCommand("reg.exe", ["query", keyPath, "/ve"]);
    return result.ok ? parseRegistryCommandValue(result.stdout) : "";
  }

  async function getExecutablePath() {
    if (fileExists(executablePath)) {
      return executablePath;
    }

    const registryCommands = [
      await readRegistryDefaultValue("HKCU\\Software\\Classes\\orpheus\\shell\\open\\command"),
      await readRegistryDefaultValue("HKCR\\orpheus\\shell\\open\\command")
    ];
    const registryPath = registryCommands.map(parseNeteaseExecutableFromCommand).find(fileExists);

    const fallbackPaths = [
      registryPath,
      path.join(env.LOCALAPPDATA || "", "Programs", "NetEase", "CloudMusic", "cloudmusic.exe"),
      path.join(env.PROGRAMFILES || "", "NetEase", "CloudMusic", "cloudmusic.exe"),
      path.join(env["PROGRAMFILES(X86)"] || "", "NetEase", "CloudMusic", "cloudmusic.exe")
    ];

    executablePath = fallbackPaths.find(fileExists);
    return executablePath;
  }

  async function runWebCommand(message) {
    const cloudMusicPath = await getExecutablePath();

    if (!cloudMusicPath) {
      return { ok: false, error: "cloudmusic.exe not found" };
    }

    const result = await runTextCommand(cloudMusicPath, [`--webcmd=${JSON.stringify(message)}`]);

    if (!result.ok) {
      logStartup("netease-webcmd-failed", {
        command: message?.cmd,
        executablePath: cloudMusicPath,
        error: result.error,
        stderr: result.stderr
      });
    }

    return {
      ...result,
      executablePath: cloudMusicPath
    };
  }

  async function isRunning() {
    const result = await runTextCommand(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq cloudmusic.exe", "/NH"],
      {
        timeout: 2500,
        maxBuffer: 64 * 1024
      }
    );

    return result.stdout.toLowerCase().includes("cloudmusic.exe");
  }

  function pickMatchingPlaylistTrack(playlist, mediaSnapshot) {
    const list = Array.isArray(playlist?.list) ? playlist.list : [];
    return pickMatchingTrack(
      list
        .map((item) => item?.track ?? item)
        .filter(Boolean),
      mediaSnapshot
    );
  }

  function pickPlaylistTrackById(playlist, wantedId) {
    const list = Array.isArray(playlist?.list) ? playlist.list : [];
    return pickTrackById(
      list
        .map((item) => item?.track ?? item)
        .filter(Boolean),
      wantedId
    );
  }

  function pickMatchingFmTrack(fmPlay, mediaSnapshot) {
    const queue = Array.isArray(fmPlay?.queue) ? fmPlay.queue : [];
    return pickMatchingTrack(queue, mediaSnapshot);
  }

  function pickFmTrackById(fmPlay, wantedId) {
    const queue = Array.isArray(fmPlay?.queue) ? fmPlay.queue : [];
    return pickTrackById(queue, wantedId);
  }

  function getTrackKey(track) {
    return [track?.id, track?.title, track?.artist, track?.durationSeconds].filter(Boolean).join("|");
  }

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

  function getCachePaths() {
    const root = path.join(env.LOCALAPPDATA || "", "NetEase", "CloudMusic");

    return {
      playingListPath: path.join(root, "webdata", "file", "playingList"),
      fmPlayPath: path.join(root, "webdata", "file", "fmPlay"),
      webDbPath: path.join(root, "Library", "webdb.dat")
    };
  }

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

  async function getSnapshot() {
    if (!(await isRunning())) {
      return { available: false, active: false };
    }

    const { playingListPath, fmPlayPath, webDbPath } = getCachePaths();
    const historyTrack = historyReader.pickHistoryTrack(webDbPath);
    const candidates = [
      {
        modifiedAt: Number(historyTrack?.startedAtMs) || getFileModifiedTime(webDbPath),
        maxAge: Math.max((historyTrack?.durationSeconds || 0) * 1000 + NETEASE_HISTORY_GRACE_MS, NETEASE_STATIC_CACHE_MAX_AGE),
        source: "netease-history",
        track: historyTrack
      },
      {
        modifiedAt: getFileModifiedTime(playingListPath),
        maxAge: NETEASE_STATIC_CACHE_MAX_AGE,
        source: "netease-playing-list",
        track: pickNeteasePlaylistTrack(safeReadJson(playingListPath))
      },
      {
        modifiedAt: getFileModifiedTime(fmPlayPath),
        maxAge: NETEASE_STATIC_CACHE_MAX_AGE,
        source: "netease-fm",
        track: pickNeteaseFmTrack(safeReadJson(fmPlayPath))
      }
    ]
      .filter((candidate) => candidate.track && candidate.modifiedAt > 0 && Date.now() - candidate.modifiedAt <= candidate.maxAge)
      .sort((a, b) => b.modifiedAt - a.modifiedAt);

    const best = candidates[0];
    if (!best) {
      return { available: true, active: false, sourceApp: "cloudmusic.exe" };
    }

    const playback = getEstimatedPosition(best.track);
    const logKey = [best.source, best.track.id, best.track.title, best.track.artist].join("|");
    if (logKey !== lastSnapshotLogKey) {
      lastSnapshotLogKey = logKey;
      logStartup("netease-snapshot", {
        source: best.source,
        title: best.track.title,
        artist: best.track.artist
      });
    }

    return createSnapshotFromTrack(best.track, best.source, playback.positionSeconds, playback.playing);
  }

  async function enrichMediaSnapshot(mediaSnapshot) {
    if (!isCloudMusicMediaSnapshot(mediaSnapshot) && !(await isRunning())) {
      return undefined;
    }

    const { playingListPath, fmPlayPath, webDbPath } = getCachePaths();
    const ncmId = extractNcmIdFromMediaSnapshot(mediaSnapshot);
    if (ncmId) {
      const idCandidates = [
        {
          source: "netease-inflink-playing-list-id-match",
          track: pickPlaylistTrackById(safeReadJson(playingListPath), ncmId)
        },
        {
          source: "netease-inflink-fm-id-match",
          track: pickFmTrackById(safeReadJson(fmPlayPath), ncmId)
        },
        {
          source: "netease-inflink-history-id-match",
          track: historyReader.pickHistoryTrackById(webDbPath, ncmId)
        }
      ];
      const idMatch = idCandidates.find((candidate) => candidate.track);

      if (idMatch) {
        logStartup("netease-inflink-id-match", {
          ncmId,
          source: idMatch.source,
          title: idMatch.track.title,
          artist: idMatch.track.artist
        });

        return createSnapshotFromTrack(
          idMatch.track,
          idMatch.source,
          Math.max(0, Math.round(mediaSnapshot.positionSeconds || 0)),
          mediaSnapshot.playing === true
        );
      }
    }

    const candidates = [
      {
        source: "netease-playing-list-match",
        track: pickMatchingPlaylistTrack(safeReadJson(playingListPath), mediaSnapshot)
      },
      {
        source: "netease-fm-match",
        track: pickMatchingFmTrack(safeReadJson(fmPlayPath), mediaSnapshot)
      },
      {
        source: "netease-history-match",
        track: historyReader.pickMatchingHistoryTrack(webDbPath, mediaSnapshot)
      }
    ];
    const match = candidates.find((candidate) => candidate.track);

    if (!match) {
      return undefined;
    }

    return createSnapshotFromTrack(
      match.track,
      match.source,
      Math.max(0, Math.round(mediaSnapshot.positionSeconds || 0)),
      mediaSnapshot.playing === true
    );
  }

  return {
    isRunning,
    getSnapshot,
    enrichMediaSnapshot,
    runWebCommand,
    nudgePlaybackAfterControl,
    setPlaybackPosition
  };
}

module.exports = {
  createNeteaseProvider,
  isNeteaseSnapshot
};
