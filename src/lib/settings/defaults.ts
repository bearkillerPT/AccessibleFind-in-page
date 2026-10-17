import { DEFAULT_SHORTCUTS } from '../shortcuts';
import type { Appearance, DarkColors, Prefs, Profile } from './types';

/*
 * Highlight colors follow what low-vision research and guidance agree on: tell things apart
 * by lightness, not hue alone (Arditi, "Effective Color Contrast"; RNIB, "Colour and contrast
 * for people with sight loss"), since many eye conditions dull color before they dull
 * lightness. So in every built-in profile, on light and on dark backgrounds:
 *
 * - Text on a highlight has at least 7:1 contrast (WCAG AAA).
 * - The current match differs from the other matches in lightness, like the change WCAG
 *   2.4.13 asks of a focus indicator (3:1): on light backgrounds it's dark with light text,
 *   on dark ones it's the brightest thing there. Hue is a bonus on top.
 * - Matches are underlined and the current one is framed, so color is never the only cue.
 *
 * tests/unit/profiles.test.ts checks these for normal vision and simulated color blindness.
 */

/** Dark backgrounds: mid-light matches (the lightest that still keeps 7:1 dark text) and a white current match. */
const DARK_DEFAULT: DarkColors = {
  matchBg: '#c68b00',
  matchText: '#000000',
  underline: '#000000',
  currentBg: '#ffffff',
  currentText: '#000000',
  currentBorder: '#ff8a00',
};

/** The ring's thickness before it was a setting of its own: a little more than the border. */
export const ringWidthFor = (borderWidth: number) => Math.max(4, borderWidth + 1);

/**
 * The brand's lighthouse: Beam matches, and the current one Night, lit in Beam, in a Signal
 * frame. Beam is a slightly golden yellow: it reads as "highlighted" like pure yellow, and
 * stands out from white pages twice as well for the blue-yellow loss cataracts and diabetic
 * retinopathy bring.
 */
export const DEFAULT_APPEARANCE: Appearance = {
  matchBg: '#ffd60a',
  matchText: '#000000',
  underline: { enabled: true, color: '#b34700' },
  currentBg: '#0b1020',
  currentText: '#ffd60a',
  currentBorder: '#ff8a00',
  borderWidth: 3,
  contextWords: 1,
  blink: { enabled: true, count: 2, intervalMs: 400 },
  // Off at first, since they change how the page looks; the find bar's quick settings offer them.
  spotlight: { enabled: false, opacity: 0.4 },
  ping: { enabled: true, durationMs: 750, width: ringWidthFor(3) },
  guides: { enabled: false },
  magnifier: { enabled: false, fontSize: 32 },
  dark: DARK_DEFAULT,
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
  autoProfile: { enabled: true },
  rememberSearches: true,
  shortcuts: DEFAULT_SHORTCUTS,
};

/** Most user profiles allowed (sync storage holds at most 512 items). */
export const MAX_PROFILES = 30;

export const DEFAULT_PROFILE_ID = 'default';

export function makeDefaultProfile(): Profile {
  return { id: DEFAULT_PROFILE_ID, name: 'Default', appearance: structuredClone(DEFAULT_APPEARANCE) };
}

const builtIn = (profile: Omit<Profile, 'builtIn'>): Profile => ({ ...profile, builtIn: true });

/**
 * Colors for particular eye conditions, in the order the profile list shows them. Effects
 * stay as in the default: they're personal, and one tap away in the find bar.
 *
 * Ids from v1 are kept, so a profile chosen there survives the upgrade. v1's high-contrast
 * profile for dark pages ("sys-hc-dark") is gone: every profile has colors for dark
 * backgrounds now, and people who used it start on Default.
 */
export const BUILT_IN_PROFILES: readonly Profile[] = [
  builtIn({
    id: 'sys-hc-light',
    name: 'High contrast, inverted (cataracts)',
    description:
      'For cloudy or blurry sight, or when contrast is hard to see. Black matches with yellow text, which scatter less light in a cloudy eye, and an orange current match in a black frame.',
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#000000',
      matchText: '#ffff00',
      underline: { enabled: true, color: '#ffff00' },
      currentBg: '#ff8a00',
      currentText: '#000000',
      currentBorder: '#000000',
      borderWidth: 4,
      ping: { ...DEFAULT_APPEARANCE.ping, width: ringWidthFor(4) },
      dark: {
        matchBg: '#ac9500',
        matchText: '#000000',
        underline: '#000000',
        currentBg: '#ffffff',
        currentText: '#000000',
        currentBorder: '#ffff00',
      },
    },
  }),
  builtIn({
    id: 'sys-light-sensitive',
    name: 'Light sensitivity',
    description:
      'For eyes that bright screens hurt. Warm amber instead of bright yellow, and no blinking. The spotlight in the find bar can dim the page around the match too.',
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#ffc400',
      matchText: '#000000',
      underline: { enabled: true, color: '#9a5b00' },
      currentBg: '#000000',
      currentText: '#ffc400',
      currentBorder: '#ff8a00',
      blink: { ...DEFAULT_APPEARANCE.blink, enabled: false },
      dark: {
        matchBg: '#cb8800',
        matchText: '#000000',
        underline: '#000000',
        currentBg: '#fff6e5',
        currentText: '#000000',
        currentBorder: '#ff8a00',
      },
    },
  }),
  builtIn({
    id: 'sys-colorblind',
    name: 'Red-green color blindness',
    description:
      'For protanopia and deuteranopia, the most common kinds. Blue matches and a current match in black and yellow: colors that stay distinct without red or green.',
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#56b4e9',
      matchText: '#000000',
      underline: { enabled: true, color: '#00457c' },
      currentBg: '#000000',
      currentText: '#ffff00',
      currentBorder: '#0072b2',
      dark: {
        matchBg: '#509dd3',
        matchText: '#000000',
        underline: '#000000',
        currentBg: '#ffffff',
        currentText: '#000000',
        currentBorder: '#56b4e9',
      },
    },
  }),
  builtIn({
    id: 'sys-blue-yellow',
    name: 'Blue-yellow color blindness',
    description:
      'For tritanopia, and the blue-yellow loss diabetic retinopathy and cataracts can bring. Pink matches and a black current match, never relying on blue or yellow.',
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#ff8fb8',
      matchText: '#000000',
      underline: { enabled: true, color: '#a3003a' },
      currentBg: '#000000',
      currentText: '#ffffff',
      currentBorder: '#c4002f',
      dark: {
        matchBg: '#e17297',
        matchText: '#000000',
        underline: '#000000',
        currentBg: '#ffffff',
        currentText: '#000000',
        currentBorder: '#ff8fb8',
      },
    },
  }),
  builtIn({
    id: 'sys-no-color',
    name: 'No color vision (achromatopsia)',
    description:
      'For seeing no colors at all. Grey matches and a black current match in a thick white frame, told apart by brightness and shape alone, on light and dark pages alike.',
    appearance: {
      ...DEFAULT_APPEARANCE,
      matchBg: '#959595',
      matchText: '#000000',
      underline: { enabled: true, color: '#000000' },
      currentBg: '#000000',
      currentText: '#ffffff',
      currentBorder: '#ffffff',
      borderWidth: 5,
      ping: { ...DEFAULT_APPEARANCE.ping, width: ringWidthFor(5) },
      // The same greys work on dark backgrounds: the white frame carries the current match.
      dark: {
        matchBg: '#959595',
        matchText: '#000000',
        underline: '#000000',
        currentBg: '#000000',
        currentText: '#ffffff',
        currentBorder: '#ffffff',
      },
    },
  }),
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
