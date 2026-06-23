import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createMainHoverController } = require("../src/main/window/hover-controller");

describe("main hover controller", () => {
  it("does not collapse keyboard lock hints before their renderer timer expires", () => {
    vi.useFakeTimers();
    const requestIslandMode = vi.fn();
    const controller = createMainHoverController({
      hoverDetection: {
        enterPadding: 1,
        exitPadding: 8,
        openDelay: 24,
        closeDelay: 180,
        pollInterval: 32
      },
      getCurrentMode: () => "keyboard-lock",
      isPointerInsideCard: () => false,
      isPrivacyActive: () => false,
      requestIslandMode,
      updateMousePassthrough: () => {}
    });

    controller.start();
    vi.advanceTimersByTime(1000);
    controller.stop();

    expect(requestIslandMode).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
