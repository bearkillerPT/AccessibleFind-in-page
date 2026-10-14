/**
 * Case and diacritic folding, so "acao" finds "Ação" like the browser's own find does.
 * Folding can change length ("ß" stays one unit, "ﬁ" becomes "fi", a combining accent
 * disappears), so folded text carries a map back to positions in the unfolded text.
 */
import { U32Builder } from './u32';

export interface FoldOptions {
  caseSensitive: boolean;
  matchDiacritics: boolean;
}

const MARKS = /\p{M}/gu;
/** Typographic quotes match the straight ones people type: "keeper's" finds "keeper’s". */
const SINGLE_QUOTES = /[\u2018\u2019\u201b\u02bc\u2032]/g;
const DOUBLE_QUOTES = /[\u201c\u201d\u201f\u2033]/g;
const cache = new Map<string, string>();

/** Folds one code point (1 or 2 UTF-16 units). May return '' or several units. */
export function foldChar(ch: string, o: FoldOptions): string {
  const key = `${o.caseSensitive ? 'C' : 'c'}${o.matchDiacritics ? 'D' : 'd'}${ch}`;
  let out = cache.get(key);
  if (out === undefined) {
    out = o.caseSensitive ? ch : ch.toLowerCase();
    // Decompose either way, so "é" typed as one character matches "e" + combining accent
    // in the page (common in text that came from macOS) and vice versa.
    out = o.matchDiacritics ? out.normalize('NFD') : out.normalize('NFKD').replace(MARKS, '');
    out = out.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
    if (cache.size > 5000) cache.clear();
    cache.set(key, out);
  }
  return out;
}

export function foldString(s: string, o: FoldOptions): string {
  let out = '';
  for (const ch of s) out += foldChar(ch, o);
  return out;
}

export interface FoldedText {
  folded: string;
  /** For each unit of `folded`, the index in the source text where its character starts. */
  foldToSource: Uint32Array;
  /** 1 where the source character folded away to nothing (e.g. a combining accent). */
  vanished: Uint8Array;
}

export const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
export const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** Length in UTF-16 units of the character starting at `i`. */
export function unitLength(text: string, i: number): number {
  return isHighSurrogate(text.charCodeAt(i)) && isLowSurrogate(text.charCodeAt(i + 1)) ? 2 : 1;
}

export function foldText(text: string, o: FoldOptions): FoldedText {
  const n = text.length;
  const vanished = new Uint8Array(n);
  const map = new U32Builder(n + 16);
  const codes: number[] = [];
  for (let i = 0; i < n; ) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      codes.push(!o.caseSensitive && c >= 65 && c <= 90 ? c + 32 : c);
      map.push(i);
      i++;
      continue;
    }
    const len = unitLength(text, i);
    const out = foldChar(text.slice(i, i + len), o);
    if (out.length === 0) {
      vanished[i] = 1;
      if (len === 2) vanished[i + 1] = 1;
    }
    for (let k = 0; k < out.length; k++) {
      codes.push(out.charCodeAt(k));
      map.push(i);
    }
    i += len;
  }
  return { folded: fromCodes(codes), foldToSource: map.finish(), vanished };
}

function fromCodes(codes: number[]): string {
  const CHUNK = 8192;
  let s = '';
  for (let i = 0; i < codes.length; i += CHUNK) {
    s += String.fromCharCode(...codes.slice(i, i + CHUNK));
  }
  return s;
}
