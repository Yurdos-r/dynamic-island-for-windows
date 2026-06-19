const { runPowerShellJson: defaultRunPowerShellJson, runTextCommand: defaultRunTextCommand } = require("./commands");
const { createInflinkBridge } = require("./inflink-bridge");
const { createNativeMediaSession } = require("./native-media");
const { createNeteaseProvider, isNeteaseSnapshot } = require("./netease");
const {
  chooseMediaSnapshot,
  isCloudMusicMediaSnapshot,
  isInflinkBridgeSnapshot,
  isPlaceholderArtist,
  normalizeMediaSnapshot
} = require("./media/media-normalizer");
const {
  getMediaControlScript,
  getMediaKeyControlScript,
  getMediaQueryScript
} = require("./media/windows-media-scripts");
const { MEDIA_CONTROL_ACTION_SET } = require("../shared/island-contracts");

const MEDIA_POLL_INTERVAL = 300;
const MEDIA_CONTROL_ACTIONS = MEDIA_CONTROL_ACTION_SET;

function createMediaController(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const runPowerShellJson = options.runPowerShellJson || defaultRunPowerShellJson;
  const runTextCommand = options.runTextCommand || defaultRunTextCommand;
  const platform = options.platform || process.platform;
  const neteaseProvider = createNeteaseProvider({ logStartup, runTextCommand });
  const nativeMediaSession = createNativeMediaSession({
    logStartup,
    platform,
    pollInterval: MEDIA_POLL_INTERVAL
  });
  const inflinkBridge = createInflinkBridge({
    logStartup,
    onSnapshot: (snapshot) => {
      sendMediaSnapshot(normalizeMediaSnapshot(snapshot));
    }
  });
  let pollTimer;
  let pollInFlight = false;
  let lastPayload = "";
  let lastLogKey = "";
  let lastActiveSnapshot;
  let fallbackMediaQueryLogged = false;

  function sendMediaSnapshot(snapshot) {
    if (snapshot?.active) {
      lastActiveSnapshot = snapshot;
    }

    const payload = JSON.stringify({ ...snapshot, updatedAt: 0 });
    if (payload === lastPayload) {
      return;
    }

    lastPayload = payload;

    const logKey = [
      snapshot.active,
      snapshot.source,
      snapshot.sourceApp,
      snapshot.title,
      snapshot.artist,
      snapshot.status,
      snapshot.playing,
      snapshot.durationSeconds
    ].join("|");

    if (logKey !== lastLogKey) {
      lastLogKey = logKey;
      logStartup("media-update", {
        source: snapshot.source,
        sourceApp: snapshot.sourceApp,
        title: snapshot.title,
      artist: snapshot.artist,
      active: snapshot.active,
      hasCover: Boolean(snapshot.cover),
      ncmId: snapshot.ncmId || "",
      durationSeconds: snapshot.durationSeconds
    });
    }

    emitSnapshot(snapshot);
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

    if (!fallbackMediaQueryLogged) {
      fallbackMediaQueryLogged = true;
      logStartup("native-media-fallback-query", {
        waitingForNative: Boolean(nativeSnapshot.waitingForNative),
        nativeReady: Boolean(nativeSnapshot.nativeReady)
      });
    }

    return runPowerShellJson(getMediaQueryScript());
  }

  async function runNativeOrPowerShellControl(action, positionSeconds = 0) {
    const nativeResult = await nativeMediaSession.control(action, positionSeconds);

    if (nativeResult.ok) {
      return nativeResult;
    }

    const fallbackResult = await runPowerShellJson(getMediaControlScript(action, positionSeconds));
    if (fallbackResult.ok) {
      logStartup("native-media-control-fallback-ok", {
        action,
        nativeError: nativeResult.error || ""
      });
    }

    return fallbackResult.ok ? fallbackResult : nativeResult;
  }

  async function poll() {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;

    try {
      const rawSnapshot = await queryWindowsMediaSnapshot();
      const mediaSnapshot = normalizeMediaSnapshot(rawSnapshot);
      const inflinkSnapshot = platform === "win32" ? inflinkBridge.getSnapshot() : { available: false, active: false };
      // The inflink bridge talks directly to BetterNCM, so when it reports an
      // active track it is the most authoritative source we have — it carries
      // the real ncmId and the real play/pause state. Trust it on its own,
      // without also requiring the Windows GSMTC session to be active (NetEase
      // Cloud Music often does not register with GSMTC at all, which used to
      // make us discard the bridge and fall back to stale cache files).
      const trustedInflinkSnapshot = inflinkSnapshot?.active
        ? inflinkSnapshot
        : { available: false, active: false };

      if (trustedInflinkSnapshot.active) {
        sendMediaSnapshot(normalizeMediaSnapshot(trustedInflinkSnapshot));
        return;
      }

      const enrichedMediaSnapshot = await maybeEnrichWithNetease(mediaSnapshot);
      const neteaseSnapshot = platform === "win32" ? await neteaseProvider.getSnapshot() : { available: false, active: false };

      sendMediaSnapshot(chooseMediaSnapshot(enrichedMediaSnapshot, neteaseSnapshot, trustedInflinkSnapshot));
    } finally {
      pollInFlight = false;
    }
  }

  function start() {
    if (pollTimer) {
      return;
    }

    void inflinkBridge.start();
    nativeMediaSession.start();
    void poll();
    pollTimer = setInterval(() => {
      void poll();
    }, MEDIA_POLL_INTERVAL);
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    inflinkBridge.stop();
    nativeMediaSession.stop();
  }

  function pollSoon(delay = 650) {
    setTimeout(() => {
      void poll();
    }, delay);
  }

  async function control(action, positionSeconds) {
    if (platform !== "win32") {
      return { ok: false, available: false };
    }

    if (action === "seek") {
      const seekSeconds = Math.max(0, Math.round(Number(positionSeconds) || 0));
      const shouldUseInflinkBridgeSeek = isInflinkBridgeSnapshot(lastActiveSnapshot);
      const shouldUseNeteaseSeek = isNeteaseSnapshot(lastActiveSnapshot);

      if (shouldUseInflinkBridgeSeek || shouldUseNeteaseSeek) {
        const inflinkResult = await inflinkBridge.seek(seekSeconds, lastActiveSnapshot);

        logStartup("media-seek", {
          transport: "inflink-bridge",
          ok: Boolean(inflinkResult.ok),
          positionSeconds: seekSeconds,
          error: inflinkResult.error || ""
        });

        if (inflinkResult.ok) {
          if (shouldUseNeteaseSeek) {
            neteaseProvider.setPlaybackPosition(seekSeconds);
          }
          pollSoon(350);
          return inflinkResult;
        }
      }

      if (shouldUseNeteaseSeek) {
        const neteaseResult = await neteaseProvider.runWebCommand({
          cmd: "seek",
          value: seekSeconds,
          channel: "dynamic-island"
        });

        if (neteaseResult.ok) {
          neteaseProvider.setPlaybackPosition(seekSeconds);
          pollSoon();

          logStartup("media-seek", {
            transport: "netease-webcmd",
            ok: true,
            positionSeconds: seekSeconds,
            executablePath: neteaseResult.executablePath
          });

          return {
            ok: true,
            available: true,
            active: true,
            action,
            transport: "netease-webcmd"
          };
        }

        const mediaSessionResult = await runNativeOrPowerShellControl(action, seekSeconds);

        if (mediaSessionResult.ok) {
          neteaseProvider.setPlaybackPosition(seekSeconds);
          pollSoon(350);
          logStartup("media-seek", {
            transport: "windows-media-session",
            ok: true,
            positionSeconds: seekSeconds,
            requestedPositionTicks: mediaSessionResult.requestedPositionTicks,
            source: lastActiveSnapshot?.source || "",
            sourceApp: lastActiveSnapshot?.sourceApp || ""
          });

          return mediaSessionResult;
        }

        pollSoon(350);
        logStartup("media-seek", {
          transport: "netease-webcmd",
          ok: false,
          positionSeconds: seekSeconds,
          mediaSessionError: mediaSessionResult.error || mediaSessionResult.stderr || "windows media session seek failed",
          error: neteaseResult.error || neteaseResult.stderr || "netease webcmd failed"
        });

        return {
          ok: false,
          available: true,
          active: true,
          action,
          transport: "netease-webcmd",
          error: neteaseResult.error || neteaseResult.stderr || "netease webcmd failed"
        };
      }

      const mediaSessionResult = await runNativeOrPowerShellControl(action, seekSeconds);

      if (mediaSessionResult.ok) {
        pollSoon(350);
        logStartup("media-seek", {
          transport: "windows-media-session",
          ok: true,
          positionSeconds: seekSeconds,
          requestedPositionTicks: mediaSessionResult.requestedPositionTicks,
          source: lastActiveSnapshot?.source || "",
          sourceApp: lastActiveSnapshot?.sourceApp || ""
        });

        return mediaSessionResult;
      }

      pollSoon(350);
      logStartup("media-seek", {
        transport: "windows-media-session",
        ok: Boolean(mediaSessionResult.ok),
        positionSeconds: seekSeconds,
        requestedPositionTicks: mediaSessionResult.requestedPositionTicks,
        error: mediaSessionResult.error || mediaSessionResult.stderr || ""
      });

      return mediaSessionResult;
    }

    if (action === "favorite-track") {
      const shouldUseInflinkBridgeControl =
        isInflinkBridgeSnapshot(lastActiveSnapshot) ||
        isNeteaseSnapshot(lastActiveSnapshot) ||
        isCloudMusicMediaSnapshot(lastActiveSnapshot);
      if (shouldUseInflinkBridgeControl) {
        const inflinkResult = await inflinkBridge.control(action, lastActiveSnapshot);

        logStartup("media-control", {
          transport: "inflink-bridge",
          action,
          ok: Boolean(inflinkResult.ok),
          favorited: inflinkResult.favorited,
          error: inflinkResult.error || ""
        });

        if (inflinkResult.ok) {
          if (typeof inflinkResult.favorited === "boolean" && lastActiveSnapshot) {
            lastActiveSnapshot = {
              ...lastActiveSnapshot,
              favorited: inflinkResult.favorited
            };
          }
          pollSoon(350);
          return inflinkResult;
        }
      }

      return {
        ok: false,
        available: Boolean(lastActiveSnapshot?.active),
        active: Boolean(lastActiveSnapshot?.active),
        action,
        transport: "inflink-bridge",
        error: "Favorite requires the BetterNCM Dynamic Island bridge."
      };
    }

    const shouldUseInflinkBridgeControl = isInflinkBridgeSnapshot(lastActiveSnapshot);
    const shouldUseMediaKeyFirst = action !== "seek" && isNeteaseSnapshot(lastActiveSnapshot);

    if (shouldUseInflinkBridgeControl) {
      const inflinkResult = await inflinkBridge.control(action, lastActiveSnapshot);
      logStartup("media-control", {
        transport: "inflink-bridge",
        action,
        ok: Boolean(inflinkResult.ok),
        error: inflinkResult.error || ""
      });

      if (inflinkResult.ok) {
        pollSoon(350);
        return inflinkResult;
      }
    }

    if (shouldUseMediaKeyFirst) {
      const keyResult = await runPowerShellJson(getMediaKeyControlScript(action));
      if (keyResult.ok) {
        neteaseProvider.nudgePlaybackAfterControl(action);
        pollSoon();
        return keyResult;
      }
    }

    const result = await runNativeOrPowerShellControl(action, positionSeconds);
    if (!result.ok && action !== "seek") {
      const keyResult = await runPowerShellJson(getMediaKeyControlScript(action));
      if (keyResult.ok) {
        neteaseProvider.nudgePlaybackAfterControl(action);
        pollSoon();
        return keyResult;
      }
    }

    pollSoon(350);
    return result;
  }

  return {
    start,
    stop,
    poll,
    control
  };
}

module.exports = {
  MEDIA_CONTROL_ACTIONS,
  createMediaController,
  normalizeMediaSnapshot
};
