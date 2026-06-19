function createNativeMediaLineDispatcher(options = {}) {
  const logStartup = typeof options.logStartup === "function" ? options.logStartup : () => {};
  const runtime = options.runtime;

  if (!runtime) {
    throw new Error("runtime is required to create native media line dispatcher.");
  }

  function handleLine(line) {
    const text = String(line || "").trim();
    if (!text) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      logStartup("native-media-parse-error", text.slice(0, 180));
      return;
    }

    if (payload.type === "status") {
      runtime.setReady(payload.status === "ready");
      logStartup("native-media-status", {
        status: payload.status || "",
        transport: payload.transport || "native-gsmtc-helper",
        error: payload.error || ""
      });
      return;
    }

    if (payload.type === "snapshot") {
      runtime.updateSnapshot(payload);
      return;
    }

    if (payload.type === "control-result") {
      runtime.resolvePendingCommand(String(payload.id || ""), {
        ok: payload.ok === true,
        available: payload.available !== false,
        active: payload.active !== false,
        action: payload.action || "unknown",
        transport: payload.transport || "native-gsmtc-helper",
        requestedPositionTicks: payload.requestedPositionTicks,
        error: payload.error || ""
      });
    }
  }

  return {
    handleLine
  };
}

module.exports = {
  createNativeMediaLineDispatcher
};
