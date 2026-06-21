import type { RendererRuntimeState } from "../runtime-state";
import type { SettingsPage } from "../state";
import {
  isGlassIntensityValue,
  isGlassStyleValue,
  isLayoutValue,
  persistGlassIntensityValue,
  persistGlassStyleValue,
  readStoredGlassIntensityValue,
  readStoredGlassStyleValue
} from "../controllers/settings-controller";
import {
  DEFAULT_GLASS_INTENSITY,
  DEFAULT_GLASS_STYLE,
  GLASS_INTENSITY_DISPLACE_SCALE,
  GLASS_INTENSITY_STORAGE_KEY,
  GLASS_STYLE_STORAGE_KEY,
  SETTINGS_LONG_PRESS_MS
} from "../state";

interface SettingsActionsOptions {
  runtime: RendererRuntimeState;
  island?: Window["island"];
  queueSync(): void;
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
  hasSystemCard(): boolean;
}

export function readInitialGlassStyle(): GlassStyle {
  return readStoredGlassStyleValue(GLASS_STYLE_STORAGE_KEY, DEFAULT_GLASS_STYLE);
}

export function readInitialGlassIntensity(): GlassIntensity {
  return readStoredGlassIntensityValue(GLASS_INTENSITY_STORAGE_KEY, DEFAULT_GLASS_INTENSITY);
}

export function createSettingsActions(options: SettingsActionsOptions) {
  const { runtime, island, queueSync, setMode, hasSystemCard } = options;

  function isGlassStyle(value: unknown): value is GlassStyle {
    return isGlassStyleValue(value);
  }

  function persistGlassStyle(style: GlassStyle) {
    persistGlassStyleValue(GLASS_STYLE_STORAGE_KEY, style);
  }

  function setGlassStyle(style: GlassStyle) {
    if (!isGlassStyle(style) || style === runtime.glassStyle) {
      return;
    }

    runtime.glassStyle = style;
    persistGlassStyle(style);
    queueSync();
  }

  function isGlassIntensity(value: unknown): value is GlassIntensity {
    return isGlassIntensityValue(value);
  }

  function persistGlassIntensity(intensity: GlassIntensity) {
    persistGlassIntensityValue(GLASS_INTENSITY_STORAGE_KEY, intensity);
  }

  function applyGlassIntensityToFilter() {
    const node = document.getElementById("liquid-glass-displace-node");
    if (node) {
      node.setAttribute("scale", String(GLASS_INTENSITY_DISPLACE_SCALE[runtime.glassIntensity]));
    }
  }

  function setGlassIntensity(intensity: GlassIntensity) {
    if (!isGlassIntensity(intensity) || intensity === runtime.glassIntensity) {
      return;
    }

    runtime.glassIntensity = intensity;
    persistGlassIntensity(intensity);
    applyGlassIntensityToFilter();
    queueSync();
  }

  function isLayout(value: unknown): value is IslandLayout {
    return isLayoutValue(value);
  }

  function ensureSystemModeValid() {
    if (runtime.mode === "system" && !hasSystemCard()) {
      setMode("idle");
    }
  }

  function setLayout(nextLayout: IslandLayout) {
    if (!isLayout(nextLayout) || nextLayout === runtime.layout) {
      return;
    }

    runtime.layout = nextLayout;
    ensureSystemModeValid();
    queueSync();
    void island?.setLayout(nextLayout);
  }

  function setSystemMonitorEnabled(enabled: boolean) {
    if (enabled === runtime.systemMonitorEnabled) {
      return;
    }

    runtime.systemMonitorEnabled = enabled;
    ensureSystemModeValid();
    queueSync();
    void island?.setSystemMonitor(enabled);
  }

  function setStartupEnabled(enabled: boolean) {
    if (enabled === runtime.startupEnabled) {
      return;
    }

    runtime.startupEnabled = enabled;
    queueSync();
    void island?.setStartup(enabled).then((startupEnabled) => {
      if (typeof startupEnabled === "boolean" && startupEnabled !== runtime.startupEnabled) {
        runtime.startupEnabled = startupEnabled;
        queueSync();
      }
    });
  }

  function applyUiSettings(settings: UiSettings | undefined) {
    if (settings && isLayout(settings.layout)) {
      runtime.layout = settings.layout;
    }
    if (settings && typeof settings.systemMonitorEnabled === "boolean") {
      runtime.systemMonitorEnabled = settings.systemMonitorEnabled;
    }
    if (settings && typeof settings.startupEnabled === "boolean") {
      runtime.startupEnabled = settings.startupEnabled;
    }
    ensureSystemModeValid();
    queueSync();
  }

  function setSettingsPage(page: SettingsPage) {
    if (runtime.settingsPage === page) {
      return;
    }

    runtime.settingsPage = page;
    queueSync();
  }

  function openSettings() {
    if (runtime.mode === "settings") {
      return;
    }

    if (runtime.mode !== "idle" && runtime.mode !== "peek") {
      return;
    }

    runtime.settingsReturnMode = "idle";
    runtime.settingsPage = "hub";
    runtime.suppressNextClick = true;
    setMode("settings");
  }

  function closeSettings() {
    if (runtime.mode !== "settings") {
      return;
    }

    runtime.settingsPage = "hub";
    setMode(runtime.settingsReturnMode || "idle");
  }

  function openSystemCard() {
    if (runtime.mode === "system" || !hasSystemCard()) {
      return;
    }

    if (runtime.mode !== "idle" && runtime.mode !== "peek") {
      return;
    }

    setMode("system");
  }

  function closeSystemCard() {
    if (runtime.mode !== "system") {
      return;
    }

    setMode("idle");
  }

  function clearSettingsLongPress() {
    if (runtime.settingsLongPressTimer !== undefined) {
      window.clearTimeout(runtime.settingsLongPressTimer);
      runtime.settingsLongPressTimer = undefined;
    }

    runtime.settingsLongPressPointerId = undefined;
  }

  function scheduleSettingsLongPress(pointerId: number) {
    clearSettingsLongPress();

    if (runtime.mode !== "idle" && runtime.mode !== "peek") {
      return;
    }

    runtime.settingsLongPressPointerId = pointerId;
    runtime.settingsLongPressTimer = window.setTimeout(() => {
      runtime.settingsLongPressTimer = undefined;
      runtime.settingsLongPressPointerId = undefined;
      openSettings();
    }, SETTINGS_LONG_PRESS_MS);
  }

  return {
    applyGlassIntensityToFilter,
    applyUiSettings,
    clearSettingsLongPress,
    closeSettings,
    closeSystemCard,
    isGlassIntensity,
    isGlassStyle,
    isLayout,
    openSettings,
    openSystemCard,
    scheduleSettingsLongPress,
    setGlassIntensity,
    setGlassStyle,
    setLayout,
    setSettingsPage,
    setStartupEnabled,
    setSystemMonitorEnabled
  };
}
