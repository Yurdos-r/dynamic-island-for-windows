import type { ViewSyncContext } from "./view-sync-context";

export function setText(context: ViewSyncContext, selector: string, value: string) {
  context.app.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (element.textContent !== value) {
      element.textContent = value;
    }
  });
}
