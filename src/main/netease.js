const fs = require("node:fs");
const path = require("node:path");
const { runTextCommand: defaultRunTextCommand } = require("./commands");

let SqliteDatabaseSync;
try {
  ({ DatabaseSync: SqliteDatabaseSync } = require("node:sqlite"));
} catch {
  SqliteDatabaseSync = undefined;
}

const NETEASE_STATIC_CACHE_MAX_AGE = 1000 * 60 * 5;
const NETEASE_HISTORY_GRACE_MS = 1000 * 60 * 10;
const DEFAULT_DURATION_SECONDS = 228;

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function getFileModifiedTime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function sanitizeCoverUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value.trim());
    return ["http:", "https:", "data:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function parseNeteaseExecutableFromCommand(command) {
  const text = String(command || "").trim();
  const quotedMatch = text.match(/^"([^"]*cloudmusic\.exe)"/i);
  const plainMatch = quotedMatch ? undefined : text.match(/^(.+?cloudmusic\.exe)\b/i);

  return quotedMatch?.[1] || plainMatch?.[1]?.trim();
}

function parseRegistryCommandValue(output) {
  const line = String(output || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /\bREG_(?:SZ|EXPAND_SZ)\b/i.test(item));

  if (!line) {
    return "";
  }

  return line.replace(/^.*?\bREG_(?:SZ|EXPAND_SZ)\b\s+/i, "").trim();
}

function extractJsonObjects(text, marker) {
  const objects = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const start = text.indexOf(marker, searchIndex);
    if (start === -1) {
      break;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }

      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;

        if (depth === 0) {
          const rawJson = text.slice(start, index + 1);
          try {
            objects.push(JSON.parse(rawJson));
          } catch {
            // SQLite pages can contain partial stale records.
          }
          searchIndex = index + 1;
          break;
        }
      }
    }

    if (searchIndex <= start) {
      searchIndex = start + marker.length;
    }
  }

  return objects;
}

function normalizeNeteaseTrack(rawTrack) {
  const track = rawTrack?.track ?? rawTrack;
  if (!track || typeof track !== "object") {
    return undefined;
  }

  const title = typeof track.name === "string" ? track.name.trim() : "";
  const artists = Array.isArray(track.artists) ? track.artists : [];
  const artist = artists
    .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
    .filter(Boolean)
    .join(" / ");
  const durationMilliseconds = Number(track.duration);
  const album = track.album && typeof track.album === "object" ? track.album : undefined;
  const cover = typeof album?.picUrl === "string" && album.picUrl ? album.picUrl : typeof album?.cover === "string" ? album.cover : "";

  if (!title && !artist) {
    return undefined;
  }

  return {
    id: String(track.id ?? rawTrack?.id ?? ""),
    title: title || "Unknown Title",
    artist: artist || "NetEase Cloud Music",
    albumTitle: typeof album?.name === "string" ? album.name : "",
    cover: sanitizeCoverUrl(cover),
    durationSeconds: Number.isFinite(durationMilliseconds) && durationMilliseconds > 0
      ? Math.round(durationMilliseconds / 1000)
      : DEFAULT_DURATION_SECONDS
  };
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·・,，、/\\|()[\]（）【】《》<>「」『』"'“”‘’._-]/g, "");
}

