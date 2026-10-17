/**
 * Visual aids drawn over the current match, all on the overlay layer (never in the page):
 * - a border box around each line of the match
 * - a spotlight that dims the rest of the page
 * - guide lines crossing at the match
 * - a magnifier showing the match and nearby words in large text
 * - a "ping": a ring that shrinks from the screen edges onto the match
 *
 * These help when the visual field is narrow (e.g. tunnel vision), where a small change
 * at the edge of the screen goes unnoticed.
 */
import { browser } from 'wxt/browser';
import type { MatchContext } from '../search/matcher';
import type { Appearance } from '../settings/types';
import { boxHeight, boxWidth, intersects, lineBoxes, unionBox, viewportBox, type Box } from './geometry';

/** Family name the brand font is registered under in the page (namespaced to avoid clashes). */
const FONT_FAMILY = 'Accessible Find Atkinson';
let fontFaces: FontFace[] = [];

/**
 * Loads Atkinson Hyperlegible Next, designed for low-vision readers, for the magnifier.
 * If the page's security policy blocks it, the magnifier falls back to the system font.
 */
function loadBrandFont(): void {
  if (fontFaces.length) return;
  try {
    const files = [
      browser.runtime.getURL('/fonts/AtkinsonHyperlegibleNext-latin.woff2'),
      browser.runtime.getURL('/fonts/AtkinsonHyperlegibleNext-latin-ext.woff2'),
    ];
    for (const url of files) {
      const face = new FontFace(FONT_FAMILY, `url("${url}")`, { weight: '200 800' });
      fontFaces.push(face);
      document.fonts.add(face);
      face.load().catch(() => document.fonts.delete(face));
    }
  } catch {
    // FontFace unavailable: the system font is fine.
  }
}

const EFFECTS_CSS = `
.box, .spotlight, .guide, .ping, .magnifier { position: fixed; display: none; pointer-events: none; }
.box { border-style: solid; border-radius: 4px; box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #000; }
.spotlight { border-radius: 10px; }
.guide { box-shadow: 0 0 0 1px #000; }
.ping { border-style: solid; border-radius: 16px; box-shadow: 0 0 0 2px #000, inset 0 0 0 2px #000; }
.magnifier {
  max-width: min(92vw, 40em); padding: 0.25em 0.5em; border-radius: 10px;
  background: #0b1020; color: #f4f6fc; border: 3px solid;
  font: 600 32px/1.35 "${FONT_FAMILY}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.01em; white-space: normal; overflow-wrap: anywhere; text-align: left;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.6);
}
/* Framed like the current match on the page, which may be as dark as the magnifier itself. */
.magnifier mark { border-radius: 4px; padding: 0 0.12em; margin: 0 0.1em; }
`;

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function place(el: HTMLElement, b: Box): void {
  el.style.left = `${b.left}px`;
  el.style.top = `${b.top}px`;
  el.style.width = `${boxWidth(b)}px`;
  el.style.height = `${boxHeight(b)}px`;
  el.style.display = 'block';
}

export class Effects {
  private readonly spotlight = div('spotlight');
  private readonly guideH = div('guide');
  private readonly guideV = div('guide');
  private readonly boxes: HTMLDivElement[] = [];
  private readonly boxLayer = div('boxes');
  private readonly magnifier = div('magnifier');
  private readonly magnifierBefore = document.createElement('span');
  private readonly magnifierMark = document.createElement('mark');
  private readonly magnifierAfter = document.createElement('span');
  private readonly ping = div('ping');
  private appearance: Appearance | null = null;
  private reducedMotion = false;
  private ranges: readonly Range[] | null = null;
  private pingAnimation: Animation | null = null;

