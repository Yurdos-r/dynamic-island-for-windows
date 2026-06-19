const ISLAND_SIZES = Object.freeze({
  idle: { width: 360, height: 44 },
  peek: { width: 360, height: 48 },
  "clipboard-prompt": { width: 360, height: 48 },
  privacy: { width: 360, height: 44 },
  "privacy-expanded": { width: 360, height: 78 },
  hover: { width: 360, height: 78 },
  expanded: { width: 450, height: 336 },
  clipboard: { width: 450, height: 336 },
  settings: { width: 360, height: 264 },
  system: { width: 360, height: 300 }
});

const ISLAND_STATE_NAMES = Object.freeze({
  capsule: "胶囊",
  island: "小岛",
  card: "卡片"
});

const STAGE_SIZE = Object.freeze({
  width: 540,
  height: 360,
  left: 12,
  statusBarWidth: 820,
  statusBarGap: 8,
  bottom: 4,
  islandLeft: 2,
  islandBottom: 2,
  top: 4,
  islandTop: 2
});

const TASKBAR_AVOID_GAP = 16;
const TASKBAR_AVOID_MIN_SCALE = 0.72;
const TASKBAR_POLL_INTERVAL_MS = 400;
const FADE_DURATION_MS = 180;
const FADE_STEP_MS = 16;

const HOVER_DETECTION = Object.freeze({
  enterPadding: 1,
  exitPadding: 8,
  mousePadding: 4,
  openDelay: 24,
  closeDelay: 180,
  pollInterval: 32
});

const COLLAPSE_HIT_AREA_HOLD_MS = 820;
const NATIVE_HIT_SHAPE = process.platform === "win32";
const NATIVE_HIT_SHAPE_PADDING = 10;
const MIN_ANIMATION_WINDOW_HEIGHT = ISLAND_SIZES.idle.height + STAGE_SIZE.islandBottom * 2;
const RAISE_ON_POINTER_INTERVAL_MS = 120;
const VALID_ISLAND_MODES = new Set(Object.keys(ISLAND_SIZES));

module.exports = {
  COLLAPSE_HIT_AREA_HOLD_MS,
  FADE_DURATION_MS,
  FADE_STEP_MS,
  HOVER_DETECTION,
  ISLAND_SIZES,
  ISLAND_STATE_NAMES,
  MIN_ANIMATION_WINDOW_HEIGHT,
  NATIVE_HIT_SHAPE,
  NATIVE_HIT_SHAPE_PADDING,
  RAISE_ON_POINTER_INTERVAL_MS,
  STAGE_SIZE,
  TASKBAR_AVOID_GAP,
  TASKBAR_AVOID_MIN_SCALE,
  TASKBAR_POLL_INTERVAL_MS,
  VALID_ISLAND_MODES
};
