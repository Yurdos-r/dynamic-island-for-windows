import { createElement } from "../dom";
import type { ViewSyncContext } from "./view-sync-context";

export function syncPrivacyStrip(context: ViewSyncContext) {
  const privacyStrip = context.app.querySelector<HTMLButtonElement>(".privacy-strip");
  if (!privacyStrip) {
    return;
  }

  privacyStrip.replaceChildren();

  if (!context.privacyState.active) {
    privacyStrip.hidden = true;
    context.privacyExpanded = false;
    return;
  }

  privacyStrip.hidden = false;
  const kind = context.privacyState.kind;
  const labelText = context.getPrivacyLabel(kind);
  const detailText = context.getPrivacyDetailText(kind);
  const icon = createElement("span", {
    className: `privacy-indicator privacy-${kind}`,
    attributes: {
      "aria-hidden": "true"
    }
  });
  const copy = createElement("span", {
    className: "privacy-copy"
  });
  const label = createElement("span", {
    className: "privacy-label",
    text: labelText
  });
  const detail = createElement("span", {
    className: "privacy-detail",
    text: detailText
  });

  if (kind === "microphone") {
    icon.classList.add("privacy-dot", "privacy-dot-microphone");
  } else if (kind === "camera") {
    icon.classList.add("privacy-dot", "privacy-dot-camera");
  } else if (kind === "location") {
    icon.classList.add("privacy-location");
  }

  privacyStrip.setAttribute("aria-expanded", context.privacyExpanded ? "true" : "false");
  privacyStrip.setAttribute("aria-label", context.privacyExpanded ? `${labelText}锛?{detailText}` : labelText);
  privacyStrip.title = context.privacyExpanded ? `${labelText} - ${detailText}` : labelText;
  copy.append(label, detail);
  privacyStrip.append(icon, copy);
}
