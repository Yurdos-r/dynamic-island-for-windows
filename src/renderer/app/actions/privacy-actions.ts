import type { RendererRuntimeState } from "../runtime-state";
import type { PrivacySnapshot } from "../state";
import {
  getPrivacyAppsForKind,
  getPrivacyDetailTextForKind,
  getPrivacyDisplayName as getPrivacyDisplayNameFromController,
  getPrivacyLabelForKind
} from "../controllers/privacy-controller";

interface PrivacyActionsOptions {
  runtime: RendererRuntimeState;
  queueSync(): void;
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
}

export function createPrivacyActions(options: PrivacyActionsOptions) {
  const { runtime, queueSync, setMode } = options;

  function getPrivacyLabel(kind: PrivacySnapshot["kind"]) {
    return getPrivacyLabelForKind(kind);
  }

  function getPrivacyApps(kind: PrivacySnapshot["kind"]) {
    return getPrivacyAppsForKind(runtime.privacyState, kind);
  }

  function getPrivacyDisplayName(app: string) {
    return getPrivacyDisplayNameFromController(app);
  }

  function getPrivacyDetailText(kind: PrivacySnapshot["kind"]) {
    return getPrivacyDetailTextForKind(runtime.privacyState, kind);
  }

  function togglePrivacyDetail() {
    if (!runtime.privacyState.active) {
      return;
    }

    runtime.privacyExpanded = !runtime.privacyExpanded;
    setMode(runtime.privacyExpanded ? "privacy-expanded" : "privacy");
    queueSync();
  }

  function collapsePrivacyDetail() {
    if (!runtime.privacyExpanded) {
      return;
    }

    runtime.privacyExpanded = false;
    setMode("privacy");
    queueSync();
  }

  return {
    collapsePrivacyDetail,
    getPrivacyApps,
    getPrivacyDetailText,
    getPrivacyDisplayName,
    getPrivacyLabel,
    togglePrivacyDetail
  };
}
