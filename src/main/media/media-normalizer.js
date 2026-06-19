const DEFAULT_DURATION_SECONDS = 228;
const MAX_LYRIC_LINES = 120;

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
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

function normalizeOptionalBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function normalizeFavoriteState(rawSnapshot = {}) {
  const candidates = [
    rawSnapshot.favorited,
    rawSnapshot.favorite,
    rawSnapshot.liked,
    rawSnapshot.isLiked,
    rawSnapshot.isFavorite,
    rawSnapshot.starred
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalBoolean(candidate);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeComparableText(value) {
  return sanitizeText(value, 120).toLowerCase();
}

function isPlaceholderArtist(artist, sourceApp = "") {
  const normalizedArtist = normalizeComparableText(artist);
  const normalizedSourceApp = normalizeComparableText(sourceApp);

  return (
    !normalizedArtist ||
    normalizedArtist === "unknown artist" ||
    normalizedArtist === "netease cloud music" ||
    normalizedArtist === "cloudmusic.exe" ||
    (normalizedSourceApp && normalizedArtist === normalizedSourceApp)
  );
}

function normalizeLyricLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line) => ({
      timeMs: Math.max(0, Math.round(Number(line?.timeMs ?? line?.time ?? 0))),
      text: sanitizeText(line?.text || line?.originalLyric || ""),
      translation: sanitizeText(line?.translation || line?.translatedLyric || "")
    }))
    .filter((line) => line.text)
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, MAX_LYRIC_LINES);
}

function normalizeTrackId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && text !== "0" ? text : "";
}

function extractNcmIdFromGenres(genres) {
  if (!Array.isArray(genres)) {
    return "";
  }

  for (const genre of genres) {
    const match = String(genre ?? "").match(/\bNCM-(\d+)\b/i);
    const ncmId = normalizeTrackId(match?.[1]);
    if (ncmId) {
      return ncmId;
    }
  }

  return "";
}

function normalizeMediaSnapshot(rawSnapshot = {}) {
  const title = typeof rawSnapshot.title === "string" ? rawSnapshot.title.trim() : "";
  const artist =
    typeof rawSnapshot.artist === "string" && rawSnapshot.artist.trim()
      ? rawSnapshot.artist.trim()
      : typeof rawSnapshot.albumArtist === "string"
        ? rawSnapshot.albumArtist.trim()
        : "";
  const sourceApp = typeof rawSnapshot.sourceApp === "string" ? rawSnapshot.sourceApp.trim() : "";
  const genres = Array.isArray(rawSnapshot.genres)
    ? rawSnapshot.genres.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const durationSeconds = Number.isFinite(rawSnapshot.durationSeconds) ? Math.max(0, Math.round(rawSnapshot.durationSeconds)) : 0;
  const positionSeconds = Number.isFinite(rawSnapshot.positionSeconds)
    ? Math.max(0, Math.round(rawSnapshot.positionSeconds))
    : 0;
  const status = typeof rawSnapshot.status === "string" ? rawSnapshot.status : "Unknown";
  const active = Boolean(rawSnapshot.available && rawSnapshot.active && (title || artist));
  const favorited = normalizeFavoriteState(rawSnapshot);
  const lyrics = normalizeLyricLines(rawSnapshot.lyrics);

  const snapshot = {
    available: Boolean(rawSnapshot.available),
    active,
    playing: active && rawSnapshot.playing === true,
    status,
    title: title || "Unknown Title",
    artist: artist || sourceApp || "Unknown Artist",
    albumTitle: typeof rawSnapshot.albumTitle === "string" ? rawSnapshot.albumTitle.trim() : "",
    genres,
    ncmId: extractNcmIdFromGenres(genres),
    cover: sanitizeCoverUrl(rawSnapshot.cover),
    source: typeof rawSnapshot.source === "string" ? rawSnapshot.source.trim() : "windows-media-session",
    sourceApp,
    controllable: rawSnapshot.controllable !== false,
    durationSeconds: durationSeconds > 0 ? durationSeconds : DEFAULT_DURATION_SECONDS,
    positionSeconds: durationSeconds > 0 ? Math.min(positionSeconds, durationSeconds) : positionSeconds,
    updatedAt: Date.now(),
    lyrics,
    lyricsSource: sanitizeText(rawSnapshot.lyricsSource || "", 80)
  };

  if (favorited !== undefined) {
    snapshot.favorited = favorited;
  }

  return snapshot;
}

function isCloudMusicMediaSnapshot(snapshot) {
  const marker = [snapshot?.source, snapshot?.sourceApp].filter(Boolean).join(" ").toLowerCase();
  return marker.includes("cloudmusic") || marker.includes("netease");
}

function isGenericWindowsMediaSnapshot(snapshot) {
  return snapshot?.active && snapshot.source === "windows-media-session" && !snapshot.sourceApp;
}

function isNeteaseMatchedSnapshot(snapshot) {
  return typeof snapshot?.source === "string" && snapshot.source.startsWith("netease-") && snapshot.source.endsWith("-match");
}

function isInflinkBridgeSnapshot(snapshot) {
  return snapshot?.source === "inflink-bridge";
}

function chooseMediaSnapshot(mediaSnapshot, neteaseSnapshot, inflinkSnapshot) {
  const normalizedInflinkSnapshot = inflinkSnapshot?.active ? normalizeMediaSnapshot(inflinkSnapshot) : undefined;
  const normalizedNeteaseSnapshot = neteaseSnapshot?.active ? normalizeMediaSnapshot(neteaseSnapshot) : undefined;

  if (normalizedInflinkSnapshot) {
    return normalizedInflinkSnapshot;
  }

  if (mediaSnapshot.active && isNeteaseMatchedSnapshot(mediaSnapshot)) {
    return mediaSnapshot;
  }

  if (
    normalizedNeteaseSnapshot &&
    (!mediaSnapshot.active || isCloudMusicMediaSnapshot(mediaSnapshot) || isGenericWindowsMediaSnapshot(mediaSnapshot))
  ) {
    return normalizedNeteaseSnapshot;
  }

  if (mediaSnapshot.active) {
    return mediaSnapshot;
  }

  return normalizedNeteaseSnapshot ?? mediaSnapshot;
}

module.exports = {
  chooseMediaSnapshot,
  isCloudMusicMediaSnapshot,
  isInflinkBridgeSnapshot,
  isPlaceholderArtist,
  normalizeMediaSnapshot
};
