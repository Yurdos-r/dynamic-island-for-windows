export {};

declare global {
  interface Window {
    island?: {
      ready: () => void;
      resize: (mode: IslandMode) => Promise<IslandMode>;
      setInteracting: (interacting: boolean) => Promise<boolean>;
      controlMedia: (action: MediaControlAction) => Promise<MediaControlResult>;
      seekMedia: (seconds: number) => Promise<MediaControlResult>;
      getUiSettings: () => Promise<UiSettings>;
      setLayout: (layout: IslandLayout) => Promise<IslandLayout>;
      setSystemMonitor: (enabled: boolean) => Promise<boolean>;
      setKeyboardLockHints: (enabled: boolean) => Promise<boolean>;
      setStartup: (enabled: boolean) => Promise<boolean>;
      writeClipboardText: (text: string) => Promise<ClipboardWriteResult>;
      acceptClipboardPending: (id: string) => Promise<ClipboardWriteResult>;
      dismissClipboardPending: (id: string) => Promise<ClipboardWriteResult>;
      clearClipboardItems: () => Promise<ClipboardWriteResult>;
      removeClipboardItem: (id: string) => Promise<ClipboardWriteResult>;
      onModeRequest: (callback: (mode: IslandMode) => void) => () => void;
      onAvoidScale: (callback: (scale: number) => void) => () => void;
      onMediaUpdate: (callback: (snapshot: MediaSnapshot) => void) => () => void;
      onPrivacyUpdate: (callback: (snapshot: PrivacySnapshot) => void) => () => void;
      onClipboardUpdate: (callback: (snapshot: ClipboardSnapshot) => void) => () => void;
      onSystemUpdate: (callback: (snapshot: SystemSnapshot) => void) => () => void;
      onKeyboardLockUpdate: (callback: (snapshot: KeyboardLockSnapshot) => void) => () => void;
      onLayoutChanged: (callback: (settings: UiSettings) => void) => () => void;
    };
  }

  type IslandMode =
    | "idle"
    | "peek"
    | "clipboard-prompt"
    | "privacy"
    | "privacy-expanded"
    | "hover"
    | "keyboard-lock"
    | "expanded"
    | "clipboard"
    | "settings"
    | "system";
  type IslandLayout = "classic" | "top-center";
  type GlassStyle = "classic" | "liquid-css" | "liquid-svg";
  type GlassIntensity = "low" | "medium" | "high";
  type MediaControlAction = "toggle-play" | "previous-track" | "next-track" | "favorite-track";

  interface UiSettings {
    layout: IslandLayout;
    systemMonitorEnabled: boolean;
    keyboardLockHintsEnabled: boolean;
    startupEnabled: boolean;
  }

  interface KeyboardLockSnapshot {
    key: "capsLock" | "numLock";
    enabled: boolean;
    changedAt: number;
    initial: boolean;
  }

  interface MediaControlResult {
    ok?: boolean;
    available?: boolean;
    active?: boolean;
    action?: string;
    localOnly?: boolean;
    transport?: string;
    error?: string;
    favorited?: boolean;
  }

  interface MediaSnapshot {
    available: boolean;
    active: boolean;
    playing: boolean;
    status: string;
    title: string;
    artist: string;
    albumTitle?: string;
    cover?: string;
    source?: string;
    sourceApp?: string;
    controllable?: boolean;
    favorited?: boolean;
    lyrics?: LyricLine[];
    lyricsSource?: string;
    durationSeconds: number;
    positionSeconds: number;
    updatedAt: number;
  }

  interface PrivacySnapshot {
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

  interface ClipboardItem {
    id: string;
    text: string;
    preview: string;
    copiedAt: number;
  }

  interface ClipboardSnapshot {
    active: boolean;
    text: string;
    preview: string;
    pending?: ClipboardItem;
    items: ClipboardItem[];
    updatedAt: number;
  }

  interface ClipboardWriteResult {
    ok?: boolean;
    error?: string;
  }

  interface SystemDisk {
    name: string;
    label?: string;
    sizeGb: number;
    freeGb: number;
    usedPercent: number;
  }

  interface SystemSnapshot {
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

  interface LyricLine {
    timeMs: number;
    text: string;
    translation?: string;
  }
}
