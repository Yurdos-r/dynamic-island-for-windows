import { createIcons } from "lucide";
import { lucideIcons } from "./app/icons";

// 系统监控视图的共享构建/同步逻辑。原本只存在于 system.ts（独立窗口），现在主窗口的
// 顶部居中布局也要内嵌系统监控卡片，于是抽成 root 作用域的纯函数：所有查询都基于传入的
// root 容器，而非全局 document/#app，这样主窗口与系统窗口互不串号。

export interface SystemDisk {
  name: string;
  label?: string;
  sizeGb: number;
  freeGb: number;
  usedPercent: number;
}

export interface SystemSnapshot {
  available: boolean;
  cpuPercent: number;
  memoryPercent: number;
  gpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskPercent: number;
  disks: SystemDisk[];
  uptimeSeconds: number;
  coreCount: number;
  state: "ok" | "warn" | "critical" | "unknown";
  updatedAt: number;
}

const TILE_COUNT = 24;

export const EMPTY_SYSTEM_SNAPSHOT: SystemSnapshot = {
  available: false,
  cpuPercent: 0,
  memoryPercent: 0,
  gpuPercent: 0,
  memoryUsedGb: 0,
  memoryTotalGb: 0,
  diskPercent: 0,
  disks: [],
  uptimeSeconds: 0,
  coreCount: 0,
  state: "unknown",
  updatedAt: 0
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatGb(value: number) {
  return `${Math.max(0, Number(value) || 0).toFixed(1)} GB`;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    attributes?: Record<string, string>;
    dataset?: Record<string, string>;
  } = {}
) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  Object.entries(options.attributes ?? {}).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  Object.entries(options.dataset ?? {}).forEach(([key, value]) => {
    element.dataset[key] = value;
  });

  return element;
}

function createIcon(name: string, label: string) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    createElement("i", {
      attributes: {
        "data-lucide": name,
        "aria-hidden": "true"
      }
    }),
    createElement("span", {
      className: "sr-only",
      text: label
    })
  );
  return fragment;
}

function createTileGrid(field: string) {
  const grid = createElement("span", {
    className: "system-tile-grid",
    dataset: { systemField: field }
  });

  for (let index = 0; index < TILE_COUNT; index += 1) {
    grid.append(createElement("span", { className: "system-tile" }));
  }

  return grid;
}

function createCapsuleMetric(className: string, label: string) {
  const metric = createElement("span", { className: `system-capsule-metric ${className}` });
  const copy = createElement("span", { className: "system-capsule-metric-copy" });
  copy.append(
    createElement("strong", { text: label }),
    createElement("small", { dataset: { systemField: `${className}-capsule-value` }, text: "0%" })
  );
  metric.append(copy, createTileGrid(`${className}-capsule-tiles`));
  return metric;
}

function createMeter(className: string, icon: string, label: string) {
  const meter = createElement("section", { className: `system-meter ${className}` });
  const iconWrap = createElement("span", { className: "system-meter-icon" });
  iconWrap.append(createIcon(icon, label));
  const copy = createElement("span", { className: "system-meter-copy" });
  copy.append(
    createElement("strong", {
      dataset: { systemField: `${className}-value` },
      text: "0%"
    }),
    createElement("small", { text: label })
  );
  const bar = createElement("span", { className: "system-meter-bar" });
  bar.append(createElement("span", { dataset: { systemField: `${className}-bar` } }));
  meter.append(iconWrap, copy, bar);
  return meter;
}

