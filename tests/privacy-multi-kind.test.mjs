import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  getPrivacyDetailTextForState,
  getPrivacyKindsForState,
  getPrivacySummaryTextForState
} from "../src/renderer/app/controllers/privacy-controller";

const require = createRequire(import.meta.url);
const { normalizePrivacySnapshot } = require("../src/main/privacy");

describe("privacy multi-kind display", () => {
  it("keeps all active privacy apps in the main-process snapshot", () => {
    const snapshot = normalizePrivacySnapshot({
      available: true,
      activeKinds: ["camera", "microphone"],
      items: [
        { kind: "camera", app: "camera-app", startedAt: 10 },
        { kind: "microphone", app: "microphone-app", startedAt: 20 }
      ]
    });

    expect(snapshot.active).toBe(true);
    expect(snapshot.activeKinds).toEqual(["camera", "microphone"]);
    expect(snapshot.apps).toHaveLength(2);
    expect(snapshot.apps.map((item) => item.kind)).toEqual(["camera", "microphone"]);
  });

  it("summarizes and details multiple active privacy kinds together", () => {
    const state = {
      available: true,
      active: true,
      kind: "camera",
      activeKinds: ["camera", "microphone"],
      apps: [
        { kind: "camera", app: "camera-app", displayName: "Zoom", startedAt: 10 },
        { kind: "microphone", app: "microphone-app", displayName: "OBS", startedAt: 20 }
      ],
      updatedAt: Date.now()
    };

    expect(getPrivacyKindsForState(state)).toEqual(["camera", "microphone"]);
    expect(getPrivacySummaryTextForState(state)).toBe("摄像头、麦克风调用中");
    expect(getPrivacyDetailTextForState(state)).toBe("摄像头：Zoom / 麦克风：OBS");
  });
});
