import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { FILE_RESULT_NAME, FILE_SNAPSHOT_NAME } = require("../src/main/inflink/bridge-contract");
const { createBridgeFilePoller } = require("../src/main/inflink/bridge-file-poller");
const { createBridgeRuntime } = require("../src/main/inflink/bridge-runtime");

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamic-island-bridge-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("bridge file poller v2 auth", () => {
  it("ignores v1 snapshots and accepts v2 snapshots with bridgeToken", () => {
    const dir = makeTempDir();
    const token = "b".repeat(64);
    const runtime = createBridgeRuntime();
    const poller = createBridgeFilePoller({ runtime, bridgeDirs: [dir], bridgeToken: token });

    fs.writeFileSync(path.join(dir, FILE_SNAPSHOT_NAME), JSON.stringify({ title: "Old", active: true }), "utf8");
    expect(poller.readFileSnapshot(5000)).toBeUndefined();

    fs.writeFileSync(
      path.join(dir, FILE_SNAPSHOT_NAME),
      JSON.stringify({
        bridgeToken: token,
        snapshot: { title: "New", artist: "Bridge", active: true, durationSeconds: 120 }
      }),
      "utf8"
    );
    expect(poller.readFileSnapshot(5000).title).toBe("New");
  });

  it("ignores v1 results and resolves v2 results with bridgeToken", async () => {
    const dir = makeTempDir();
    const token = "c".repeat(64);
    const runtime = createBridgeRuntime();
    const poller = createBridgeFilePoller({ runtime, bridgeDirs: [dir], bridgeToken: token });

    let resolved;
    runtime.state.pendingCommand = {
      id: "cmd-2",
      type: "favorite-track",
      resolve: (value) => {
        resolved = value;
      },
      timeout: setTimeout(() => {}, 1000)
    };

    fs.writeFileSync(path.join(dir, FILE_RESULT_NAME), JSON.stringify({ id: "cmd-2", ok: true }), "utf8");
    poller.startResultPolling();
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(resolved).toBeUndefined();

    fs.writeFileSync(path.join(dir, FILE_RESULT_NAME), JSON.stringify({ id: "cmd-2", ok: true, bridgeToken: token }), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 160));
    poller.stopResultPolling();
    expect(resolved.ok).toBe(true);
  });
});
