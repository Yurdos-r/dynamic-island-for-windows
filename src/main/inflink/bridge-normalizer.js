const { COMMAND_TIMEOUT_MS, MAX_LYRIC_LINES } = require("./bridge-contract");

function sanitizeText(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function sanitizeCoverUrl(value) {
  const text = sanitizeText(value, 4096);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    return ["http:", "https:", "data:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function normalizeTrackId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && text !== "0" ? text : "";
}

function normalizeFavoriteState(payload = {}) {
  const candidates = [
    payload.favorited,
    payload.favorite,
    payload.liked,
    payload.isLiked,
    payload.isFavorite,
    payload.starred
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate;
    }
  }

  return undefined;
}

function normalizeLyricLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => ({
      timeMs: Math.max(0, Math.round(Number(line?.timeMs ?? line?.time ?? 0))),
      text: sanitizeText(line?.text || line?.originalLyric || "", 300),
      translation: sanitizeText(line?.translation || line?.translatedLyric || "", 300)
    }))
    .filter((line) => line.text)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, MAX_LYRIC_LINES);
}

function createPublicCommand(command) {
  if (!command) {
    return null;
  }

  return {
    id: command.id,
    type: command.type,
    positionMs: command.positionMs,
    positionSeconds: command.positionSeconds,
    createdAt: command.createdAt,
    timeoutMs: COMMAND_TIMEOUT_MS,
    source: command.source,
    sourceApp: command.sourceApp,
    title: command.title,
    artist: command.artist
  };
}

function normalizeBridgeSnapshot(payload = {}) {
  const ncmId = normalizeTrackId(payload.ncmId);
  const title = sanitizeText(payload.title || payload.songName || "Unknown Title");
  const artist = sanitizeText(payload.artist || payload.authorName || "NetEase Cloud Music");
  const durationSeconds = normalizeSeconds(payload.durationSeconds || Number(payload.durationMs) / 1000);
  const positionSeconds = normalizeSeconds(payload.positionSeconds || Number(payload.positionMs) / 1000);
  const active = payload.active !== false && Boolean(title || artist || ncmId);
  const favorited = normalizeFavoriteState(payload);
  const lyrics = normalizeLyricLines(payload.lyrics);

  const snapshot = {
    available: true,
    active,
    playing: active && payload.playing === true,
    status: payload.playing === true ? "Playing" : "Paused",
    title,
    artist,
    albumTitle: sanitizeText(payload.albumTitle || payload.albumName || ""),
    genres: ncmId ? [`NCM-${ncmId}`] : [],
    ncmId,
    cover: sanitizeCoverUrl(payload.cover || payload.coverUrl),
    source: "inflink-bridge",
    sourceApp: "cloudmusic.exe",
    controllable: true,
    durationSeconds: durationSeconds > 0 ? durationSeconds : 1,
    positionSeconds: durationSeconds > 0 ? Math.min(positionSeconds, durationSeconds) : positionSeconds,
    updatedAt: Date.now(),
    bridgeStatus: sanitizeText(payload.bridgeStatus || ""),
    bridgeVersion: sanitizeText(payload.bridgeVersion || ""),
    lyrics,
    lyricsSource: sanitizeText(payload.lyricsSource || "")
  };

  if (favorited !== undefined) {
    snapshot.favorited = favorited;
  }

  return snapshot;
}

module.exports = {
  createPublicCommand,
  normalizeBridgeSnapshot,
  normalizeFavoriteState,
  normalizeSeconds
};
