import type { RendererRuntimeState } from "../runtime-state";

export interface IslandUpdateActions {
  setMode(mode: IslandMode, resizeWindow?: boolean): void;
  hasClipboardCard(): boolean;
  cancelMediaEnterTransition(): void;
  startMediaExitTransition(): void;
  cancelMediaExitTransition(): void;
  clearInactiveMediaState(): void;
  startMediaEnterTransition(): void;
  clampProgressSeconds(seconds: number): number;
  queueSync(): void;
  startPriorityTransition(name: string, duration?: number, onDone?: () => void): void;
  clearPriorityTransition(): void;
  hasClipboardItems(): boolean;
  getPendingClipboardItem(): unknown;
  getClipboardFallbackMode(): IslandMode;
  canShowClipboardPrompt(): boolean;
  showClipboardPrompt(): void;
  setProgress(seconds: number, syncSystem?: boolean): void;
}

export interface IslandUpdateHandlerOptions {
  runtime: RendererRuntimeState;
  actions: IslandUpdateActions;
}
