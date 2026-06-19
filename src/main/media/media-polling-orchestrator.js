function createMediaPollingOrchestrator(options = {}) {
  const runtime = options.runtime;
  const inflinkBridge = options.inflinkBridge;
  const nativeMediaSession = options.nativeMediaSession;
  const queryMediaSnapshot = options.queryMediaSnapshot;
  const sendMediaSnapshot = options.sendMediaSnapshot;
  const pollInterval = Number(options.pollInterval) || 300;

  if (!runtime || !inflinkBridge || !nativeMediaSession) {
    throw new Error("runtime, inflink bridge, and native media session are required to create media polling orchestrator.");
  }
  if (typeof queryMediaSnapshot !== "function" || typeof sendMediaSnapshot !== "function") {
    throw new Error("queryMediaSnapshot and sendMediaSnapshot are required to create media polling orchestrator.");
  }

  async function poll() {
    if (runtime.state.pollInFlight) {
      return;
    }

    runtime.state.pollInFlight = true;

    try {
      sendMediaSnapshot(await queryMediaSnapshot());
    } finally {
      runtime.state.pollInFlight = false;
    }
  }

  function start() {
    if (runtime.state.pollTimer) {
      return;
    }

    void inflinkBridge.start();
    nativeMediaSession.start();
    void poll();
    runtime.state.pollTimer = setInterval(() => {
      void poll();
    }, pollInterval);
  }

  function stop() {
    if (runtime.state.pollTimer) {
      clearInterval(runtime.state.pollTimer);
      runtime.state.pollTimer = undefined;
    }

    inflinkBridge.stop();
    nativeMediaSession.stop();
  }

  function pollSoon(delay = 650) {
    setTimeout(() => {
      void poll();
    }, delay);
  }

  return {
    poll,
    pollSoon,
    start,
    stop
  };
}

module.exports = {
  createMediaPollingOrchestrator
};
