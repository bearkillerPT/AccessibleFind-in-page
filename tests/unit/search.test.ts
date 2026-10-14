import { beforeEach, describe, expect, it } from 'vitest';
import { buildTextIndex, type TextIndex } from '../../src/lib/search/text-index';
import {
  contextText,
  findMatches,
  positionOf,
  revealTargets,
  sentenceText,
  spanToRanges,
} from '../../src/lib/search/matcher';
import type { SearchOptions } from '../../src/lib/settings/types';

const OPTS: SearchOptions = { caseSensitive: false, matchDiacritics: false, wholeWord: false };

// happy-dom has no layout, so visibility comes from the `hidden` attribute and inline styles.
const isRendered = (el: Element) =>
  !(el as HTMLElement).hidden && (el as HTMLElement).style?.display !== 'none';
const isTextVisible = (el: Element) => (el as HTMLElement).style?.visibility !== 'hidden';

function index(
  html: string,
  setup?: (root: HTMLElement) => void,
  displayOf?: (el: Element) => string,
): TextIndex {
  document.body.innerHTML = html;
  setup?.(document.body);
  return buildTextIndex({ root: document.body, isRendered, isTextVisible, displayOf });
}

function find(idx: TextIndex, query: string, opts: Partial<SearchOptions> = {}) {
  return findMatches(idx, query, { ...OPTS, ...opts }, 1000).spans;
}

const rangeText = (idx: TextIndex, query: string, opts?: Partial<SearchOptions>) =>
  find(idx, query, opts).map((s) => spanToRanges(idx, s).map((r) => r.toString()).join('|'));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('text index', () => {
  it('collapses whitespace and separates blocks', () => {
    const idx = index('<p>  Hello\n   <b>world</b>  </p><p>again</p>');
    expect(idx.text).toBe('Hello world\nagain');
  });

  it('skips script, style and hidden subtrees', () => {
    const idx = index(
      '<p>shown</p><script>secret()</script><style>.x{}</style><div hidden>gone</div><div style="display:none">gone</div>',
    );
    expect(idx.text).toBe('shown');
  });

  it('skips visibility:hidden text but keeps visible children', () => {
    const idx = index('<div style="visibility:hidden">no <span style="visibility:visible">yes</span></div>');
    expect(idx.text).toBe('yes');
  });

  it('drops soft hyphens and zero-width spaces', () => {
    const idx = index('<p>hy\u00adphen\u200bation</p>');
    expect(find(idx, 'hyphenation')).toHaveLength(1);
  });
});

describe('layout', () => {
  // happy-dom doesn't make flex items block-level, as browsers do; this does.
  const withFlexItems = (el: Element) =>
    el.parentElement?.style.display === 'flex' ? 'block' : getComputedStyle(el).display;

  it('keeps the text of flex items apart, like the browser’s find', () => {
    const idx = index('<nav style="display:flex"><a>Home</a><a>About</a></nav>', undefined, withFlexItems);
    expect(idx.text).toBe('Home\nAbout');
    expect(find(idx, 'homeabout')).toHaveLength(0);
    expect(find(idx, 'about', { wholeWord: true })).toHaveLength(1);
  });

  it('starts a block at any block-level element, whatever its tag', () => {
    const idx = index('<p>left<span style="display:block">middle</span>right</p>');
    expect(idx.text).toBe('left\nmiddle\nright');
  });

  it('keeps the text of an inline block apart, but not an empty one', () => {
    expect(index('<p>alpha <span style="display:inline-block">beta</span> gamma</p>').text).toBe('alpha\nbeta\ngamma');
    expect(index('<p>alpha<span style="display:inline-flex"><b>beta</b></span>gamma</p>').text).toBe('alpha\nbeta\ngamma');
    // An icon between two words doesn't split them.
    expect(index('<p>Click <span style="display:inline-block"> </span> here</p>').text).toBe('Click here');
  });

  it('keeps ruby annotations inline', () => {
    const idx = index('<p>r <ruby>漢<rt>kan</rt></ruby> s</p>', undefined, (el) =>
      el.localName === 'ruby' ? 'ruby' : el.localName === 'rt' ? 'ruby-text' : getComputedStyle(el).display,
    );
    expect(idx.text).toBe('r 漢kan s');
  });
});

