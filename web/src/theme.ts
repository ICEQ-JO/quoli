import { useSyncExternalStore } from "react";

/** Per-viewer appearance. The choice lives in localStorage; `web/index.html` applies it before first paint. */
export type ThemePref = "system" | "dark" | "light";
export type Theme = "dark" | "light";

export const THEME_KEY = "quoli.theme";
const QUERY = "(prefers-color-scheme: light)";

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia(QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export const resolveTheme = (pref: ThemePref): Theme => (pref === "system" ? systemTheme() : pref);

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function apply() {
  document.documentElement.dataset.theme = resolveTheme(readPref());
  notify();
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage can be blocked; the choice then lasts until reload.
  }
  document.documentElement.dataset.theme = resolveTheme(pref);
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  let mq: MediaQueryList | undefined;
  try {
    mq = window.matchMedia(QUERY);
    mq.addEventListener("change", apply);
  } catch {
    // No matchMedia: System stays dark.
  }
  window.addEventListener("storage", apply);
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener("change", apply);
    window.removeEventListener("storage", apply);
  };
}

/** The theme in effect (System resolved), re-rendering when the preference or the OS setting changes. */
export const useTheme = (): Theme =>
  useSyncExternalStore(
    subscribe,
    () => resolveTheme(readPref()),
    () => "dark",
  );

export const useThemePref = (): ThemePref =>
  useSyncExternalStore(subscribe, readPref, () => "system");

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const ch = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
