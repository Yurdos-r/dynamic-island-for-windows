import { describe, expect, it } from "vitest";
import {
  canShowKeyboardLockHint,
  normalizeKeyboardLockSnapshot
} from "../src/renderer/app/controllers/keyboard-lock-controller.ts";

describe("keyboard lock renderer behavior", () => {
  it("allows keyboard hints only from lightweight island modes", () => {
    expect(canShowKeyboardLockHint("idle")).toBe(true);
    expect(canShowKeyboardLockHint("peek")).toBe(true);
    expect(canShowKeyboardLockHint("hover")).toBe(true);
    expect(canShowKeyboardLockHint("keyboard-lock")).toBe(true);

    expect(canShowKeyboardLockHint("settings")).toBe(false);
    expect(canShowKeyboardLockHint("system")).toBe(false);
    expect(canShowKeyboardLockHint("expanded")).toBe(false);
    expect(canShowKeyboardLockHint("clipboard")).toBe(false);
    expect(canShowKeyboardLockHint("privacy")).toBe(false);
    expect(canShowKeyboardLockHint("privacy-expanded")).toBe(false);
    expect(canShowKeyboardLockHint("clipboard-prompt")).toBe(false);
  });

  it("normalizes Caps Lock and Num Lock copy", () => {
    expect(
      normalizeKeyboardLockSnapshot({ key: "capsLock", enabled: true, changedAt: 20, initial: false })
    ).toEqual({
      key: "capsLock",
      enabled: true,
      label: "大写锁定",
      statusText: "已开启",
      changedAt: 20
    });

    expect(
      normalizeKeyboardLockSnapshot({ key: "numLock", enabled: false, changedAt: 30, initial: false })
    ).toEqual({
      key: "numLock",
      enabled: false,
      label: "数字键盘",
      statusText: "已关闭",
      changedAt: 30
    });
  });
});
