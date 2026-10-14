/**
 * One find session in a page: owns the text index, highlights, effects and the find bar
 * overlay, and answers the find bar's messages. Lives in the content script. It also reads
 * aloud, for the find bar and for the read aloud browser shortcut, with or without the bar.
 */
import { browser } from 'wxt/browser';
import type { BarMessage, Results } from '../messages';
import {
  contextSpans,
  contextText,
  findMatches,
  positionOf,
  revealTargets,
  sentenceText,
  spanToRanges,
  type MatchContext,
  type Span,
} from '../search/matcher';
import { buildTextIndex, type TextIndex } from '../search/text-index';
import { cleanSelection, textInField } from '../selection';
import { DEFAULT_PREFS } from '../settings/defaults';
import { appearanceForPage, stateFromRaw } from '../settings/schema';
import { readState, subscribe } from '../settings/store';
import type { Appearance, PageTone, SearchOptions, SettingsState } from '../settings/types';
import { actionFor, isAltGraph, isLetterKey, typingTarget } from '../shortcuts';
import { isSpeaking, speak, speechAvailable, stopSpeaking } from '../speech';
import { Effects } from './effects';
import { lineBoxes, scrollIntoView, unionBox, type ScrollMode } from './geometry';
import { Highlighter } from './highlighter';
import { Overlay } from './overlay';
import { detectPageTone, textTone } from './tone';

/** More matches than this aren't highlighted; the bar shows "5000+". */
const MAX_MATCHES = 5000;
/** The all-matches blink only lights context words for this many matches. */
const BLINK_CONTEXT_LIMIT = 500;
const MAGNIFIER_WORDS = 6;
const BAR_CONTEXT_WORDS = 8;
/** The results list shows at most this many matches. */
const LIST_LIMIT = 500;
const LIST_CONTEXT_WORDS = 6;
/** Wait this long after the last keystroke before blinking and pinging. */
const TYPING_SETTLE_MS = 450;
/** Shortest wait between a DOM change and refreshing the matches. */
const LIVE_UPDATE_MS = 400;
/** On big pages, wait at least this many times the indexing cost between refreshes. */
const LIVE_UPDATE_COST_FACTOR = 8;
/**
 * While typing, a stale index is reused (and refreshed shortly after) if it's younger than
 * this, or this many times its build cost on big pages. Rebuilding on every keystroke would
 * make typing lag on large pages that change constantly (carousels, clocks, feeds).
 */
const REUSE_MIN_MS = 500;
const REUSE_COST_FACTOR = 10;
/** Said when read aloud finds nothing to read, so the key never seems to do nothing. */
const NOTHING_TO_READ = 'Nothing to read yet. Select some text, or search for a word.';

type Dirty = 'none' | 'attributes' | 'content';

function closedShadowRoot(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  // Closed shadow roots are only reachable through chrome.dom. Only custom elements
  // (names with a dash) commonly have them, so skip the call for everything else.
  if (!el.localName.includes('-')) return null;
  const dom = (globalThis as { chrome?: { dom?: { openOrClosedShadowRoot?(e: Element): ShadowRoot | null } } })
    .chrome?.dom;
  try {
    return dom?.openOrClosedShadowRoot?.(el) ?? null;
  } catch {
    return null;
  }
}

function selectedText(): string {
  return cleanSelection(window.getSelection()?.toString());
}

/** The focused element, looking inside shadow roots. */
function deepActiveElement(): Element | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** The focused form field, if any: reading aloud reads what's typed in it. */
function focusedField(): HTMLElement | null {
  const el = deepActiveElement();
  const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  return field ? el : null;
}

function sameOptions(a: SearchOptions, b: SearchOptions): boolean {
  return a.caseSensitive === b.caseSensitive && a.matchDiacritics === b.matchDiacritics && a.wholeWord === b.wholeWord;
}

export interface FinderOptions {
  /** What to search. Defaults to the whole page; the practice page limits it to its article. */
  root?: () => Node;
}

export class Finder {
  private overlay: Overlay | null = null;
  private highlighter: Highlighter | null = null;
  private effects: Effects | null = null;
  private settings: SettingsState = stateFromRaw({});
  private index: TextIndex | null = null;
  private indexBuiltAt = 0;
  private indexCostMs = 0;
  private dirty: Dirty = 'content';
  private observer: MutationObserver | null = null;
  /** Roots the current observer watches; reset with each new observer. */
  private observed = new WeakSet<Node>();

