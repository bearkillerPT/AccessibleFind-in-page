import { describe, expect, it } from 'vitest';
import {
  appearanceFromV1,
  builtInProfile,
  isChangedBuiltIn,
  migrateV1,
  profileKey,
  stateFromRaw,
} from '../../src/lib/settings/schema';
import { sanitizeAppearance, sanitizePrefs, LIMITS } from '../../src/lib/settings/sanitize';
import { BUILT_IN_PROFILES, DEFAULT_APPEARANCE, DEFAULT_PREFS } from '../../src/lib/settings/defaults';
import { contrastRatio } from '../../src/lib/settings/contrast';

const V1_SETTINGS = {
  blinkInterval: 100,
  numBlinks: 3,
  numSurroundingWords: 2,
  highlightBgColor: '#FF0',
  highlightTextColor: '#000000',
  outlineColor: '#ff8c00',
  borderWidth: 5,
  matchFontSize: 20,
  selectedBgColor: '#ff8c00',
  selectedBorderColor: '#ffff00',
  selectedTextColor: '#ffffff',
};

describe('v1 migration', () => {
  it('converts v1 settings to an appearance', () => {
    const a = appearanceFromV1(V1_SETTINGS);
    expect(a.matchBg).toBe('#ffff00');
    expect(a.currentText).toBe('#ffffff');
    expect(a.borderWidth).toBe(5);
    expect(a.contextWords).toBe(2);
    expect(a.blink).toEqual({ enabled: true, count: 3, intervalMs: LIMITS.blinkIntervalMs.min });
    expect(a.magnifier).toEqual({ enabled: true, fontSize: 32 });
  });

  it('keeps user profiles, their ids and a selected built-in profile', () => {
    const out = migrateV1({
      settings: V1_SETTINGS,
      profiles: [
        { id: 'default', name: 'Default', settings: V1_SETTINGS },
        { id: 'k3j2', name: 'Night', settings: { ...V1_SETTINGS, highlightBgColor: '#00ff00' } },
      ],
      activeProfileId: 'sys-colorblind',
    });
    expect(out.profileOrder).toEqual(['default', 'k3j2']);
    expect(out.activeProfileId).toBe('sys-colorblind');
    expect((out[profileKey('k3j2')] as { appearance: { matchBg: string } }).appearance.matchBg).toBe('#00ff00');
  });

  it('builds a Default profile from single v1 settings', () => {
    const state = stateFromRaw({ settings: V1_SETTINGS });
    expect(state.active.id).toBe('default');
    expect(state.active.appearance.borderWidth).toBe(5);
  });

  it('falls back to defaults for an empty store', () => {
    const state = stateFromRaw({});
    expect(state.active.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(state.prefs).toEqual(DEFAULT_PREFS);
    expect(state.profiles.filter((p) => p.builtIn)).toHaveLength(BUILT_IN_PROFILES.length);
  });

  it('falls back when the active profile no longer exists', () => {
    const state = stateFromRaw({
      schemaVersion: 2,
      profileOrder: ['a'],
      [profileKey('a')]: { id: 'a', name: 'A', appearance: {} },
      activeProfileId: 'gone',
    });
    expect(state.activeProfileId).toBe('a');
  });
});

describe('built-in profiles', () => {
  it('can be changed: the changes are stored under their own id, and missing values come from the original', () => {
    const original = builtInProfile('sys-hc-light')!;
    const state = stateFromRaw({
      schemaVersion: 2,
      profileOrder: ['default'],
      [profileKey('default')]: { id: 'default', name: 'Default', appearance: {} },
      [profileKey('sys-hc-light')]: { id: 'sys-hc-light', name: 'Renamed?', appearance: { matchBg: '#123456' } },
      activeProfileId: 'sys-hc-light',
    });
    const changed = state.active;
    expect(changed).toMatchObject({ id: 'sys-hc-light', name: original.name, builtIn: true });
    expect(changed.appearance.matchBg).toBe('#123456');
    // Not from the global defaults: from the built-in profile itself.
    expect(changed.appearance.currentBorder).toBe(original.appearance.currentBorder);
    expect(changed.appearance.borderWidth).toBe(original.appearance.borderWidth);
    expect(isChangedBuiltIn(changed)).toBe(true);
    // Still not a user profile.
    expect(state.profiles.filter((p) => !p.builtIn).map((p) => p.id)).toEqual(['default']);
  });

  it('count as unchanged when they look like the original', () => {
    const original = builtInProfile('sys-hc-light')!;
    const state = stateFromRaw({
      schemaVersion: 2,
      activeProfileId: 'sys-hc-light',
      [profileKey('sys-hc-light')]: { appearance: { ...original.appearance } },
    });
    expect(state.active.id).toBe('sys-hc-light');
    expect(isChangedBuiltIn(state.active)).toBe(false);
    expect(isChangedBuiltIn({ ...state.active, appearance: { ...original.appearance, borderWidth: 1 } })).toBe(true);
  });
});

describe('sanitizing', () => {
  it('clamps numbers and rejects bad colors', () => {
    const a = sanitizeAppearance({ borderWidth: 99, matchBg: 'red', blink: { intervalMs: 10, count: '4' } });
    expect(a.borderWidth).toBe(LIMITS.borderWidth.max);
    expect(a.matchBg).toBe(DEFAULT_APPEARANCE.matchBg);
    expect(a.blink.intervalMs).toBe(LIMITS.blinkIntervalMs.min);
    expect(a.blink.count).toBe(4);
  });

  it('gives profiles saved before the ring duration existed the default one, and keeps it in range', () => {
    expect(sanitizeAppearance({ ping: { enabled: false } }).ping).toMatchObject({
      enabled: false,
      durationMs: DEFAULT_APPEARANCE.ping.durationMs,
    });
    expect(sanitizeAppearance({ ping: { durationMs: 50 } }).ping.durationMs).toBe(LIMITS.pingDurationMs.min);
    expect(sanitizeAppearance({ ping: { durationMs: 1600 } }).ping.durationMs).toBe(1600);
  });

  it('keeps the ring as thick as it was before its thickness was a setting', () => {
    // It used to follow the border: a pixel more, and at least 4.
    expect(sanitizeAppearance({ ping: { enabled: true } }).ping.width).toBe(4);
    expect(sanitizeAppearance({ borderWidth: 8, ping: { enabled: true } }).ping.width).toBe(9);
    expect(sanitizeAppearance({ borderWidth: 8, ping: { width: 3 } }).ping.width).toBe(3);
    expect(sanitizeAppearance({ ping: { width: 99 } }).ping.width).toBe(LIMITS.pingWidth.max);
    expect(DEFAULT_APPEARANCE.ping.width).toBe(4);
  });

  it('validates prefs', () => {
    const p = sanitizePrefs({ barPosition: 'middle', uiScale: 9, motion: 'reduce' });
    expect(p.barPosition).toBe('top-right');
    expect(p.uiScale).toBe(LIMITS.uiScale.max);
    expect(p.motion).toBe('reduce');
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ff8c00', '#ffffff')!).toBeLessThan(4.5);
    expect(contrastRatio('#ff8c00', '#000000')!).toBeGreaterThan(4.5);
    expect(contrastRatio('nope', '#000')).toBeNull();
  });
});
