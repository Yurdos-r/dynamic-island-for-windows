import type { PrivacySnapshot } from "../state";

const PRIVACY_KIND_NAMES: Record<Exclude<PrivacySnapshot["kind"], "none">, string> = {
  microphone: "麦克风",
  camera: "摄像头",
  location: "定位"
};

const PRIVACY_KIND_STATUS_TEXT: Record<Exclude<PrivacySnapshot["kind"], "none">, string> = {
  microphone: "麦克风调用中",
  camera: "摄像头调用中",
  location: "定位调用中"
};

function isActivePrivacyKind(kind: PrivacySnapshot["kind"]): kind is Exclude<PrivacySnapshot["kind"], "none"> {
  return kind !== "none";
}

export function getPrivacyNameForKind(kind: PrivacySnapshot["kind"]) {
  return isActivePrivacyKind(kind) ? PRIVACY_KIND_NAMES[kind] : "";
}

export function getPrivacyLabelForKind(kind: PrivacySnapshot["kind"]) {
  return isActivePrivacyKind(kind) ? PRIVACY_KIND_STATUS_TEXT[kind] : "";
}

export function getPrivacyAppsForKind(privacyState: PrivacySnapshot, kind: PrivacySnapshot["kind"]) {
  return (privacyState.apps || []).filter((item) => item.kind === kind);
}

export function getPrivacyDisplayName(app: string) {
  const normalized = app.replace(/#/g, "\\");
  const fileName = normalized.split("\\").filter(Boolean).pop() || normalized;
  return fileName.replace(/_/g, " ");
}

export function getPrivacyKindsForState(privacyState: PrivacySnapshot) {
  const activeKinds = (privacyState.activeKinds || []).filter(isActivePrivacyKind);
  if (activeKinds.length > 0) {
    return activeKinds;
  }

  return isActivePrivacyKind(privacyState.kind) ? [privacyState.kind] : [];
}

export function getPrivacySummaryTextForKinds(kinds: PrivacySnapshot["activeKinds"]) {
  const names = kinds.filter(isActivePrivacyKind).map((kind) => getPrivacyNameForKind(kind)).filter(Boolean);

  if (!names.length) {
    return "";
  }

  if (names.length === 1) {
    return `${names[0]}调用中`;
  }

  return `${names.join("、")}调用中`;
}

export function getPrivacySummaryTextForState(privacyState: PrivacySnapshot) {
  const kinds = getPrivacyKindsForState(privacyState);
  if (!kinds.length) {
    return "";
  }

  if (kinds.length === 1) {
    return getPrivacyLabelForKind(kinds[0]);
  }

  return getPrivacySummaryTextForKinds(kinds);
}

export function getPrivacyDetailTextForKind(privacyState: PrivacySnapshot, kind: PrivacySnapshot["kind"]) {
  const apps = getPrivacyAppsForKind(privacyState, kind);

  if (!apps.length) {
    return "未识别到调用程序";
  }

  return apps
    .slice(0, 3)
    .map((item) => item.displayName || getPrivacyDisplayName(item.app))
    .join(" / ");
}

export function getPrivacyDetailTextForState(privacyState: PrivacySnapshot) {
  const kinds = getPrivacyKindsForState(privacyState);
  if (!kinds.length) {
    return "";
  }

  return kinds
    .map((kind) => `${getPrivacyNameForKind(kind)}：${getPrivacyDetailTextForKind(privacyState, kind)}`)
    .join(" / ");
}
