import type { IslandApiListenerContext } from "./event-context";

export function registerIslandApiListeners(context: IslandApiListenerContext) {
  const { app, island } = context;

  island?.onModeRequest((requestedMode) => {
    context.onModeRequest(requestedMode);
  });

  island?.onAvoidScale((scale) => {
    const safeScale = Number.isFinite(scale) ? Math.max(0.5, Math.min(1, scale)) : 1;
    app.style.setProperty("--avoid-scale", safeScale.toFixed(4));
    app.dataset.avoiding = safeScale < 0.999 ? "true" : "false";
  });

  island?.onMediaUpdate((snapshot) => {
    context.onMediaUpdate(snapshot);
  });

  island?.onPrivacyUpdate((snapshot) => {
    context.onPrivacyUpdate(snapshot);
  });

  island?.onClipboardUpdate((snapshot) => {
    context.onClipboardUpdate(snapshot);
  });

  island?.onSystemUpdate((snapshot) => {
    context.onSystemUpdate(snapshot);
  });

  island?.onKeyboardLockUpdate((snapshot) => {
    context.onKeyboardLockUpdate(snapshot);
  });

  island?.onLayoutChanged((settings) => {
    context.onLayoutChanged(settings);
  });

  void island?.getUiSettings().then((settings) => {
    context.onLayoutChanged(settings);
  });

  window.setInterval(() => {
    context.onPlaybackTick();
  }, 250);

  island?.ready();
}
