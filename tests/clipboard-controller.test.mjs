import { describe, expect, it } from "vitest";
import { normalizeClipboardSnapshot, formatClipboardTimestamp } from "../src/renderer/app/controllers/clipboard-controller";

describe("clipboard controller", () => {
  it("normalizes clipboard items and pending text", () => {
    const snapshot = normalizeClipboardSnapshot({
      active: false,
      text: "",
      preview: "",
      pending: { id: "", text: " hello\nworld ", preview: "", copiedAt: 1 },
      items: [
        { id: "a", text: "first item", preview: "", copiedAt: 2 },
        { id: "bad", text: "   ", preview: "", copiedAt: 3 }
      ],
      updatedAt: 4
    });

    expect(snapshot.active).toBe(true);
    expect(snapshot.pending.preview).toBe("hello world");
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0].preview).toBe("first item");
  });

  it("formats clipboard timestamps as local HH:mm", () => {
    expect(formatClipboardTimestamp(new Date(2026, 0, 1, 9, 5).getTime())).toBe("09:05");
  });
});
