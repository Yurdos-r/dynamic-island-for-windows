import "./styles.css";
import {
  EMPTY_SYSTEM_SNAPSHOT,
  type SystemSnapshot,
  buildSystemCapsule,
  buildSystemCard,
  buildSystemHover,
  normalizeSystemSnapshot,
  renderSystemIcons,
  syncSystemView
} from "./system-view";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("App root not found");
}

const app = appRoot;
let mode: IslandMode = "idle";
let collapseTimer: number | undefined;
let frameQueued = false;
let snapshot: SystemSnapshot = { ...EMPTY_SYSTEM_SNAPSHOT };

function renderTemplate() {
  app.replaceChildren();
  app.dataset.role = "system";
  app.dataset.mode = mode;
  app.dataset.glass = "liquid-css";
  app.dataset.glassIntensity = "medium";

  const shell = document.createElement("section");
  shell.className = "island-shell system-shell";
  shell.setAttribute("aria-label", "系统监控小岛");

  shell.append(buildSystemCapsule(), buildSystemHover(), buildSystemCard());
  app.append(shell);
  renderSystemIcons(app);
}

function queueSync() {
  if (frameQueued) {
    return;
  }

  frameQueued = true;
  window.requestAnimationFrame(() => {
    frameQueued = false;
    syncUi();
  });
}

function syncUi() {
  app.dataset.role = "system";
  app.dataset.mode = mode;
  app.dataset.systemState = snapshot.state;
  syncSystemView(app, snapshot);
}

function clearCollapseTimer() {
  if (collapseTimer !== undefined) {
    window.clearTimeout(collapseTimer);
    collapseTimer = undefined;
  }
}

function setMode(nextMode: IslandMode) {
  const resolvedMode: IslandMode = nextMode === "expanded" || nextMode === "hover" ? nextMode : "idle";
  if (mode === resolvedMode) {
    void window.island?.resize(resolvedMode);
    return;
  }

  mode = resolvedMode;
  void window.island?.resize(resolvedMode);
  queueSync();
}

function restoreClassicSystemSurface() {
  clearCollapseTimer();
  mode = "idle";
  app.dataset.role = "system";
  app.dataset.mode = mode;
  app.hidden = false;
  app.style.removeProperty("opacity");
  void window.island?.resize("idle");
  queueSync();
}

app.addEventListener("pointerenter", () => {
  clearCollapseTimer();
  if (mode === "idle") {
    setMode("hover");
  }
});

app.addEventListener("pointerleave", () => {
  clearCollapseTimer();
  collapseTimer = window.setTimeout(() => {
    setMode("idle");
  }, mode === "expanded" ? 220 : 120);
});

app.addEventListener("click", () => {
  clearCollapseTimer();
  setMode(mode === "expanded" ? "idle" : "expanded");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMode("idle");
  }
});

window.island?.onModeRequest((requestedMode) => {
  setMode(requestedMode);
});

window.island?.onSystemUpdate((nextSnapshot) => {
  snapshot = normalizeSystemSnapshot(nextSnapshot);
  queueSync();
});

window.island?.onLayoutChanged((settings) => {
  if (settings?.layout === "classic" && settings.systemMonitorEnabled !== false) {
    restoreClassicSystemSurface();
  }
});

renderTemplate();
syncUi();
window.island?.ready();
