const path = require("node:path");
const { getFileModifiedTime, safeReadJson } = require("./cache-reader");
const {
  extractNcmIdFromMediaSnapshot,
  pickMatchingTrack,
  pickNeteaseFmTrack,
  pickNeteasePlaylistTrack,
  pickTrackById
} = require("./track-metadata");

const NETEASE_STATIC_CACHE_MAX_AGE = 1000 * 60 * 5;
const NETEASE_HISTORY_GRACE_MS = 1000 * 60 * 10;

function getPlaylistTracks(playlist) {
  const list = Array.isArray(playlist?.list) ? playlist.list : [];
  return list
    .map((item) => item?.track ?? item)
    .filter(Boolean);
}

function pickMatchingPlaylistTrack(playlist, mediaSnapshot) {
  return pickMatchingTrack(getPlaylistTracks(playlist), mediaSnapshot);
}

function pickPlaylistTrackById(playlist, wantedId) {
  return pickTrackById(getPlaylistTracks(playlist), wantedId);
}

function pickMatchingFmTrack(fmPlay, mediaSnapshot) {
  const queue = Array.isArray(fmPlay?.queue) ? fmPlay.queue : [];
  return pickMatchingTrack(queue, mediaSnapshot);
}

function pickFmTrackById(fmPlay, wantedId) {
  const queue = Array.isArray(fmPlay?.queue) ? fmPlay.queue : [];
  return pickTrackById(queue, wantedId);
}

function createNeteaseTrackSelector(options = {}) {
  const env = options.env || process.env;
  const historyReader = options.historyReader;

  function getCachePaths() {
    const root = path.join(env.LOCALAPPDATA || "", "NetEase", "CloudMusic");

    return {
      playingListPath: path.join(root, "webdata", "file", "playingList"),
      fmPlayPath: path.join(root, "webdata", "file", "fmPlay"),
      webDbPath: path.join(root, "Library", "webdb.dat")
    };
  }

  function pickSnapshotCandidate() {
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

    return candidates[0];
  }

  function pickIdEnrichmentCandidate(mediaSnapshot) {
    const { playingListPath, fmPlayPath, webDbPath } = getCachePaths();
    const ncmId = extractNcmIdFromMediaSnapshot(mediaSnapshot);
    if (!ncmId) {
      return undefined;
    }

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
    const match = idCandidates.find((candidate) => candidate.track);

    return match ? { ...match, ncmId } : undefined;
  }

  function pickTextEnrichmentCandidate(mediaSnapshot) {
    const { playingListPath, fmPlayPath, webDbPath } = getCachePaths();
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

    return candidates.find((candidate) => candidate.track);
  }

  return {
    getCachePaths,
    pickIdEnrichmentCandidate,
    pickSnapshotCandidate,
    pickTextEnrichmentCandidate
  };
}

module.exports = {
  createNeteaseTrackSelector
};
