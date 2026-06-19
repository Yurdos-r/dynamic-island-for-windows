import {
  PRIORITY_TRANSITION_MEDIA_TO_PRIVACY,
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_TRANSITION_MS,
  type PrivacySnapshot
} from "../state";
import type { IslandUpdateHandlerOptions } from "./update-handler-types";

export function createPrivacyUpdateHandler(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

  function handlePrivacyUpdate(snapshot: PrivacySnapshot) {
    const previousPrivacyActive = runtime.wasPrivacyActive;
    const previousMode = runtime.mode;
    const nextPrivacyState: PrivacySnapshot = {
      available: Boolean(snapshot?.available),
      active: Boolean(snapshot?.active),
      kind: snapshot?.kind || "none",
      activeKinds: Array.isArray(snapshot?.activeKinds) ? snapshot.activeKinds : [],
      apps: Array.isArray(snapshot?.apps) ? snapshot.apps : [],
      updatedAt: Number(snapshot?.updatedAt || 0)
    };
    const shouldHandOffFromMedia =
      !previousPrivacyActive &&
      nextPrivacyState.active &&
      runtime.systemMediaActive &&
      (previousMode === "idle" || previousMode === "peek" || previousMode === "hover");
    const shouldHandBackToMedia =
      previousPrivacyActive &&
      !nextPrivacyState.active &&
      runtime.systemMediaActive &&
      (runtime.mode === "privacy" || runtime.mode === "privacy-expanded");

    if (shouldHandBackToMedia) {
      runtime.pendingPrivacySnapshot = nextPrivacyState;
      runtime.privacyExpanded = false;
      const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
      actions.startPriorityTransition(PRIORITY_TRANSITION_PRIVACY_TO_MEDIA, PRIVACY_PRIORITY_TRANSITION_MS, () => {
        if (runtime.pendingPrivacySnapshot) {
          runtime.privacyState = runtime.pendingPrivacySnapshot;
          runtime.pendingPrivacySnapshot = undefined;
        }

        runtime.wasPrivacyActive = runtime.privacyState.active;
        runtime.privacyReturnMode = "idle";
        actions.setMode(restoreMode || "idle");
      });
      actions.setMode("privacy");
      actions.queueSync();
      return;
    }

    runtime.pendingPrivacySnapshot = undefined;
    runtime.privacyState = nextPrivacyState;
    runtime.wasPrivacyActive = runtime.privacyState.active;

    if (runtime.privacyState.active) {
      const userSelectedForeground =
        runtime.mode === "clipboard" ||
        runtime.mode === "clipboard-prompt" ||
        (previousPrivacyActive && runtime.mode === "expanded");

      if (!previousPrivacyActive && runtime.mode !== "privacy" && runtime.mode !== "privacy-expanded" && runtime.mode !== "peek") {
        runtime.privacyReturnMode = runtime.mode;
      }

      if (shouldHandOffFromMedia) {
        actions.startPriorityTransition(PRIORITY_TRANSITION_MEDIA_TO_PRIVACY);
      } else if (!previousPrivacyActive) {
        actions.clearPriorityTransition();
      }

      if (!userSelectedForeground) {
        actions.setMode(runtime.privacyExpanded ? "privacy-expanded" : "privacy");
      }
    } else {
      runtime.privacyExpanded = false;
      actions.clearPriorityTransition();
      if (runtime.mode === "privacy" || runtime.mode === "privacy-expanded" || runtime.mode === "peek") {
        const restoreMode = runtime.privacyReturnMode === "privacy" ? "idle" : runtime.privacyReturnMode;
        runtime.privacyReturnMode = "idle";
        actions.setMode(restoreMode);
      }
    }

    actions.queueSync();
  }

  return handlePrivacyUpdate;
}
