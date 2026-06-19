import { createElement } from "../dom";
import type { ViewSyncContext } from "./view-sync-context";

export function syncCardPager(context: ViewSyncContext, cardModes: IslandMode[], cardIndex: number) {
  const pager = context.app.querySelector<HTMLElement>(".card-pager");
  if (!pager) {
    return;
  }

  const shouldShow = cardModes.length > 1 && context.isCardMode();
  pager.hidden = !shouldShow;
  pager.replaceChildren(
    ...cardModes.map((cardMode, index) =>
      createElement("span", {
        className: "card-pager-dot",
        dataset: {
          cardMode,
          active: index === cardIndex ? "true" : "false"
        }
      })
    )
  );
}
