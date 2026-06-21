import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { BRIDGE_TOKEN_HEADER } = require("../src/main/inflink/bridge-contract");
const { createBridgeHttpRouter } = require("../src/main/inflink/bridge-http-router");
const { createBridgeRuntime } = require("../src/main/inflink/bridge-runtime");

function createRequest(method, url, token, body) {
  const request = new PassThrough();
  request.method = method;
  request.url = url;
  request.headers = token ? { [BRIDGE_TOKEN_HEADER.toLowerCase()]: token } : {};
  queueMicrotask(() => {
    request.end(body === undefined ? "" : JSON.stringify(body));
  });
  return request;
}

function dispatch(router, request) {
  return new Promise((resolve) => {
    const response = {
      headers: {},
      statusCode: 0,
      body: "",
      setHeader(name, value) {
        this.headers[name] = value;
      },
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode;
        Object.assign(this.headers, headers);
      },
      end(body = "") {
        this.body = String(body || "");
        resolve(this);
      }
    };

    router.handleRequest(request, response);
  });
}

function createRouter(token = "a".repeat(64)) {
  const runtime = createBridgeRuntime();
  const router = createBridgeHttpRouter({
    runtime,
    bridgeToken: token,
    fileBridgeDirs: ["C:\\test-bridge"],
    getSnapshot: () => ({ available: true, active: false })
  });
  return { runtime, router, token };
}

describe("bridge HTTP token auth", () => {
  it("rejects unauthenticated status, snapshot, result, and command requests", async () => {
    const { router } = createRouter();
    const cases = [
      createRequest("GET", "/dynamic-island-bridge/status"),
      createRequest("GET", "/dynamic-island-bridge/command"),
      createRequest("POST", "/dynamic-island-bridge/snapshot", "", { title: "Injected" }),
      createRequest("POST", "/dynamic-island-bridge/result", "", { id: "1", ok: true })
    ];

    for (const request of cases) {
      const response = await dispatch(router, request);
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toEqual({ ok: false, error: "Unauthorized." });
    }
  });

  it("accepts tokened snapshot, command, status, and result requests", async () => {
    const { runtime, router, token } = createRouter();
    const snapshotResponse = await dispatch(
      router,
      createRequest("POST", "/dynamic-island-bridge/snapshot", token, {
        title: "Song",
        artist: "Artist",
        active: true,
        playing: true,
        durationSeconds: 200,
        positionSeconds: 20
      })
    );
    expect(snapshotResponse.statusCode).toBe(200);
    expect(runtime.state.lastSnapshot.title).toBe("Song");

    runtime.state.pendingCommand = {
      id: "cmd-1",
      type: "toggle-play",
      createdAt: Date.now(),
      resolve: () => {},
      timeout: setTimeout(() => {}, 1000)
    };
    const commandResponse = await dispatch(router, createRequest("GET", "/dynamic-island-bridge/command", token));
    expect(commandResponse.statusCode).toBe(200);
    expect(JSON.parse(commandResponse.body).command.id).toBe("cmd-1");

    const result = await new Promise(async (resolve) => {
      runtime.state.pendingCommand.resolve = resolve;
      const resultResponse = await dispatch(
        router,
        createRequest("POST", "/dynamic-island-bridge/result", token, { id: "cmd-1", type: "toggle-play", ok: true })
      );
      expect(resultResponse.statusCode).toBe(200);
    });
    expect(result.ok).toBe(true);

    const statusResponse = await dispatch(router, createRequest("GET", "/dynamic-island-bridge/status", token));
    expect(statusResponse.statusCode).toBe(200);
    expect(JSON.parse(statusResponse.body).fileBridgeDirs).toEqual(["C:\\test-bridge"]);
  });
});
