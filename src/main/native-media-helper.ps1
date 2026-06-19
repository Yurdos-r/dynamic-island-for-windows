param(
  [int]$PollIntervalMs = 300,
  [string]$CommandDir = ""
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$script:manager = $null
$script:managerReady = $false
$script:managerError = ""
$script:lastManagerAttemptMs = 0
$script:lastStatusKey = ""
$managerRetryMs = 5000

function Await-WinRtOperation($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethodDefinition -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1

  if ($null -eq $method) {
    throw "Unable to bind Windows Runtime async operation."
  }

  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

function Write-JsonLine($Payload) {
  try {
    $json = $Payload | ConvertTo-Json -Compress -Depth 6
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch {
  }
}

function Get-NowMs {
  return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function Write-StatusLine($Status, $ErrorMessage = "") {
  $key = "$Status|$ErrorMessage"
  if ($key -eq $script:lastStatusKey) {
    return
  }

  $script:lastStatusKey = $key
  Write-JsonLine @{
    type = "status"
    status = $Status
    transport = "native-gsmtc-helper"
    error = $ErrorMessage
    updatedAt = Get-NowMs
  }
}

function Initialize-MediaManager {
  $script:lastManagerAttemptMs = Get-NowMs

  try {
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $script:managerType = $managerType
    $script:manager = Await-WinRtOperation $managerType::RequestAsync() $managerType
    $script:managerReady = $true
    $script:managerError = ""
    Write-StatusLine "ready"
  } catch {
    $script:manager = $null
    $script:managerReady = $false
    $script:managerError = $_.Exception.Message
    Write-StatusLine "unavailable" $script:managerError
  }
}

function Get-MediaSession {
  $nowMs = Get-NowMs
  if ($null -eq $script:manager -and ($nowMs - $script:lastManagerAttemptMs) -ge $managerRetryMs) {
    Initialize-MediaManager
  }

  if ($null -eq $script:manager) {
    return $null
  }

  try {
    return $script:manager.GetCurrentSession()
  } catch {
    $script:manager = $null
    $script:managerReady = $false
    $script:managerError = $_.Exception.Message
    Write-StatusLine "unavailable" $script:managerError
    return $null
  }
}

function Get-MediaSnapshot {
  try {
    $session = Get-MediaSession

    if ($null -eq $session) {
      return @{
        type = "snapshot"
        available = $script:managerReady
        active = $false
        nativeUnavailable = -not $script:managerReady
        source = "windows-media-session"
        transport = "native-gsmtc-helper"
        error = $script:managerError
        updatedAt = Get-NowMs
      }
    }

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

    return @{
      type = "snapshot"
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
      source = "windows-media-session"
      transport = "native-gsmtc-helper"
      controllable = $true
      durationSeconds = $durationSeconds
      positionSeconds = $positionSeconds
      updatedAt = Get-NowMs
    }
  } catch {
    return @{
      type = "snapshot"
      available = $false
      active = $false
      nativeUnavailable = $true
      source = "windows-media-session"
      transport = "native-gsmtc-helper"
      error = $_.Exception.Message
      updatedAt = Get-NowMs
    }
  }
}

function Invoke-MediaCommand($Command) {
  $id = [string]$Command.id
  $action = [string]$Command.action

  try {
    $session = Get-MediaSession
    if ($null -eq $session) {
      Write-JsonLine @{
        type = "control-result"
        id = $id
        available = $false
        active = $false
        ok = $false
        action = $action
        transport = "native-gsmtc-helper"
        error = "No active media session."
        updatedAt = Get-NowMs
      }
      return
    }

    if ($action -eq "seek") {
      $positionTicks = [Int64]([Math]::Max(0, [Math]::Round([double]$Command.positionSeconds)) * 10000000)
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
    Write-JsonLine @{
      type = "control-result"
      id = $id
      available = $true
      active = $true
      ok = [Boolean]$ok
      action = $action
      transport = "native-gsmtc-helper"
      requestedPositionTicks = if ($action -eq "seek") { $targetTicks } else { 0 }
      updatedAt = Get-NowMs
    }
  } catch {
    Write-JsonLine @{
      type = "control-result"
      id = $id
      available = $true
      active = $false
      ok = $false
      action = $action
      transport = "native-gsmtc-helper"
      error = $_.Exception.Message
      updatedAt = Get-NowMs
    }
  }
}

function Invoke-QueuedCommands {
  if ([string]::IsNullOrWhiteSpace($CommandDir) -or -not (Test-Path -LiteralPath $CommandDir)) {
    return
  }

  Get-ChildItem -LiteralPath $CommandDir -Filter "*.json" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime |
    Select-Object -First 12 |
    ForEach-Object {
      $file = $_.FullName
      $payload = $null
      try {
        $payload = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
      } catch {
      }

      Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue

      if ($null -ne $payload) {
        Invoke-MediaCommand $payload
      }
    }
}

if (-not [string]::IsNullOrWhiteSpace($CommandDir)) {
  New-Item -ItemType Directory -Path $CommandDir -Force | Out-Null
}

Initialize-MediaManager

while ($true) {
  Invoke-QueuedCommands
  Write-JsonLine (Get-MediaSnapshot)
  Start-Sleep -Milliseconds ([Math]::Max(100, $PollIntervalMs))
}
