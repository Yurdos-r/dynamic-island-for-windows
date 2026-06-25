const { runPowerShellJson: defaultRunPowerShellJson } = require("./commands");

const PRIVACY_POLL_INTERVAL = 1000;
const PRIVACY_KIND_PRIORITY = ["camera", "microphone", "location"];
const PRIVACY_KINDS = new Set(PRIVACY_KIND_PRIORITY);

function getPrivacyQueryScript() {
  return `
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Convert-ToInt64($Value) {
  try {
    if ($null -eq $Value) {
      return [Int64]0
    }

    return [Int64]$Value
  } catch {
    return [Int64]0
  }
}

$now = [Int64]([DateTime]::UtcNow.ToFileTimeUtc())
# Location reads are momentary (~2ms), unlike camera/microphone which stay held
# for seconds or minutes. A 1Hz poll almost never lands inside the in-use
# (stop==0) window, so we also count a capability as active for a short linger
# after its last use (5s, expressed in 100ns FILETIME ticks).
$lingerTicks = [Int64]50000000

$basePath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore"
$capabilities = @(
  @{ Kind = "microphone"; Key = "microphone" },
  @{ Kind = "camera"; Key = "webcam" },
  @{ Kind = "location"; Key = "location" }
)
$activeItems = @()

foreach ($capability in $capabilities) {
  $path = Join-Path $basePath $capability.Key
  if (-not (Test-Path $path)) {
    continue
  }

  Get-ChildItem -Path $path -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $item = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
    $start = Convert-ToInt64 $item.LastUsedTimeStart
    $stop = Convert-ToInt64 $item.LastUsedTimeStop

    if ($start -gt 0) {
      $inUse = ($stop -eq 0)
      $recentlyUsed = ($stop -gt 0 -and ($now - $stop) -le $lingerTicks)

      if ($inUse -or $recentlyUsed) {
        $activeItems += [PSCustomObject]@{
          kind = $capability.Kind
          app = $_.PSChildName
          startedAt = $start
        }
      }
    }
  }
}

$activeKinds = @($activeItems | Select-Object -ExpandProperty kind -Unique)
@{
  available = $true
  active = @($activeItems).Count -gt 0
  activeKinds = @($activeKinds)
  items = @($activeItems | Select-Object -First 8)
} | ConvertTo-Json -Compress -Depth 4
`;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === "string" ? [value] : [];
}

function normalizePrivacySnapshot(rawSnapshot = {}) {
  const items = Array.isArray(rawSnapshot.items) ? rawSnapshot.items : [];
  const sanitizedItems = items
    .map((item) => ({
      kind: PRIVACY_KINDS.has(item?.kind) ? item.kind : "",
      app: typeof item?.app === "string" ? item.app.trim() : "",
      startedAt: Number.isFinite(item?.startedAt) ? item.startedAt : 0
    }))
    .filter((item) => item.kind);
  const withDisplayNames = sanitizedItems.map((item) => ({
    ...item,
    displayName: item.app.replace(/#/g, "\\").split("\\").filter(Boolean).pop() || item.app
  }));

  const rawKinds = normalizeStringArray(rawSnapshot.activeKinds)
    .concat(withDisplayNames.map((item) => item.kind));
  const activeKinds = PRIVACY_KIND_PRIORITY.filter((kind) => rawKinds.includes(kind));
  const kind = PRIVACY_KIND_PRIORITY.find((candidate) => activeKinds.includes(candidate)) || "none";
  const activeApps = withDisplayNames;
  const active = activeKinds.length > 0;

  return {
    available: rawSnapshot.available !== false,
    active,
    kind,
    activeKinds,
    apps: activeApps,
    updatedAt: Date.now()
  };
}

function createPrivacyMonitor(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const runPowerShellJson = options.runPowerShellJson || defaultRunPowerShellJson;
  let pollTimer;
  let pollInFlight = false;
  let lastPayload = "";

  function sendPrivacySnapshot(snapshot) {
    const payload = JSON.stringify({ ...snapshot, updatedAt: 0 });
    if (payload === lastPayload) {
      return;
    }

    lastPayload = payload;
    logStartup("privacy-update", {
      active: snapshot.active,
      kind: snapshot.kind,
      activeKinds: snapshot.activeKinds
    });
    emitSnapshot(snapshot);
  }

  async function poll() {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;

    try {
      const rawSnapshot =
        process.platform === "win32"
          ? await runPowerShellJson(getPrivacyQueryScript(), { timeout: 3500, maxBuffer: 256 * 1024 })
          : { available: false, active: false };
      sendPrivacySnapshot(normalizePrivacySnapshot(rawSnapshot));
    } finally {
      pollInFlight = false;
    }
  }

  function start() {
    if (pollTimer) {
      return;
    }

    void poll();
    pollTimer = setInterval(() => {
      void poll();
    }, PRIVACY_POLL_INTERVAL);
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  return {
    start,
    stop,
    poll
  };
}

module.exports = {
  createPrivacyMonitor,
  normalizePrivacySnapshot
};
