const KEYBOARD_LOCK_POLL_INTERVAL_MS = 150;
const KEYBOARD_LOCK_KEYS = Object.freeze(["capsLock", "numLock"]);
const KEYBOARD_LOCK_KEY_SET = new Set(KEYBOARD_LOCK_KEYS);
const KEYBOARD_LOCK_VK = Object.freeze({
  capsLock: 0x14,
  numLock: 0x90
});

function normalizeKeyboardLockKey(key) {
  return KEYBOARD_LOCK_KEY_SET.has(key) ? key : "";
}

function isKeyboardLockEnabledFromState(state) {
  return (Number(state) & 1) === 1;
}

function createKeyboardLockSnapshot(key, enabled, options = {}) {
  const safeKey = normalizeKeyboardLockKey(key);
  if (!safeKey) {
    throw new Error(`Unsupported keyboard lock key: ${key}`);
  }

  const now = typeof options.now === "function" ? options.now : Date.now;
  return {
    key: safeKey,
    enabled: Boolean(enabled),
    changedAt: Number(now()),
    initial: Boolean(options.initial)
  };
}

function readLockStateFromGetKeyState(getKeyState, key) {
  const safeKey = normalizeKeyboardLockKey(key);
  if (!safeKey) {
    throw new Error(`Unsupported keyboard lock key: ${key}`);
  }

  return isKeyboardLockEnabledFromState(getKeyState(KEYBOARD_LOCK_VK[safeKey]));
}

function createKeyboardLockStateTracker(options = {}) {
  const readLockState = options.readLockState;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const keys = Array.isArray(options.keys) ? options.keys.map(normalizeKeyboardLockKey).filter(Boolean) : KEYBOARD_LOCK_KEYS;
  const previous = new Map();

  if (typeof readLockState !== "function") {
    throw new Error("readLockState is required.");
  }

  function readSnapshot(key, initial) {
    const enabled = Boolean(readLockState(key));
    previous.set(key, enabled);
    return createKeyboardLockSnapshot(key, enabled, { now, initial });
  }

  function prime() {
    return keys.map((key) => readSnapshot(key, true));
  }

  function poll() {
    const changes = [];

    keys.forEach((key) => {
      const enabled = Boolean(readLockState(key));
      if (!previous.has(key)) {
        previous.set(key, enabled);
        return;
      }

      if (previous.get(key) !== enabled) {
        previous.set(key, enabled);
        changes.push(createKeyboardLockSnapshot(key, enabled, { now, initial: false }));
      }
    });

    return changes;
  }

  return {
    poll,
    prime
  };
}

function createNativeGetKeyState() {
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  return user32.func("short __stdcall GetKeyState(int nVirtKey)");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createKeyboardLockMonitor(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const emitSnapshot = typeof options.emitSnapshot === "function" ? options.emitSnapshot : () => {};
  const platform = options.platform || process.platform;
  const pollInterval = Math.max(50, Number(options.pollInterval || KEYBOARD_LOCK_POLL_INTERVAL_MS));
  const now = typeof options.now === "function" ? options.now : Date.now;
  const getKeyStateFactory = typeof options.getKeyStateFactory === "function" ? options.getKeyStateFactory : createNativeGetKeyState;
  let getKeyState;
  let tracker;
  let timer;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function readLockState(key) {
    if (typeof options.readLockState === "function") {
      return Boolean(options.readLockState(key));
    }

    if (!getKeyState) {
      getKeyState = getKeyStateFactory();
    }

    return readLockStateFromGetKeyState(getKeyState, key);
  }

  function start() {
    if (timer) {
      return true;
    }

    if (platform !== "win32") {
      logStartup("keyboard-lock-unavailable", { reason: "unsupported-platform", platform });
      return false;
    }

    try {
      tracker = createKeyboardLockStateTracker({ readLockState, now });
      const initialSnapshots = tracker.prime();
      logStartup("keyboard-lock-status", {
        available: true,
        capsLock: initialSnapshots.find((snapshot) => snapshot.key === "capsLock")?.enabled,
        numLock: initialSnapshots.find((snapshot) => snapshot.key === "numLock")?.enabled
      });
    } catch (error) {
      logStartup("keyboard-lock-unavailable", { reason: "initial-read-failed", error: errorMessage(error) });
      tracker = undefined;
      return false;
    }

    timer = setInterval(() => {
      try {
        tracker?.poll().forEach(emitSnapshot);
      } catch (error) {
        logStartup("keyboard-lock-unavailable", { reason: "poll-failed", error: errorMessage(error) });
        stop();
      }
    }, pollInterval);
    timer.unref?.();
    return true;
  }

  return {
    start,
    stop
  };
}

module.exports = {
  KEYBOARD_LOCK_KEYS,
  KEYBOARD_LOCK_POLL_INTERVAL_MS,
  createKeyboardLockMonitor,
  createKeyboardLockSnapshot,
  createKeyboardLockStateTracker,
  isKeyboardLockEnabledFromState,
  normalizeKeyboardLockKey,
  readLockStateFromGetKeyState
};
