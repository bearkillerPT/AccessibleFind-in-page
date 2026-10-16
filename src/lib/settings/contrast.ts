import { normalizeHex } from './sanitize';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two hex colors, or null if either is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const ha = normalizeHex(a);
  const hb = normalizeHex(b);
  if (!ha || !hb) return null;
  const la = luminance(ha);
  const lb = luminance(hb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Minimum contrast WCAG AA asks for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;
