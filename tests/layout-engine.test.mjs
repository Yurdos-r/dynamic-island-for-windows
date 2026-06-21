import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getMainStageMetrics, getSystemStageMetrics } = require("../src/main/window/layout-engine");

const displayWithBottomTaskbar = {
  bounds: { x: 0, y: 0, width: 1707, height: 960 },
  workArea: { x: 0, y: 0, width: 1707, height: 912 }
};

const displayWithRightAndBottomReservedArea = {
  bounds: { x: 0, y: 0, width: 1707, height: 960 },
  workArea: { x: 0, y: 0, width: 1600, height: 912 }
};

describe("layout engine", () => {
  it("keeps classic main island aligned with the taskbar band", () => {
    const metrics = getMainStageMetrics({
      display: displayWithBottomTaskbar,
      layout: "classic",
      windowHeight: 48
    });

    expect(metrics.position.y).toBe(910);
  });

  it("keeps the classic system island horizontally inside work area and vertically on the taskbar band", () => {
    const metrics = getSystemStageMetrics({
      display: displayWithRightAndBottomReservedArea,
      windowHeight: 48
    });

    expect(metrics.position.x).toBe(1128);
    expect(metrics.position.y).toBe(910);
  });

  it("keeps top-center layout anchored to the full display top", () => {
    const metrics = getMainStageMetrics({
      display: displayWithBottomTaskbar,
      layout: "top-center",
      windowHeight: 48
    });

    expect(metrics.position.x).toBe(623);
    expect(metrics.position.y).toBe(2);
  });
});
