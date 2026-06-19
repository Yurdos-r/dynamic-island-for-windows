const DEFAULT_DURATION_SECONDS = 228;

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

module.exports = {
  extractNcmIdFromMediaSnapshot,
  isCloudMusicMediaSnapshot,
  isNeteaseSnapshot,
  pickLatestNeteaseHistoryTrack,
  pickMatchingTrack,
  pickNeteaseFmTrack,
  pickNeteasePlaylistTrack,
  pickTrackById
};
