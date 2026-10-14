/**
 * The find bar's own keyboard shortcuts (match case, list, read aloud...). They default to
 * Alt+letter, which some systems reserve (e.g. i3 and other window managers use Alt as
 * their modifier), so each one can be changed.
 *
 * A shortcut is stored as a string like "Ctrl+Alt+KeyC": modifiers in a fixed order, then
 * the physical key's KeyboardEvent.code. Matching the physical key works on any keyboard
 * layout and with macOS Option, which turns letters into symbols.
 */

export const SHORTCUT_ACTIONS = ['matchCase', 'matchAccents', 'wholeWord', 'list', 'readAloud'] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type Shortcuts = Record<ShortcutAction, string>;

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  matchCase: 'Match case',
  matchAccents: 'Match accents',
  wholeWord: 'Whole words only',
  list: 'Show all matches',
  readAloud: 'Read aloud',
};

const LETTERS: Record<ShortcutAction, string> = {
  matchCase: 'KeyC',
  matchAccents: 'KeyA',
  wholeWord: 'KeyW',
  list: 'KeyL',
  readAloud: 'KeyR',
};

/** Modifier sets offered as one-click presets for all shortcuts. */
export const MODIFIER_PRESETS = ['Alt', 'Ctrl+Alt', 'Alt+Shift', 'Ctrl+Shift', 'Meta'] as const;
export type ModifierPreset = (typeof MODIFIER_PRESETS)[number];

/** Letters a preset swaps out: the browser keeps Ctrl+Shift+W (close window) for itself. */
const PRESET_LETTERS: Partial<Record<ModifierPreset, Partial<Record<ShortcutAction, string>>>> = {
  'Ctrl+Shift': { wholeWord: 'KeyO' }, // "Whole words only".
};

/**
 * The presets worth offering on a platform. Win/Super alone only makes sense on Linux and
 * the like: Windows keeps Win+letter for itself (Win+L locks the computer), and on macOS
 * ⌘C, ⌘W and the rest are copy, close tab and so on.
 */
export function modifierPresets(platform: Platform = detectPlatform()): readonly ModifierPreset[] {
  return platform === 'other' ? MODIFIER_PRESETS : MODIFIER_PRESETS.filter((m) => m !== 'Meta');
}

export function shortcutsWith(modifiers: ModifierPreset): Shortcuts {
  const out = {} as Shortcuts;
  for (const action of SHORTCUT_ACTIONS) {
    out[action] = `${modifiers}+${PRESET_LETTERS[modifiers]?.[action] ?? LETTERS[action]}`;
  }
  return out;
}

export const DEFAULT_SHORTCUTS: Shortcuts = shortcutsWith('Alt');

/** The preset all shortcuts currently follow, if any. */
export function currentPreset(shortcuts: Shortcuts): ModifierPreset | null {
  return (
    MODIFIER_PRESETS.find((m) => {
      const preset = shortcutsWith(m);
      return SHORTCUT_ACTIONS.every((a) => shortcuts[a] === preset[a]);
    }) ?? null
  );
}

interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

const COMBO = /^(Ctrl\+)?(Alt\+)?(Shift\+)?(Meta\+)?([A-Za-z][A-Za-z0-9]*)$/;
const MODIFIER_KEY = /^(Control|Alt|Shift|Meta|OS|AltGraph|CapsLock|Fn)(Left|Right)?$/;

export function parseCombo(value: unknown): Combo | null {
  if (typeof value !== 'string') return null;
  const m = value.match(COMBO);
  if (!m || MODIFIER_KEY.test(m[5]!)) return null;
  return { ctrl: Boolean(m[1]), alt: Boolean(m[2]), shift: Boolean(m[3]), meta: Boolean(m[4]), code: m[5]! };
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** The combination a key press makes, or null while only modifiers are held. */
export function comboFromEvent(e: KeyLike): string | null {
  if (!e.code || MODIFIER_KEY.test(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.code);
  return parts.join('+');
}

/**
 * Whether a key press is `letter` (lowercase), like the browser's own Ctrl+F and Ctrl+G: by
 * the character typed on layouts with Latin letters (so Dvorak's F is F), and by the
 * physical key on layouts without them (Cyrillic, Greek...).
 */
export function isLetterKey(e: { key: string; code: string }, letter: string): boolean {
  const key = e.key.toLowerCase();
  return key === letter || (e.code === `Key${letter.toUpperCase()}` && !/^[a-z]$/.test(key));
}

/** The form field or editable area a key press goes to, where keys type or edit text, if any. */
export function typingTarget(e: Event): HTMLElement | null {
  const target = e.composedPath()[0];
  const field =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  return field ? (target as HTMLElement) : null;
}

/**
 * Whether a key press comes with AltGr, which types letters like ą or ł on many layouts (on
 * Windows, Ctrl+Alt can count as AltGr). The find bar never treats those as shortcuts.
 */
export function isAltGraph(e: { getModifierState?: (key: string) => boolean }): boolean {
  return Boolean(e.getModifierState?.('AltGraph'));
}

export const ALT_GRAPH_PROBLEM =
  'Your keyboard treats that as AltGr, which types letters like ą or ł, so the find bar leaves it alone.';

/** The action a key press triggers, if any. */
export function actionFor(e: KeyLike, shortcuts: Shortcuts): ShortcutAction | null {
  const combo = comboFromEvent(e);
  return combo ? (SHORTCUT_ACTIONS.find((a) => shortcuts[a] === combo) ?? null) : null;
}

const KEY_NAMES: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'Num Plus',
  NumpadSubtract: 'Num Minus',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
};

function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return KEY_NAMES[code] ?? `Num ${code.slice(6)}`;
  return KEY_NAMES[code] ?? code;
}

