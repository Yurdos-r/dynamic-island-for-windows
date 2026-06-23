import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => ""
  }
}));

const require = createRequire(import.meta.url);
const { DEFAULT_SETTINGS, sanitizeUiSettings } = require("../src/main/settings-store");

describe("ui settings store", () => {
  it("enables keyboard lock hints by default", () => {
    expect(DEFAULT_SETTINGS.keyboardLockHintsEnabled).toBe(true);
    expect(sanitizeUiSettings({})).toMatchObject({
      layout: "top-center",
      systemMonitorEnabled: true,
      keyboardLockHintsEnabled: true,
      startupEnabled: false
    });
  });

  it("accepts only boolean keyboard lock hint values", () => {
    expect(sanitizeUiSettings({ keyboardLockHintsEnabled: false }).keyboardLockHintsEnabled).toBe(false);
    expect(sanitizeUiSettings({ keyboardLockHintsEnabled: true }).keyboardLockHintsEnabled).toBe(true);
    expect(sanitizeUiSettings({ keyboardLockHintsEnabled: "false" }).keyboardLockHintsEnabled).toBe(true);
  });
});
