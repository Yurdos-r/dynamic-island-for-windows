import type { ClipboardItem, ClipboardSnapshot, KeyboardLockHint, LyricLine, PrivacySnapshot, SettingsPage, TrackState } from "./state";
import { createDefaultTrack, createEmptyClipboardSnapshot, createEmptyPrivacySnapshot } from "./state";

export interface RendererRuntimeState {
  track: TrackState;
  mode: IslandMode;
  glassStyle: GlassStyle;
  glassIntensity: GlassIntensity;
  settingsReturnMode: IslandMode;
  settingsLongPressTimer: number | undefined;
  settingsPage: SettingsPage;
  layout: IslandLayout;
  systemMonitorEnabled: boolean;
  keyboardLockHintsEnabled: boolean;
  startupEnabled: boolean;
  keyboardLockHint: KeyboardLockHint | undefined;
  keyboardLockReturnMode: IslandMode;
  keyboardLockTimer: number | undefined;
  systemSnapshot: SystemSnapshot;
  settingsLongPressPointerId: number | undefined;
  suppressNextClick: boolean;
  modeCommitToken: number;
  playing: boolean;
  frameQueued: boolean;
  favorited: boolean;
  draggingProgress: boolean;
  pendingSeekSeconds: number | undefined;
  systemMediaActive: boolean;
  mediaControllable: boolean;
  mediaEntering: boolean;
  mediaExiting: boolean;
  mediaEnterTimer: number | undefined;
  mediaExitTimer: number | undefined;
  capsuleAppearing: boolean;
  capsuleDisappearing: boolean;
  capsuleAppearTimer: number | undefined;
  capsuleDisappearTimer: number | undefined;
  progressSeconds: number;
  lyrics: LyricLine[];
  lastLyricsDataKey: string;
  lyricsCenterFrame: number;
  expandedLayerPrewarmed: boolean;
  expandedTransitionTimer: number | undefined;
  lastPlaybackSyncTime: number;
  privacyExpanded: boolean;
  wasPrivacyActive: boolean;
  privacyReturnMode: IslandMode;
  clipboardSnapshot: ClipboardSnapshot;
  clipboardPromptVisible: boolean;
  clipboardPromptTimer: number | undefined;
  clipboardReturnMode: IslandMode;
  clipboardTransitionTimer: number | undefined;
  clipboardAccepting: boolean;
  clipboardAcceptPreview: string;
  clipboardAcceptedItem: ClipboardItem | undefined;
  clipboardAcceptTimer: number | undefined;
  clipboardListRenderKey: string;
  clipboardDeleteTimer: number | undefined;
  clipboardDeletePointerId: number | undefined;
  clipboardDeleteItemId: string;
  clipboardDeleteDialogItemId: string;
  cardWheelLockedUntil: number;
  priorityTransition: string;
  priorityTransitionStage: string;
  priorityTransitionTimer: number | undefined;
  priorityTransitionStageTimer: number | undefined;
  priorityTransitionSettleTimer: number | undefined;
  pendingPrivacySnapshot: PrivacySnapshot | undefined;
  privacyState: PrivacySnapshot;
}

interface RendererRuntimeStateOptions {
  glassStyle: GlassStyle;
  glassIntensity: GlassIntensity;
  systemSnapshot: SystemSnapshot;
  lastPlaybackSyncTime: number;
}

export function createRendererRuntimeState(options: RendererRuntimeStateOptions): RendererRuntimeState {
  return {
    track: createDefaultTrack(),
    mode: "idle",
    glassStyle: options.glassStyle,
    glassIntensity: options.glassIntensity,
    settingsReturnMode: "idle",
    settingsLongPressTimer: undefined,
    settingsPage: "hub",
    layout: "top-center",
    systemMonitorEnabled: true,
    keyboardLockHintsEnabled: true,
    startupEnabled: false,
    keyboardLockHint: undefined,
    keyboardLockReturnMode: "idle",
    keyboardLockTimer: undefined,
    systemSnapshot: options.systemSnapshot,
    settingsLongPressPointerId: undefined,
    suppressNextClick: false,
    modeCommitToken: 0,
    playing: false,
    frameQueued: false,
    favorited: false,
    draggingProgress: false,
    pendingSeekSeconds: undefined,
    systemMediaActive: false,
    mediaControllable: false,
    mediaEntering: false,
    mediaExiting: false,
    mediaEnterTimer: undefined,
    mediaExitTimer: undefined,
    capsuleAppearing: false,
    capsuleDisappearing: false,
    capsuleAppearTimer: undefined,
    capsuleDisappearTimer: undefined,
    progressSeconds: 72,
    lyrics: [],
    lastLyricsDataKey: "",
    lyricsCenterFrame: 0,
    expandedLayerPrewarmed: false,
    expandedTransitionTimer: undefined,
    lastPlaybackSyncTime: options.lastPlaybackSyncTime,
    privacyExpanded: false,
    wasPrivacyActive: false,
    privacyReturnMode: "idle",
    clipboardSnapshot: createEmptyClipboardSnapshot(),
    clipboardPromptVisible: false,
    clipboardPromptTimer: undefined,
    clipboardReturnMode: "idle",
    clipboardTransitionTimer: undefined,
    clipboardAccepting: false,
    clipboardAcceptPreview: "",
    clipboardAcceptedItem: undefined,
    clipboardAcceptTimer: undefined,
    clipboardListRenderKey: "",
    clipboardDeleteTimer: undefined,
    clipboardDeletePointerId: undefined,
    clipboardDeleteItemId: "",
    clipboardDeleteDialogItemId: "",
    cardWheelLockedUntil: 0,
    priorityTransition: "",
    priorityTransitionStage: "",
    priorityTransitionTimer: undefined,
    priorityTransitionStageTimer: undefined,
    priorityTransitionSettleTimer: undefined,
    pendingPrivacySnapshot: undefined,
    privacyState: createEmptyPrivacySnapshot()
  };
}
