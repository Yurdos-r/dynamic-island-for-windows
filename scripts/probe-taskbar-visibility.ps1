# End-to-end regression: run the REAL helper script as a child process, capture
# its JSON lines while (1) no fullscreen window exists, then (2) a synthetic
# borderless full-monitor window is foreground. Assert the helper emits
# visible=true then visible=false. No manual interaction needed.
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName System.Windows.Forms

$helper = Join-Path $PSScriptRoot "src/main/native-taskbar-helper.ps1"
if (-not (Test-Path $helper)) { Write-Host "FAIL: helper not found at $helper"; exit 1 }

# Start helper, collecting stdout lines into a temp file.
$outFile = [System.IO.Path]::GetTempFileName()
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "powershell.exe"
$psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$helper`" -PollIntervalMs 250"
$psi.RedirectStandardOutput = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$sb = New-Object System.Text.StringBuilder
$handler = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
  if ($EventArgs.Data) { [void]$Event.MessageData.AppendLine($EventArgs.Data) }
} -MessageData $sb
[void]$proc.Start()
$proc.BeginOutputReadLine()

Start-Sleep -Seconds 2   # phase 1: taskbar visible

# phase 2: spawn synthetic fullscreen window
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = "None"; $form.StartPosition = "Manual"
$form.Bounds = $screen.Bounds; $form.TopMost = $true
$form.BackColor = "Black"; $form.ShowInTaskbar = $false
$form.Add_Shown({ $form.Activate() })
$form.Show(); [System.Windows.Forms.Application]::DoEvents()
Start-Sleep -Seconds 2   # let helper poll while fullscreen
[System.Windows.Forms.Application]::DoEvents()

$form.Close(); $form.Dispose()
Start-Sleep -Milliseconds 600

$proc.Kill()
Unregister-Event -SourceIdentifier $handler.Name
$lines = $sb.ToString() -split "`r?`n" | Where-Object { $_ -match '"type":"taskbar"' }

Write-Host "=== helper taskbar lines ==="
$lines | ForEach-Object { Write-Host "  $_" }

$sawVisible = $false; $sawHidden = $false
foreach ($l in $lines) {
  if ($l -match '"visible":true')  { $sawVisible = $true }
  if ($l -match '"visible":false') { $sawHidden = $true }
}
Write-Host ""
Write-Host ("sawVisible(true) = {0}   sawHidden(false) = {1}" -f $sawVisible, $sawHidden)
if ($sawVisible -and $sawHidden) { Write-Host "RESULT: PASS - helper flips visible across fullscreen toggle" }
else { Write-Host "RESULT: FAIL - did not observe both states (see lines above)"; exit 1 }
