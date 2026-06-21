import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeBridgeSnapshot } = require("../src/main/inflink/bridge-normalizer");
const { normalizeMediaSnapshot } = require("../src/main/media/media-normalizer");

describe("bridge and media normalizers", () => {
  it("sanitizes bridge snapshots and caps lyrics", () => {
    const snapshot = normalizeBridgeSnapshot({
      active: true,
      title: "  Song  ",
      artist: "  Artist  ",
      cover: "file:///bad.png",
      ncmId: "123",
      durationSeconds: 10,
      positionSeconds: 99,
      lyrics: Array.from({ length: 140 }, (_, index) => ({ timeMs: index, text: `line ${index}` }))
    });

    expect(snapshot.title).toBe("Song");
    expect(snapshot.cover).toBe("");
    expect(snapshot.positionSeconds).toBe(10);
    expect(snapshot.lyrics).toHaveLength(120);
  });

  it("normalizes media snapshots with invalid URLs and timing", () => {
    const snapshot = normalizeMediaSnapshot({
      available: true,
      active: true,
      title: "Track",
      artist: "",
      sourceApp: "player.exe",
      cover: "javascript:alert(1)",
      durationSeconds: 5,
      positionSeconds: 20,
      genres: ["NCM-456"],
      favorited: true
    });

    expect(snapshot.artist).toBe("player.exe");
    expect(snapshot.cover).toBe("");
    expect(snapshot.positionSeconds).toBe(5);
    expect(snapshot.ncmId).toBe("456");
    expect(snapshot.favorited).toBe(true);
  });
});
