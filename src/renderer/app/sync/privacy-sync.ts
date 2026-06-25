import { createElement } from "../dom";
import {
  getPrivacyDetailTextForState,
  getPrivacyKindsForState,
  getPrivacySummaryTextForState
} from "../controllers/privacy-controller";
import type { PrivacySnapshot } from "../state";
import type { ViewSyncContext } from "./view-sync-context";

function createPrivacyIndicator(kind: PrivacySnapshot["kind"]) {
  const indicator = createElement("span", {
    className: `privacy-indicator privacy-${kind}`
  });

  if (kind === "microphone") {
    indicator.classList.add("privacy-dot", "privacy-dot-microphone");
  } else if (kind === "camera") {
    indicator.classList.add("privacy-dot", "privacy-dot-camera");
  } else if (kind === "location") {
    indicator.classList.add("privacy-location");
  }

  return indicator;
}

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
  const activeKinds = getPrivacyKindsForState(context.privacyState);
  const summaryText = getPrivacySummaryTextForState(context.privacyState);
  const detailText = getPrivacyDetailTextForState(context.privacyState);

  const indicatorRow = createElement("span", {
    className: "privacy-indicator-row",
    attributes: {
      "aria-hidden": "true"
    }
  });
  activeKinds.forEach((kind) => {
    indicatorRow.append(createPrivacyIndicator(kind));
  });

  const copy = createElement("span", {
    className: "privacy-copy"
  });
  const label = createElement("span", {
    className: "privacy-label",
    text: summaryText
  });
  const detail = createElement("span", {
    className: "privacy-detail",
    text: detailText
  });

  privacyStrip.setAttribute("aria-expanded", context.privacyExpanded ? "true" : "false");
  privacyStrip.setAttribute(
    "aria-label",
    context.privacyExpanded && detailText ? `${summaryText}，${detailText}` : summaryText
  );
  privacyStrip.title = context.privacyExpanded && detailText ? `${summaryText} - ${detailText}` : summaryText;
  copy.append(label, detail);
  privacyStrip.append(indicatorRow, copy);
}
