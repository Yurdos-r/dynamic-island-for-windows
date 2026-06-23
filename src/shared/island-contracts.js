const ISLAND_MODES = Object.freeze([
  "idle",
  "peek",
  "clipboard-prompt",
  "privacy",
  "privacy-expanded",
  "hover",
  "keyboard-lock",
  "expanded",
  "clipboard",
  "settings",
  "system"
]);

const ISLAND_MODE_SET = new Set(ISLAND_MODES);

const MEDIA_CONTROL_ACTIONS = Object.freeze(["toggle-play", "previous-track", "next-track", "favorite-track"]);
const MEDIA_CONTROL_ACTION_SET = new Set(MEDIA_CONTROL_ACTIONS);

const ISLAND_LAYOUTS = Object.freeze(["classic", "top-center"]);
const ISLAND_LAYOUT_SET = new Set(ISLAND_LAYOUTS);

const IPC_CHANNELS = Object.freeze({
  rendererReady: "island:renderer-ready",
  resize: "island:resize",
  getUiSettings: "island:get-ui-settings",
  setLayout: "island:set-layout",
  setSystemMonitor: "island:set-system-monitor",
  setKeyboardLockHints: "island:set-keyboard-lock-hints",
  setStartup: "island:set-startup",
  setInteracting: "island:set-interacting",
  setMode: "island:set-mode",
  avoidScale: "island:avoid-scale",
  layoutChanged: "island:layout-changed",
  mediaControl: "media:control",
  mediaSeek: "media:seek",
  mediaUpdate: "media:update",
  privacyUpdate: "privacy:update",
  clipboardWrite: "clipboard:write",
  clipboardAcceptPending: "clipboard:accept-pending",
  clipboardDismissPending: "clipboard:dismiss-pending",
  clipboardClear: "clipboard:clear",
  clipboardRemove: "clipboard:remove",
  clipboardUpdate: "clipboard:update",
  keyboardLockUpdate: "keyboard-lock:update",
  systemUpdate: "system:update"
});

module.exports = {
  IPC_CHANNELS,
  ISLAND_LAYOUTS,
  ISLAND_LAYOUT_SET,
  ISLAND_MODES,
  ISLAND_MODE_SET,
  MEDIA_CONTROL_ACTIONS,
  MEDIA_CONTROL_ACTION_SET
};
