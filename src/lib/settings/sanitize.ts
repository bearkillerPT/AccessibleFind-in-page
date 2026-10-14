import { sanitizeShortcuts } from '../shortcuts';
import { BAR_POSITIONS, DEFAULT_APPEARANCE, DEFAULT_PREFS } from './defaults';
import type { Appearance, BarPosition, MotionPref, Prefs, ThemePref } from './types';

/**
 * Allowed ranges for numeric settings. The minimum blink interval keeps blinking under
 * 3 flashes per second (WCAG 2.3.1): one flash is an on and an off phase.
 */
export const LIMITS = {
  borderWidth: { min: 1, max: 12 },
  contextWords: { min: 0, max: 10 },
  blinkCount: { min: 1, max: 10 },
  blinkIntervalMs: { min: 200, max: 2000 },
  spotlightOpacity: { min: 0.1, max: 0.9 },
  magnifierFontSize: { min: 16, max: 120 },
  uiScale: { min: 1, max: 3 },
  speechRate: { min: 0.5, max: 2 },
} as const;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return `#${hex.toLowerCase()}`;
}

function color(value: unknown, fallback: string): string {
  return normalizeHex(value) ?? fallback;
}

function num(value: unknown, fallback: number, limit: { min: number; max: number }, integer = true): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(limit.max, Math.max(limit.min, n));
  return integer ? Math.round(clamped) : Math.round(clamped * 100) / 100;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sub(value: unknown): Obj {
  return isObj(value) ? value : {};
}

/** A valid appearance from anything stored or imported; missing or bad values come from `base`. */
export function sanitizeAppearance(input: unknown, base: Appearance = DEFAULT_APPEARANCE): Appearance {
  const a = sub(input);
  const d = base;
  const underline = sub(a.underline);
  const blink = sub(a.blink);
  const spotlight = sub(a.spotlight);
  const ping = sub(a.ping);
  const guides = sub(a.guides);
  const magnifier = sub(a.magnifier);
  return {
    matchBg: color(a.matchBg, d.matchBg),
    matchText: color(a.matchText, d.matchText),
    underline: {
      enabled: bool(underline.enabled, d.underline.enabled),
      color: color(underline.color, d.underline.color),
    },
    currentBg: color(a.currentBg, d.currentBg),
    currentText: color(a.currentText, d.currentText),
    currentBorder: color(a.currentBorder, d.currentBorder),
    borderWidth: num(a.borderWidth, d.borderWidth, LIMITS.borderWidth),
    contextWords: num(a.contextWords, d.contextWords, LIMITS.contextWords),
    blink: {
      enabled: bool(blink.enabled, d.blink.enabled),
      count: num(blink.count, d.blink.count, LIMITS.blinkCount),
      intervalMs: num(blink.intervalMs, d.blink.intervalMs, LIMITS.blinkIntervalMs),
    },
    spotlight: {
      enabled: bool(spotlight.enabled, d.spotlight.enabled),
      opacity: num(spotlight.opacity, d.spotlight.opacity, LIMITS.spotlightOpacity, false),
    },
    ping: { enabled: bool(ping.enabled, d.ping.enabled) },
    guides: { enabled: bool(guides.enabled, d.guides.enabled) },
    magnifier: {
      enabled: bool(magnifier.enabled, d.magnifier.enabled),
      fontSize: num(magnifier.fontSize, d.magnifier.fontSize, LIMITS.magnifierFontSize),
    },
  };
}

export function sanitizePrefs(input: unknown): Prefs {
  const p = sub(input);
  const d = DEFAULT_PREFS;
  const search = sub(p.search);
  const position = BAR_POSITIONS.includes(p.barPosition as BarPosition)
    ? (p.barPosition as BarPosition)
    : d.barPosition;
  const motion: MotionPref = p.motion === 'reduce' || p.motion === 'allow' ? p.motion : 'system';
  const theme: ThemePref = p.theme === 'dark' || p.theme === 'light' ? p.theme : 'system';
  const speech = sub(p.speech);
  const auto = sub(p.autoProfile);
  const id = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v.slice(0, 64) : fallback);
  // Fields added after v2.0 are filled in with defaults here, so they need no migration.
  return {
    uiScale: num(p.uiScale, d.uiScale, LIMITS.uiScale, false),
    theme,
    barPosition: position,
    showContextInBar: bool(p.showContextInBar, d.showContextInBar),
    prefillSelection: bool(p.prefillSelection, d.prefillSelection),
    motion,
    search: {
      caseSensitive: bool(search.caseSensitive, d.search.caseSensitive),
      matchDiacritics: bool(search.matchDiacritics, d.search.matchDiacritics),
      wholeWord: bool(search.wholeWord, d.search.wholeWord),
    },
    speech: {
      autoRead: bool(speech.autoRead, d.speech.autoRead),
      rate: num(speech.rate, d.speech.rate, LIMITS.speechRate, false),
      voiceURI: typeof speech.voiceURI === 'string' ? speech.voiceURI.slice(0, 300) : d.speech.voiceURI,
    },
    // v2 previews also stored a profile for light pages (`light`); those now use the active one.
    autoProfile: {
      enabled: bool(auto.enabled, d.autoProfile.enabled),
      dark: id(auto.dark, d.autoProfile.dark),
    },
    rememberSearches: bool(p.rememberSearches, d.rememberSearches),
    shortcuts: sanitizeShortcuts(p.shortcuts),
  };
}

/** Longest profile name kept. */
export const NAME_MAX = 60;

export function sanitizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || fallback;
}
