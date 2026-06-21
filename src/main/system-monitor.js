const os = require("node:os");
const { createNativeSystemProbe } = require("./native-system");

const SYSTEM_MONITOR_INTERVAL_MS = 1000;
const DISK_REFRESH_INTERVAL_MS = 5000;
const GPU_REFRESH_INTERVAL_MS = 1500;

function readCpuSample() {
  return os.cpus().map((cpu) => {
    const idle = cpu.times.idle;
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle, total };
  });
}

function calculateCpuUsage(previousSample, nextSample) {
  if (!Array.isArray(previousSample) || !previousSample.length) {
    return 0;
  }

  const usages = nextSample
    .map((nextCpu, index) => {
      const previousCpu = previousSample[index];
      if (!previousCpu) {
        return 0;
      }

      const idleDelta = nextCpu.idle - previousCpu.idle;
      const totalDelta = nextCpu.total - previousCpu.total;
      return totalDelta > 0 ? 1 - idleDelta / totalDelta : 0;
    })
    .filter((value) => Number.isFinite(value));

  if (!usages.length) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((usages.reduce((sum, value) => sum + value, 0) / usages.length) * 100)));
}

function bytesToGb(bytes) {
  return Math.round((Math.max(0, Number(bytes) || 0) / 1024 ** 3) * 10) / 10;
}

function normalizeDiskItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return items
    .map((item) => {
      const size = Number(item?.size || 0);
      const free = Number(item?.free || 0);
      const used = Math.max(0, size - free);
      const usedPercent = size > 0 ? Math.round((used / size) * 100) : 0;

      return {
        name: String(item?.name || "").trim(),
        label: String(item?.label || "").trim(),
        sizeGb: bytesToGb(size),
        freeGb: bytesToGb(free),
        usedPercent: Math.max(0, Math.min(100, usedPercent))
      };
    })
    .filter((item) => item.name && item.sizeGb > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 4);
}

function getStateFromPressure(value) {
  if (value >= 90) {
    return "critical";
  }

  if (value >= 75) {
    return "warn";
  }

  return "ok";
}

function createSystemMonitor(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const probe =
    options.probe ||
    createNativeSystemProbe({
      logStartup,
      gpuInterval: GPU_REFRESH_INTERVAL_MS,
      diskInterval: DISK_REFRESH_INTERVAL_MS
    });
  let timer;
  let previousCpuSample = readCpuSample();
  const coreCount = os.cpus().length;
  let pollInFlight = false;
  let lastPayload = "";

  function poll() {
    if (pollInFlight) {
      return;
    }

    pollInFlight = true;

    try {
      const nextCpuSample = readCpuSample();
      const cpuPercent = calculateCpuUsage(previousCpuSample, nextCpuSample);
      previousCpuSample = nextCpuSample;

      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = Math.max(0, totalMemory - freeMemory);
      const memoryPercent = totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

      const diskItems = normalizeDiskItems(probe.getDiskItems());
      const gpuPercent = Math.max(0, Math.min(100, Math.round(Number(probe.getGpuPercent()) || 0)));

      const primaryDisk = diskItems[0];
      const diskPercent = primaryDisk?.usedPercent || 0;
      const pressure = Math.max(cpuPercent, memoryPercent, gpuPercent, diskPercent);
      const snapshot = {
        available: true,
        cpuPercent,
        memoryPercent,
        gpuPercent,
        memoryUsedGb: bytesToGb(usedMemory),
        memoryTotalGb: bytesToGb(totalMemory),
        diskPercent,
        disks: diskItems,
        uptimeSeconds: Math.max(0, Math.round(os.uptime())),
        coreCount,
        state: getStateFromPressure(pressure),
        updatedAt: Date.now()
      };
      const payload = JSON.stringify({ ...snapshot, updatedAt: 0 });

      if (payload !== lastPayload) {
        lastPayload = payload;
        emitSnapshot(snapshot);
      }
    } catch (error) {
      logStartup("system-monitor-error", error?.message || String(error));
      emitSnapshot({
        available: false,
        cpuPercent: 0,
        memoryPercent: 0,
        gpuPercent: 0,
        memoryUsedGb: 0,
        memoryTotalGb: 0,
        diskPercent: 0,
        disks: [],
        uptimeSeconds: 0,
        coreCount,
        state: "unknown",
        updatedAt: Date.now()
      });
    } finally {
      pollInFlight = false;
    }
  }

  function start() {
    if (timer) {
      return;
    }

    probe.start();
    poll();
    timer = setInterval(poll, SYSTEM_MONITOR_INTERVAL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }

    probe.stop();
  }

  return {
    start,
    stop,
    poll
  };
}

module.exports = {
  createSystemMonitor
};
