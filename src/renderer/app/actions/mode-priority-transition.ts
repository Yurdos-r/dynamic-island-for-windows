import type { RendererRuntimeState } from "../runtime-state";
import {
  PRIORITY_TRANSITION_PRIVACY_TO_MEDIA,
  PRIVACY_PRIORITY_STAGE_SWITCH_MS,
  PRIVACY_PRIORITY_TRANSITION_MS,
  PRIVACY_TO_MEDIA_IDLE_DELAY_MS
} from "../state";

interface ModePriorityTransitionOptions {
  runtime: RendererRuntimeState;
  queueSync(): void;
}

export function createModePriorityTransition(options: ModePriorityTransitionOptions) {
  const { runtime, queueSync } = options;

  function clearPriorityTransition() {
    if (runtime.priorityTransitionStageTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionStageTimer);
      runtime.priorityTransitionStageTimer = undefined;
    }

    if (runtime.priorityTransitionTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionTimer);
      runtime.priorityTransitionTimer = undefined;
    }

    if (runtime.priorityTransitionSettleTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionSettleTimer);
      runtime.priorityTransitionSettleTimer = undefined;
    }

    if (!runtime.priorityTransition) {
      return;
    }

    runtime.priorityTransition = "";
    runtime.priorityTransitionStage = "";
    queueSync();
  }

  function getPriorityTransitionStages(name: string) {
    if (name === PRIORITY_TRANSITION_PRIVACY_TO_MEDIA) {
      return ["privacy-out", "music-in"] as const;
    }

    return ["music-out", "privacy-in"] as const;
  }

  function getPriorityTransitionDurations(name: string) {
    if (name === PRIORITY_TRANSITION_PRIVACY_TO_MEDIA) {
      return {
        duration: 760,
        stageSwitch: 380,
        settleDelay: PRIVACY_TO_MEDIA_IDLE_DELAY_MS
      };
    }

    return {
      duration: PRIVACY_PRIORITY_TRANSITION_MS,
      stageSwitch: PRIVACY_PRIORITY_STAGE_SWITCH_MS,
      settleDelay: 0
    };
  }

  function startPriorityTransition(name: string, duration = PRIVACY_PRIORITY_TRANSITION_MS, onDone?: () => void) {
    const timing = getPriorityTransitionDurations(name);
    const transitionDuration = duration === PRIVACY_PRIORITY_TRANSITION_MS ? timing.duration : duration;
    const stageSwitchDuration = timing.stageSwitch;
    const settleDelay = timing.settleDelay;

    if (runtime.priorityTransitionStageTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionStageTimer);
      runtime.priorityTransitionStageTimer = undefined;
    }

    if (runtime.priorityTransitionTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionTimer);
      runtime.priorityTransitionTimer = undefined;
    }

    if (runtime.priorityTransitionSettleTimer !== undefined) {
      window.clearTimeout(runtime.priorityTransitionSettleTimer);
      runtime.priorityTransitionSettleTimer = undefined;
    }

    const [firstStage, secondStage] = getPriorityTransitionStages(name);
    runtime.priorityTransition = name;
    runtime.priorityTransitionStage = firstStage;
    runtime.priorityTransitionStageTimer = window.setTimeout(() => {
      runtime.priorityTransitionStageTimer = undefined;

      if (runtime.priorityTransition === name) {
        runtime.priorityTransitionStage = secondStage;
        queueSync();
      }
    }, Math.min(stageSwitchDuration, Math.max(0, transitionDuration - 40)));
    runtime.priorityTransitionTimer = window.setTimeout(() => {
      runtime.priorityTransitionTimer = undefined;

      if (runtime.priorityTransition === name) {
        const finishTransition = () => {
          if (runtime.priorityTransition !== name) {
            return;
          }

          runtime.priorityTransition = "";
          runtime.priorityTransitionStage = "";
          onDone?.();
          queueSync();
        };

        if (settleDelay > 0) {
          runtime.priorityTransitionSettleTimer = window.setTimeout(() => {
            runtime.priorityTransitionSettleTimer = undefined;
            finishTransition();
          }, settleDelay);
        } else {
          finishTransition();
        }
      }
    }, transitionDuration);

    queueSync();
  }

  return {
    clearPriorityTransition,
    startPriorityTransition
  };
}
