const MEDIA_KEY_CODES = {
  "previous-track": 0xb1,
  "next-track": 0xb0,
  "toggle-play": 0xb3
};

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

module.exports = {
  getMediaControlScript,
  getMediaKeyControlScript,
  getMediaQueryScript
};
