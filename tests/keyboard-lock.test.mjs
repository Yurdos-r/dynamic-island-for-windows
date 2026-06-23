import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createKeyboardLockStateTracker,
  isKeyboardLockEnabledFromState,
  readLockStateFromGetKeyState
} = require("../src/main/keyboard-lock");

describe("keyboard lock monitor state", () => {
  it("normalizes GetKeyState toggle bits", () => {
    expect(isKeyboardLockEnabledFromState(0)).toBe(false);
    expect(isKeyboardLockEnabledFromState(1)).toBe(true);
    expect(isKeyboardLockEnabledFromState(0x8000)).toBe(false);
    expect(isKeyboardLockEnabledFromState(0x8001)).toBe(true);
  });

  it("reads Caps Lock and Num Lock virtual keys", () => {
    const calls = [];
    const getKeyState = (vk) => {
      calls.push(vk);
      return vk === 0x14 ? 1 : 0;
    };

    expect(readLockStateFromGetKeyState(getKeyState, "capsLock")).toBe(true);
    expect(readLockStateFromGetKeyState(getKeyState, "numLock")).toBe(false);
    expect(calls).toEqual([0x14, 0x90]);
  });

  it("primes initial state and emits only actual changes", () => {
    const state = { capsLock: false, numLock: true };
    let now = 1000;
    const tracker = createKeyboardLockStateTracker({
      now: () => now,
      readLockState: (key) => state[key]
    });

    expect(tracker.prime()).toEqual([
      { key: "capsLock", enabled: false, changedAt: 1000, initial: true },
      { key: "numLock", enabled: true, changedAt: 1000, initial: true }
    ]);
    expect(tracker.poll()).toEqual([]);

    now = 1150;
    state.capsLock = true;
    expect(tracker.poll()).toEqual([{ key: "capsLock", enabled: true, changedAt: 1150, initial: false }]);
    expect(tracker.poll()).toEqual([]);

    now = 1300;
    state.numLock = false;
    expect(tracker.poll()).toEqual([{ key: "numLock", enabled: false, changedAt: 1300, initial: false }]);
  });
});
