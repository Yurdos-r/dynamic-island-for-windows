import { describe, expect, it } from "vitest";
import { getSystemTileMeterState } from "../src/renderer/system-view";

describe("system tile meter", () => {
  it("uses 24 tiles, so CPU alert begins at the tile containing 70 percent", () => {
    expect(getSystemTileMeterState(71, 70)).toEqual({
      percent: 71,
      activeCount: 17,
      warnStartIndex: 24,
      alertStartIndex: 16,
      hasWarn: false,
      hasAlert: true
    });
  });

  it("does not enter the alert band until the value is above the threshold", () => {
    expect(getSystemTileMeterState(70, 70)).toEqual({
      percent: 70,
      activeCount: 17,
      warnStartIndex: 24,
      alertStartIndex: 24,
      hasWarn: false,
      hasAlert: false
    });
  });

  it("does not mark memory as elevated at exactly 70 percent", () => {
    expect(
      getSystemTileMeterState(70, {
        warnPercent: 70,
        alertPercent: 85,
        warnMode: "above",
        alertMode: "atOrAbove"
      })
    ).toEqual({
      percent: 70,
      activeCount: 17,
      warnStartIndex: 24,
      alertStartIndex: 24,
      hasWarn: false,
      hasAlert: false
    });
  });

  it("marks only the memory band above 70 percent as elevated", () => {
    expect(
      getSystemTileMeterState(71, {
        warnPercent: 70,
        alertPercent: 85,
        warnMode: "above",
        alertMode: "atOrAbove"
      })
    ).toEqual({
      percent: 71,
      activeCount: 17,
      warnStartIndex: 16,
      alertStartIndex: 24,
      hasWarn: true,
      hasAlert: false
    });
  });

  it("marks memory as dangerous from 85 percent", () => {
    expect(
      getSystemTileMeterState(85, {
        warnPercent: 70,
        alertPercent: 85,
        warnMode: "above",
        alertMode: "atOrAbove"
      })
    ).toEqual({
      percent: 85,
      activeCount: 21,
      warnStartIndex: 16,
      alertStartIndex: 20,
      hasWarn: true,
      hasAlert: true
    });
  });
});
