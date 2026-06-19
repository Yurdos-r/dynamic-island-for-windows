# Taskbar probe helper (pure ASCII). Resident process.
# Emits one JSON line per poll with the icon-area (ReBarWindow32) rect, so the
# main process can shrink the capsule when the centered taskbar grows toward it.
# Also reports taskbar VISIBILITY (visible=false when a fullscreen app covers the
# taskbar's monitor, or when an auto-hide taskbar has retracted off-screen), so
# the main process can fade the capsules out in lockstep with the taskbar.
# Protocol: stdout JSON lines. Started/managed by native-taskbar.js.

param(
  [int]$PollIntervalMs = 400
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class TaskbarProbe {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string className, string windowName);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern IntPtr MonitorFromWindow(IntPtr hWnd, int flags);

  [DllImport("user32.dll")]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

  [DllImport("user32.dll")]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int maxCount);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }
}
"@

$MONITOR_DEFAULTTONEAREST = 2
# Foreground window classes that are part of the shell itself; a fullscreen one
# of these is the desktop, not an app covering the taskbar.
$ShellClasses = @("Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow")

function Get-TrayHandle {
  return [TaskbarProbe]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "Shell_TrayWnd", $null)
}

function Get-RebarRect($tray) {
  if ($tray -eq [IntPtr]::Zero) { return $null }
  $rebar = [TaskbarProbe]::FindWindowEx($tray, [IntPtr]::Zero, "ReBarWindow32", $null)
  if ($rebar -eq [IntPtr]::Zero) { return $null }
  $r = New-Object TaskbarProbe+RECT
  if (-not [TaskbarProbe]::GetWindowRect($rebar, [ref]$r)) { return $null }
  return $r
}

function Get-ClassNameOf($hWnd) {
  $sb = New-Object System.Text.StringBuilder 256
  [void][TaskbarProbe]::GetClassName($hWnd, $sb, $sb.Capacity)
  return $sb.ToString()
}

# Returns $true when the taskbar is currently hidden: either an auto-hide bar has
# retracted below the screen, or a fullscreen foreground app covers its monitor.
# A merely maximized window stops at the work area (above the taskbar) and does
# NOT count as fullscreen, so the capsule stays visible for it.
function Get-TaskbarHidden($tray) {
  if ($tray -eq [IntPtr]::Zero) { return $false }

  $tr = New-Object TaskbarProbe+RECT
  if (-not [TaskbarProbe]::GetWindowRect($tray, [ref]$tr)) { return $false }

  $mon = [TaskbarProbe]::MonitorFromWindow($tray, $MONITOR_DEFAULTTONEAREST)
  $mi = New-Object TaskbarProbe+MONITORINFO
  $mi.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($mi)
  if (-not [TaskbarProbe]::GetMonitorInfo($mon, [ref]$mi)) { return $false }

  # (a) auto-hide retracted: the bar slid to/below the monitor's bottom edge.
  if ($tr.Top -ge $mi.rcMonitor.Bottom - 2) { return $true }

  # (b) fullscreen foreground window covering the taskbar's monitor.
  $fg = [TaskbarProbe]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero -and $fg -ne $tray) {
    $cls = Get-ClassNameOf $fg
    if ($ShellClasses -notcontains $cls) {
      $fr = New-Object TaskbarProbe+RECT
      if ([TaskbarProbe]::GetWindowRect($fg, [ref]$fr)) {
        $fgMon = [TaskbarProbe]::MonitorFromWindow($fg, $MONITOR_DEFAULTTONEAREST)
        $coversWidth = ($fr.Left -le $mi.rcMonitor.Left + 2) -and ($fr.Right -ge $mi.rcMonitor.Right - 2)
        $coversHeight = ($fr.Top -le $mi.rcMonitor.Top + 2) -and ($fr.Bottom -ge $mi.rcMonitor.Bottom - 2)
        if ($fgMon -eq $mon -and $coversWidth -and $coversHeight) { return $true }
      }
    }
  }

  return $false
}

function Write-JsonLine($obj) {
  try {
    $json = $obj | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch { }
}

# Announce readiness once.
Write-JsonLine @{ type = "status"; status = "ready" }

$lastKey = ""
while ($true) {
  $tray = Get-TrayHandle
  $rect = Get-RebarRect $tray
  $hidden = Get-TaskbarHidden $tray
  $visible = -not $hidden

  if ($null -ne $rect) {
    # Key includes the visibility flag so a fullscreen toggle (rect unchanged but
    # visibility flipped) still emits an update instead of being de-duped away.
    $key = "$($rect.Left)|$($rect.Right)|$($rect.Top)|$($rect.Bottom)|$visible"
    if ($key -ne $lastKey) {
      $lastKey = $key
      Write-JsonLine @{
        type    = "taskbar"
        left    = $rect.Left
        right   = $rect.Right
        top     = $rect.Top
        bottom  = $rect.Bottom
        width   = ($rect.Right - $rect.Left)
        visible = $visible
      }
    }
  } else {
    # No taskbar rect (e.g. explorer restarting). Report unavailable but keep the
    # capsule visible so it never gets stuck hidden.
    $key = "none|$visible"
    if ($key -ne $lastKey) {
      $lastKey = $key
      Write-JsonLine @{ type = "taskbar"; available = $false; visible = $visible }
    }
  }
  Start-Sleep -Milliseconds ([Math]::Max(150, $PollIntervalMs))
}
