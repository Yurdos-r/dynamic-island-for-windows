(function () {
  const BRIDGE_BASE_URL = "http://127.0.0.1:32147/dynamic-island-bridge";
  const BRIDGE_TOKEN_HEADER = "X-Dynamic-Island-Bridge-Token";
  const FILE_BRIDGE_VERSION = 2;
  const FILE_BRIDGE_DIR = "./dynamic-island-bridge";
  const TOKEN_FILE_PATH = `${FILE_BRIDGE_DIR}/bridge-token.json`;
  const FILE_SNAPSHOT_PATH = `${FILE_BRIDGE_DIR}/snapshot.json`;
  const FILE_COMMAND_PATH = `${FILE_BRIDGE_DIR}/command.json`;
  const FILE_RESULT_PATH = `${FILE_BRIDGE_DIR}/result.json`;
  const COMMAND_POLL_INTERVAL_MS = 220;
  const SNAPSHOT_INTERVAL_MS = 900;
  const IDLE_INTERVAL_MS = 1000;
  const COMMAND_MAX_AGE_MS = 5000;
  const FILE_IO_TIMEOUT_MS = 350;
  const FILE_IO_COOLDOWN_MS = 5000;
  const TOKEN_REFRESH_MS = 2000;
  const LYRICS_MAX_LINES = 120;
  const LYRICS_FETCH_TIMEOUT_MS = 2200;
  const LYRICS_EMPTY_RETRY_MS = 30000;

  let lastCommandId = "";
  let stopped = false;
  let lastSnapshotJson = "";
  let lastSnapshotAt = 0;
  let bootstrapped = false;
  let fileIoSuspendedUntil = 0;
  let bridgeToken = "";
  let lastTokenReadAt = 0;
  let lyricsHookInstalled = false;
  let lyricsCache = {
    songId: "",
    lines: [],
    source: "",
    updatedAt: 0
  };
  let lyricsFetchPromise = null;
  let lyricsFetchSongId = "";

  window.DynamicIslandBridge = {
    version: "0.5.0",
    status: "starting",
    lastCommandId: "",
    lastError: ""
  };

  function setStatus(status, error) {
    window.DynamicIslandBridge.status = status;
    window.DynamicIslandBridge.lastError = error || "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getInfLinkApi() {
    return globalThis.InfLinkApi || null;
  }

  function getFsApi() {
    return globalThis.betterncm?.fs || null;
  }

  function getNcmApi() {
    return globalThis.betterncm?.ncm || null;
  }

  function suspendFileIo() {
    fileIoSuspendedUntil = Date.now() + FILE_IO_COOLDOWN_MS;
  }

  function isFileIoSuspended() {
    return Date.now() < fileIoSuspendedUntil;
  }

  function withTimeout(operation, timeoutMs, fallback) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(fallback);
      }, timeoutMs);

      Promise.resolve()
        .then(operation)
        .then((value) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        });
    });
  }

  function normalizeBridgeToken(value) {
    const text = String(value || "").trim();
    return /^[A-Za-z0-9._~-]{32,256}$/.test(text) ? text : "";
  }

  async function refreshBridgeToken(force) {
    if (!force && bridgeToken && Date.now() - lastTokenReadAt < TOKEN_REFRESH_MS) {
      return bridgeToken;
    }

    lastTokenReadAt = Date.now();
    const fsApi = getFsApi();
    if (!fsApi) {
      return bridgeToken;
    }

    const token = await withTimeout(async () => {
      const text = await fsApi.readFileText(TOKEN_FILE_PATH);
      if (!text) {
        return "";
      }

      const rawToken = normalizeBridgeToken(text);
      if (rawToken) {
        return rawToken;
      }

      const payload = JSON.parse(text);
      return normalizeBridgeToken(payload.bridgeToken || payload.token);
    }, FILE_IO_TIMEOUT_MS, "");

    if (token) {
      bridgeToken = token;
    }

    return bridgeToken;
  }

  async function getBridgeHeaders(includeJson) {
    const token = await refreshBridgeToken(false);
    const headers = includeJson ? { "Content-Type": "application/json" } : {};
    if (token) {
      headers[BRIDGE_TOKEN_HEADER] = token;
    }

    return headers;
  }

  async function ensureFileBridgeDir() {
    const fsApi = getFsApi();
    if (!fsApi || isFileIoSuspended()) {
      return false;
    }

    const ok = await withTimeout(async () => {
      if (!(await fsApi.exists(FILE_BRIDGE_DIR))) {
        await fsApi.mkdir(FILE_BRIDGE_DIR);
      }
      return true;
    }, FILE_IO_TIMEOUT_MS, false);

    if (!ok) {
      suspendFileIo();
      return false;
    }

    return true;
  }

  async function readJsonFile(filePath) {
    const fsApi = getFsApi();
    if (!fsApi || isFileIoSuspended()) {
      return null;
    }

    const payload = await withTimeout(async () => {
      const text = await fsApi.readFileText(filePath);
      return text ? JSON.parse(text) : null;
    }, FILE_IO_TIMEOUT_MS, null);

    if (payload === null) {
      suspendFileIo();
      return null;
    }

    return payload;
  }

  async function writeJsonFile(filePath, payload) {
    const fsApi = getFsApi();
    if (!fsApi || isFileIoSuspended() || !(await ensureFileBridgeDir())) {
      return false;
    }

    const ok = await withTimeout(async () => {
      await fsApi.writeFileText(filePath, JSON.stringify(payload));
      return true;
    }, FILE_IO_TIMEOUT_MS, false);

    if (!ok) {
      suspendFileIo();
      return false;
    }

    return true;
  }

  async function waitForInfLinkApi(timeoutMs) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const api = getInfLinkApi();
      if (api && typeof api.seekTo === "function") {
        return api;
      }

      await sleep(100);
    }

    return getInfLinkApi();
  }

  function getCoverUrl(song) {
    const cover = song && song.cover;
    if (!cover) {
      return "";
    }

    if (typeof cover.url === "string") {
      return cover.url;
    }

    return "";
  }

  // Different InfLink-rs / NCM builds report playback state in different shapes
  // (the string "Playing", lowercase "playing", a numeric enum, a boolean, or
  // nothing at all). Reading only `status === "Playing"` left the island stuck
  // on "paused" forever. Normalise every shape we've seen into a boolean, and
  // return undefined when a signal is genuinely unknown so callers can fall back.
  function normalizePlayingValue(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      // NCM's song.state uses 1 = paused; InfLink numeric enums use 1 = playing.
      // We can't tell them apart here, so leave numbers to the caller.
      return undefined;
    }

    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["playing", "play", "started", "started-playing", "1", "true"].includes(text)) {
        return true;
      }
      if (["paused", "pause", "stopped", "stop", "idle", "0", "false"].includes(text)) {
        return false;
      }
    }

    return undefined;
  }

  // Read the play/pause state off NCM's own DOM player button as a last resort.
  // The play button carries `btn-pause` (or `j-flag`-style toggles) while audio
  // is actually playing in every NCM skin we've checked.
  function readDomPlayingState() {
    const player = getVisiblePlayerElement();
    if (!player) {
      return undefined;
    }

    const button = player.querySelector(
      ".btnp-pause, .btn-pause, [class*='pause'], .m-player-play .play, [aria-label*='暂停'], [title*='暂停']"
    );
    if (button) {
      const signal = `${button.className || ""} ${button.getAttribute?.("aria-label") || ""} ${button.getAttribute?.("title") || ""}`.toLowerCase();
      if (/pause|暂停/.test(signal)) {
        return true;
      }
      if (/\bplay\b|播放/.test(signal)) {
        return false;
      }
    }

    return undefined;
  }

  function resolveInfLinkPlaying(api, song) {
    const probes = [
      () => (typeof api?.getPlaybackStatus === "function" ? api.getPlaybackStatus() : undefined),
      () => (typeof api?.isPlaying === "function" ? api.isPlaying() : undefined),
      () => (typeof api?.getPlayState === "function" ? api.getPlayState() : undefined),
      () => (typeof api?.getPlaying === "function" ? api.getPlaying() : undefined)
    ];

    for (const probe of probes) {
      try {
        const normalized = normalizePlayingValue(probe());
        if (normalized !== undefined) {
          return normalized;
        }
      } catch {
        // Optional probes must not break snapshots.
      }
    }

    const fromSongState = typeof song?.state === "number" ? song.state !== 1 : undefined;
    if (fromSongState !== undefined) {
      return fromSongState;
    }

    const fromDom = readDomPlayingState();
    if (fromDom !== undefined) {
      return fromDom;
    }

    return undefined;
  }

  function isVisible(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width >= 0 && rect.height >= 0;
  }

  function getNcmPlayingSong() {
    const ncm = getNcmApi();
    const calls = [
      () => ncm?.getPlayingSong?.(),
      () => ncm?.getPlaying?.()
    ];

    for (const call of calls) {
      try {
        const song = call();
        if (song) {
          return song;
        }
      } catch {
        // Optional NCM probes must not break bridge snapshots.
      }
    }

    return null;
  }

  function parseTimeText(value) {
    const parts = String(value || "")
      .trim()
      .split(":")
      .map((part) => Number(part));

    if (!parts.length || parts.some((part) => !Number.isFinite(part))) {
      return 0;
    }

    return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
  }

  function getVisiblePlayerElement() {
    return Array.from(document.querySelectorAll(".m-player")).find(isVisible) || null;
  }

  function getNcmTimeline() {
    const player = getVisiblePlayerElement();
    if (!player) {
      return { positionMs: 0, durationMs: 0 };
    }

    return {
      positionMs: parseTimeText(player.querySelector("time.now")?.textContent),
      durationMs: parseTimeText(player.querySelector("time.all")?.textContent)
    };
  }

  function parseLyricTimestamp(value) {
    const match = String(value || "").match(/^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
    if (!match) {
      return -1;
    }

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = match[3] || "0";
    const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(milliseconds)) {
      return -1;
    }

    return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
  }

  function parseLrcText(text) {
    const lines = [];

    String(text || "")
      .split(/\r?\n/)
      .forEach((rawLine) => {
        const timestamps = Array.from(rawLine.matchAll(/\[([^\]]+)\]/g))
          .map((match) => parseLyricTimestamp(match[1]))
          .filter((timeMs) => timeMs >= 0);
        const lyricText = rawLine.replace(/\[[^\]]+\]/g, "").trim();

        if (!timestamps.length || !lyricText) {
          return;
        }

        timestamps.forEach((timeMs) => {
          lines.push({ timeMs, text: lyricText });
        });
      });

    return lines.sort((a, b) => a.timeMs - b.timeMs);
  }

  function mergeTranslatedLyrics(originalLines, translatedLines) {
    if (!translatedLines.length) {
      return originalLines;
    }

    const translations = new Map(translatedLines.map((line) => [line.timeMs, line.text]));
    return originalLines.map((line) => ({
      ...line,
      translation: translations.get(line.timeMs) || ""
    }));
  }

  function sanitizeLyricLines(lines) {
    const seen = new Set();

    return (Array.isArray(lines) ? lines : [])
      .map((line) => ({
        timeMs: Math.max(0, Math.round(Number(line?.timeMs ?? line?.time ?? 0))),
        text: String(line?.text || line?.originalLyric || "").trim(),
        translation: String(line?.translation || line?.translatedLyric || "").trim()
      }))
      .filter((line) => {
        const key = `${line.timeMs}|${line.text}|${line.translation}`;
        if (!line.text || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, LYRICS_MAX_LINES);
  }

  function getDomLyricLines() {
    const containers = Array.from(
      document.querySelectorAll(
        [
          ".m-lyric",
          ".j-lyric",
          ".lyric",
          "[class*='lyric']",
          "[class*='Lyric']"
        ].join(",")
      )
    ).filter((element) => isVisible(element) && String(element.textContent || "").trim().length > 0);

    const container = containers.find((element) => {
      const text = String(element.textContent || "").trim();
      return text.length >= 4 && text.length < 5000;
    });

    if (!container) {
      return [];
    }

    const rows = Array.from(container.querySelectorAll("p, li, [class*='line'], [class*='Line']"))
      .filter((element) => isVisible(element))
      .map((element) => ({
        element,
        text: String(element.textContent || "").replace(/\s+/g, " ").trim()
      }))
      .filter((line) => line.text && line.text.length < 160);

    const lines = rows.length >= 2
      ? rows
      : String(container.textContent || "")
          .split(/\r?\n/)
          .map((text) => ({ element: container, text: text.replace(/\s+/g, " ").trim() }))
          .filter((line) => line.text && line.text.length < 160);

    if (!lines.length) {
      return [];
    }

    const activeIndex = Math.max(
      0,
      lines.findIndex(({ element }) => /\b(active|current|curr|selected|z-sel)\b/i.test(String(element.className || "")))
    );
    const positionMs = getNcmTimeline().positionMs || 0;

    return lines.slice(0, LYRICS_MAX_LINES).map((line, index) => ({
      timeMs: Math.max(0, positionMs + (index - activeIndex) * 3500),
      text: line.text
    }));
  }

  function storeLyrics(songId, lines, source) {
    const sanitizedLines = sanitizeLyricLines(lines);
    if (!songId || !sanitizedLines.length) {
      return false;
    }

    lyricsCache = {
      songId: String(songId),
      lines: sanitizedLines,
      source,
      updatedAt: Date.now()
    };

    return true;
  }

  function rememberEmptyLyrics(songId, source) {
    if (!songId) {
      return;
    }

    lyricsCache = {
      songId: String(songId),
      lines: [],
      source,
      updatedAt: Date.now()
    };
  }

  function parseLyricsPayload(payload) {
    if (!payload) {
      return [];
    }

    if (typeof payload === "string") {
      return parseLrcText(payload);
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    const original = parseLrcText(payload?.lrc?.lyric || payload?.lyric || payload?.klyric?.lyric || "");
    const translated = parseLrcText(payload?.tlyric?.lyric || payload?.translatedLyric || "");
    if (original.length) {
      return mergeTranslatedLyrics(original, translated);
    }

    if (Array.isArray(payload?.lyrics)) {
      return payload.lyrics;
    }

    return [];
  }

  function ingestLyricsPayload(payload, source) {
    const songId = getSongId(getNcmPlayingSong());
    return storeLyrics(songId, parseLyricsPayload(payload), source);
  }

  function installLyricsHook() {
    if (lyricsHookInstalled) {
      return;
    }

    lyricsHookInstalled = true;
    const previousOnProcessLyrics = window.onProcessLyrics;

    window.onProcessLyrics = function dynamicIslandOnProcessLyrics(payload, ...args) {
      try {
        ingestLyricsPayload(payload, "netease-onProcessLyrics");
      } catch (error) {
        setStatus("lyrics-hook-error", error && error.message ? error.message : String(error));
      }

      if (typeof previousOnProcessLyrics === "function") {
        return previousOnProcessLyrics.call(this, payload, ...args);
      }

      return payload;
    };
  }

  async function fetchLyrics(songId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LYRICS_FETCH_TIMEOUT_MS);

    try {
      const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(songId)}&lv=1&kv=1&tv=-1`;
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`lyrics HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureLyrics(songId) {
    const normalizedSongId = String(songId || "").trim();
    if (!normalizedSongId) {
      return lyricsCache;
    }

    if (
      lyricsCache.songId === normalizedSongId &&
      (lyricsCache.lines.length || Date.now() - lyricsCache.updatedAt < LYRICS_EMPTY_RETRY_MS)
    ) {
      return lyricsCache;
    }

    if (lyricsFetchPromise && lyricsFetchSongId === normalizedSongId) {
      return lyricsFetchPromise;
    }

    lyricsFetchSongId = normalizedSongId;
    lyricsFetchPromise = fetchLyrics(normalizedSongId)
      .then((payload) => {
        const currentSongId = getSongId(getNcmPlayingSong());
        if (!currentSongId || currentSongId === normalizedSongId) {
          const parsedLines = parseLyricsPayload(payload);
          if (!storeLyrics(normalizedSongId, parsedLines, "netease-lyric-api")) {
            const hasDomLyrics = storeLyrics(normalizedSongId, getDomLyricLines(), "netease-lyric-dom");
            if (!hasDomLyrics) {
              rememberEmptyLyrics(normalizedSongId, "none");
            }
          }
        }
        return lyricsCache;
      })
      .catch((error) => {
        setStatus("lyrics-fetch-error", error && error.message ? error.message : String(error));
        return lyricsCache;
      })
      .finally(() => {
        lyricsFetchPromise = null;
        lyricsFetchSongId = "";
      });

    return lyricsFetchPromise;
  }

  function getCachedLyrics(songId) {
    return lyricsCache.songId === String(songId || "").trim() && lyricsCache.lines.length ? lyricsCache : null;
  }

  function dispatchNativeClick(element) {
    const options = {
      bubbles: true,
      cancelable: true,
      view: window
    };

    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.click();
  }

  function normalizeFavoriteValue(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 0;
    }

    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["true", "liked", "favorite", "favorited", "starred", "1"].includes(text)) {
        return true;
      }
      if (["false", "unliked", "0"].includes(text)) {
        return false;
      }
    }

    return undefined;
  }

  function getElementSignal(element) {
    if (!element) {
      return "";
    }

    const attributes = [
      "aria-label",
      "title",
      "aria-pressed",
      "data-state",
      "data-active",
      "data-checked",
      "data-res-action",
      "data-action",
      "class"
    ];

    const values = attributes.map((name) => element.getAttribute?.(name) || "");
    values.push(String(element.className || ""));
    values.push(String(element.textContent || ""));

    return values.join(" ").toLowerCase();
  }

  function inferFavoriteButtonState(element) {
    if (!element) {
      return undefined;
    }

    const signal = getElementSignal(element);

    if (/\bicn-loved\b|\bloved\b|\bliked\b|\bz-sel\b|\bunfav\b|\bunlike\b/.test(signal)) {
      return true;
    }

    if (/\bicn-love\b|\bfav\b|\blike\b|\blove\b/.test(signal)) {
      return false;
    }

    if (/\b(true|checked|selected|active|on)\b/.test(signal)) {
      return true;
    }

    if (/\b(false|unchecked|unselected|inactive|off)\b/.test(signal)) {
      return false;
    }

    if (/unlike|remove\s+(from\s+)?favou?rite|\u53d6\u6d88.*(\u559c\u6b22|\u6536\u85cf)/.test(signal)) {
      return true;
    }

    if (/like|favou?rite|\u559c\u6b22|\u6536\u85cf/.test(signal)) {
      return false;
    }

    return undefined;
  }

  function getFavoriteButtonCandidates() {
    const selectors = [
      ".m-pinfo span.icn-loved",
      ".m-pinfo span.icn-love",
      ".m-player .m-pinfo span[class*='icn-love']",
      "footer .left button:nth-child(1)",
      "footer [aria-label*='\u559c\u6b22']",
      "footer [title*='\u559c\u6b22']",
      "footer [aria-label*='\u6536\u85cf']",
      "footer [title*='\u6536\u85cf']",
      "footer [class*='love']",
      "footer [class*='like']",
      "[data-res-action='fav']",
      "[data-res-action='unfav']"
    ];
    const seen = new Set();

    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((element) => {
        if (seen.has(element) || element.disabled) {
          return false;
        }

        seen.add(element);
        return element.matches(".m-pinfo *") || isVisible(element);
      });
  }

  function readDomFavoriteState() {
    if (document.querySelector(".m-pinfo span.icn-loved")) {
      return true;
    }

    const legacyLove = document.querySelector(".m-pinfo span.icn-love");
    if (legacyLove && !String(legacyLove.className || "").includes("icn-loved")) {
      return false;
    }

    for (const candidate of getFavoriteButtonCandidates()) {
      const state = inferFavoriteButtonState(candidate);
      if (state !== undefined) {
        return state;
      }
    }

    return undefined;
  }

  function findFavoriteButton() {
    const currentState = readDomFavoriteState();
    const candidates = getFavoriteButtonCandidates();

    if (!candidates.length) {
      return null;
    }

    if (currentState !== undefined) {
      return candidates.find((candidate) => inferFavoriteButtonState(candidate) === currentState) || candidates[0];
    }

    return candidates[0];
  }

  function readFavoriteFields(source) {
    if (!source || typeof source !== "object") {
      return undefined;
    }

    const fields = ["favorited", "favorite", "liked", "isLiked", "isFavorite", "starred", "subscribed"];
    for (const field of fields) {
      const value = normalizeFavoriteValue(source[field]);
      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  function getSongId(song) {
    return String(song?.ncmId || song?.id || song?.songId || song?.data?.id || "").trim();
  }

  function readFavoriteState(song) {
    const fromDom = readDomFavoriteState();
    if (fromDom !== undefined) {
      return fromDom;
    }

    const fromSong = readFavoriteFields(song);
    if (fromSong !== undefined) {
      return fromSong;
    }

    const api = getInfLinkApi();
    const songId = getSongId(song);
    const statusCalls = [
      () => api?.isCurrentSongLiked?.(),
      () => api?.isCurrentSongFavorite?.(),
      () => api?.getCurrentSongLiked?.(),
      () => api?.getCurrentSongFavorite?.(),
      () => (songId ? api?.isLiked?.(songId) : undefined),
      () => (songId ? api?.isFavorite?.(songId) : undefined)
    ];

    for (const getStatus of statusCalls) {
      try {
        const value = normalizeFavoriteValue(getStatus());
        if (value !== undefined) {
          return value;
        }
      } catch {
        // Optional API probes must not break snapshots.
      }
    }

    return undefined;
  }

  function getNcmArtistText(data) {
    const artists = Array.isArray(data?.artists) ? data.artists : Array.isArray(data?.ar) ? data.ar : [];
    const text = artists
      .map((artist) => artist?.name || artist)
      .filter(Boolean)
      .join(" / ");

    return text || data?.artist || "";
  }

  async function createSnapshotFromNcmSong(ncmSong) {
    const data = ncmSong?.data || ncmSong;
    if (!data) {
      return null;
    }

    const songId = getSongId(ncmSong) || String(data.id || "").trim();
    const timeline = getNcmTimeline();
    const durationMs = Number(data.duration || data.dt || timeline.durationMs || 0);
    const positionMs = timeline.positionMs;
    const favorited = readFavoriteState(ncmSong);
    const lyrics = await ensureLyrics(songId);
    const domPlaying = readDomPlayingState();
    const playing = domPlaying !== undefined ? domPlaying : ncmSong?.state !== 1;

    return {
      active: true,
      playing,
      title: data.name || data.songName || "",
      artist: getNcmArtistText(data) || "NetEase Cloud Music",
      albumTitle: data.album?.name || data.al?.name || "",
      cover: data.album?.picUrl || data.al?.picUrl || "",
      ncmId: songId,
      favorited,
      lyrics: lyrics?.songId === songId ? lyrics.lines : [],
      lyricsSource: lyrics?.songId === songId ? lyrics.source : "",
      durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0,
      positionMs: Number.isFinite(positionMs) && positionMs > 0 ? positionMs : 0,
      bridgeStatus: getInfLinkApi() ? "connected-ncm" : "connected-ncm-fallback",
      bridgeVersion: window.DynamicIslandBridge.version
    };
  }

  async function createSnapshot() {
    const api = getInfLinkApi();
    const ncmSnapshot = await createSnapshotFromNcmSong(getNcmPlayingSong());

    if (!api) {
      return ncmSnapshot || {
        active: false,
        bridgeStatus: "waiting-for-inflink"
      };
    }

    const song = typeof api.getCurrentSong === "function" ? api.getCurrentSong() : null;
    const timeline = typeof api.getTimeline === "function" ? api.getTimeline() : null;
    const playbackStatus = typeof api.getPlaybackStatus === "function" ? api.getPlaybackStatus() : "Paused";

    if (!song) {
      return ncmSnapshot || {
        active: false,
        bridgeStatus: "no-song"
      };
    }

    const favorited = readFavoriteState(song);
    const songId = getSongId(song);
    const lyrics = getCachedLyrics(songId) || (await ensureLyrics(songId));
    const resolvedPlaying = resolveInfLinkPlaying(api, song);
    const playing = resolvedPlaying !== undefined ? resolvedPlaying : playbackStatus === "Playing";

    return {
      active: true,
      playing,
      title: song.songName || "",
      artist: song.authorName || "",
      albumTitle: song.albumName || "",
      cover: getCoverUrl(song),
      ncmId: songId,
      favorited,
      lyrics: lyrics?.songId === songId ? lyrics.lines : [],
      lyricsSource: lyrics?.songId === songId ? lyrics.source : "",
      durationMs: timeline && typeof timeline.totalTime === "number" ? timeline.totalTime : song.duration || 0,
      positionMs: timeline && typeof timeline.currentTime === "number" ? timeline.currentTime : 0,
      bridgeStatus: "connected",
      bridgeVersion: window.DynamicIslandBridge.version
    };
  }

  async function postJson(path, payload) {
    const response = await fetch(`${BRIDGE_BASE_URL}${path}`, {
      method: "POST",
      headers: await getBridgeHeaders(true),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Bridge returned HTTP ${response.status}`);
    }

    return response.json();
  }

  async function postSnapshot(force) {
    await refreshBridgeToken(false);
    const snapshot = await createSnapshot();
    const snapshotJson = JSON.stringify(snapshot);
    const now = Date.now();

    if (!force && snapshotJson === lastSnapshotJson && now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
      return;
    }

    lastSnapshotJson = snapshotJson;
    lastSnapshotAt = now;

    try {
      await postJson("/snapshot", { snapshot });
    } catch (error) {
      setStatus("file-bridge", error && error.message ? error.message : String(error));
    }

    void writeJsonFile(FILE_SNAPSHOT_PATH, {
      bridge: "dynamic-island-inflink",
      version: FILE_BRIDGE_VERSION,
      bridgeToken,
      snapshot,
      updatedAt: now
    });
  }

  async function postResult(command, ok, error, details) {
    const result = {
      id: command.id,
      type: command.type,
      ok,
      error: error || "",
      ...(details && typeof details === "object" ? details : {})
    };

    const fileResult = writeJsonFile(FILE_RESULT_PATH, {
      ...result,
      bridge: "dynamic-island-inflink",
      version: FILE_BRIDGE_VERSION,
      bridgeToken,
      updatedAt: Date.now()
    });

    try {
      await postJson("/result", result);
    } catch {
      // The file bridge already persisted the command result.
    }

    await fileResult;
  }

  async function callFirstAvailableMethod(api, methodNames, argumentSets) {
    let lastError = null;

    for (const methodName of methodNames) {
      const method = api && api[methodName];
      if (typeof method !== "function") {
        continue;
      }

      for (const args of argumentSets) {
        try {
          return {
            called: true,
            methodName,
            value: await method.apply(api, args)
          };
        } catch (error) {
          lastError = error;
        }
      }
    }

    return {
      called: false,
      error: lastError
    };
  }

  async function waitForFavoriteState(previousState, expectedState) {
    for (let index = 0; index < 24; index += 1) {
      await sleep(100);
      const state = readFavoriteState(getNcmPlayingSong());

      if (state === expectedState || (previousState !== undefined && state !== previousState)) {
        return state;
      }
    }

    return readFavoriteState(getNcmPlayingSong());
  }

  async function executeDomFavoriteCommand() {
    const button = findFavoriteButton();
    if (!button) {
      throw new Error("NetEase favorite button was not found.");
    }

    const previousFavorited = readFavoriteState(getNcmPlayingSong());
    const expectedFavorited = typeof previousFavorited === "boolean" ? !previousFavorited : undefined;

    dispatchNativeClick(button);

    const nextFavorited = await waitForFavoriteState(previousFavorited, expectedFavorited);
    if (typeof expectedFavorited === "boolean" && nextFavorited !== expectedFavorited) {
      throw new Error("NetEase favorite button did not change state.");
    }

    return {
      favorited: typeof nextFavorited === "boolean" ? nextFavorited : expectedFavorited,
      favoriteTransport: "netease-dom"
    };
  }

  async function executeFavoriteCommand(api) {
    try {
      return await executeDomFavoriteCommand();
    } catch (domError) {
      const song = typeof api?.getCurrentSong === "function" ? api.getCurrentSong() : getNcmPlayingSong();
      const fallbackResult = await executeInfLinkFavoriteCommand(api, song).catch((error) => ({
        ok: false,
        error
      }));

      if (fallbackResult && fallbackResult.ok !== false) {
        return fallbackResult;
      }

      const fallbackMessage = fallbackResult?.error?.message || fallbackResult?.error || "";
      throw new Error([domError?.message || String(domError), fallbackMessage].filter(Boolean).join(" "));
    }
  }

  async function executeInfLinkFavoriteCommand(api, song) {
    if (!api) {
      throw new Error("InfLink-rs API is not available.");
    }

    const currentFavorited = readFavoriteState(song);
    const nextFavorited = typeof currentFavorited === "boolean" ? !currentFavorited : true;
    const songId = getSongId(song);
    const songArgs = songId ? [[songId], [song]] : [[song]];

    const toggleResult = await callFirstAvailableMethod(
      api,
      [
        "toggleCurrentSongLike",
        "toggleLikeCurrentSong",
        "toggleCurrentSongFavorite",
        "toggleFavoriteCurrentSong",
        "toggleLike",
        "toggleFavorite"
      ],
      [[]]
    );

    if (toggleResult.called) {
      const resultFavorited = normalizeFavoriteValue(toggleResult.value);
      return {
        favorited: resultFavorited !== undefined ? resultFavorited : nextFavorited,
        favoriteTransport: `inflink:${toggleResult.methodName}`
      };
    }

    const setResult = await callFirstAvailableMethod(
      api,
      ["setCurrentSongLiked", "setCurrentSongFavorite", "setLiked", "setFavorite"],
      songId ? [[nextFavorited], [songId, nextFavorited], [nextFavorited, songId]] : [[nextFavorited]]
    );

    if (setResult.called) {
      const resultFavorited = normalizeFavoriteValue(setResult.value);
      return {
        favorited: resultFavorited !== undefined ? resultFavorited : nextFavorited,
        favoriteTransport: `inflink:${setResult.methodName}`
      };
    }

    const methodNames = nextFavorited
      ? ["likeCurrentSong", "favoriteCurrentSong", "collectCurrentSong", "like", "favorite", "collect"]
      : ["unlikeCurrentSong", "unfavoriteCurrentSong", "uncollectCurrentSong", "unlike", "unfavorite", "uncollect"];
    const result = await callFirstAvailableMethod(api, methodNames, [[], ...songArgs]);

    if (result.called) {
      const resultFavorited = normalizeFavoriteValue(result.value);
      return {
        favorited: resultFavorited !== undefined ? resultFavorited : nextFavorited,
        favoriteTransport: `inflink:${result.methodName}`
      };
    }

    throw new Error("No favorite method is available on InfLink-rs API.");
  }

  async function executeCommand(command) {
    if (command.type === "favorite-track") {
      return executeFavoriteCommand(getInfLinkApi());
    }

    const api = await waitForInfLinkApi(1200);
    if (!api) {
      throw new Error("InfLink-rs API is not available.");
    }

    switch (command.type) {
      case "seek":
        if (typeof api.seekTo !== "function") {
          throw new Error("InfLink-rs seekTo() is not available.");
        }
        api.seekTo(Math.max(0, Math.round(Number(command.positionMs) || 0)));
        return;
      case "toggle-play":
        if (typeof api.getPlaybackStatus === "function" && api.getPlaybackStatus() === "Playing") {
          api.pause();
        } else {
          api.play();
        }
        return;
      case "previous-track":
        api.previous();
        return;
      case "next-track":
        api.next();
        return;
      default:
        throw new Error(`Unsupported command: ${command.type}`);
    }
  }

  async function handleCommand(command) {
    if (!command || command.id === lastCommandId) {
      return;
    }

    lastCommandId = command.id;
    window.DynamicIslandBridge.lastCommandId = command.id;

    if (Date.now() - Number(command.createdAt || 0) > COMMAND_MAX_AGE_MS) {
      await postResult(command, false, "Command expired.");
      return;
    }

    try {
      const details = await executeCommand(command);
      setStatus("connected");
      await postResult(command, true, "", details);
      await sleep(80);
      await postSnapshot(true);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setStatus("error", message);
      await postResult(command, false, message);
    }
  }

  async function pollCommandOnce() {
    try {
      const response = await fetch(`${BRIDGE_BASE_URL}/command?lastId=${encodeURIComponent(lastCommandId)}`, {
        cache: "no-store",
        headers: await getBridgeHeaders(false)
      });

      if (!response.ok) {
        throw new Error(`Bridge returned HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (payload.command) {
        await handleCommand(payload.command);
        return;
      }
    } catch (error) {
      if (!getFsApi()) {
        throw error;
      }
    }

    const filePayload = await readJsonFile(FILE_COMMAND_PATH);
    if (filePayload?.command && filePayload.command.id !== lastCommandId) {
      await handleCommand(filePayload.command);
    }
  }

  function attachInfLinkListeners() {
    const api = getInfLinkApi();
    if (!api || typeof api.addEventListener !== "function") {
      return false;
    }

    const update = () => {
      void postSnapshot(true).catch((error) => {
        setStatus("snapshot-error", error && error.message ? error.message : String(error));
      });
    };

    api.addEventListener("songChange", update);
    api.addEventListener("playStateChange", update);
    api.addEventListener("timelineUpdate", update);

    window.addEventListener("beforeunload", () => {
      try {
        api.removeEventListener("songChange", update);
        api.removeEventListener("playStateChange", update);
        api.removeEventListener("timelineUpdate", update);
      } catch {
        // Best effort cleanup.
      }
    });

    return true;
  }

  async function commandLoop() {
    while (!stopped) {
      try {
        await pollCommandOnce();
        setStatus(getInfLinkApi() ? "connected" : "waiting-for-inflink");
        await sleep(COMMAND_POLL_INTERVAL_MS);
      } catch (error) {
        setStatus("waiting-for-dynamic-island", error && error.message ? error.message : String(error));
        await sleep(IDLE_INTERVAL_MS);
      }
    }
  }

  async function snapshotLoop() {
    let listenersAttached = false;

    while (!stopped) {
      try {
        if (!listenersAttached) {
          listenersAttached = attachInfLinkListeners();
        }

        await postSnapshot(false);
        setStatus(getInfLinkApi() ? "connected" : "waiting-for-inflink");
        await sleep(SNAPSHOT_INTERVAL_MS);
      } catch (error) {
        setStatus("waiting-for-dynamic-island", error && error.message ? error.message : String(error));
        await sleep(IDLE_INTERVAL_MS);
      }
    }
  }

  function bootstrap() {
    if (bootstrapped) {
      return;
    }

    bootstrapped = true;
    installLyricsHook();
    window.DynamicIslandBridge.startedAt = Date.now();
    void createSnapshot()
      .then((snapshot) => postJson("/snapshot", { snapshot }))
      .catch(() => {});
    void commandLoop();
    void snapshotLoop();
  }

  window.addEventListener("beforeunload", () => {
    stopped = true;
  });

  if (globalThis.plugin && typeof globalThis.plugin.onLoad === "function") {
    globalThis.plugin.onLoad(() => {
      bootstrap();
    });
  }

  bootstrap();
})();
