const {
  chooseMediaSnapshot,
  isPlaceholderArtist,
  normalizeMediaSnapshot
} = require("./media-normalizer");
const { getMediaQueryScript } = require("./windows-media-scripts");

function createMediaSourceQuery(options = {}) {
  const platform = options.platform || process.platform;
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runPowerShellJson = options.runPowerShellJson;
  const nativeMediaSession = options.nativeMediaSession;
  const inflinkBridge = options.inflinkBridge;
  const neteaseProvider = options.neteaseProvider;
  const runtime = options.runtime;

  if (typeof runPowerShellJson !== "function") {
    throw new Error("runPowerShellJson is required to create media source query.");
  }
  if (!nativeMediaSession || !inflinkBridge || !neteaseProvider || !runtime) {
    throw new Error("native media, inflink bridge, netease provider, and runtime are required to create media source query.");
  }

  async function maybeEnrichWithNetease(mediaSnapshot) {
    if (!mediaSnapshot.active || platform !== "win32") {
      return mediaSnapshot;
    }

    const neteaseSnapshot = await neteaseProvider.enrichMediaSnapshot(mediaSnapshot);
    if (!neteaseSnapshot) {
      return mediaSnapshot;
    }

    return {
      ...mediaSnapshot,
      source: neteaseSnapshot.source,
      sourceApp: mediaSnapshot.sourceApp || neteaseSnapshot.sourceApp,
      playing: mediaSnapshot.playing,
      status: mediaSnapshot.status,
      title: mediaSnapshot.title === "Unknown Title" ? neteaseSnapshot.title : mediaSnapshot.title,
      artist: isPlaceholderArtist(mediaSnapshot.artist, mediaSnapshot.sourceApp)
        ? neteaseSnapshot.artist || mediaSnapshot.artist
        : mediaSnapshot.artist,
      cover: neteaseSnapshot.cover || mediaSnapshot.cover,
      albumTitle: neteaseSnapshot.albumTitle || mediaSnapshot.albumTitle,
      durationSeconds: neteaseSnapshot.durationSeconds || mediaSnapshot.durationSeconds,
      positionSeconds: Number.isFinite(mediaSnapshot.positionSeconds)
        ? mediaSnapshot.positionSeconds
        : neteaseSnapshot.positionSeconds
    };
  }

  async function queryWindowsMediaSnapshot() {
    if (platform !== "win32") {
      return { available: false, active: false };
    }

    const nativeSnapshot = nativeMediaSession.getSnapshot();
    if (nativeSnapshot.nativeUnavailable) {
      return nativeSnapshot;
    }

    if (nativeSnapshot.available || nativeSnapshot.active || nativeSnapshot.nativeReady) {
      return nativeSnapshot;
    }

    if (!runtime.state.fallbackMediaQueryLogged) {
      runtime.state.fallbackMediaQueryLogged = true;
      logStartup("native-media-fallback-query", {
        waitingForNative: Boolean(nativeSnapshot.waitingForNative),
        nativeReady: Boolean(nativeSnapshot.nativeReady)
      });
    }

    return runPowerShellJson(getMediaQueryScript());
  }

  async function queryMediaSnapshot() {
    const rawSnapshot = await queryWindowsMediaSnapshot();
    const mediaSnapshot = normalizeMediaSnapshot(rawSnapshot);
    const inflinkSnapshot = platform === "win32" ? inflinkBridge.getSnapshot() : { available: false, active: false };
    const trustedInflinkSnapshot = inflinkSnapshot?.active
      ? inflinkSnapshot
      : { available: false, active: false };

    if (trustedInflinkSnapshot.active) {
      return normalizeMediaSnapshot(trustedInflinkSnapshot);
    }

    const enrichedMediaSnapshot = await maybeEnrichWithNetease(mediaSnapshot);
    const neteaseSnapshot = platform === "win32" ? await neteaseProvider.getSnapshot() : { available: false, active: false };

    return chooseMediaSnapshot(enrichedMediaSnapshot, neteaseSnapshot, trustedInflinkSnapshot);
  }

  return {
    maybeEnrichWithNetease,
    queryMediaSnapshot,
    queryWindowsMediaSnapshot
  };
}

module.exports = {
  createMediaSourceQuery
};
