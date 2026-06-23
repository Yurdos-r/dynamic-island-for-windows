function createMainHoverController(options = {}) {
  const hoverDetection = options.hoverDetection;
  let pollTimer;
  let openTimer;
  let closeTimer;

  function clearOpenTimer() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = undefined;
    }
  }

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  function clearTimers() {
    clearOpenTimer();
    clearCloseTimer();
  }

  function start() {
    if (pollTimer) {
      return;
    }

    pollTimer = setInterval(() => {
      options.updateMousePassthrough?.();
      const currentMode = options.getCurrentMode?.() || "idle";

      if (
        currentMode === "privacy" ||
        currentMode === "privacy-expanded" ||
        currentMode === "clipboard-prompt" ||
        currentMode === "keyboard-lock"
      ) {
        clearTimers();
        return;
      }

      const insideCard = Boolean(options.isPointerInsideCard?.(hoverDetection.enterPadding));
      const insideExitArea = Boolean(options.isPointerInsideCard?.(hoverDetection.exitPadding));

      if (insideExitArea) {
        clearCloseTimer();
      }

      if (!options.isPrivacyActive?.() && insideCard && currentMode === "idle" && !openTimer) {
        openTimer = setTimeout(() => {
          openTimer = undefined;

          if (
            !options.isPrivacyActive?.() &&
            options.getCurrentMode?.() === "idle" &&
            options.isPointerInsideCard?.(hoverDetection.enterPadding)
          ) {
            options.requestIslandMode?.("peek");
          }
        }, hoverDetection.openDelay);
      }

      if (insideExitArea) {
        return;
      }

      clearOpenTimer();

      const collapseMode = options.isPrivacyActive?.() ? "privacy" : "idle";
      if (currentMode !== collapseMode && currentMode !== "clipboard-prompt" && !closeTimer) {
        closeTimer = setTimeout(() => {
          closeTimer = undefined;

          if (options.getCurrentMode?.() !== collapseMode && !options.isPointerInsideCard?.(hoverDetection.exitPadding)) {
            options.requestIslandMode?.(collapseMode);
          }
        }, hoverDetection.closeDelay);
      }
    }, hoverDetection.pollInterval);
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    clearTimers();
  }

  return {
    clearTimers,
    start,
    stop
  };
}

function createSystemHoverController(options = {}) {
  const hoverDetection = options.hoverDetection;
  let pollTimer;
  let closeTimer;

  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  function start() {
    if (pollTimer) {
      return;
    }

    pollTimer = setInterval(() => {
      options.updateMousePassthrough?.();

      const insideExitArea = Boolean(options.isPointerInsideCard?.(hoverDetection.exitPadding));
      if (insideExitArea) {
        clearCloseTimer();
        return;
      }

      const currentMode = options.getCurrentMode?.() || "idle";
      if (currentMode !== "idle" && !closeTimer) {
        closeTimer = setTimeout(
          () => {
            closeTimer = undefined;

            if (options.getCurrentMode?.() !== "idle" && !options.isPointerInsideCard?.(hoverDetection.exitPadding)) {
              options.requestIslandMode?.("idle");
            }
          },
          currentMode === "expanded" ? 220 : hoverDetection.closeDelay
        );
      }
    }, hoverDetection.pollInterval);
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }

    clearCloseTimer();
  }

  return {
    clearCloseTimer,
    start,
    stop
  };
}

module.exports = {
  createMainHoverController,
  createSystemHoverController
};
