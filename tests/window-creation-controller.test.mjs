import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createWindowCreationController } = require("../src/main/window/window-creation-controller");

function createFakeWindow() {
  return {
    showCount: 0,
    destroyed: false,
    webContents: {},
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.showCount > 0;
    },
    show() {
      this.showCount += 1;
    },
    getBounds() {
      return { x: 0, y: 0, width: 540, height: 44 };
    }
  };
}

function createController() {
  const state = {
    mainWindow: undefined,
    systemWindow: undefined,
    rendererReady: false,
    systemRendererReady: false,
    currentMode: "idle",
    systemCurrentMode: "idle",
    stageWidth: 540,
    systemStageWidth: 540,
    taskbarVisible: true
  };
  const created = [];
  const controller = createWindowCreationController({
    state,
    loadRendererEntry: () => {},
    createIslandBrowserWindow: () => {
      const win = createFakeWindow();
      created.push(win);
      return win;
    },
    configureIslandBrowserWindow: () => {},
    registerIslandWindowLifecycle: () => {},
    getWindowHeightForMode: () => 44,
    getSystemWindowHeightForMode: () => 44,
    getStagePosition: () => ({ x: 1, y: 2 }),
    getSystemStagePosition: () => ({ x: 3, y: 4 }),
    systemWindowShouldShow: () => true,
    systemWindowVisibility: { parkWithoutFade: () => {} }
  });
  return { controller, created };
}

describe("window creation controller", () => {
  it("reuses the existing main window", () => {
    const { controller, created } = createController();

    const first = controller.createWindow();
    const second = controller.createWindow();

    expect(first).toBe(second);
    expect(created).toHaveLength(1);
    expect(created[0].showCount).toBe(1);
  });

  it("reuses the existing system window", () => {
    const { controller, created } = createController();

    const first = controller.createSystemWindow();
    const second = controller.createSystemWindow();

    expect(first).toBe(second);
    expect(created).toHaveLength(1);
    expect(created[0].showCount).toBe(1);
  });
});
