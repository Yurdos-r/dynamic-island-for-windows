const { isNeteaseSnapshot } = require("../netease");
const {
  isCloudMusicMediaSnapshot,
  isInflinkBridgeSnapshot
} = require("./media-normalizer");
const {
  getMediaControlScript,
  getMediaKeyControlScript
} = require("./windows-media-scripts");

function createMediaControlRouter(options = {}) {
  const platform = options.platform || process.platform;
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runPowerShellJson = options.runPowerShellJson;
  const nativeMediaSession = options.nativeMediaSession;
  const inflinkBridge = options.inflinkBridge;
  const neteaseProvider = options.neteaseProvider;
  const runtime = options.runtime;
  const pollSoon = typeof options.pollSoon === "function" ? options.pollSoon : () => {};

  if (typeof runPowerShellJson !== "function") {
    throw new Error("runPowerShellJson is required to create media control router.");
  }
  if (!nativeMediaSession || !inflinkBridge || !neteaseProvider || !runtime) {
    throw new Error("native media, inflink bridge, netease provider, and runtime are required to create media control router.");
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

  async function control(action, positionSeconds) {
    if (platform !== "win32") {
      return { ok: false, available: false };
    }

    if (action === "seek") {
      const seekSeconds = Math.max(0, Math.round(Number(positionSeconds) || 0));
      const lastActiveSnapshot = runtime.getLastActiveSnapshot();
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
      const lastActiveSnapshot = runtime.getLastActiveSnapshot();
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
            runtime.setLastActiveSnapshot({
              ...lastActiveSnapshot,
              favorited: inflinkResult.favorited
            });
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

    const lastActiveSnapshot = runtime.getLastActiveSnapshot();
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
    control,
    runNativeOrPowerShellControl
  };
}

module.exports = {
  createMediaControlRouter
};
