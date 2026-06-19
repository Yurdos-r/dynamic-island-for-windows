import { normalizeSystemSnapshot } from "../../system-view";
import type { IslandUpdateHandlerOptions } from "./update-handler-types";

export function createSystemUpdateHandler(options: IslandUpdateHandlerOptions) {
  const { runtime, actions } = options;

  function handleSystemUpdate(snapshot: SystemSnapshot) {
    runtime.systemSnapshot = normalizeSystemSnapshot(snapshot);
    actions.queueSync();
  }

  return handleSystemUpdate;
}