  constructor(
    layer: HTMLElement,
    /** Where the find bar is, so the magnifier can stay clear of it. */
    private readonly barBox: () => Box | null,
  ) {
    loadBrandFont();
    const style = document.createElement('style');
    style.textContent = EFFECTS_CSS;
    this.magnifier.append(this.magnifierBefore, this.magnifierMark, this.magnifierAfter);
    this.magnifier.setAttribute('aria-hidden', 'true');
    layer.append(style, this.spotlight, this.guideH, this.guideV, this.boxLayer, this.magnifier, this.ping);
  }

  configure(appearance: Appearance, reducedMotion: boolean): void {
    this.appearance = appearance;
    this.reducedMotion = reducedMotion;
    const a = appearance;
    this.spotlight.style.boxShadow = `0 0 0 200vmax rgba(0, 0, 0, ${a.spotlight.opacity})`;
    for (const g of [this.guideH, this.guideV]) {
      g.style.borderColor = a.currentBorder;
      g.style.borderStyle = 'solid';
    }
    this.guideH.style.borderWidth = `${Math.max(2, a.borderWidth)}px 0`;
    this.guideV.style.borderWidth = `0 ${Math.max(2, a.borderWidth)}px`;
    this.magnifier.style.fontSize = `${a.magnifier.fontSize}px`;
    this.magnifier.style.borderColor = a.currentBorder;
    this.magnifierMark.style.background = a.currentBg;
    this.magnifierMark.style.color = a.currentText;
    this.magnifierMark.style.boxShadow = `0 0 0 0.08em ${a.currentBorder}`;
    this.ping.style.borderColor = a.currentBorder;
    this.ping.style.borderWidth = `${a.ping.width}px`;
    this.update();
  }

  /** Shows the effects around `ranges` (the current match), or hides them for null. */
  show(ranges: readonly Range[] | null, context: MatchContext | null): void {
    this.ranges = ranges;
    if (context) {
      this.magnifierBefore.textContent = context.before;
      this.magnifierMark.textContent = context.match;
      this.magnifierAfter.textContent = context.after;
    }
    this.update();
  }

  /** Recomputes positions; call after scrolling, resizing or layout changes. */
  update(): void {
    const a = this.appearance;
    const boxes = this.ranges && a ? lineBoxes(this.ranges) : [];
    const bounds = unionBox(boxes);
    const view = viewportBox();
    if (!a || !bounds || !intersects(bounds, view)) {
      this.hideAll();
      return;
    }
    const pad = 2 + a.borderWidth;
    const grow = (b: Box, by: number): Box => ({
      left: b.left - by,
      top: b.top - by,
      right: b.right + by,
      bottom: b.bottom + by,
    });

    while (this.boxes.length < boxes.length) {
      const el = div('box');
      this.boxes.push(el);
      this.boxLayer.append(el);
    }
    this.boxes.forEach((el, i) => {
      const b = boxes[i];
      if (!b) {
        el.style.display = 'none';
        return;
      }
      el.style.borderWidth = `${a.borderWidth}px`;
      el.style.borderColor = a.currentBorder;
      place(el, grow(b, pad));
    });

    if (a.spotlight.enabled) place(this.spotlight, grow(bounds, pad + 8));
    else this.spotlight.style.display = 'none';

    if (a.guides.enabled) {
      const g = grow(bounds, pad + 4);
      place(this.guideH, { left: -10, right: view.right + 10, top: g.top, bottom: g.bottom });
      place(this.guideV, { top: -10, bottom: view.bottom + 10, left: g.left, right: g.right });
    } else {
      this.guideH.style.display = 'none';
      this.guideV.style.display = 'none';
    }

    if (a.magnifier.enabled && this.magnifierMark.textContent) this.placeMagnifier(grow(bounds, pad + 10), view);
    else this.magnifier.style.display = 'none';
  }

