/**
 * The rules the built-in highlight colors are designed by (see defaults.ts), checked for
 * normal vision and simulated color blindness, so a change of color can't quietly break them.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_PROFILES, DEFAULT_APPEARANCE } from '../../src/lib/settings/defaults';
import { darkVersion, migrateV1, stateFromRaw } from '../../src/lib/settings/schema';
import type { Appearance } from '../../src/lib/settings/types';

type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'no color';
const VISIONS: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'no color'];

// Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of Color
// Vision Deficiency", severity 1 (dichromacy), on linear RGB.
const MACHADO: Record<string, number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const linear = (hex: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

/** Relative luminance of a color as someone with `vision` sees it. */
function luminance(hex: string, vision: Vision): number {
  let rgb = linear(hex);
  const m = MACHADO[vision];
  if (m) rgb = m.map((row) => Math.min(1, Math.max(0, row.reduce((sum, k, j) => sum + k * rgb[j]!, 0))));
  // With no color vision only brightness is left, which is the luminance itself.
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

function contrast(a: string, b: string, vision: Vision = 'normal'): number {
  const [hi, lo] = [luminance(a, vision), luminance(b, vision)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const profiles = [
  { name: 'Default', a: DEFAULT_APPEARANCE },
  ...BUILT_IN_PROFILES.map((p) => ({ name: p.name, a: p.appearance })),
];

// Each profile's usual colors on a white page, and its colors for dark backgrounds on a dark one.
const backgrounds = [
  // About the 3:1 change WCAG asks of a focus indicator; on light pages the dark current
  // match does far better.
  { background: 'light', page: '#ffffff', colors: (a: Appearance) => a, least: 6.5 },
  // Two highlights that both keep 7:1 dark text can only be 3:1 apart, so a little less.
  { background: 'dark', page: '#121212', colors: darkVersion, least: 2.5 },
];

describe.each(profiles)('$name', ({ a: appearance }) => {
  describe.each(backgrounds)('on $background backgrounds', ({ page, colors, least }) => {
    const a = colors(appearance);

    it('keeps text on a highlight at 7:1 or more', () => {
      expect(contrast(a.matchBg, a.matchText)).toBeGreaterThanOrEqual(7);
      expect(contrast(a.currentBg, a.currentText)).toBeGreaterThanOrEqual(7);
    });

    it('tells the current match from the others by lightness, for every kind of color vision', () => {
      for (const vision of VISIONS) {
        expect(contrast(a.currentBg, a.matchBg, vision), vision).toBeGreaterThanOrEqual(least);
      }
    });

    it('makes the current match stand out from the page', () => {
      expect(Math.max(contrast(a.currentBg, page), contrast(a.currentBorder, page))).toBeGreaterThanOrEqual(3);
    });

    it('draws an underline that shows on the match', () => {
      expect(a.underline.enabled).toBe(true);
      expect(contrast(a.underline.color, a.matchBg)).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('built-in profiles', () => {
  it('keep the ids from v1, so a profile chosen there survives the upgrade', () => {
    const ids = BUILT_IN_PROFILES.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['sys-hc-light', 'sys-colorblind']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('send people who used v1’s profile for dark pages to Default, which has colors for them', () => {
    const state = stateFromRaw(migrateV1({ activeProfileId: 'sys-hc-dark', settings: {} }));
    expect(state.active.id).toBe('default');
    expect(state.prefs.autoProfile.enabled).toBe(true);
  });

  it('each say who they are for', () => {
    for (const p of BUILT_IN_PROFILES) expect(p.description, p.id).toBeTruthy();
  });
});
