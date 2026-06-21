# System metrics probe helper (pure ASCII). Resident process.
# Replaces the per-tick `powershell.exe` cold starts that system-monitor.js used
# to spawn for GPU and disk: instead this single long-lived process loops in-place
# and emits one JSON line whenever it has a fresh GPU or disk reading. CPU/memory
# stay on the Node `os` API in the main process; only the two genuinely
# Windows-specific queries live here.
# Protocol: stdout JSON lines. Started/managed by native-system.js.

param(
  [int]$GpuIntervalMs = 1500,
  [int]$DiskIntervalMs = 5000
)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# GPU utilization across all engines. Primary path is the locale-independent CIM
# perf class; falls back to the (localized) Get-Counter path, then to 0. Mirrors
# the query that previously lived in system-monitor.js so the value is identical.
function Get-GpuPercent {
  $sum = 0
  try {
    $items = Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop
    $sum = ($items |
      Where-Object { $_.Name -match "engtype_" } |
      Measure-Object -Property UtilizationPercentage -Sum).Sum
  } catch {
    try {
      $counter = Get-Counter "\GPU Engine(*)\Utilization Percentage" -ErrorAction Stop
      $sum = ($counter.CounterSamples |
        Where-Object { $_.InstanceName -match "engtype_" } |
        Measure-Object -Property CookedValue -Sum).Sum
    } catch {
      $sum = 0
    }
  }

  if ($null -eq $sum) {
    $sum = 0
  }

  return [Math]::Min(100, [Math]::Max(0, [Math]::Round([Double]$sum)))
}

# Fixed-drive (DriveType=3) sizes + volume labels, sorted by drive letter. Emits
# raw bytes; the GB rounding / usedPercent / top-4 trimming stay in JS
# (system-monitor.js normalizeDiskItems) so that math remains unit-testable.
function Get-DiskItems {
  return @(
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue |
      Sort-Object DeviceID |
      Select-Object `
        @{Name="name";Expression={$_.DeviceID}}, `
        @{Name="label";Expression={$_.VolumeName}}, `
        @{Name="size";Expression={[Int64]$_.Size}}, `
        @{Name="free";Expression={[Int64]$_.FreeSpace}}
  )
}

function Write-JsonLine($obj) {
  try {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch { }
}

# Announce readiness once.
Write-JsonLine @{ type = "status"; status = "ready" }

$gpuInterval = [Math]::Max(400, $GpuIntervalMs)
$diskInterval = [Math]::Max(1000, $DiskIntervalMs)
$lastGpuAt = -1000000
$lastDiskAt = -1000000

while ($true) {
  $now = [Environment]::TickCount64

  if ($now - $lastGpuAt -ge $gpuInterval) {
    $lastGpuAt = $now
    Write-JsonLine @{ type = "gpu"; gpuPercent = (Get-GpuPercent) }
  }

  if ($now - $lastDiskAt -ge $diskInterval) {
    $lastDiskAt = $now
    # @(...) keeps a single disk from being unwrapped, but PowerShell still
    # collapses a one-element array to a bare object in JSON; native-system.js
    # coerces back to an array on the JS side, so both shapes are handled.
    Write-JsonLine @{ type = "disk"; disks = (Get-DiskItems) }
  }

  Start-Sleep -Milliseconds 250
}