  private query = '';
  private options: SearchOptions = DEFAULT_PREFS.search;
  private spans: Span[] = [];
  private ranges: Range[][] = [];
  /** The background each match is on: automatic style colors each one for its own. */
  private tones: PageTone[] = [];
  private capped = false;
  private current = -1;
  /** Remembered across open/close, so reopening offers the previous search. */
  private lastQuery = '';
  private prefill = '';
  private previousFocus: Element | null = null;
  private tone: PageTone = 'light';
  private listOpen = false;
  /** Whether something is being read aloud. */
  private speaking = false;
  /** Removes the key listener that lets Escape stop reading while the find bar is closed. */
  private stopOnEscape: (() => void) | null = null;

  constructor(private readonly config: FinderOptions = {}) {}

  private cleanups: (() => void)[] = [];
  private settleTimer = 0;
  private liveTimer = 0;
  private frame = 0;

  isOpen(): boolean {
    return this.overlay !== null;
  }

  open(selection?: string): void {
    const given = cleanSelection(selection);
    if (this.overlay) {
      // Like the browser's find: Ctrl+F with newly selected text searches for it. Only when
      // the page has focus, so Ctrl+F pressed in the find bar never replaces what's typed.
      const pageFocused = document.activeElement !== this.overlay.host;
      const text = given || (pageFocused ? selectedText() : '');
      if (text && text !== this.query && this.settings.prefs.prefillSelection) {
        this.overlay.post({ t: 'init', query: text });
      }
      this.overlay.raise();
      this.overlay.focusBar();
      return;
    }
    try {
      this.start(given);
    } catch (error) {
      // Don't leave half an overlay behind; the caller reports that it couldn't open.
      this.close('silent');
      throw error;
    }
  }

  private start(selection: string): void {
    this.previousFocus = deepActiveElement();
    this.prefill = selection || selectedText();
    this.dirty = 'content';
    this.listOpen = false;
    // Before the overlay exists, so it can't affect what's sampled.
    this.tone = detectPageTone(this.config.root?.());

    const overlay = new Overlay({
      onMessage: (m) => this.onBarMessage(m),
      onConnect: () => {
        const usePrefill = this.settings.prefs.prefillSelection && this.prefill;
        overlay.post({ t: 'init', query: usePrefill ? this.prefill : this.lastQuery });
        overlay.post({ t: 'page', tone: this.tone });
        overlay.post({ t: 'speaking', on: this.speaking });
        overlay.focusBar();
      },
    });
    this.overlay = overlay;
    this.highlighter = new Highlighter();
    this.effects = new Effects(overlay.layer, () => this.overlay?.barBox() ?? null);
    this.applySettings(this.settings);
    void readState().then((s) => this.applySettings(s));
    this.cleanups.push(subscribe((s) => this.applySettings(s)));
    this.observe();
    this.listen();
    this.followModalDialogs();
  }

