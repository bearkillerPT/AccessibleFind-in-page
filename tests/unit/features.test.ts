import { describe, expect, it } from 'vitest';
import { freeArea } from '../../src/lib/finder/geometry';
import { placesFor } from '../../src/lib/finder/overlay';
import { luminance, parseColor, textTone } from '../../src/lib/finder/tone';
import { addToHistory } from '../../src/lib/history';
import { BUILT_IN_PROFILES, DEFAULT_APPEARANCE } from '../../src/lib/settings/defaults';
import { LIMITS, sanitizePrefs } from '../../src/lib/settings/sanitize';
import {
  appearanceForPage,
  appearanceFromV1,
  migrateV1,
  profileKey,
  stateFromRaw,
} from '../../src/lib/settings/schema';

describe('search history', () => {
  it('puts the latest first, without duplicates', () => {
    expect(addToHistory(['b', 'a'], 'A')).toEqual(['A', 'b']);
    expect(addToHistory(['b'], '  two   words ')).toEqual(['two words', 'b']);
    expect(addToHistory(['b'], '   ')).toEqual(['b']);
  });

  it('keeps a limited number', () => {
    const many = Array.from({ length: 40 }, (_, i) => `q${i}`);
    expect(addToHistory(many, 'new', 30)).toHaveLength(30);
  });
});

