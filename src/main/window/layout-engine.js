const {
  ISLAND_SIZES,
  MIN_ANIMATION_WINDOW_HEIGHT,
  STAGE_SIZE,
  TASKBAR_AVOID_GAP,
  TASKBAR_AVOID_MIN_SCALE,
  VALID_ISLAND_MODES
} = require("./window-config");

function coerceIslandMode(mode) {
  return VALID_ISLAND_MODES.has(mode) ? mode : "idle";
}

function resolveModeForMediaState(mode, { mediaActive = false, privacyActive = false } = {}) {
  const nextMode = coerceIslandMode(mode);

  if (nextMode === "clipboard" || nextMode === "clipboard-prompt" || nextMode === "system") {
    return nextMode;
  }

  return mediaActive ||
    privacyActive ||
    nextMode === "idle" ||
    nextMode === "peek" ||
    nextMode === "settings" ||
    nextMode === "privacy" ||
    nextMode === "privacy-expanded"
    ? nextMode
    : "idle";
}

function getWorkArea(display) {
  return display.workArea || display.bounds;
}

function getMainStageMetrics({ display, layout, windowHeight }) {
  const workArea = getWorkArea(display);
  const horizontalArea = layout === "top-center" ? display.bounds : workArea;
  const widestMode = Math.max(
    ISLAND_SIZES.expanded.width,
    ISLAND_SIZES.clipboard.width,
    ISLAND_SIZES.settings ? ISLAND_SIZES.settings.width : 0
  );
  const desiredStageWidth = widestMode + STAGE_SIZE.islandLeft * 2 + 8;
  const stageWidth = Math.min(
    horizontalArea.width - STAGE_SIZE.left * 2,
    Math.max(ISLAND_SIZES.idle.width + 4, desiredStageWidth)
  );
  const boundsBottom = display.bounds.y + display.bounds.height;
  const position =
    layout === "top-center"
      ? {
          x: Math.round(horizontalArea.x + (horizontalArea.width - stageWidth) / 2),
          y: Math.round(display.bounds.y + STAGE_SIZE.top - STAGE_SIZE.islandTop)
        }
      : {
          x: Math.round(horizontalArea.x + STAGE_SIZE.left - STAGE_SIZE.islandLeft),
          y: Math.round(boundsBottom - windowHeight - STAGE_SIZE.bottom + STAGE_SIZE.islandBottom)
        };

  return { position, stageWidth };
}

function getSystemStageMetrics({ display, windowHeight }) {
  const workArea = getWorkArea(display);
  const widestMode = Math.max(ISLAND_SIZES.expanded.width, ISLAND_SIZES.hover.width, ISLAND_SIZES.idle.width);
  const desiredStageWidth = widestMode + STAGE_SIZE.islandLeft * 2 + 8;
  const systemStageWidth = Math.min(
    workArea.width - STAGE_SIZE.left * 2,
    Math.max(ISLAND_SIZES.idle.width + 4, desiredStageWidth)
  );
  const workAreaRight = workArea.x + workArea.width;
  const boundsBottom = display.bounds.y + display.bounds.height;

  return {
    position: {
      x: Math.round(workAreaRight - STAGE_SIZE.left - systemStageWidth + STAGE_SIZE.islandLeft),
      y: Math.round(boundsBottom - windowHeight - STAGE_SIZE.bottom + STAGE_SIZE.islandBottom)
    },
    systemStageWidth
  };
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function clampRect(rect, { widthLimit, heightLimit }) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(widthLimit, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(heightLimit, Math.ceil(rect.y + rect.height));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function getMainIslandLocalRect({ mode, layout, stageWidth, windowHeight, paddingX = 0, paddingY = paddingX }) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];

  if (layout === "top-center") {
    const width = size.width;
    return clampRect(
      {
        x: (stageWidth - width) / 2 - paddingX,
        y: STAGE_SIZE.islandTop - paddingY,
        width: width + paddingX * 2,
        height: size.height + paddingY * 2
      },
      { widthLimit: stageWidth, heightLimit: windowHeight }
    );
  }

  const width = Math.max(ISLAND_SIZES.idle.width, stageWidth - STAGE_SIZE.islandLeft * 2);
  return clampRect(
    {
      x: STAGE_SIZE.islandLeft - paddingX,
      y: windowHeight - size.height - STAGE_SIZE.islandBottom - paddingY,
      width: width + paddingX * 2,
      height: size.height + paddingY * 2
    },
    { widthLimit: stageWidth, heightLimit: windowHeight }
  );
}

function getSystemIslandLocalRect({ mode, systemStageWidth, systemWindowHeight, paddingX = 0, paddingY = paddingX }) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];

  return clampRect(
    {
      x: systemStageWidth - STAGE_SIZE.islandLeft - size.width - paddingX,
      y: systemWindowHeight - size.height - STAGE_SIZE.islandBottom - paddingY,
      width: size.width + paddingX * 2,
      height: size.height + paddingY * 2
    },
    { widthLimit: systemStageWidth, heightLimit: systemWindowHeight }
  );
}

function getWindowHeightForMode(mode) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];
  return Math.min(STAGE_SIZE.height, Math.max(MIN_ANIMATION_WINDOW_HEIGHT, size.height + STAGE_SIZE.islandBottom * 2));
}

function getModeArea(mode) {
  const size = ISLAND_SIZES[coerceIslandMode(mode)];
  return size.width * size.height;
}

function computeAvoidScale({ layout, taskbarIconLeft, display, currentMode }) {
  if (layout === "top-center" || !(taskbarIconLeft > 0)) {
    return 1;
  }

  const naturalWidth = ISLAND_SIZES[coerceIslandMode(currentMode)].width;
  const capsuleLeft = display.bounds.x + STAGE_SIZE.left;
  const capsuleRightWanted = capsuleLeft + naturalWidth + TASKBAR_AVOID_GAP;
  if (capsuleRightWanted <= taskbarIconLeft) {
    return 1;
  }

  const availableWidth = taskbarIconLeft - capsuleLeft - TASKBAR_AVOID_GAP;
  const scale = availableWidth / naturalWidth;
  return Math.max(TASKBAR_AVOID_MIN_SCALE, Math.min(1, scale));
}

module.exports = {
  coerceIslandMode,
  computeAvoidScale,
  getMainIslandLocalRect,
  getMainStageMetrics,
  getModeArea,
  getSystemIslandLocalRect,
  getSystemStageMetrics,
  getWindowHeightForMode,
  pointInRect,
  resolveModeForMediaState
};