export type Platform = 'mac' | 'windows' | 'other';

export function detectPlatform(): Platform {
  const p = typeof navigator === 'undefined' ? '' : navigator.platform;
  if (/Mac|iPhone|iPad/.test(p)) return 'mac';
  return /Win/.test(p) ? 'windows' : 'other';
}

/** "Ctrl+Alt+C" (or "⌃⌥C" on macOS), for showing to people. */
export function formatCombo(value: string, platform: Platform = detectPlatform()): string {
  const c = parseCombo(value);
  if (!c) return value;
  if (platform === 'mac') {
    return `${c.ctrl ? '⌃' : ''}${c.alt ? '⌥' : ''}${c.shift ? '⇧' : ''}${c.meta ? '⌘' : ''}${keyName(c.code)}`;
  }
  const parts: string[] = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.alt) parts.push('Alt');
  if (c.shift) parts.push('Shift');
  if (c.meta) parts.push(platform === 'windows' ? 'Win' : 'Super');
  parts.push(keyName(c.code));
  return parts.join('+');
}

/**
 * The separate keys of a shortcut as shown to people: "Ctrl+Shift+F" and macOS "⇧⌘F12" have
 * three keys each, "Enter" one.
 */
export function shortcutKeys(shortcut: string): string[] {
  if (shortcut.includes('+')) return shortcut.split('+');
  const [, modifiers = '', key = ''] = shortcut.match(/^([⌘⇧⌥⌃]*)(.*)$/)!;
  return key ? [...modifiers, key] : [...modifiers];
}

/** The find bar's fixed keys: next/previous match, history, closing. */
const FIND_BAR_KEYS = new Set([
  'Enter', 'NumpadEnter', 'Escape', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backspace', 'Delete', 'Home', 'End', 'Space',
]);
/** Ctrl/⌘ shortcuts the browser keeps for itself, so a page never sees them. */
const BROWSER_KEYS = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab', 'PageUp', 'PageDown']);

/** Why a combination can't be used for `action`, or null if it's fine. */
export function shortcutProblem(
  value: string,
  action: ShortcutAction,
  all: Shortcuts,
  platform: Platform = detectPlatform(),
): string | null {
  const c = parseCombo(value);
  if (!c) return 'That key can’t be used as a shortcut.';
  const functionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(c.code);
  if (FIND_BAR_KEYS.has(c.code)) return 'The find bar already uses that key.';
  if (c.code === 'F4' && (c.ctrl || c.alt)) return 'That shortcut closes the tab or the window.';
  if (c.meta && platform === 'windows') {
    return 'Windows keeps Win key shortcuts for itself, like Win+L to lock the computer.';
  }
  if (!c.ctrl && !c.alt && !c.meta && !functionKey) {
    return 'Hold Ctrl, Alt or another modifier key too, otherwise it would just type into the search box.';
  }
  // The browser's own shortcuts use ⌘ on macOS and Ctrl elsewhere; Win/Super+W is free.
  const primary = c.ctrl || (c.meta && platform === 'mac');
  if (primary && !c.alt && (c.code === 'KeyF' || c.code === 'KeyG')) return 'The find bar already uses that key.';
  if (primary && !c.alt && BROWSER_KEYS.has(c.code)) return 'The browser keeps that shortcut for itself.';
  const other = SHORTCUT_ACTIONS.find((a) => a !== action && all[a] === value);
  if (other) return `That’s already the shortcut for “${SHORTCUT_LABELS[other]}”.`;
  return null;
}

/** Valid stored shortcuts, falling back to defaults for anything unusable. */
export function sanitizeShortcuts(input: unknown): Shortcuts {
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = {} as Shortcuts;
  for (const action of SHORTCUT_ACTIONS) {
    const value = raw[action];
    out[action] = parseCombo(value) ? (value as string) : DEFAULT_SHORTCUTS[action];
  }
  return out;
}
