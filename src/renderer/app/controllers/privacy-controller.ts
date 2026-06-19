import type { PrivacySnapshot } from "../state";

export function getPrivacyLabelForKind(kind: PrivacySnapshot["kind"]) {
  if (kind === "microphone") {
    return "麦克风调用中";
  }

  if (kind === "camera") {
    return "摄像头调用中";
  }

  if (kind === "location") {
    return "定位调用中";
  }

  return "";
}

export function getPrivacyAppsForKind(privacyState: PrivacySnapshot, kind: PrivacySnapshot["kind"]) {
  return (privacyState.apps || []).filter((item) => item.kind === kind);
}

export function getPrivacyDisplayName(app: string) {
  const normalized = app.replace(/#/g, "\\");
  const fileName = normalized.split("\\").filter(Boolean).pop() || normalized;
  return fileName.replace(/_/g, " ");
}

export function getPrivacyDetailTextForKind(privacyState: PrivacySnapshot, kind: PrivacySnapshot["kind"]) {
  const apps = getPrivacyAppsForKind(privacyState, kind);

  if (!apps.length) {
    return "未识别到调用程序";
  }

  return apps
    .slice(0, 3)
    .map((item) => item.displayName || getPrivacyDisplayName(item.app))
    .join(" · ");
}
