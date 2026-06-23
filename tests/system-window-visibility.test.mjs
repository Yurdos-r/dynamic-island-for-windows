import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createSystemWindowVisibilityManager } = require("../src/main/window/system-window-visibility");

function createFakeWindow() {
  return {
    opacity: 1,
    showCount: 0,
    showInactiveCount: 0,
    hideCount: 0,
    visible: false,
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    show() {
      this.showCount += 1;
      this.visible = true;
    },
    showInactive() {
      this.showInactiveCount += 1;
      this.visible = true;
    },
    hide() {
      this.hideCount += 1;
      this.visible = false;
    },
    getOpacity() {
      return this.opacity;
    },
    setOpacity(value) {
      this.opacity = value;
    }
  };
}

describe("system window visibility manager", () => {
  it("parks the system window off-screen without hiding it or touching opacity", () => {
    const win = createFakeWindow();
    win.visible = true;
    const reposition = vi.fn();
    const manager = createSystemWindowVisibilityManager({
      getWindow: () => win,
      isRendererReady: () => true,
      reposition,
      raise: vi.fn(),
      restoreHitState: vi.fn()
    });

    manager.parkWithoutFade();

    expect(manager.isParked()).toBe(true);
    expect(reposition).toHaveBeenCalled();
    // Parked windows are pushed off-screen, never hidden and never dimmed.
    expect(win.hideCount).toBe(0);
    expect(win.opacity).toBe(1);
    expect(manager.resolveY(900)).toBe(900 + 10000);
  });

  it("restores the system window positionally, raising it and reasserting hit state", () => {
    const win = createFakeWindow();
    const raise = vi.fn();
    const restoreHitState = vi.fn();
    const reposition = vi.fn();
    const manager = createSystemWindowVisibilityManager({
      getWindow: () => win,
      isRendererReady: () => true,
      reposition,
      raise,
      restoreHitState
    });

    manager.parkWithoutFade();
    manager.show();

    expect(manager.isParked()).toBe(false);
    expect(win.isVisible()).toBe(true);
    // Opacity is never manipulated; it stays at the creation default.
    expect(win.opacity).toBe(1);
    expect(win.hideCount).toBe(0);
    expect(raise).toHaveBeenCalledWith(true);
    expect(restoreHitState).toHaveBeenCalled();
    expect(manager.resolveY(900)).toBe(900);
  });

  it("prefers showInactive so the ambient capsule never steals focus", () => {
    const win = createFakeWindow();
    const manager = createSystemWindowVisibilityManager({
      getWindow: () => win,
      reposition: () => {},
      raise: () => {},
      restoreHitState: () => {}
    });

    manager.show();

    expect(win.showInactiveCount).toBe(1);
    expect(win.showCount).toBe(0);
    expect(win.isVisible()).toBe(true);
  });

  it("does not re-show a window that is already visible when restoring", () => {
    const win = createFakeWindow();
    win.visible = true;
    const manager = createSystemWindowVisibilityManager({
      getWindow: () => win,
      reposition: () => {},
      raise: () => {},
      restoreHitState: () => {}
    });

    manager.show();

    expect(win.showInactiveCount).toBe(0);
    expect(win.showCount).toBe(0);
    expect(win.isVisible()).toBe(true);
  });
});