describe('matching', () => {
  it('finds text across inline elements', () => {
    const idx = index('<p>Hello <b>wor</b>ld</p>');
    expect(rangeText(idx, 'hello world')).toEqual(['Hello world']);
  });

  it('does not match across block boundaries', () => {
    const idx = index('<p>foo</p><p>bar</p>');
    expect(find(idx, 'foo bar')).toHaveLength(0);
    expect(find(idx, 'bar')).toHaveLength(1);
  });

  it('ignores case and accents by default', () => {
    const idx = index('<p>A AÇÃO começou</p>');
    expect(rangeText(idx, 'acao')).toEqual(['AÇÃO']);
    expect(rangeText(idx, 'comecou')).toEqual(['começou']);
  });

  it('respects case and accent options', () => {
    const idx = index('<p>Ação acao</p>');
    expect(find(idx, 'acao', { matchDiacritics: true })).toHaveLength(1);
    expect(find(idx, 'Acao', { caseSensitive: true })).toHaveLength(1);
    expect(find(idx, 'ACAO', { caseSensitive: true })).toHaveLength(0);
    expect(find(idx, 'Ação', { caseSensitive: true, matchDiacritics: true })).toHaveLength(1);
  });

  it('treats composed and decomposed accents as equal when matching accents', () => {
    const composed = index('<p>caf\u00e9 time</p>');
    const decomposed = index('<p>cafe\u0301 time</p>');
    for (const idx of [composed, decomposed]) {
      expect(find(idx, 'caf\u00e9', { matchDiacritics: true })).toHaveLength(1);
      expect(find(idx, 'cafe\u0301', { matchDiacritics: true })).toHaveLength(1);
      // "cafe" without the accent must not match half of "café".
      expect(find(idx, 'cafe', { matchDiacritics: true })).toHaveLength(0);
      expect(find(idx, 'cafe')).toHaveLength(1);
    }
  });

  it('keeps a decomposed accent inside the highlight', () => {
    const idx = index('<p>café time</p>');
    expect(rangeText(idx, 'cafe')).toEqual(['café']);
  });

  it('supports whole-word matching', () => {
    const idx = index('<p>cat concatenate cat.</p>');
    expect(find(idx, 'cat')).toHaveLength(3);
    expect(find(idx, 'cat', { wholeWord: true })).toHaveLength(2);
  });

  it('matches curly quotes with straight ones', () => {
    const idx = index('<p>the keeper\u2019s \u201clog\u201d</p>');
    expect(rangeText(idx, "keeper's")).toEqual(['keeper\u2019s']);
    expect(rangeText(idx, '"log"')).toEqual(['\u201clog\u201d']);
  });

  it('collapses whitespace in the query and trims it', () => {
    const idx = index('<p>one   two</p>');
    expect(find(idx, '  one \t two ')).toHaveLength(1);
  });

  it('handles characters outside the BMP', () => {
    const idx = index('<p>😀 smile 😀</p>');
    expect(rangeText(idx, 'smile')).toEqual(['smile']);
    expect(rangeText(idx, '😀')).toEqual(['😀', '😀']);
  });

  it('caps the number of matches', () => {
    const idx = index(`<p>${'a '.repeat(50)}</p>`);
    const res = findMatches(idx, 'a', OPTS, 10);
    expect(res.spans).toHaveLength(10);
    expect(res.capped).toBe(true);
  });

  it('still makes ranges after the page shortens an indexed text node', () => {
    // While typing, the finder may briefly reuse an index built before the page changed.
    const idx = index('<p>needle needle</p>');
    const spans = find(idx, 'needle');
    (document.querySelector('p')!.firstChild as Text).data = 'n';
    expect(() => spans.map((s) => spanToRanges(idx, s))).not.toThrow();
  });

  it('treats markup-looking text as text and never changes the DOM', () => {
    const idx = index('<pre>&lt;img src=x onerror="alert(1)"&gt; &lt;div&gt;</pre>');
    const before = document.body.innerHTML;
    expect(rangeText(idx, '<div>')).toEqual(['<div>']);
    expect(rangeText(idx, 'onerror')).toHaveLength(1);
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('shadow DOM and revealable content', () => {
  it('searches open shadow roots in rendered order, including slotted content', () => {
    const idx = index('<div id="host"><span>slotted</span></div><p>after</p>', () => {
      const host = document.getElementById('host')!;
      host.attachShadow({ mode: 'open' }).innerHTML = '<span>before </span><slot></slot><span> inside</span>';
    });
    expect(idx.text).toBe('before slotted inside\nafter');
    // The match crosses from the shadow tree into slotted light DOM: one Range per text node.
    expect(rangeText(idx, 'before slotted')).toEqual(['before |slotted']);
  });

  it('indexes closed <details> content and reports what to reveal', () => {
    const idx = index('<details><summary>Title</summary><p>Hidden text</p></details>');
    const [span] = find(idx, 'hidden');
    expect(span).toBeDefined();
    expect(revealTargets(idx, span!).map((el) => el.localName)).toEqual(['details']);
    const [summary] = find(idx, 'title');
    expect(revealTargets(idx, summary!)).toEqual([]);
  });

  it('indexes hidden=until-found content', () => {
    const idx = index('<div hidden="until-found">Later</div>');
    const [span] = find(idx, 'later');
    expect(span).toBeDefined();
    expect(revealTargets(idx, span!)).toHaveLength(1);
  });
});

describe('context', () => {
  it('returns words around the match within the block', () => {
    const idx = index('<p>one two three four five</p><p>six</p>');
    const [span] = find(idx, 'three');
    expect(contextText(idx.text, span!, 1)).toEqual({ before: 'two ', match: 'three', after: ' four' });
    const [five] = find(idx, 'five');
    expect(contextText(idx.text, five!, 3)).toEqual({ before: 'two three four ', match: 'five', after: '' });
  });
});

describe('sentence', () => {
  it('returns the sentence around a match, within its block', () => {
    const idx = index('<p>First one. The lighthouse is tall, about 22 m. Third!</p><p>Next block.</p>');
    const [span] = find(idx, 'lighthouse');
    expect(sentenceText(idx.text, span!)).toBe('The lighthouse is tall, about 22 m.');
  });

  it("doesn't split on decimals or abbreviations without a space", () => {
    const idx = index('<p>It costs 3.5 euros, e.g.the lighthouse tour.</p>');
    const [span] = find(idx, 'lighthouse');
    expect(sentenceText(idx.text, span!)).toBe('It costs 3.5 euros, e.g.the lighthouse tour.');
  });

  it('finds the sentence at a point in the page, like the caret after a click', () => {
    const idx = index('<p>First one. The <b>keeper</b> climbed the stairs. Third.</p>');
    const keeper = document.querySelector('b')!.firstChild!;
    const at = positionOf(idx, keeper, 2);
    expect(idx.text[at]).toBe('e');
    expect(sentenceText(idx.text, { start: at, end: at })).toBe('The keeper climbed the stairs.');
    expect(positionOf(idx, document.body, 0)).toBe(-1);
  });

  it('caps very long sentences', () => {
    const idx = index(`<p>${'word '.repeat(200)}needle ${'word '.repeat(200)}</p>`);
    const [span] = find(idx, 'needle');
    expect(sentenceText(idx.text, span!, 50).length).toBeLessThanOrEqual(50 * 2 + 'needle'.length);
  });
});
