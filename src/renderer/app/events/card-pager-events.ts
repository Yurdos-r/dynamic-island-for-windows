import type { RendererEventContext } from "./event-context";

export function registerCardPagerEvents(context: RendererEventContext) {
  context.app.addEventListener(
    "wheel",
    (event) => {
      if (!context.isCardMode() || context.getAvailableCardModes().length < 2) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      context.switchCardPage(event.deltaY || event.deltaX || 1);
    },
    { passive: false }
  );
}
