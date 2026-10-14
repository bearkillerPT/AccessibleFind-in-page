import type { Shortcuts } from '../shortcuts';

/** How matches look and which attention effects run. Stored per profile. */
export interface Appearance {
  matchBg: string;
  matchText: string;
  underline: { enabled: boolean; color: string };
  currentBg: string;
  currentText: string;
  currentBorder: string;
  /** Border drawn around the current match, in px. */
  borderWidth: number;
  /** Words on each side of a match that light up while it blinks. */
  contextWords: number;
  blink: { enabled: boolean; count: number; intervalMs: number };
  /** Dims the page around the current match. `opacity` is the strength of the dimming. */
  spotlight: { enabled: boolean; opacity: number };
  /** A ring that shrinks from the edges of the screen onto the current match. */
  ping: { enabled: boolean };
  /** Full-width and full-height lines crossing at the current match. */
  guides: { enabled: boolean };
  /** An enlarged copy of the current match and its surrounding words, shown next to it. */
  magnifier: { enabled: boolean; fontSize: number };
}

export interface Profile {
  id: string;
  name: string;
  appearance: Appearance;
  /** Built-in profiles ship with the extension. They can be changed and reset, but not renamed or deleted. */
  builtIn?: boolean;
}

export type BarPosition =
  | 'top-right'
  | 'top-center'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left';

/** `system` follows the OS "reduce motion" setting. */
export type MotionPref = 'system' | 'reduce' | 'allow';

/** Color theme of the extension's own UI. `system` follows the OS light/dark setting. */
export type ThemePref = 'system' | 'dark' | 'light';

/** Whether a page is mostly light or dark, judged from its background. */
export type PageTone = 'light' | 'dark';

export interface SearchOptions {
  caseSensitive: boolean;
  matchDiacritics: boolean;
  wholeWord: boolean;
}

/** Global preferences, shared by every profile. */
export interface Prefs {
  /** Multiplier applied to the text and controls of all the extension's UI. */
  uiScale: number;
  theme: ThemePref;
  barPosition: BarPosition;
  showContextInBar: boolean;
  prefillSelection: boolean;
  motion: MotionPref;
  search: SearchOptions;
  /** Reading the current match's sentence aloud. `voiceURI` '' picks a voice for the page's language. */
  speech: { autoRead: boolean; rate: number; voiceURI: string };
  /**
   * Automatic style: matches on a dark background take the highlight colors of another
   * profile (`dark`). Other matches, and everything but the colors, follow the active profile.
   */
  autoProfile: { enabled: boolean; dark: string };
  /** Keep recent searches, on this device only, for ↑/↓ in the search box. */
  rememberSearches: boolean;
  /** The find bar's own shortcuts (match case, list, read aloud...). */
  shortcuts: Shortcuts;
}

export interface SettingsState {
  /** User profiles first, then built-in ones. */
  profiles: Profile[];
  activeProfileId: string;
  active: Profile;
  prefs: Prefs;
}
