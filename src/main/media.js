const { runPowerShellJson: defaultRunPowerShellJson, runTextCommand: defaultRunTextCommand } = require("./commands");
const { createInflinkBridge } = require("./inflink-bridge");
const { createNativeMediaSession } = require("./native-media");
const { createNeteaseProvider, isNeteaseSnapshot } = require("./netease");

const MEDIA_POLL_INTERVAL = 300;
const MEDIA_CONTROL_ACTIONS = new Set(["toggle-play", "previous-track", "next-track", "favorite-track"]);
const MEDIA_KEY_CODES = {
  "previous-track": 0xb1,
  "next-track": 0xb0,
  "toggle-play": 0xb3
};
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

function mediaSessionPrelude(body) {
  return `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Await-WinRtOperation($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  } | Select-Object -First 1

  if ($null -eq $method) {
    throw "Unable to bind Windows Runtime async operation."
  }

  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

try {
  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $manager = Await-WinRtOperation $managerType::RequestAsync() $managerType
  $session = $manager.GetCurrentSession()

  if ($null -eq $session) {
    @{ available = $false; active = $false } | ConvertTo-Json -Compress
    exit 0
  }

${body}
} catch {
  @{
    available = $false
    active = $false
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress
}
`;
}

function getMediaQueryScript() {
  return mediaSessionPrelude(`
  $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
  $props = Await-WinRtOperation $session.TryGetMediaPropertiesAsync() $propsType
  $playback = $session.GetPlaybackInfo()
  $timeline = $session.GetTimelineProperties()
  $status = [string]$playback.PlaybackStatus
  $durationSeconds = [Math]::Max(0, [Math]::Round(($timeline.EndTime - $timeline.StartTime).TotalSeconds))
  $positionSeconds = [Math]::Max(0, [Math]::Round(($timeline.Position - $timeline.StartTime).TotalSeconds))
  $title = [string]$props.Title
  $artist = [string]$props.Artist
  $albumArtist = [string]$props.AlbumArtist
  $sourceApp = [string]$session.SourceAppUserModelId
  $genres = @($props.Genres | ForEach-Object { [string]$_ })
  $hasTrack = -not [string]::IsNullOrWhiteSpace($title) -or -not [string]::IsNullOrWhiteSpace($artist)
  $active = $hasTrack -and ($status -eq "Playing" -or $status -eq "Paused" -or $status -eq "Changing")

  @{
    available = $true
    active = $active
    playing = $status -eq "Playing"
    status = $status
    title = $title
    artist = $artist
    albumArtist = $albumArtist
    albumTitle = [string]$props.AlbumTitle
    genres = $genres
    sourceApp = $sourceApp
    durationSeconds = $durationSeconds
    positionSeconds = $positionSeconds
  } | ConvertTo-Json -Compress
`);
}

function getMediaControlScript(action, positionSeconds = 0) {
  const safePositionTicks = Math.max(0, Math.round(Number(positionSeconds) || 0)) * 10_000_000;

  return mediaSessionPrelude(`
  $action = "${action}"
  $positionTicks = [Int64]${safePositionTicks}

  if ($action -eq "seek") {
    $timeline = $session.GetTimelineProperties()
    $startTicks = [Int64]$timeline.StartTime.Ticks
    $endTicks = [Int64]$timeline.EndTime.Ticks
    $minSeekTicks = [Int64]$timeline.MinSeekTime.Ticks
    $maxSeekTicks = [Int64]$timeline.MaxSeekTime.Ticks

    if ($minSeekTicks -eq 0 -and $maxSeekTicks -eq 0) {
      $minSeekTicks = $startTicks
      $maxSeekTicks = $endTicks
    } elseif ($maxSeekTicks -lt $minSeekTicks) {
      $maxSeekTicks = $endTicks
    }

    $targetTicks = $startTicks + $positionTicks
    $targetTicks = [Math]::Max($minSeekTicks, [Math]::Min($maxSeekTicks, $targetTicks))
    $operation = $session.TryChangePlaybackPositionAsync($targetTicks)
  } elseif ($action -eq "toggle-play") {
    $operation = $session.TryTogglePlayPauseAsync()
  } elseif ($action -eq "previous-track") {
    $operation = $session.TrySkipPreviousAsync()
  } elseif ($action -eq "next-track") {
    $operation = $session.TrySkipNextAsync()
  } else {
    throw "Unsupported media command."
  }

  $ok = Await-WinRtOperation $operation ([Boolean])
  @{
    available = $true
    active = $true
    ok = [Boolean]$ok
    action = $action
    requestedPositionTicks = if ($action -eq "seek") { $targetTicks } else { $positionTicks }
  } | ConvertTo-Json -Compress
`);
}

function getMediaKeyControlScript(action) {
  const keyCode = MEDIA_KEY_CODES[action];
  if (!keyCode) {
    return "";
  }

  return `
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class MediaKeyboard {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@

$key = [byte]${keyCode}
[MediaKeyboard]::keybd_event($key, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 36
[MediaKeyboard]::keybd_event($key, 0, 2, [UIntPtr]::Zero)

@{
  available = $true
  active = $true
  ok = $true
  action = "${action}"
  transport = "media-key"
} | ConvertTo-Json -Compress
`;
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
