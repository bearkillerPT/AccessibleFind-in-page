import { foldString, foldText, unitLength, type FoldedText } from './fold';
import type { TextIndex } from './text-index';
import type { SearchOptions } from '../settings/types';

/** A match as [start, end) positions in `TextIndex.text`. */
export interface Span {
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}\p{M}_]/u;
const MARK = /\p{M}/u;
const WHITESPACE_RUN = /\s+/g;
/** Invisible characters pages put inside words; the text index leaves them out too. */
const IGNORABLE = /[\u00ad\u200b\u2060\ufeff]/g;

/** What the user typed, prepared the same way as the page text. Empty means "no search". */
export function normalizeQuery(query: string, o: SearchOptions): string {
  const collapsed = query.replace(IGNORABLE, '').replace(WHITESPACE_RUN, ' ').trim();
  return foldString(collapsed, o);
}

/** Folded copies of the index text, cached per fold option combination. */
const foldCache = new WeakMap<TextIndex, Map<string, FoldedText>>();

export function foldedFor(index: TextIndex, o: SearchOptions): FoldedText {
  let byKey = foldCache.get(index);
  if (!byKey) foldCache.set(index, (byKey = new Map()));
  const key = `${o.caseSensitive}/${o.matchDiacritics}`;
  let folded = byKey.get(key);
  if (!folded) byKey.set(key, (folded = foldText(index.text, o)));
  return folded;
}