  close(how: 'escape' | 'button' | 'silent'): void {
    if (!this.overlay) return;
    if (this.speaking) this.stopReading();
    const ranges = this.current >= 0 ? this.ranges[this.current] : undefined;
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // Extension APIs throw once the extension was updated underneath us; keep tearing down.
      }
    }
    window.clearTimeout(this.settleTimer);
    window.clearTimeout(this.liveTimer);
    this.liveTimer = 0;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.observer = null;
    this.highlighter?.destroy();
    this.effects?.destroy();
    this.overlay.destroy();
    this.overlay = null;
    this.highlighter = null;
    this.effects = null;
    this.index = null;
    this.spans = [];
    this.ranges = [];
    this.tones = [];
    this.current = -1;
    // Reopening searches lastQuery afresh (scroll, blink), not as a refresh of this session.
    this.query = '';
    if (how === 'silent') return;

    // Like the browser's find: leave the current match selected, and focus it if it's
    // inside a link or button so Enter activates it.
    if (ranges?.[0] && ranges[0].startContainer.isConnected) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(ranges[0]);
      const target = this.activatable(ranges[0]);
      if (target instanceof HTMLElement || target instanceof SVGElement) {
        target.focus({ preventScroll: true });
        return;
      }
    }
    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }

  /** Closes the bar and stops any reading, for good: this finder is being replaced. */
  destroy(): void {
    this.close('silent');
    if (this.speaking) this.stopReading();
  }

  /**
   * How matches on a light or dark background look: the active profile, with automatic
   * colors if on. By default, for the current match's background (or the page's).
   */
  private appearance(tone: PageTone = this.tones[this.current] ?? this.tone): Appearance {
    return appearanceForPage(this.settings, tone);
  }

  private applySettings(state: SettingsState): void {
    this.settings = state;
    this.highlighter?.setAppearance(this.appearance('light'), this.appearance('dark'));
    this.effects?.configure(this.appearance(), this.reducedMotion());
    this.overlay?.setPosition(state.prefs.barPosition);
  }

  private reducedMotion(): boolean {
    const pref = this.settings.prefs.motion;
    if (pref !== 'system') return pref === 'reduce';
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private onBarMessage(m: BarMessage): void {
    switch (m.t) {
      case 'ready':
        break;
      case 'search':
        this.search(m.query, m.options);
        break;
      case 'nav':
        this.navigate(m.dir);
        break;
      case 'goto':
        if (m.index >= 0 && m.index < this.spans.length) {
          window.clearTimeout(this.settleTimer);
          this.select(m.index, 'center', true);
          this.attention('current');
          this.autoRead();
        }
        break;
      case 'list':
        this.listOpen = m.open;
        this.sendResults();
        break;
      case 'size':
        this.overlay?.setBarSize(m.width, m.height);
        this.scheduleGeometry();
        break;
      case 'close':
        this.close(m.how);
        break;
      case 'activate':
        this.activate();
        break;
      case 'read':
        this.readAloud(undefined, true);
        break;
    }
  }

  /**
   * The text index, rebuilt when the page has changed. While typing, a recent but stale
   * index is reused and a refresh is scheduled instead, so keystrokes never wait on a
   * full rebuild more than once per REUSE_MIN_MS.
   */
  private ensureIndex(reason: 'typing' | 'refresh'): TextIndex {
    if (this.index && this.dirty === 'none') return this.index;
    if (this.index && reason === 'typing') {
      const age = performance.now() - this.indexBuiltAt;
      if (age < Math.max(REUSE_MIN_MS, this.indexCostMs * REUSE_COST_FACTOR)) {
        this.scheduleLiveUpdate();
        return this.index;
      }
    }
    const started = performance.now();
    const index = this.buildIndex();
    this.index = index;
    this.indexBuiltAt = performance.now();
    this.indexCostMs = this.indexBuiltAt - started;
    this.dirty = 'none';
    for (const root of index.shadowRoots) this.observeRoot(root);
    return index;
  }

  /** A fresh index of the page (or the configured root), leaving out our own overlay. */
  private buildIndex(): TextIndex {
    const host = this.overlay?.host;
    return buildTextIndex({
      root: this.config.root?.() ?? document.body ?? document.documentElement,
      getShadowRoot: closedShadowRoot,
      skip: (el) => el === host,
    });
  }

  private search(query: string, options: SearchOptions): void {
    const changed = query !== this.query || !sameOptions(options, this.options);
    this.query = query;
    this.options = options;
    this.lastQuery = query;
    this.runSearch(changed ? 'typing' : 'refresh');
  }

  /**
   * typing: the query changed; pick the match nearest the middle of the screen.
   * refresh: the page changed; keep the current match where possible, don't scroll.
   */
  private runSearch(reason: 'typing' | 'refresh'): void {
    const highlighter = this.highlighter;
    if (!highlighter) return;
    const anchor = reason === 'refresh' ? this.currentCenter() : null;
    const index = this.ensureIndex(reason);
    const { spans, capped } = findMatches(index, this.query, this.options, MAX_MATCHES);
    this.spans = spans;
    this.capped = capped;
    this.ranges = spans.map((s) => spanToRanges(index, s));
    this.tones = this.tonesOf(this.ranges);
    highlighter.setMatches(this.ranges, this.tones);
    window.clearTimeout(this.settleTimer);

    if (spans.length === 0) {
      this.current = -1;
      highlighter.setCurrent([]);
      this.effects?.show(null, null);
      this.sendResults();
      return;
    }
    const target = anchor ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const typing = reason === 'typing';
    // A refresh never reveals: the user may have closed a <details> on purpose.
    this.select(this.nearest(target.x, target.y), typing ? 'if-needed' : null, typing);
    if (reason === 'typing') {
      this.settleTimer = window.setTimeout(() => this.attention('all'), TYPING_SETTLE_MS);
    }
  }

  private navigate(dir: 1 | -1): void {
    const n = this.spans.length;
    if (n === 0) return;
    window.clearTimeout(this.settleTimer);
    this.select((this.current + dir + n) % n, 'center', true);
    this.attention('current');
    this.autoRead();
  }

  private select(i: number, scroll: ScrollMode | null, reveal: boolean): void {
    const index = this.index;
    const span = this.spans[i];
    const ranges = this.ranges[i];
    if (!index || !span || !ranges) return;
    this.current = i;
    if (reveal) this.reveal(revealTargets(index, span));
    this.highlighter?.setCurrent(ranges, this.tones[i]);
    // The box, magnifier and ring take the colors for the background this match is on.
    this.effects?.configure(this.appearance(), this.reducedMotion());
    this.effects?.show(ranges, contextText(index.text, span, MAGNIFIER_WORDS));
    if (scroll) {
      scrollIntoView(ranges, scroll, this.overlay?.chosenBox() ?? null);
      // Only when moving to a match: never while the user scrolls or changes a setting.
      this.overlay?.uncover(unionBox(lineBoxes(ranges)));
    }
    this.effects?.update();
    this.sendResults();
  }

  /** Opens closed <details> and hidden=until-found elements, as the browser's find does. */
  private reveal(elements: Element[]): void {
    for (const el of elements) {
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
      } else if (el.getAttribute('hidden')?.toLowerCase() === 'until-found') {
        el.dispatchEvent(new Event('beforematch', { bubbles: true }));
        el.removeAttribute('hidden');
      }
    }
  }

  /** Blinks and pings, unless the user asked for reduced motion. */
  private attention(scope: 'all' | 'current'): void {
    const highlighter = this.highlighter;
    if (!highlighter || this.current < 0 || this.reducedMotion()) return;
    const a = this.appearance();
    if (a.blink.enabled) {
      if (scope === 'all') {
        const context: Range[][] = [];
        const limit = Math.min(this.spans.length, BLINK_CONTEXT_LIMIT);
        for (let i = 0; i < limit; i++) context.push(this.contextRanges(i));
        highlighter.blinkAll(context, a.blink.count, a.blink.intervalMs);
      } else {
        highlighter.blinkCurrent(this.contextRanges(this.current), a.blink.count, a.blink.intervalMs);
      }
    }
    this.effects?.playPing();
  }

  /** The background each match is on, from the text it's in. Matches mostly share elements. */
  private tonesOf(all: Range[][]): PageTone[] {
    const seen = new Map<Element, PageTone>();
    return all.map((ranges) => {
      const node = ranges[0]?.startContainer;
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el) return this.tone;
      let tone = seen.get(el);
      if (!tone) {
        tone = textTone(el);
        seen.set(el, tone);
      }
      return tone;
    });
  }

  private contextRanges(i: number): Range[] {
    const index = this.index;
    const span = this.spans[i];
    const words = this.appearance().contextWords;
    if (!index || !span || words === 0) return [];
    const { before, after } = contextSpans(index.text, span, words);
    return [...before, ...after].flatMap((s) => spanToRanges(index, s));
  }

  /** Index of the match closest to a viewport point. Hidden matches count as far away. */
  private nearest(x: number, y: number): number {
    let best = 0;
    let bestDistance = Infinity;
    this.ranges.forEach((ranges, i) => {
      const r = ranges[0]?.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return;
      const dy = Math.abs(r.top + r.height / 2 - y);
      const dx = Math.abs(r.left + r.width / 2 - x);
      const distance = dy + dx * 0.1;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  private currentCenter(): { x: number; y: number } | null {
    const ranges = this.ranges[this.current];
    const box = ranges ? unionBox(lineBoxes(ranges)) : null;
    return box ? { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 } : null;
  }

  private sendResults(): void {
    const index = this.index;
    const span = this.spans[this.current];
    let items: MatchContext[] | null = null;
    if (this.listOpen && index) {
      items = this.spans.slice(0, LIST_LIMIT).map((s) => contextText(index.text, s, LIST_CONTEXT_WORDS));
    }
    const results: Results = {
      query: this.query,
      count: this.spans.length,
      current: this.current,
      capped: this.capped,
      context: span && index ? contextText(index.text, span, BAR_CONTEXT_WORDS) : null,
      items,
    };
    this.overlay?.post({ t: 'results', results });
  }

  /**
   * Reads aloud, or stops if something is being read. In the find bar: the current match's
   * sentence, else the text selected on the page, else that nothing was found. Elsewhere: the
   * text selected in a frame (`selection`) or on the page, or what's in the focused form
   * field, else the current match's sentence while the bar is open, else the sentence at the
   * caret (where the user last clicked). It always says something.
   */
  readAloud(selection?: string, fromBar = false): void {
    // Stop only what's really being read: if an end event got lost, read instead.
    if (this.speaking && isSpeaking()) {
      this.stopReading();
      return;
    }
    // The read aloud shortcut is the browser's, so it comes here even while the bar has focus.
    const inBar = fromBar || (this.overlay !== null && document.activeElement === this.overlay.host);
    void this.speakText(this.textToRead(selection, inBar));
  }

  private textToRead(given: string | undefined, inBar: boolean): string {
    const match = this.currentSentence();
    if (inBar && match) return match;
    const field = inBar ? null : focusedField();
    // A focused field's text, never the page selection: that could be a password's.
    const selected = given?.trim() || (field ? textInField(field) : (window.getSelection()?.toString() ?? '')).trim();
    if (selected) return selected;
    if (match) return match;
    if (!inBar) return (field ? null : this.caretSentence()) ?? NOTHING_TO_READ;
    const query = this.query.trim();
    return query ? `No results for “${query}”.` : NOTHING_TO_READ;
  }

  /** The sentence around the current match, while the find bar is open. */
  private currentSentence(): string | null {
    const span = this.spans[this.current];
    return this.overlay && span && this.index ? sentenceText(this.index.text, span) || null : null;
  }

  /** The sentence at the caret, which a click in the page's text leaves behind. */
  private caretSentence(): string | null {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (!selection?.isCollapsed || node?.nodeType !== Node.TEXT_NODE) return null;
    // Only kept up to date while the bar is open; otherwise built just for this.
    const index = this.overlay ? this.ensureIndex('refresh') : this.buildIndex();
    const at = positionOf(index, node, selection.anchorOffset);
    return at < 0 ? null : sentenceText(index.text, { start: at, end: at }) || null;
  }

  /** "Read each match aloud when I move to it." */
  private autoRead(): void {
    if (!this.settings.prefs.speech.autoRead) return;
    const sentence = this.currentSentence();
    if (sentence) void this.speakText(sentence);
  }

  private async speakText(text: string): Promise<void> {
    if (!speechAvailable()) return;
    this.setSpeaking(true);
    try {
      // While the find bar is closed, settings aren't kept up to date.
      const { speech } = (this.overlay ? this.settings : await readState()).prefs;
      if (!this.speaking) return; // Stopped while the settings loaded.
      const started = speak(text, {
        rate: speech.rate,
        voiceURI: speech.voiceURI,
        lang: document.documentElement.lang,
        onEnd: () => this.setSpeaking(false),
      });
      if (!started) this.setSpeaking(false);
      else if (!this.overlay) this.listenForEscape();
    } catch {
      this.setSpeaking(false); // The extension was updated or reloaded underneath this page.
    }
  }

  private setSpeaking(on: boolean): void {
    this.speaking = on;
    this.overlay?.post({ t: 'speaking', on });
    if (!on) this.stopOnEscape?.();
  }

  private stopReading(): void {
    stopSpeaking();
    this.setSpeaking(false);
  }

  /** Escape stops reading while the find bar is closed. With it open, Escape closes it, which stops too. */
  private listenForEscape(): void {
    if (this.stopOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.stopReading();
    };
    window.addEventListener('keydown', onKeyDown, true);
    this.stopOnEscape = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      this.stopOnEscape = null;
    };
  }

  /** The link or button the match is inside, if any. */
  private activatable(range: Range): Element | null {
    const node = range.startContainer;
    const el = node instanceof Element ? node : node.parentElement;
    return el?.closest('a[href], button, [role="button"], [role="link"], summary, label') ?? null;
  }

  private activate(): void {
    const range = this.ranges[this.current]?.[0];
    const target = range ? this.activatable(range) : null;
    this.close('silent');
    if (target instanceof HTMLElement) target.click();
  }

  private observe(): void {
    this.observed = new WeakSet();
    this.observer = new MutationObserver((records) => {
      let content = false;
      let attributes = false;
      let dialogs = false;
      for (const r of records) {
        if (r.type === 'childList') {
          const ours = [...r.addedNodes, ...r.removedNodes].every((n) => n === this.overlay?.host);
          if (!ours) content = true;
        } else if (r.type === 'characterData') {
          content = true;
        } else if (r.attributeName === 'hidden' || r.attributeName === 'open') {
          content = true;
          if (r.target instanceof HTMLDialogElement) dialogs = true;
        } else {
          attributes = true;
        }
      }
      if (dialogs) this.followModalDialogs();
      if (content) {
        this.dirty = 'content';
        this.scheduleLiveUpdate();
      } else if (attributes && this.dirty === 'none') {
        this.dirty = 'attributes';
      }
      this.scheduleGeometry();
    });
    this.observeRoot(document);
  }

  private observeRoot(root: Node): void {
    if (!this.observer || this.observed.has(root)) return;
    this.observed.add(root);
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
  }

  /**
   * Throttled, not debounced: a page that changes constantly (a clock, a feed) would
   * otherwise keep postponing the refresh forever.
   */
  private scheduleLiveUpdate(): void {
    if (!this.query || this.liveTimer) return;
    const wait = Math.max(LIVE_UPDATE_MS, this.indexCostMs * LIVE_UPDATE_COST_FACTOR);
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = 0;
      // Refreshing replaces the highlights, which would cut a blink short; wait for it.
      if (this.highlighter?.blinking) this.scheduleLiveUpdate();
      else this.runSearch('refresh');
    }, wait);
  }

  /** Keeps the overlay usable while a modal dialog is open (see Overlay.moveInto). */
  private followModalDialogs(): void {
    const modals = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal'));
    this.overlay?.moveInto(modals[modals.length - 1] ?? document.documentElement);
  }

  private scheduleGeometry(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.overlay?.applySize();
      this.effects?.update();
    });
  }

  private listen(): void {
    const on = <K extends keyof WindowEventMap>(
      type: K,
      handler: (e: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      window.addEventListener(type, handler, options);
      this.cleanups.push(() => window.removeEventListener(type, handler, options));
    };
    const geometry = () => this.scheduleGeometry();
    on('scroll', geometry, { capture: true, passive: true });
    on('resize', geometry, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', geometry);
      vv.addEventListener('scroll', geometry);
      this.cleanups.push(() => {
        vv.removeEventListener('resize', geometry);
        vv.removeEventListener('scroll', geometry);
      });
    }
    const raise = () => this.overlay?.raise();
    document.addEventListener('fullscreenchange', raise);
    this.cleanups.push(() => document.removeEventListener('fullscreenchange', raise));

    // Keys pressed while the page (not the find bar) has focus, like the browser's find.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    on(
      'keydown',
      (e) => {
        const mod = mac ? e.metaKey : e.ctrlKey;
        const next = e.key === 'F3' || (mod && !e.altKey && isLetterKey(e, 'g'));
        if (next && this.spans.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.navigate(e.shiftKey ? -1 : 1);
        } else if (!e.isComposing && !isAltGraph(e) && actionFor(e, this.settings.prefs.shortcuts) === 'readAloud') {
          // The find bar's read aloud key, when it isn't also the browser shortcut (which
          // never reaches the page).
          if (mac && typingTarget(e)) return; // ⌥ and a letter type a character in fields on macOS.
          e.preventDefault();
          e.stopImmediatePropagation();
          this.readAloud();
        }
      },
      { capture: true },
    );
    // Escape on the page closes the bar, unless the page used the key itself (to close a
    // menu, say) or the user is typing in a field, where Escape usually cancels something.
    on('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (!typingTarget(e)) this.close('escape');
    });

    // Layout can shift without scroll or resize events (images loading, animations).
    const poll = window.setInterval(() => {
      if (!this.alive()) {
        this.close('silent');
        return;
      }
      if (this.current >= 0) this.scheduleGeometry();
    }, 500);
    this.cleanups.push(() => window.clearInterval(poll));

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => this.applySettings(this.settings);
    motion.addEventListener('change', onMotion);
    this.cleanups.push(() => motion.removeEventListener('change', onMotion));

    // Many sites switch between light and dark with the system; re-check the page's tone.
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () =>
      window.setTimeout(() => {
        if (!this.overlay) return;
        this.tone = detectPageTone(this.config.root?.());
        this.applySettings(this.settings);
        this.overlay.post({ t: 'page', tone: this.tone });
      }, 300);
    scheme.addEventListener('change', onScheme);
    this.cleanups.push(() => scheme.removeEventListener('change', onScheme));
  }

  /** False once the extension was updated or reloaded underneath this content script. */
  alive(): boolean {
    try {
      return Boolean(browser.runtime?.id);
    } catch {
      return false;
    }
  }
}