// 系统监控胶囊（静息态紧凑读数）。按钮形态用于独立窗口；主窗口内嵌时由调用方决定外层标签。
export function buildSystemCapsule(): HTMLButtonElement {
  const capsule = createElement("button", {
    className: "island-layer system-capsule-layer",
    attributes: {
      type: "button",
      "aria-label": "打开系统监控"
    }
  });
  const capsuleIcon = createElement("span", { className: "system-capsule-icon" });
  capsuleIcon.append(createIcon("activity", "系统"));
  const capsuleCopy = createElement("span", { className: "system-capsule-copy" });
  capsuleCopy.append(
    createElement("strong", { dataset: { systemField: "capsule-primary" }, text: "CPU 0%" }),
    createElement("small", { dataset: { systemField: "capsule-secondary" }, text: "内存 0%" })
  );
  const capsuleGauge = createElement("span", { className: "system-capsule-gauge" });
  capsuleGauge.append(createElement("span", { dataset: { systemField: "capsule-gauge" } }));
  capsule.append(capsuleIcon, capsuleCopy, capsuleGauge);
  capsule.append(
    createCapsuleMetric("cpu", "CPU"),
    createCapsuleMetric("memory", "内存"),
    createCapsuleMetric("gpu", "GPU")
  );
  return capsule;
}

export function buildSystemHover(): HTMLButtonElement {
  const hover = createElement("button", {
    className: "island-layer system-hover-layer",
    attributes: {
      type: "button",
      "aria-label": "打开系统监控卡片"
    }
  });
  hover.append(
    createCapsuleMetric("cpu", "CPU"),
    createCapsuleMetric("memory", "内存"),
    createCapsuleMetric("gpu", "GPU")
  );
  return hover;
}

export function buildSystemCard(): HTMLElement {
  const card = createElement("main", {
    className: "island-layer system-card-layer",
    attributes: { "aria-label": "系统监控卡片" }
  });
  const header = createElement("header", { className: "system-card-header" });
  const title = createElement("div", { className: "system-card-title" });
  title.append(
    createElement("strong", { text: "系统监控" }),
    createElement("small", { dataset: { systemField: "system-subtitle" }, text: "等待数据" })
  );
  const health = createElement("div", { className: "system-health-pill" });
  health.append(createIcon("gauge", "健康状态"), createElement("span", { dataset: { systemField: "health" }, text: "读取中" }));
  header.append(title, health);

  const grid = createElement("div", { className: "system-meter-grid" });
  grid.append(
    createMeter("cpu", "cpu", "CPU"),
    createMeter("memory", "memory-stick", "内存"),
    createMeter("disk", "hard-drive", "磁盘")
  );

  const diskList = createElement("div", { className: "system-disk-list" });
  const footer = createElement("footer", { className: "system-card-footer" });
  footer.append(
    createElement("span", { dataset: { systemField: "uptime" }, text: "运行 0m" }),
    createElement("span", { dataset: { systemField: "cores" }, text: "0 cores" })
  );

  card.append(header, grid, diskList, footer);
  return card;
}

// 渲染 lucide 图标。在追加完所有系统视图节点后调用一次即可（root 作用域）。
export function renderSystemIcons(root: Element | Document | DocumentFragment) {
  createIcons({ icons: lucideIcons, root });
}

function normalizePartial(raw: Partial<SystemSnapshot> | undefined, fallbackUpdatedAt: number): SystemSnapshot {
  return {
    available: raw?.available !== false,
    cpuPercent: clampPercent(raw?.cpuPercent || 0),
    memoryPercent: clampPercent(raw?.memoryPercent || 0),
    gpuPercent: clampPercent(raw?.gpuPercent || 0),
    memoryUsedGb: Math.max(0, Number(raw?.memoryUsedGb) || 0),
    memoryTotalGb: Math.max(0, Number(raw?.memoryTotalGb) || 0),
    diskPercent: clampPercent(raw?.diskPercent || 0),
    disks: Array.isArray(raw?.disks) ? raw.disks.slice(0, 4) : [],
    uptimeSeconds: Math.max(0, Math.round(Number(raw?.uptimeSeconds) || 0)),
    coreCount: Math.max(0, Math.round(Number(raw?.coreCount) || 0)),
    state: raw?.state || "unknown",
    updatedAt: Number(raw?.updatedAt || fallbackUpdatedAt)
  };
}

export function normalizeSystemSnapshot(raw: Partial<SystemSnapshot> | undefined): SystemSnapshot {
  return normalizePartial(raw, Date.now());
}

