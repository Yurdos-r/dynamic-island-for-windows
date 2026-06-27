const { FADE_DURATION_MS, FADE_STEP_MS } = require("./window-config");

function createWindowFader() {
  const fadeTimers = new WeakMap();

  function clear(win) {
    const timer = fadeTimers.get(win);
    if (timer) {
      clearInterval(timer);
      fadeTimers.delete(win);
    }
  }

  function fadeTo(win, target, done) {
    if (!win || win.isDestroyed()) {
      return;
    }

    clear(win);
    const start = win.getOpacity();
    const delta = target - start;
    if (Math.abs(delta) < 0.01) {
      win.setOpacity(target);
      if (done) {
        done();
      }
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (!win || win.isDestroyed()) {
        clear(win);
        return;
      }

      const progress = Math.min(1, (Date.now() - startedAt) / FADE_DURATION_MS);
      win.setOpacity(start + delta * progress);
      if (progress >= 1) {
        clear(win);
        if (done) {
          done();
        }
      }
    }, FADE_STEP_MS);
    fadeTimers.set(win, timer);
  }

  function fadeOutAndHide(win) {
    if (!win || win.isDestroyed() || !win.isVisible()) {
      return;
    }

    clear(win);
    win.hide();
  }

  function showAndFadeIn(win, raise, onShown) {
    if (!win || win.isDestroyed()) {
      return;
    }

    clear(win);
    if (!win.isVisible()) {
      win.show();
    }
    if (raise) {
      raise(true);
    }
    if (onShown) {
      onShown();
    }
  }

  return {
    clear,
    fadeOutAndHide,
    fadeTo,
    showAndFadeIn
  };
}

module.exports = {
  createWindowFader
};