describe('page tone', () => {
  it('parses computed colors', () => {
    expect(parseColor('rgb(255, 255, 255)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('tells a match’s background from its text, or else from the background behind it', () => {
    const box = document.createElement('div');
    const text = document.createElement('span');
    box.append(text);
    document.body.append(box);
    // Light text: a dark background, even with no background color (a picture, say).
    text.style.color = 'rgb(240, 240, 240)';
    expect(textTone(text)).toBe('dark');
    text.style.color = 'rgb(20, 20, 20)';
    expect(textTone(text)).toBe('light');
    // Text in between goes by the background behind it.
    text.style.color = 'rgb(136, 136, 136)';
    box.style.backgroundColor = 'rgb(18, 18, 18)';
    expect(textTone(text)).toBe('dark');
    box.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(textTone(text)).toBe('light');
    box.remove();
  });

  it('computes luminance', () => {
    expect(luminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1);
    expect(luminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
    expect(luminance({ r: 18, g: 18, b: 18, a: 1 })).toBeLessThan(0.25);
  });
});

describe('keeping the find bar off the current match', () => {
  const view = { left: 0, top: 0, right: 1000, bottom: 800 };

  it('scrolls into the part of the screen the bar leaves free', () => {
    const topBar = { left: 400, top: 12, right: 988, bottom: 300 };
    // Under the bar: only the space below it counts.
    expect(freeArea(view, { left: 500, top: 100, right: 560, bottom: 120 }, topBar)).toEqual({ ...view, top: 300 });
    // Beside the bar: the whole screen.
    expect(freeArea(view, { left: 100, top: 100, right: 160, bottom: 120 }, topBar)).toEqual(view);
    // A bar at the bottom leaves the space above it.
    const bottomBar = { left: 0, top: 500, right: 1000, bottom: 788 };
    expect(freeArea(view, { left: 500, top: 600, right: 560, bottom: 620 }, bottomBar)).toEqual({ ...view, bottom: 500 });
    // A bar that leaves too little room is ignored rather than squeezing the match.
    const hugeBar = { left: 0, top: 12, right: 1000, bottom: 700 };
    expect(freeArea(view, { left: 500, top: 100, right: 560, bottom: 120 }, hugeBar)).toEqual(view);
  });

  it('moves the bar along the same edge first, then to the other edge', () => {
    expect(placesFor('top-right')).toEqual([
      'top-right', 'top-center', 'top-left', 'bottom-right', 'bottom-center', 'bottom-left',
    ]);
    expect(placesFor('bottom-center').slice(0, 3)).toEqual(['bottom-center', 'bottom-right', 'bottom-left']);
    expect(placesFor('top-left')[3]).toBe('bottom-left');
  });
});

describe('new preferences', () => {
  it('fills in defaults for settings saved before they existed', () => {
    const prefs = sanitizePrefs({ uiScale: 1.5 });
    expect(prefs.speech).toEqual({ autoRead: false, rate: 1, voiceURI: '' });
    expect(prefs.autoProfile).toEqual({ enabled: true });
    expect(prefs.rememberSearches).toBe(true);
  });

  it('clamps the speech rate', () => {
    expect(sanitizePrefs({ speech: { rate: 9 } }).speech.rate).toBe(LIMITS.speechRate.max);
  });

  it('ignores the profiles early v2 builds picked for light and dark pages', () => {
    const state = stateFromRaw({ schemaVersion: 2, prefs: { autoProfile: { enabled: false, light: 'a', dark: 'gone' } } });
    expect(state.prefs.autoProfile).toEqual({ enabled: false });
  });

  it('gives profiles saved before they had colors for dark backgrounds the default ones', () => {
    const state = stateFromRaw({
      schemaVersion: 2,
      profileOrder: ['a'],
      [profileKey('a')]: { id: 'a', name: 'A', appearance: { matchBg: '#123456' } },
      activeProfileId: 'a',
    });
    expect(state.active.appearance.dark).toEqual(DEFAULT_APPEARANCE.dark);
  });

  it('automatic style uses the profile’s own colors for dark backgrounds, and only on them', () => {
    const state = stateFromRaw({ schemaVersion: 2, activeProfileId: 'sys-colorblind' });
    expect(state.prefs.autoProfile.enabled).toBe(true);
    expect(appearanceForPage(state, 'light')).toEqual(state.active.appearance);
    expect(appearanceForPage(state, null)).toEqual(state.active.appearance);
    expect(appearanceForPage(state, 'dark').matchBg).toBe(state.active.appearance.dark.matchBg);
  });

  it('automatic style only swaps the colors; the other options stay', () => {
    const state = stateFromRaw({
      schemaVersion: 2,
      profileOrder: ['a'],
      [profileKey('a')]: {
        id: 'a',
        name: 'A',
        appearance: {
          matchBg: '#123456',
          borderWidth: 7,
          spotlight: { enabled: false, opacity: 0.3 },
          underline: { enabled: false, color: '#abcdef' },
          blink: { enabled: false, count: 5, intervalMs: 600 },
          dark: { matchBg: '#654321', currentBorder: '#abcabc', underline: '#111111' },
        },
      },
      activeProfileId: 'a',
    });
    const dark = appearanceForPage(state, 'dark');
    // Its colors for dark backgrounds...
    expect(dark.matchBg).toBe('#654321');
    expect(dark.currentBorder).toBe('#abcabc');
    expect(dark.underline.color).toBe('#111111');
    // ...everything else unchanged.
    expect(dark.borderWidth).toBe(7);
    expect(dark.spotlight).toEqual({ enabled: false, opacity: 0.3 });
    expect(dark.underline.enabled).toBe(false);
    expect(dark.blink).toEqual({ enabled: false, count: 5, intervalMs: 600 });

    const off = { ...state, prefs: { ...state.prefs, autoProfile: { enabled: false } } };
    expect(appearanceForPage(off, 'dark')).toEqual(state.active.appearance);
  });
});

describe('defaults', () => {
  it('start with the spotlight and magnifier off, which change how the page looks', () => {
    const state = stateFromRaw({});
    // Built-in profiles too: effects are personal, and one tap away in the find bar.
    for (const profile of state.profiles) {
      expect(profile.appearance.spotlight.enabled, profile.id).toBe(false);
      expect(profile.appearance.guides.enabled, profile.id).toBe(false);
      expect(profile.appearance.magnifier.enabled, profile.id).toBe(false);
    }
    expect(state.prefs.autoProfile.enabled).toBe(true);
  });

  it('keep the magnifier on for people coming from version 1, where matches were enlarged', () => {
    expect(appearanceFromV1({}).magnifier.enabled).toBe(true);
    const state = stateFromRaw(migrateV1({ settings: { highlightBgColor: '#00ff00' } }));
    expect(state.active.appearance.magnifier.enabled).toBe(true);
    expect(state.active.appearance.spotlight.enabled).toBe(false);
  });

  it('give the current match a background of its own in every built-in profile', () => {
    for (const { appearance: a } of BUILT_IN_PROFILES) {
      expect(a.currentBg).not.toBe(a.matchBg);
      expect(a.currentBorder).not.toBe(a.currentBg);
    }
  });
});

describe('selected text', () => {
  it('collapses whitespace and shortens long selections at a word', async () => {
    const { cleanSelection, SELECTION_MAX } = await import('../../src/lib/selection');
    expect(cleanSelection('  two\n   lines ')).toBe('two lines');
    const long = 'word '.repeat(100);
    const cut = cleanSelection(long);
    expect(cut.length).toBeLessThanOrEqual(SELECTION_MAX);
    expect(cut.endsWith('word')).toBe(true);
    expect(cleanSelection(null)).toBe('');
  });
});
