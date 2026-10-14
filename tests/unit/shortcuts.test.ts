import { describe, expect, it } from 'vitest';
import {
  actionFor,
  comboFromEvent,
  currentPreset,
  DEFAULT_SHORTCUTS,
  formatCombo,
  isAltGraph,
  isLetterKey,
  modifierPresets,
  sanitizeShortcuts,
  shortcutKeys,
  shortcutProblem,
  shortcutsWith,
} from '../../src/lib/shortcuts';

const key = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: Boolean(mods.ctrl),
  altKey: Boolean(mods.alt),
  shiftKey: Boolean(mods.shift),
  metaKey: Boolean(mods.meta),
});

describe('shortcuts', () => {
  it('builds combinations from key presses, ignoring lone modifiers', () => {
    expect(comboFromEvent(key('KeyC', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+KeyC');
    expect(comboFromEvent(key('AltLeft', { alt: true }))).toBeNull();
    expect(comboFromEvent(key('ShiftRight', { shift: true }))).toBeNull();
  });

  it('finds the action for a key press', () => {
    expect(actionFor(key('KeyL', { alt: true }), DEFAULT_SHORTCUTS)).toBe('list');
    expect(actionFor(key('KeyL', { ctrl: true, alt: true }), DEFAULT_SHORTCUTS)).toBeNull();
    const custom = { ...DEFAULT_SHORTCUTS, list: 'Ctrl+Alt+KeyL' };
    expect(actionFor(key('KeyL', { ctrl: true, alt: true }), custom)).toBe('list');
  });

  it('splits shortcuts into the keys to show', () => {
    expect(shortcutKeys('Ctrl+Shift+F')).toEqual(['Ctrl', 'Shift', 'F']);
    expect(shortcutKeys('Alt+Num Plus')).toEqual(['Alt', 'Num Plus']);
    expect(shortcutKeys('⇧⌘F')).toEqual(['⇧', '⌘', 'F']);
    // Key names longer than a letter stay whole on macOS too.
    expect(shortcutKeys('⌥F12')).toEqual(['⌥', 'F12']);
    expect(shortcutKeys('⌃⌥Num 1')).toEqual(['⌃', '⌥', 'Num 1']);
    expect(shortcutKeys('Enter')).toEqual(['Enter']);
  });

  it('recognizes letter keys on any keyboard layout', () => {
    expect(isLetterKey({ key: 'f', code: 'KeyF' }, 'f')).toBe(true);
    expect(isLetterKey({ key: 'F', code: 'KeyF' }, 'f')).toBe(true);
    // Dvorak: the key labelled F is where QWERTY has Y.
    expect(isLetterKey({ key: 'f', code: 'KeyY' }, 'f')).toBe(true);
    expect(isLetterKey({ key: 'u', code: 'KeyF' }, 'f')).toBe(false);
    // Russian and Greek type other letters on the F key.
    expect(isLetterKey({ key: 'а', code: 'KeyF' }, 'f')).toBe(true);
    expect(isLetterKey({ key: 'φ', code: 'KeyF' }, 'f')).toBe(true);
    expect(isLetterKey({ key: 'п', code: 'KeyG' }, 'g')).toBe(true);
  });

  it('formats combinations for each platform', () => {
    expect(formatCombo('Ctrl+Alt+KeyC', 'other')).toBe('Ctrl+Alt+C');
    expect(formatCombo('Alt+Shift+Digit1', 'mac')).toBe('⌥⇧1');
    expect(formatCombo('Meta+KeyL', 'windows')).toBe('Win+L');
    expect(formatCombo('Meta+KeyL', 'other')).toBe('Super+L');
    expect(formatCombo('Ctrl+Slash', 'other')).toBe('Ctrl+/');
  });

  it('rejects combinations that would type, clash or never arrive', () => {
    const p = (combo: string) => shortcutProblem(combo, 'list', DEFAULT_SHORTCUTS);
    expect(p('KeyL')).toMatch(/modifier/);
    expect(p('Shift+KeyL')).toMatch(/modifier/);
    expect(p('Ctrl+KeyF')).toMatch(/already uses/);
    expect(p('Alt+Enter')).toMatch(/already uses/);
    expect(p('Ctrl+KeyW')).toMatch(/browser keeps/);
    expect(p('Alt+KeyC')).toMatch(/Match case/);
    expect(p('F3')).toMatch(/already uses/);
    expect(p('Ctrl+Alt+KeyL')).toBeNull();
    expect(p('F7')).toBeNull();
    expect(p('Alt+KeyL')).toBeNull(); // Its own current shortcut.
  });

  it('rejects combinations the browser or the system takes before the find bar', () => {
    const p = (combo: string, platform: 'mac' | 'windows' | 'other') =>
      shortcutProblem(combo, 'list', DEFAULT_SHORTCUTS, platform);
    expect(p('Ctrl+F4', 'other')).toMatch(/closes the tab/);
    expect(p('Alt+F4', 'windows')).toMatch(/closes the tab/);
    expect(p('Alt+Shift+F4', 'windows')).toMatch(/closes the tab/);
    expect(p('F4', 'other')).toBeNull();
    expect(p('Meta+KeyL', 'windows')).toMatch(/Windows keeps/);
    expect(p('Ctrl+Meta+KeyL', 'windows')).toMatch(/Windows keeps/);
    expect(p('Meta+KeyL', 'other')).toBeNull();
  });

  it('spots AltGr, which the find bar ignores', () => {
    expect(isAltGraph({ getModifierState: (k) => k === 'AltGraph' })).toBe(true);
    expect(isAltGraph({ getModifierState: () => false })).toBe(false);
    expect(isAltGraph({})).toBe(false);
  });

  it('treats ⌘ as the browser’s key on macOS only', () => {
    expect(shortcutProblem('Meta+KeyW', 'list', DEFAULT_SHORTCUTS, 'mac')).toMatch(/browser keeps/);
    expect(shortcutProblem('Meta+KeyW', 'list', DEFAULT_SHORTCUTS, 'other')).toBeNull();
    expect(shortcutProblem('Ctrl+KeyW', 'list', DEFAULT_SHORTCUTS, 'other')).toMatch(/browser keeps/);
  });

  it('applies and recognizes modifier presets', () => {
    const all = shortcutsWith('Ctrl+Alt');
    expect(all.readAloud).toBe('Ctrl+Alt+KeyR');
    expect(currentPreset(all)).toBe('Ctrl+Alt');
    expect(currentPreset({ ...all, list: 'F7' })).toBeNull();
    expect(currentPreset(DEFAULT_SHORTCUTS)).toBe('Alt');
    expect(currentPreset(shortcutsWith('Meta'))).toBe('Meta');
  });

  it('offers Win/Super alone only where the system leaves it free', () => {
    expect(modifierPresets('other')).toContain('Meta');
    expect(modifierPresets('windows')).not.toContain('Meta'); // Win+L locks the computer.
    expect(modifierPresets('mac')).not.toContain('Meta'); // ⌘W closes the tab.
    expect(modifierPresets('mac')).toContain('Ctrl+Shift');
  });

  it('never gives a preset a combination the checks would refuse', () => {
    // Regression: the Ctrl+Shift preset made "Whole words only" Ctrl+Shift+W, which closes
    // the browser window instead.
    expect(shortcutsWith('Ctrl+Shift').wholeWord).toBe('Ctrl+Shift+KeyO');
    expect(currentPreset(shortcutsWith('Ctrl+Shift'))).toBe('Ctrl+Shift');
    for (const platform of ['other', 'windows', 'mac'] as const) {
      for (const m of modifierPresets(platform)) {
        const all = shortcutsWith(m);
        for (const [action, combo] of Object.entries(all)) {
          expect(shortcutProblem(combo, action as keyof typeof all, all, platform), `${platform}: ${combo}`).toBeNull();
        }
      }
    }
  });

  it('falls back to defaults for invalid stored values', () => {
    expect(sanitizeShortcuts({ list: 'Ctrl+Alt+KeyL', readAloud: 'nonsense+', matchCase: 42 })).toEqual({
      ...DEFAULT_SHORTCUTS,
      list: 'Ctrl+Alt+KeyL',
    });
    expect(sanitizeShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS);
  });
});
