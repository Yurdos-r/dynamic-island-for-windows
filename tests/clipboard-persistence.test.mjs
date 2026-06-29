import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => ""
  },
  clipboard: {
    readText: () => "",
    writeText: () => {}
  }
}));

const require = createRequire(import.meta.url);
const {
  createClipboardMonitor,
  sanitizeClipboardHistoryItems
} = require("../src/main/clipboard");

function createTempHistoryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamic-island-clipboard-"));
  return {
    dir,
    historyPath: path.join(dir, "clipboard-history.json")
  };
}

function readHistoryFile(historyPath) {
  return JSON.parse(fs.readFileSync(historyPath, "utf8"));
}

function createStartedMonitor(options = {}) {
  let nativeTextHandler;
  const nativeStop = vi.fn();
  const snapshots = [];
  const monitor = createClipboardMonitor({
    clipboardApi: {
      readText: () => "",
      writeText: vi.fn()
    },
    createNativeClipboardListener: ({ onText }) => {
      nativeTextHandler = onText;
      return {
        start: () => true,
        stop: nativeStop
      };
    },
    emitSnapshot: (snapshot) => snapshots.push(snapshot),
    platform: "win32",
    ...options
  });

  monitor.start();

  return {
    emitNativeText: (text) => nativeTextHandler?.(text, "test"),
    monitor,
    nativeStop,
    snapshots
  };
}

describe("clipboard persistence", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("sanitizes restored clipboard history", () => {
    const items = sanitizeClipboardHistoryItems([
      { id: "first", text: " first\nitem ", copiedAt: 10 },
      { id: "duplicate", text: "first\nitem", copiedAt: 11 },
      { id: "blank", text: "   ", copiedAt: 12 },
      { id: "second", text: "second", copiedAt: 13 }
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "first",
      text: "first\nitem",
      preview: "first item",
      copiedAt: 10
    });
    expect(items[1]).toMatchObject({
      id: "second",
      text: "second",
      preview: "second",
      copiedAt: 13
    });
  });

  it("restores confirmed history on start without creating a pending item", () => {
    const created = createTempHistoryPath();
    tempDir = created.dir;
    fs.writeFileSync(
      created.historyPath,
      JSON.stringify({
        version: 1,
        items: [{ id: "saved", text: "saved text", copiedAt: 100 }]
      }),
      "utf8"
    );

    const { monitor, snapshots } = createStartedMonitor({ historyPath: created.historyPath });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].pending).toBeUndefined();
    expect(snapshots[0].items).toHaveLength(1);
    expect(snapshots[0].items[0]).toMatchObject({
      id: "saved",
      text: "saved text",
      preview: "saved text",
      copiedAt: 100
    });
    expect(monitor.getSnapshot().items[0].text).toBe("saved text");

    monitor.stop();
  });

  it("persists accepted items and keeps delete and clear operations durable", () => {
    const created = createTempHistoryPath();
    tempDir = created.dir;

    const { emitNativeText, monitor, snapshots } = createStartedMonitor({ historyPath: created.historyPath });
    emitNativeText("persist me");
    const pendingId = snapshots.at(-1)?.pending?.id;

    expect(pendingId).toBeTruthy();
    expect(monitor.acceptPending(pendingId).ok).toBe(true);
    expect(readHistoryFile(created.historyPath).items).toMatchObject([
      { text: "persist me" }
    ]);

    const savedId = monitor.getSnapshot().items[0].id;
    expect(monitor.removeItem(savedId).ok).toBe(true);
    expect(readHistoryFile(created.historyPath).items).toEqual([]);

    monitor.writeText("clear me");
    expect(readHistoryFile(created.historyPath).items).toMatchObject([
      { text: "clear me" }
    ]);
    expect(monitor.clearItems().ok).toBe(true);
    expect(readHistoryFile(created.historyPath).items).toEqual([]);

    monitor.stop();
  });

  it("re-prompts dismissed text when the native clipboard listener sees it copied again", () => {
    const created = createTempHistoryPath();
    tempDir = created.dir;

    const { emitNativeText, monitor, snapshots } = createStartedMonitor({ historyPath: created.historyPath });
    emitNativeText("repeat me");
    const firstPending = snapshots.at(-1)?.pending;

    expect(firstPending?.text).toBe("repeat me");
    expect(monitor.dismissPending(firstPending?.id).ok).toBe(true);
    expect(snapshots.at(-1)?.pending).toBeUndefined();

    emitNativeText("repeat me");
    const secondPending = snapshots.at(-1)?.pending;

    expect(secondPending?.text).toBe("repeat me");
    expect(secondPending?.id).not.toBe(firstPending?.id);

    monitor.stop();
  });

  it("keeps fallback polling from re-prompting dismissed unchanged text", async () => {
    vi.useFakeTimers();

    const created = createTempHistoryPath();
    tempDir = created.dir;
    let clipboardText = "";
    const snapshots = [];
    const monitor = createClipboardMonitor({
      clipboardApi: {
        readText: () => clipboardText,
        writeText: vi.fn()
      },
      emitSnapshot: (snapshot) => snapshots.push(snapshot),
      historyPath: created.historyPath,
      platform: "linux"
    });

    monitor.start();
    clipboardText = "repeat poll";
    await vi.advanceTimersByTimeAsync(750);
    const firstPending = snapshots.at(-1)?.pending;

    expect(firstPending?.text).toBe("repeat poll");
    expect(monitor.dismissPending(firstPending?.id).ok).toBe(true);
    expect(snapshots.at(-1)?.pending).toBeUndefined();

    await vi.advanceTimersByTimeAsync(750);

    expect(snapshots.at(-1)?.pending).toBeUndefined();

    monitor.stop();
  });

  it("does not filter repeated clipboard text inside the native helper", () => {
    const helperScript = fs.readFileSync(path.join(process.cwd(), "src/main/native-clipboard-helper.ps1"), "utf8");

    expect(helperScript).not.toMatch(/\$script:lastText/);
    expect(helperScript).not.toMatch(/\$text\s+-eq\s+\$script:lastText/);
    expect(helperScript).toContain('type = "clipboard"');
  });
});
