import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createWindowFader } = require("../src/main/window/fade-controller");

function createFakeWindow() {
  return {
    hideCount: 0,
    opacity: 1,
    showCount: 0,
    visible: false,
    destroyed: false,
    getOpacity() {
      return this.opacity;
    },
    hide() {
      this.hideCount += 1;
      this.visible = false;
    },
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    setOpacity(value) {
      this.opacity = value;
    },
    show() {
      this.showCount += 1;
      this.visible = true;
    }
  };
}

describe("window fader", () => {
  it("shows without changing opacity", () => {
    const win = createFakeWindow();
    const raise = vi.fn();
    const onShown = vi.fn();
    const fader = createWindowFader();

    fader.showAndFadeIn(win, raise, onShown);

    expect(win.showCount).toBe(1);
    expect(win.opacity).toBe(1);
    expect(raise).toHaveBeenCalledWith(true);
    expect(onShown).toHaveBeenCalled();
  });

  it("hides without fading opacity to zero", () => {
    const win = createFakeWindow();
    win.visible = true;
    const fader = createWindowFader();

    fader.fadeOutAndHide(win);

    expect(win.hideCount).toBe(1);
    expect(win.opacity).toBe(1);
  });
});
