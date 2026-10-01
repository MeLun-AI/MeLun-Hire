/* ------------------------------------------------------------------ */
/*  Shared theme + appearance store for the MeLun Hire platform.       */
/*  Single source of truth for theme mode (dark/light/system), the     */
/*  applied theme, and the accent color. It persists to localStorage   */
/*  and is applied via the `theme-light` class on the layout root.     */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';
export type AccentColor = 'orange' | 'blue' | 'green' | 'purple';
export type FontSize = 'small' | 'medium' | 'large';

const MODE_KEY = 'quno_applicant_theme_mode';
const ACCENT_KEY = 'quno_applicant_accent';
const FONT_SIZE_KEY = 'quno_applicant_font_size';

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function readStoredAccent(): AccentColor {
  try {
    const v = window.localStorage.getItem(ACCENT_KEY);
    return v === 'orange' || v === 'blue' || v === 'green' || v === 'purple'
      ? v
      : 'purple';
  } catch {
    return 'purple';
  }
}

function readStoredFontSize(): FontSize {
  try {
    const v = window.localStorage.getItem(FONT_SIZE_KEY);
    return v === 'small' || v === 'medium' || v === 'large' ? v : 'medium';
  } catch {
    return 'medium';
  }
}

let currentMode: ThemeMode = readStoredMode();
let currentAccent: AccentColor = readStoredAccent();
let currentFontSize: FontSize = readStoredFontSize();
let prefersDark: boolean = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false;

const listeners = new Set<() => void>();

interface ThemeSnapshot {
  mode: ThemeMode;
  theme: Theme;
  accent: AccentColor;
  fontSize: FontSize;
}

function resolveTheme(): Theme {
  if (currentMode === 'system') return prefersDark ? 'dark' : 'light';
  return currentMode;
}

let snapshot: ThemeSnapshot = {
  mode: currentMode,
  theme: resolveTheme(),
  accent: currentAccent,
  fontSize: currentFontSize,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  snapshot = {
    mode: currentMode,
    theme: resolveTheme(),
    accent: currentAccent,
    fontSize: currentFontSize,
  };
  listeners.forEach((listener) => listener());
}

/* System-preference listener so the UI reacts if the OS theme changes. */
function subscribeToSystemTheme(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  const list = window.matchMedia('(prefers-color-scheme: dark)');
  list.addEventListener('change', () => {
    prefersDark = list.matches;
    notify();
  });
  return list;
}

subscribeToSystemTheme();

/** Resolved theme mode preference ('dark' | 'light' | 'system'). */
export function getThemeMode(): ThemeMode {
  return currentMode;
}

/** The currently applied theme ('dark' | 'light'), after resolving 'system'. */
export function getTheme(): Theme {
  return resolveTheme();
}

/** The active accent color. */
export function getAccentColor(): AccentColor {
  return currentAccent;
}

export function setThemeMode(next: ThemeMode): void {
  currentMode = next;
  try {
    window.localStorage.setItem(MODE_KEY, next);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
  notify();
}

export function setTheme(next: Theme): void {
  setThemeMode(next);
}

export function setAccentColor(next: AccentColor): void {
  currentAccent = next;
  try {
    window.localStorage.setItem(ACCENT_KEY, next);
  } catch {
    /* storage unavailable — accent still applies for this session */
  }
  notify();
}

/** The active (committed) font size. */
export function getFontSize(): FontSize {
  return currentFontSize;
}

export function setFontSize(next: FontSize): void {
  currentFontSize = next;
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, next);
  } catch {
    /* storage unavailable — font size still applies for this session */
  }
  notify();
}

export function toggleTheme(): void {
  setThemeMode(resolveTheme() === 'dark' ? 'light' : 'dark');
}

/**
 * Reactive theme + accent + font-size hook shared by the applicant layout
 * and the settings page. Returns the COMMITTED (applied) mode/theme/accent/
 * font-size and setters.
 */
export function useTheme(): {
  mode: ThemeMode;
  theme: Theme;
  accent: AccentColor;
  fontSize: FontSize;
  setMode: (m: ThemeMode) => void;
  setTheme: (t: Theme) => void;
  setAccent: (c: AccentColor) => void;
  setFontSize: (s: FontSize) => void;
  toggleTheme: () => void;
} {
  const current = useSyncExternalStore(subscribe, read);
  return {
    mode: current.mode,
    theme: current.theme,
    accent: current.accent,
    fontSize: current.fontSize,
    setMode: setThemeMode,
    setTheme,
    setAccent: setAccentColor,
    setFontSize,
    toggleTheme,
  };
}

/* Kept as a separate function so useSyncExternalStore has a stable snapshot. */
function read(): ThemeSnapshot {
  return snapshot;
}
