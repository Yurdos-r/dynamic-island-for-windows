export function isGlassStyleValue(value: unknown): value is GlassStyle {
  return value === "classic" || value === "liquid-css" || value === "liquid-svg";
}

export function readStoredGlassStyleValue(storageKey: string, fallback: GlassStyle): GlassStyle {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isGlassStyleValue(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistGlassStyleValue(storageKey: string, style: GlassStyle) {
  try {
    window.localStorage.setItem(storageKey, style);
  } catch {
    // Best effort only; settings still apply for the current session.
  }
}

export function isGlassIntensityValue(value: unknown): value is GlassIntensity {
  return value === "low" || value === "medium" || value === "high";
}

export function readStoredGlassIntensityValue(storageKey: string, fallback: GlassIntensity): GlassIntensity {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isGlassIntensityValue(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistGlassIntensityValue(storageKey: string, intensity: GlassIntensity) {
  try {
    window.localStorage.setItem(storageKey, intensity);
  } catch {
    // Best effort only; settings still apply for the current session.
  }
}

export function isLayoutValue(value: unknown): value is IslandLayout {
  return value === "classic" || value === "top-center";
}