function setText(root: ParentNode, field: string, value: string) {
  root.querySelectorAll<HTMLElement>(`[data-system-field="${field}"]`).forEach((element) => {
    if (element.textContent !== value) {
      element.textContent = value;
    }
  });
}

function setBar(root: ParentNode, field: string, value: number) {
  root.querySelectorAll<HTMLElement>(`[data-system-field="${field}"]`).forEach((element) => {
    element.style.width = `${clampPercent(value)}%`;
  });
}

function setTileMeter(root: ParentNode, field: string, value: number) {
  const activeCount = Math.round((clampPercent(value) / 100) * TILE_COUNT);

  root.querySelectorAll<HTMLElement>(`[data-system-field="${field}"]`).forEach((grid) => {
    grid.dataset.value = String(clampPercent(value));
    grid.querySelectorAll<HTMLElement>(".system-tile").forEach((tile, index) => {
      tile.dataset.active = index < activeCount ? "true" : "false";
    });
  });
}

function renderDisks(root: ParentNode, snapshot: SystemSnapshot) {
  const diskList = root.querySelector<HTMLElement>(".system-disk-list");
  if (!diskList) {
    return;
  }

  if (!snapshot.disks.length) {
    diskList.replaceChildren(createElement("div", { className: "system-disk-empty", text: "磁盘数据读取中" }));
    return;
  }

  diskList.replaceChildren(
    ...snapshot.disks.map((disk) => {
      const row = createElement("div", { className: "system-disk-row" });
      const copy = createElement("span", { className: "system-disk-copy" });
      copy.append(
        createElement("strong", { text: disk.name }),
        createElement("small", { text: `${formatGb(disk.freeGb)} 可用 / ${formatGb(disk.sizeGb)}` })
      );
      const bar = createElement("span", { className: "system-disk-bar" });
      const fill = createElement("span");
      fill.style.width = `${clampPercent(disk.usedPercent)}%`;
      bar.append(fill);
      row.append(copy, createElement("span", { className: "system-disk-percent", text: `${disk.usedPercent}%` }), bar);
      return row;
    })
  );
}

// 把快照写进 root 下的所有系统监控字段。调用方负责设置 root 上的 data-system-state（配色）。
export function syncSystemView(root: ParentNode, snapshot: SystemSnapshot) {
  setText(root, "capsule-primary", `CPU ${snapshot.cpuPercent}%`);
  setText(root, "capsule-secondary", `内存 ${snapshot.memoryPercent}%`);
  setBar(root, "capsule-gauge", Math.max(snapshot.cpuPercent, snapshot.memoryPercent));
  setText(root, "cpu-capsule-value", `${snapshot.cpuPercent}%`);
  setText(root, "memory-capsule-value", `${snapshot.memoryPercent}%`);
  setText(root, "gpu-capsule-value", `${snapshot.gpuPercent}%`);
  setTileMeter(root, "cpu-capsule-tiles", snapshot.cpuPercent);
  setTileMeter(root, "memory-capsule-tiles", snapshot.memoryPercent);
  setTileMeter(root, "gpu-capsule-tiles", snapshot.gpuPercent);
  setText(root, "cpu-value", `${snapshot.cpuPercent}%`);
  setText(root, "memory-value", `${snapshot.memoryPercent}%`);
  setText(root, "disk-value", `${snapshot.diskPercent}%`);
  setBar(root, "cpu-bar", snapshot.cpuPercent);
  setBar(root, "memory-bar", snapshot.memoryPercent);
  setBar(root, "disk-bar", snapshot.diskPercent);
  setText(root, "system-subtitle", `${formatGb(snapshot.memoryUsedGb)} / ${formatGb(snapshot.memoryTotalGb)}`);
  setText(
    root,
    "health",
    snapshot.state === "critical" ? "高负载" : snapshot.state === "warn" ? "偏高" : snapshot.available ? "正常" : "不可用"
  );
  setText(root, "uptime", `运行 ${formatUptime(snapshot.uptimeSeconds)}`);
  setText(root, "cores", `${snapshot.coreCount} cores`);
  renderDisks(root, snapshot);
}
