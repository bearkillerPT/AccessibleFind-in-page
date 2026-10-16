/**
 * Decides whether a page looks light or dark, for choosing a profile automatically.
 * It samples what's under a few points of the screen and walks up to the first element
 * with a solid background color.
 */
import type { PageTone } from '../settings/types';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
let canvas: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

/** Parses a computed CSS color. rgb()/rgba() directly; anything else via a 1×1 canvas. */
export function parseColor(css: string): Rgba | null {
  const m = css.trim().match(RGB);
  if (m) {
    let a = m[4] === undefined ? 1 : Number(m[4]);
    if (m[5] === '%') a /= 100;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  if (css === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  try {
    canvas ??= new OffscreenCanvas(1, 1).getContext('2d');
    if (!canvas) return null;
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = css;
    canvas.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = canvas.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgba): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Below this luminance a background counts as dark (mid-grey is about 0.22). */
export const DARK_LUMINANCE = 0.25;

function flatParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Luminance of the first solid background behind an element. */
function backgroundBehind(el: Element | null): number {
  for (let cur = el; cur; cur = flatParent(cur)) {
    const color = parseColor(getComputedStyle(cur).backgroundColor);
    if (color && color.a >= 0.5) return luminance(color);
  }
  // Nothing painted a background: the page canvas shows, which is dark only if the page
  // opted into a dark color scheme and the system is in dark mode.
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const darkCanvas =
    scheme.includes('dark') && (!scheme.includes('light') || matchMedia('(prefers-color-scheme: dark)').matches);
  return darkCanvas ? 0 : 1;
}

/** Text at least this light sits on a dark background; at most this light, on a light one. */
const LIGHT_TEXT = 0.45;
const DARK_TEXT = 0.15;

/**
 * Whether the text in `el` is on a light or a dark background, for the colors of a match
 * there. The text's own color says so best (pages keep text readable, so light text means a
 * dark background), even over an image or a box that isn't one of its ancestors. Text in
 * between goes by the first solid background behind it.
 */
export function textTone(el: Element): PageTone {
  const color = parseColor(getComputedStyle(el).color);
  if (color && color.a >= 0.5) {
    const l = luminance(color);
    if (l >= LIGHT_TEXT) return 'dark';
    if (l <= DARK_TEXT) return 'light';
  }
  return backgroundBehind(el) < DARK_LUMINANCE ? 'dark' : 'light';
}

/**
 * Light or dark, from what's on the screen. Searching only part of the page (`root`, like
 * the practice page's article), that part's background decides.
 */
export function detectPageTone(root?: Node | null): PageTone {
  if (root instanceof Element && root !== document.body && root !== document.documentElement) {
    return backgroundBehind(root) < DARK_LUMINANCE ? 'dark' : 'light';
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  // The middle counts twice: it's where the content usually is.
  const points: [number, number][] = [
    [0.5, 0.5],
    [0.5, 0.5],
    [0.3, 0.3],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.7, 0.7],
  ];
  let dark = 0;
  for (const [x, y] of points) {
    // Skip our own overlay: the find bar can sit under a sample point.
    const el =
      document.elementsFromPoint(x * w, y * h).find((e) => e.localName !== 'accessible-find-overlay') ??
      document.body;
    if (backgroundBehind(el) < DARK_LUMINANCE) dark++;
  }
  return dark > points.length / 2 ? 'dark' : 'light';
}
