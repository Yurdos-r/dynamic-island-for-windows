# Taskbar width probe (read-only, changes nothing).
# Run:  powershell -ExecutionPolicy Bypass -File .\scripts\probe-taskbar.ps1
# Run it twice: once with few taskbar icons, once with many, compare the numbers.

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class Win32Probe {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr child, string className, string windowName);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

function Show-Rect($label, $hwnd) {
  Write-Host ("`n[{0}] hwnd={1}" -f $label, $hwnd)
  if ($hwnd -eq [IntPtr]::Zero) { Write-Host "  (not found)"; return }
  $r = New-Object Win32Probe+RECT
  if ([Win32Probe]::GetWindowRect($hwnd, [ref]$r)) {
    Write-Host ("  Left={0} Right={1} Top={2} Bottom={3} Width={4} Height={5}" -f `
      $r.Left, $r.Right, $r.Top, $r.Bottom, ($r.Right - $r.Left), ($r.Bottom - $r.Top))
  } else {
    Write-Host "  GetWindowRect failed"
  }
}

Write-Host "=== Windows version ===" -ForegroundColor Cyan
Write-Host ([System.Environment]::OSVersion.Version.ToString())
Write-Host ((Get-CimInstance Win32_OperatingSystem).Caption)

Write-Host "`n=== Screens ===" -ForegroundColor Cyan
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  Write-Host ("Primary={0} Bounds={1} WorkingArea={2}" -f $_.Primary, $_.Bounds, $_.WorkingArea)
}

Write-Host "`n=== Taskbar window chain ===" -ForegroundColor Cyan

$tray = [Win32Probe]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "Shell_TrayWnd", $null)
Show-Rect "Shell_TrayWnd (whole taskbar)" $tray

$rebar = [Win32Probe]::FindWindowEx($tray, [IntPtr]::Zero, "ReBarWindow32", $null)
Show-Rect "ReBarWindow32" $rebar

$taskSw = [Win32Probe]::FindWindowEx($rebar, [IntPtr]::Zero, "MSTaskSwWClass", $null)
Show-Rect "MSTaskSwWClass" $taskSw

$taskList = [Win32Probe]::FindWindowEx($taskSw, [IntPtr]::Zero, "MSTaskListWClass", $null)
Show-Rect "MSTaskListWClass (CLASSIC: task button area)" $taskList

$trayNotify = [Win32Probe]::FindWindowEx($tray, [IntPtr]::Zero, "TrayNotifyWnd", $null)
Show-Rect "TrayNotifyWnd (right tray area)" $trayNotify

$xamlHost = [Win32Probe]::FindWindowEx($tray, [IntPtr]::Zero, "Windows.UI.Composition.DesktopWindowContentBridge", $null)
Show-Rect "DesktopWindowContentBridge (Win11 XAML, if any)" $xamlHost

Write-Host "`n=== NOTE ===" -ForegroundColor Yellow
Write-Host "Open/close a few apps so taskbar icons change, run again, see which Width/Left/Right moves."
Write-Host "That changing value is the live signal the capsule will use. Paste both runs back."
