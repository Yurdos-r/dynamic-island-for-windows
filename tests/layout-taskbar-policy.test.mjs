import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLayoutTaskbarPolicy } = require("../src/main/window/layout-taskbar-policy");

describe("layout taskbar policy", () => {
  it("restores the system window position when switching from top-center back to classic", () => {
    const state = {
      layout: "top-center",
      systemMonitorEnabled: true,
      keyboardLockHintsEnabled: true,
      taskbarVisible: true
    };
    const repositionMainWindow = vi.fn();
    const showSystemWindow = vi.fn();
    const systemWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    };

    const policy = createLayoutTaskbarPolicy({
      getLayout: () => state.layout,
      setLayoutValue: (value) => {
        state.layout = value;
      },
      getSystemMonitorEnabled: () => state.systemMonitorEnabled,
      getKeyboardLockHintsEnabled: () => state.keyboardLockHintsEnabled,
      getTaskbarVisible: () => state.taskbarVisible,
      getSystemWindow: () => systemWindow,
      isSystemRendererReady: () => true,
      repositionMainWindow,
      showSystemWindow
    });

    expect(policy.applyLayout("classic")).toBe("classic");

    expect(repositionMainWindow).toHaveBeenCalledTimes(1);
    expect(showSystemWindow).toHaveBeenCalledTimes(1);
  });
});
