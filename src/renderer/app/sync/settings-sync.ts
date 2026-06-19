import type { ViewSyncContext } from "./view-sync-context";

export function syncSettingsSurface(context: ViewSyncContext) {
  context.app.querySelectorAll<HTMLButtonElement>('.settings-option[data-action="set-glass"]').forEach((option) => {
    const isActive = option.dataset.glass === context.glassStyle;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>(".settings-intensity-option").forEach((option) => {
    const isActive = option.dataset.intensity === context.glassIntensity;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>('.settings-option[data-action="set-layout"]').forEach((option) => {
    const isActive = option.dataset.layout === context.layout;
    option.setAttribute("aria-checked", isActive ? "true" : "false");
  });
  context.app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-system-monitor"]').forEach((toggle) => {
    toggle.setAttribute("aria-checked", context.systemMonitorEnabled ? "true" : "false");
  });
}
