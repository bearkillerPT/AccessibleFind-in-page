import type { Shortcuts } from '../shortcuts';

/** The colors of matches on a dark background, used there when automatic style is on. */
export interface DarkColors {
  matchBg: string;
  matchText: string;
  underline: string;
  currentBg: string;
  currentText: string;
  currentBorder: string;
}

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
  /** A ring that shrinks from the edges of the screen onto the current match, in `durationMs`, `width` px thick. */
  ping: { enabled: boolean; durationMs: number; width: number };
  /** Full-width and full-height lines crossing at the current match. */
  guides: { enabled: boolean };
  /** An enlarged copy of the current match and its surrounding words, shown next to it. */
  magnifier: { enabled: boolean; fontSize: number };
  /** Colors for matches on a dark background. The ones above are for light backgrounds. */
  dark: DarkColors;
}

export interface Profile {
  id: string;
  name: string;
  appearance: Appearance;
  /** Built-in profiles ship with the extension. They can be changed and reset, but not renamed or deleted. */
  builtIn?: boolean;
  /** Built-in profiles only: who it's for and what it does, in a sentence or two. */
  description?: string;
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
   * Automatic style: matches on a dark background use the active profile's `dark` colors.
   * (Named for v2 previews, where it picked another profile for them.)
   */
  autoProfile: { enabled: boolean };
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
