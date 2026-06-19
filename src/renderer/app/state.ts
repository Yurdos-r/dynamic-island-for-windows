export interface TrackState {
  title: string;
  artist: string;
  cover?: string;
  durationSeconds: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  translation?: string;
}

export interface PrivacySnapshot {
  available: boolean;
  active: boolean;
  kind: "microphone" | "camera" | "location" | "none";
  activeKinds: Array<"microphone" | "camera" | "location">;
  apps?: Array<{
    kind: "microphone" | "camera" | "location";
    app: string;
    displayName?: string;
    startedAt: number;
  }>;
  updatedAt: number;
}

export interface ClipboardItem {
  id: string;
  text: string;
  preview: string;
  copiedAt: number;
}

export interface ClipboardSnapshot {
  active: boolean;
  text: string;
  preview: string;
  pending?: ClipboardItem;
  items: ClipboardItem[];
  updatedAt: number;
}


export const ISLAND_STATE_NAMES = {
  capsule: "胶囊",
  island: "小岛",
  card: "卡片"
} as const;

export const GLASS_STYLE_OPTIONS: ReadonlyArray<{ id: GlassStyle; label: string; hint: string }> = [
  { id: "classic", label: "经典", hint: "默认毛玻璃" },
  { id: "liquid-css", label: "液态", hint: "通透 · 镜面高光" },
  { id: "liquid-svg", label: "液态折射", hint: "边缘折射 · 较耗性能" }
];
export const DEFAULT_GLASS_STYLE: GlassStyle = "classic";
export const GLASS_STYLE_STORAGE_KEY = "dynamic-island:glass-style";
export const GLASS_INTENSITY_OPTIONS: ReadonlyArray<{ id: GlassIntensity; label: string }> = [
  { id: "low", label: "弱" },
  { id: "medium", label: "中" },
  { id: "high", label: "强" }
];
export const DEFAULT_GLASS_INTENSITY: GlassIntensity = "medium";
export const GLASS_INTENSITY_STORAGE_KEY = "dynamic-island:glass-intensity";
// 液态折射 SVG 位移强度，按档位联动（与 styles.css 的 blur/saturate 配合）。
export const GLASS_INTENSITY_DISPLACE_SCALE: Record<GlassIntensity, number> = {
  low: 28,
  medium: 62,
  high: 104
};
export const SETTINGS_LONG_PRESS_MS = 550;
// 布局选项：经典（左下主胶囊 + 右下系统监控）/ 顶部居中（单胶囊，系统监控并入）。
export const LAYOUT_OPTIONS: ReadonlyArray<{ id: IslandLayout; label: string; hint: string }> = [
  { id: "classic", label: "经典", hint: "左下胶囊 · 右下系统监控" },
  { id: "top-center", label: "顶部居中", hint: "屏幕顶部单胶囊" }
];
// 设置中心导航项 → 对应二级页。
export const SETTINGS_NAV_ITEMS: ReadonlyArray<{ page: "appearance" | "layout" | "monitor"; label: string; hint: string }> = [
  { page: "appearance", label: "外观", hint: "玻璃质感与强度" },
  { page: "layout", label: "布局", hint: "胶囊位置与呈现" },
  { page: "monitor", label: "系统监控", hint: "显示或隐藏系统监控" }
];
export const PRIVACY_PRIORITY_TRANSITION_MS = 720;
export const PRIVACY_PRIORITY_STAGE_SWITCH_MS = 360;
export const PRIVACY_TO_MEDIA_IDLE_DELAY_MS = 140;
export const MEDIA_ENTER_TRANSITION_MS = 220;
export const MEDIA_EXIT_TRANSITION_MS = 200;
export const CAPSULE_APPEAR_TRANSITION_MS = 220;
export const PRIORITY_TRANSITION_MEDIA_TO_PRIVACY = "media-to-privacy";
export const PRIORITY_TRANSITION_PRIVACY_TO_MEDIA = "privacy-to-media";

export type SettingsPage = "hub" | "appearance" | "layout" | "monitor";

export interface AppState {
  mode: IslandMode;
  glassStyle: GlassStyle;
  glassIntensity: GlassIntensity;
  settingsReturnMode: IslandMode;
  settingsPage: SettingsPage;
  layout: IslandLayout;
  systemMonitorEnabled: boolean;
  track: TrackState;
  progressSeconds: number;
  lyrics: LyricLine[];
  privacyState: PrivacySnapshot;
  clipboardSnapshot: ClipboardSnapshot;
}

export function createDefaultTrack(): TrackState {
  return {
    title: "Cloudline",
    artist: "Lo-fi Focus",
    durationSeconds: 228
  };
}

export function createEmptyClipboardSnapshot(): ClipboardSnapshot {
  return {
    active: false,
    text: "",
    preview: "",
    items: [],
    updatedAt: 0
  };
}

export function createEmptyPrivacySnapshot(): PrivacySnapshot {
  return {
    available: false,
    active: false,
    kind: "none",
    activeKinds: [],
    apps: [],
    updatedAt: 0
  };
}