function splitArtistTokens(value) {
  return String(value || "")
    .split(/\s*(?:\/|,|，|、|&|和|;|；)\s*/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

function normalizeTrackId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && text !== "0" ? text : "";
}

function extractNcmIdFromMediaSnapshot(mediaSnapshot) {
  const candidates = [
    mediaSnapshot?.ncmId,
    ...(Array.isArray(mediaSnapshot?.genres) ? mediaSnapshot.genres : [])
  ];

  for (const candidate of candidates) {
    const exactId = normalizeTrackId(candidate);
    if (exactId) {
      return exactId;
    }

    const match = String(candidate ?? "").match(/\bNCM-(\d+)\b/i);
    const prefixedId = normalizeTrackId(match?.[1]);
    if (prefixedId) {
      return prefixedId;
    }
  }

  return "";
}

function isTrackMetadataMatch(track, mediaSnapshot) {
  const wantedTitle = normalizeSearchText(mediaSnapshot?.title);
  const trackTitle = normalizeSearchText(track?.title);

  if (!wantedTitle || !trackTitle || wantedTitle !== trackTitle) {
    return false;
  }

  const wantedArtists = splitArtistTokens(mediaSnapshot?.artist || mediaSnapshot?.sourceApp);
  const trackArtist = normalizeSearchText(track?.artist);

  if (!wantedArtists.length || !trackArtist) {
    return true;
  }

  return wantedArtists.some((artist) => trackArtist.includes(artist) || artist.includes(trackArtist));
}

function pickNeteasePlaylistTrack(playlist) {
  const list = Array.isArray(playlist?.list) ? playlist.list : [];
  if (!list.length) {
    return undefined;
  }

  const playedItems = list.filter((item) => item?.isPlayedOnce);
  return normalizeNeteaseTrack(playedItems[playedItems.length - 1] ?? list[0]);
}

function isLikelyNeteaseSongObject(item) {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id !== "undefined" &&
    typeof item.name === "string" &&
    Number.isFinite(Number(item.duration)) &&
    Array.isArray(item.artists)
  );
}

function normalizeNeteaseHistoryTrack(item, startedAtMs) {
  if (!isLikelyNeteaseSongObject(item)) {
    return undefined;
  }

  const normalized = normalizeNeteaseTrack(item);
  const playtime = Number(startedAtMs ?? item.playtime);

  if (!normalized || !Number.isFinite(playtime) || playtime <= 0) {
    return undefined;
  }

  return {
    ...normalized,
    startedAtMs: playtime
  };
}

function pickLatestNeteaseHistoryTrack(items) {
  return items
    .map((item) => normalizeNeteaseHistoryTrack(item))
    .filter(Boolean)
    .sort((a, b) => b.startedAtMs - a.startedAtMs)[0];
}

function pickMatchingTrack(items, mediaSnapshot) {
  return items.map((item) => normalizeNeteaseHistoryTrack(item) ?? normalizeNeteaseTrack(item)).find((track) => isTrackMetadataMatch(track, mediaSnapshot));
}

function pickTrackById(items, wantedId) {
  return items.map((item) => normalizeNeteaseHistoryTrack(item) ?? normalizeNeteaseTrack(item)).find((track) => normalizeTrackId(track?.id) === wantedId);
}

function pickNeteaseFmTrack(fmPlay) {
  const queue = Array.isArray(fmPlay?.queue) ? fmPlay.queue : [];
  if (!queue.length) {
    return undefined;
  }

  const index = Number.isInteger(fmPlay.currentIndex) ? fmPlay.currentIndex : 0;
  return normalizeNeteaseTrack(queue[Math.max(0, Math.min(index, queue.length - 1))]);
}

function isNeteaseSnapshot(snapshot) {
  return typeof snapshot?.source === "string" && snapshot.source.startsWith("netease-");
}

function isCloudMusicMediaSnapshot(snapshot) {
  const marker = [snapshot?.source, snapshot?.sourceApp].filter(Boolean).join(" ").toLowerCase();
  return marker.includes("cloudmusic") || marker.includes("netease");
}

