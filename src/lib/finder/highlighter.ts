/**
 * Paints matches with the CSS Custom Highlight API. Highlights are drawn by the browser
 * from Ranges, so the page's DOM is never modified: no wrapper elements for frameworks or
 * editors to trip over, no layout shift, and nothing to undo when the find bar closes.
 *
 * Each match is painted for the background it's on: matches on a dark background (with
 * automatic style) go in highlights of their own, named with "-dark", in other colors.
 */
import type { Appearance, PageTone } from '../settings/types';

export const HIGHLIGHT_NAMES = {
  match: 'accessible-find-match',
  context: 'accessible-find-context',
  current: 'accessible-find-current',
} as const;

type Kind = keyof typeof HIGHLIGHT_NAMES;
const KINDS = Object.keys(HIGHLIGHT_NAMES) as Kind[];
const TONES: PageTone[] = ['light', 'dark'];
const PRIORITY: Record<Kind, number> = { match: 1, context: 2, current: 3 };

/** The registered name of a highlight: "accessible-find-match", "accessible-find-match-dark"... */
export function highlightName(kind: Kind, tone: PageTone): string {
  return tone === 'dark' ? `${HIGHLIGHT_NAMES[kind]}-dark` : HIGHLIGHT_NAMES[kind];
}

function stylesheetText(a: Appearance, tone: PageTone): string {
  // Colors are validated hex values (see sanitize.ts), so they're safe to interpolate.
  const thickness = Math.max(2, Math.round(a.borderWidth * 0.75));
  const underline = a.underline.enabled
    ? `text-decoration: underline ${thickness}px solid ${a.underline.color};`
    : 'text-decoration: none;';
  return `
::highlight(${highlightName('match', tone)}) { background-color: ${a.matchBg}; color: ${a.matchText}; ${underline} }
::highlight(${highlightName('context', tone)}) { background-color: ${a.matchBg}; color: ${a.matchText}; }
::highlight(${highlightName('current', tone)}) { background-color: ${a.currentBg}; color: ${a.currentText}; text-decoration: none; }
`;
}

type Layer = Record<Kind, Highlight>;

export class Highlighter {
  private readonly sheet = new CSSStyleSheet();
  private readonly layers = {} as Record<PageTone, Layer>;
  private readonly roots = new Set<Document | ShadowRoot>();
  private all: Range[][] = [];
  /** The background each match in `all` is on. */
  private tones: readonly PageTone[] = [];
  private currentRanges: Range[] = [];
  private currentTone: PageTone = 'light';
  private blinkTimer = 0;
  private endBlink: (() => void) | null = null;

  constructor() {
    for (const tone of TONES) {
      const layer = {} as Layer;
      for (const kind of KINDS) {
        layer[kind] = new Highlight();
        layer[kind].priority = PRIORITY[kind];
        CSS.highlights.set(highlightName(kind, tone), layer[kind]);
      }
      this.layers[tone] = layer;
    }
    this.adopt(document);
  }

  /** True while a blink is running. */
  get blinking(): boolean {
    return this.blinkTimer !== 0;
  }

  /** How matches look on a light background, and on a dark one (the same, without automatic style). */
  setAppearance(light: Appearance, dark: Appearance = light): void {
    this.sheet.replaceSync(stylesheetText(light, 'light') + stylesheetText(dark, 'dark'));
  }

  /**
   * Adds the ::highlight() rules to a document or shadow root. Recent Chrome inherits them
   * into shadow trees from the document; older versions need them in each tree.
   */
  adopt(root: Document | ShadowRoot): void {
    if (this.roots.has(root)) return;
    this.roots.add(root);
    try {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.sheet];
    } catch {
      // A page can freeze adoptedStyleSheets; highlights still inherit document styles.
    }
  }

  private layer(i: number): Layer {
    return this.layers[this.tones[i] ?? 'light'];
  }

  private clear(kind: Kind): void {
    for (const tone of TONES) this.layers[tone][kind].clear();
  }

  private addMatches(): void {
    this.all.forEach((ranges, i) => {
      const layer = this.layer(i);
      for (const r of ranges) layer.match.add(r);
    });
  }

  /** Every match, and the background each one is on (light if left out). */
  setMatches(all: Range[][], tones: readonly PageTone[] = []): void {
    this.stopBlink();
    this.all = all;
    this.tones = tones;
    this.clear('match');
    this.clear('context');
    this.addMatches();
    for (const ranges of all) {
      const root = ranges[0]?.startContainer.getRootNode();
      if (root instanceof ShadowRoot) this.adopt(root);
    }
  }

  setCurrent(ranges: Range[], tone: PageTone = 'light'): void {
    this.stopBlink();
    this.clear('current');
    for (const r of ranges) this.layers[tone].current.add(r);
    this.currentRanges = ranges;
    this.currentTone = tone;
  }

  /**
   * Blinks every match: the matches and the words around them take turns being
   * highlighted, ending with the matches lit. Mirrors v1's "blinking line" effect.
   * `context` holds the words around each match, in the same order as the matches.
   */
  blinkAll(context: Range[][], count: number, intervalMs: number): void {
    this.runBlink(count, intervalMs, (on) => {
      for (const kind of KINDS) this.clear(kind);
      if (on) {
        this.addMatches();
        for (const r of this.currentRanges) this.layers[this.currentTone].current.add(r);
      } else {
        context.forEach((ranges, i) => {
          const layer = this.layer(i);
          for (const r of ranges) layer.context.add(r);
        });
      }
    });
  }

  /** Same effect as blinkAll, for the current match only. */
  blinkCurrent(contextRanges: Range[], count: number, intervalMs: number): void {
    const current = this.currentRanges;
    const layer = this.layers[this.currentTone];
    this.runBlink(count, intervalMs, (on) => {
      this.clear('context');
      for (const r of current) {
        if (on) {
          layer.match.add(r);
          layer.current.add(r);
        } else {
          layer.match.delete(r);
          layer.current.delete(r);
        }
      }
      if (!on) for (const r of contextRanges) layer.context.add(r);
    });
  }

  private runBlink(count: number, intervalMs: number, setPhase: (on: boolean) => void): void {
    this.stopBlink();
    let ticks = count * 2;
    this.endBlink = () => setPhase(true);
    this.blinkTimer = window.setInterval(() => {
      ticks--;
      setPhase(ticks % 2 === 0);
      if (ticks <= 0) this.stopBlink();
    }, intervalMs);
  }

  stopBlink(): void {
    window.clearInterval(this.blinkTimer);
    this.blinkTimer = 0;
    const end = this.endBlink;
    this.endBlink = null;
    end?.();
  }

  destroy(): void {
    window.clearInterval(this.blinkTimer);
    this.endBlink = null;
    for (const tone of TONES) for (const kind of KINDS) CSS.highlights.delete(highlightName(kind, tone));
    for (const root of this.roots) {
      try {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== this.sheet);
      } catch {
        // See adopt().
      }
    }
    this.roots.clear();
  }
}
