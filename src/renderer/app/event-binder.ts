import { registerCardPagerEvents } from "./events/card-pager-events";
import { registerClickEvents } from "./events/click-events";
import type { RendererEventContext } from "./events/event-context";
import { registerKeyboardEvents } from "./events/keyboard-events";
import { registerPointerEvents } from "./events/pointer-events";

export function registerRendererEvents(context: RendererEventContext) {
  registerClickEvents(context);
  registerCardPagerEvents(context);
  registerPointerEvents(context);
  registerKeyboardEvents(context);
}

export { registerIslandApiListeners } from "./events/island-api-listeners";
export type { IslandApiListenerContext, RendererEventContext } from "./events/event-context";