function createNeteaseProvider(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runTextCommand = options.runTextCommand || defaultRunTextCommand;
  const env = options.env || process.env;
  const sqliteDatabaseSync = options.sqliteDatabaseSync || SqliteDatabaseSync;
  let playbackState;
  let sqliteWarningLogged = false;
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

  function pickHistoryTrackFromSqlite(webDbPath) {
    if (!sqliteDatabaseSync) {
      return undefined;
    }

    let database;

    try {
      database = new sqliteDatabaseSync(webDbPath, { readOnly: true });
      const rows = database
        .prepare("select playtime, jsonStr from historyTracks where jsonStr is not null order by playtime desc limit 20")
        .all();

      return pickLatestNeteaseHistoryTrack(
        rows
          .map((row) => {
            try {
              const item = JSON.parse(row.jsonStr);
              item.playtime = Number(row.playtime ?? item.playtime);
              return item;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean)
      );
    } catch (error) {
      if (!sqliteWarningLogged) {
        sqliteWarningLogged = true;
        logStartup("netease-sqlite-error", error?.message || String(error));
      }
      return undefined;
    } finally {
      try {
        database?.close();
      } catch {
        // Best effort cleanup.
      }
    }
  }

  function pickHistoryTrackFromText(webDbPath) {
    let text = "";

    try {
      text = fs.readFileSync(webDbPath).toString("utf8");
    } catch {
      return undefined;
    }

    return pickLatestNeteaseHistoryTrack(extractJsonObjects(text, "{\"id\":\""));
  }

  function pickHistoryTrack(webDbPath) {
    return pickHistoryTrackFromSqlite(webDbPath) ?? pickHistoryTrackFromText(webDbPath);
  }

  function pickMatchingHistoryTrackFromSqlite(webDbPath, mediaSnapshot) {
    if (!sqliteDatabaseSync) {
      return undefined;
    }

    let database;

    try {
      database = new sqliteDatabaseSync(webDbPath, { readOnly: true });
      const rows = database
        .prepare("select playtime, jsonStr from historyTracks where jsonStr is not null order by playtime desc limit 80")
        .all();

      return pickMatchingTrack(
        rows
          .map((row) => {
            try {
              const item = JSON.parse(row.jsonStr);
              item.playtime = Number(row.playtime ?? item.playtime);
              return item;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean),
        mediaSnapshot
      );
    } catch (error) {
      if (!sqliteWarningLogged) {
        sqliteWarningLogged = true;
        logStartup("netease-sqlite-error", error?.message || String(error));
      }
      return undefined;
    } finally {
      try {
        database?.close();
      } catch {
        // Best effort cleanup.
      }
    }
  }

  function pickMatchingHistoryTrackFromText(webDbPath, mediaSnapshot) {
    let text = "";

    try {
      text = fs.readFileSync(webDbPath).toString("utf8");
    } catch {
      return undefined;
    }

    return pickMatchingTrack(extractJsonObjects(text, "{\"id\":\""), mediaSnapshot);
  }

  function pickMatchingHistoryTrack(webDbPath, mediaSnapshot) {
    return pickMatchingHistoryTrackFromSqlite(webDbPath, mediaSnapshot) ?? pickMatchingHistoryTrackFromText(webDbPath, mediaSnapshot);
  }

  function pickHistoryTrackByIdFromSqlite(webDbPath, wantedId) {
    if (!sqliteDatabaseSync) {
      return undefined;
    }

    let database;

    try {
      database = new sqliteDatabaseSync(webDbPath, { readOnly: true });
      const rows = database
        .prepare("select playtime, jsonStr from historyTracks where jsonStr is not null order by playtime desc limit 120")
        .all();

      return pickTrackById(
        rows
          .map((row) => {
            try {
              const item = JSON.parse(row.jsonStr);
              item.playtime = Number(row.playtime ?? item.playtime);
              return item;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean),
        wantedId
      );
    } catch (error) {
      if (!sqliteWarningLogged) {
        sqliteWarningLogged = true;
        logStartup("netease-sqlite-error", error?.message || String(error));
      }
      return undefined;
    } finally {
      try {
        database?.close();
      } catch {
        // Best effort cleanup.
      }
    }
  }

  function pickHistoryTrackByIdFromText(webDbPath, wantedId) {
    let text = "";

    try {
      text = fs.readFileSync(webDbPath).toString("utf8");
    } catch {
      return undefined;
    }

    return pickTrackById(extractJsonObjects(text, "{\"id\":\""), wantedId);
  }

  function pickHistoryTrackById(webDbPath, wantedId) {
    return pickHistoryTrackByIdFromSqlite(webDbPath, wantedId) ?? pickHistoryTrackByIdFromText(webDbPath, wantedId);
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
    const historyTrack = pickHistoryTrack(webDbPath);
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
          track: pickHistoryTrackById(webDbPath, ncmId)
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
        track: pickMatchingHistoryTrack(webDbPath, mediaSnapshot)
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