  /**
   * Below or above the match, clear of the find bar: centered on the match if possible,
   * otherwise beside the bar, narrower (the text wraps) if that's what it takes to fit.
   */
  private placeMagnifier(around: Box, view: Box): void {
    const el = this.magnifier;
    el.style.display = 'block';
    const bar = this.barBox();
    const roomBesideBar = bar ? Math.max(bar.left, view.right - bar.right) - 16 : 0;
    const widths = roomBesideBar >= 160 ? ['', `min(92vw, 40em, ${roomBesideBar}px)`] : [''];
    for (const maxWidth of widths) {
      el.style.maxWidth = maxWidth;
      if (this.placeMagnifierClear(around, view, bar)) return;
    }
    // Nowhere clear: full width, on the roomier side of the match, kept on screen.
    el.style.maxWidth = '';
    const { w, h } = this.measureMagnifier();
    const top = view.bottom - around.bottom >= around.top ? around.bottom : around.top - h;
    el.style.left = `${Math.max(8, Math.min(view.right - w - 8, (around.left + around.right) / 2 - w / 2))}px`;
    el.style.top = `${Math.max(8, Math.min(view.bottom - h - 8, top))}px`;
  }

  private measureMagnifier(): { w: number; h: number } {
    const el = this.magnifier;
    el.style.left = '0px';
    el.style.top = '0px';
    return { w: el.offsetWidth, h: el.offsetHeight };
  }

  /** Puts the magnifier where it doesn't cover the find bar, if there's such a place. */
  private placeMagnifierClear(around: Box, view: Box, bar: Box | null): boolean {
    const { w, h } = this.measureMagnifier();
    const lefts = [Math.max(8, Math.min(view.right - w - 8, (around.left + around.right) / 2 - w / 2))];
    if (bar) {
      if (bar.left - 8 - w >= 8) lefts.push(bar.left - 8 - w);
      if (bar.right + 8 + w <= view.right - 8) lefts.push(bar.right + 8);
    }
    const tops = [around.bottom, around.top - h];
    for (const left of lefts) {
      for (const top of tops) {
        const box = { left, right: left + w, top, bottom: top + h };
        if (box.top >= 8 && box.bottom <= view.bottom - 8 && !(bar && intersects(box, bar))) {
          this.magnifier.style.left = `${left}px`;
          this.magnifier.style.top = `${top}px`;
          return true;
        }
      }
    }
    return false;
  }

  /** Plays the shrinking ring onto the current match. */
  playPing(): void {
    const a = this.appearance;
    if (!a?.ping.enabled || this.reducedMotion || !this.ranges) return;
    const bounds = unionBox(lineBoxes(this.ranges));
    const view = viewportBox();
    if (!bounds || !intersects(bounds, view)) return;
    const pad = 6 + a.borderWidth;
    const end = { left: bounds.left - pad, top: bounds.top - pad, width: boxWidth(bounds) + pad * 2, height: boxHeight(bounds) + pad * 2 };
    const cx = end.left + end.width / 2;
    const cy = end.top + end.height / 2;
    const startW = 2 * Math.max(cx, view.right - cx) + 40;
    const startH = 2 * Math.max(cy, view.bottom - cy) + 40;
    const frame = (left: number, top: number, width: number, height: number, opacity: number) => ({
      left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, opacity,
    });
    this.pingAnimation?.cancel();
    this.ping.style.display = 'block';
    this.pingAnimation = this.ping.animate(
      [
        frame(cx - startW / 2, cy - startH / 2, startW, startH, 0.9),
        { ...frame(end.left, end.top, end.width, end.height, 1), offset: 0.8 },
        frame(end.left, end.top, end.width, end.height, 0),
      ],
      { duration: a.ping.durationMs, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
    this.pingAnimation.onfinish = () => {
      this.ping.style.display = 'none';
    };
  }

  private hideAll(): void {
    for (const el of [this.spotlight, this.guideH, this.guideV, this.magnifier, ...this.boxes]) {
      el.style.display = 'none';
    }
  }

  destroy(): void {
    this.pingAnimation?.cancel();
    // Leave nothing behind in the page once the find bar is closed.
    for (const face of fontFaces) document.fonts.delete(face);
    fontFaces = [];
  }
}
