import { DEFAULT_SHORTCUTS } from '../shortcuts';
import type { Appearance, Prefs, Profile } from './types';

export const DEFAULT_APPEARANCE: Appearance = {
  matchBg: '#ffff00',
  matchText: '#000000',
  underline: { enabled: true, color: '#ff8c00' },
  currentBg: '#ff8c00',
  currentText: '#000000',
  currentBorder: '#ffff00',
  borderWidth: 3,
  contextWords: 1,
  blink: { enabled: true, count: 2, intervalMs: 400 },
  // Off at first, since they change how the page looks; the find bar's quick settings offer them.
  spotlight: { enabled: false, opacity: 0.4 },
  ping: { enabled: true },
  guides: { enabled: false },
  magnifier: { enabled: false, fontSize: 32 },
};

export const DEFAULT_PREFS: Prefs = {
  uiScale: 1.25,
  theme: 'system',
  barPosition: 'top-right',
  showContextInBar: false,
  prefillSelection: true,
  motion: 'system',
  search: { caseSensitive: false, matchDiacritics: false, wholeWord: false },
  speech: { autoRead: false, rate: 1, voiceURI: '' },
  autoProfile: { enabled: true, dark: 'sys-hc-dark' },
  rememberSearches: true,
  shortcuts: DEFAULT_SHORTCUTS,
};

/** Most user profiles allowed (sync storage holds at most 512 items). */
export const MAX_PROFILES = 30;

export const DEFAULT_PROFILE_ID = 'default';

export function makeDefaultProfile(): Profile {
  return { id: DEFAULT_PROFILE_ID, name: 'Default', appearance: structuredClone(DEFAULT_APPEARANCE) };
}

// Ids match v1 so a selected built-in profile survives the upgrade. Each gives the current
// match a background of its own, not just a border.
export const BUILT_IN_PROFILES: readonly Profile[] = [
  {
    id: 'sys-hc-light',
    name: 'High contrast (light pages)',
    builtIn: true,
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#000000',
      matchText: '#ffff00',
      underline: { enabled: true, color: '#ffffff' },
      // The other way round from the other matches, framed in black to stand out on white.
      currentBg: '#ffff00',
      currentText: '#000000',
      currentBorder: '#000000',
      borderWidth: 4,
    },
  },
  {
    id: 'sys-hc-dark',
    name: 'High contrast (dark pages)',
    builtIn: true,
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#ffffff',
      matchText: '#000000',
      underline: { enabled: true, color: '#ffff00' },
      currentBg: '#00ffff',
      currentText: '#000000',
      currentBorder: '#ffff00',
      borderWidth: 4,
    },
  },
  {
    id: 'sys-colorblind',
    name: 'Colour-blind friendly (blue/orange)',
    builtIn: true,
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#0072ce',
      matchText: '#ffffff',
      underline: { enabled: true, color: '#ffa500' },
      currentBg: '#ffa500',
      currentText: '#000000',
      currentBorder: '#0072ce',
      borderWidth: 4,
    },
  },
];

export const BAR_POSITIONS = [
  'top-right',
  'top-center',
  'top-left',
  'bottom-right',
  'bottom-center',
  'bottom-left',
] as const;

export const UI_SCALES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