function charBefore(s: string, i: number): string {
  if (i <= 0) return '';
  const c = s.charCodeAt(i - 1);
  if (c >= 0xdc00 && c <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s[i - 1]!;
}

function charAt(s: string, i: number): string {
  if (i >= s.length) return '';
  return s.slice(i, i + unitLength(s, i));
}

export interface MatchResult {
  spans: Span[];
  /** True when there were more matches than `limit`. */
  capped: boolean;
}

export function findMatches(index: TextIndex, query: string, o: SearchOptions, limit: number): MatchResult {
  const q = normalizeQuery(query, o);
  if (!q) return { spans: [], capped: false };
  const { folded, foldToSource, vanished } = foldedFor(index, o);
  const text = index.text;
  const checkLeft = o.wholeWord && WORD.test(charAt(q, 0));
  const checkRight = o.wholeWord && WORD.test(charBefore(q, q.length));

  const spans: Span[] = [];
  let from = 0;
  for (;;) {
    const i = folded.indexOf(q, from);
    if (i < 0) break;
    const j = i + q.length;
    if ((checkLeft && WORD.test(charBefore(folded, i))) || (checkRight && WORD.test(charAt(folded, j)))) {
      from = i + 1;
      continue;
    }
    // With accents matched, text is decomposed: "café" is "cafe" + a combining accent.
    // A match ending right before an accent would split a letter ("cafe" in "café").
    if (o.matchDiacritics && MARK.test(charAt(folded, j))) {
      from = i + 1;
      continue;
    }
    if (spans.length === limit) return { spans, capped: true };
    const start = foldToSource[i]!;
    const lastStart = foldToSource[j - 1]!;
    let end = lastStart + unitLength(text, lastStart);
    // Take along accents that folded away, so a highlight never splits a letter from its accent.
    while (end < text.length && vanished[end]) end += unitLength(text, end);
    spans.push({ start, end });
    from = j;
  }
  return { spans, capped: false };
}

/** Up to `words` whitespace-separated words on each side of a span, within its block. */
export function contextSpans(text: string, span: Span, words: number): { before: Span[]; after: Span[] } {
  const before: Span[] = [];
  const after: Span[] = [];
  let k = span.start;
  for (let w = 0; w < words; w++) {
    while (k > 0 && text[k - 1] === ' ') k--;
    if (k === 0 || text[k - 1] === '\n') break;
    const end = k;
    while (k > 0 && text[k - 1] !== ' ' && text[k - 1] !== '\n') k--;
    before.unshift({ start: k, end });
  }
  k = span.end;
  for (let w = 0; w < words; w++) {
    while (k < text.length && text[k] === ' ') k++;
    if (k >= text.length || text[k] === '\n') break;
    const start = k;
    while (k < text.length && text[k] !== ' ' && text[k] !== '\n') k++;
    after.push({ start, end: k });
  }
  return { before, after };
}

export interface MatchContext {
  before: string;
  match: string;
  after: string;
}

/** The match with a few words around it, as plain text, for the magnifier and the find bar. */
export function contextText(text: string, span: Span, words: number): MatchContext {
  const { before, after } = contextSpans(text, span, words);
  const from = before[0]?.start ?? span.start;
  const to = after[after.length - 1]?.end ?? span.end;
  return {
    before: text.slice(from, span.start),
    match: text.slice(span.start, span.end),
    after: text.slice(span.end, to),
  };
}

/** Characters that end a sentence. */
const SENTENCE_END = /[.!?…。！？]/;

/**
 * The sentence containing a span, for reading aloud: from the previous sentence end (or
 * block start) to the next one, at most `maxChars` on each side of the match.
 */
export function sentenceText(text: string, span: Span, maxChars = 200): string {
  let start = span.start;
  const minStart = Math.max(0, span.start - maxChars);
  while (start > minStart) {
    const c = text[start - 1]!;
    if (c === '\n') break;
    // A sentence end counts only when followed by a space: "3.5" or "e.g" don't split.
    if (SENTENCE_END.test(c) && text[start] === ' ') break;
    start--;
  }
  let end = span.end;
  const maxEnd = Math.min(text.length, span.end + maxChars);
  while (end < maxEnd) {
    const c = text[end]!;
    if (c === '\n') break;
    end++;
    if (SENTENCE_END.test(c) && (end >= text.length || text[end] === ' ' || text[end] === '\n')) break;
  }
  return text.slice(start, end).trim();
}

/**
 * DOM Ranges covering a span. Usually one; a match that crosses into or out of a shadow
 * tree gets one Range per text node, because a single Range can't span DOM trees.
 *
 * While typing, a slightly stale index can be reused (see Finder.ensureIndex), and the page
 * may have shortened a text node since it was built. Offsets are kept within the node, so
 * the highlight is briefly off until the next refresh instead of the search failing.
 */
export function spanToRanges(index: TextIndex, span: Span): Range[] {
  const firstNode = index.nodeOf[span.start]!;
  const lastNode = index.nodeOf[span.end - 1]!;
  const root = index.nodes[firstNode]!.getRootNode();
  let sameTree = true;
  for (let n = firstNode + 1; n <= lastNode && sameTree; n++) {
    sameTree = index.nodes[n]!.getRootNode() === root;
  }
  const range = (startNode: number, start: number, endNode: number, end: number) => {
    const a = index.nodes[startNode]!;
    const b = index.nodes[endNode]!;
    const r = new Range();
    r.setStart(a, Math.min(start, a.length));
    r.setEnd(b, Math.min(end, b.length));
    return r;
  };
  if (sameTree) {
    return [range(firstNode, index.startOf[span.start]!, lastNode, index.endOf[span.end - 1]!)];
  }
  const ranges: Range[] = [];
  let i = span.start;
  while (i < span.end) {
    const node = index.nodeOf[i]!;
    let j = i;
    while (j + 1 < span.end && index.nodeOf[j + 1] === node) j++;
    ranges.push(range(node, index.startOf[i]!, node, index.endOf[j]!));
    i = j + 1;
  }
  return ranges;
}

/**
 * Where a point in the page (like the caret, after a click) falls in `index.text`, or -1 if
 * its text isn't indexed.
 */
export function positionOf(index: TextIndex, node: Node, offset: number): number {
  const n = index.nodes.indexOf(node as Text);
  if (n < 0) return -1;
  let last = -1;
  for (let i = 0; i < index.nodeOf.length; i++) {
    if (index.nodeOf[i] !== n) continue;
    if (index.startOf[i]! >= offset) return i;
    last = i;
  }
  return last;
}

/** Hidden ancestors (closed <details>, hidden=until-found) that must open to show a span. */
export function revealTargets(index: TextIndex, span: Span): Element[] {
  const out = new Set<Element>();
  const firstNode = index.nodeOf[span.start]!;
  const lastNode = index.nodeOf[span.end - 1]!;
  for (let n = firstNode; n <= lastNode; n++) {
    for (const el of index.revealOf[n] ?? []) out.add(el);
  }
  return [...out];
}
