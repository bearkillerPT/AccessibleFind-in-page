/**
 * Builds a flat, searchable copy of the page's visible text, with a map from every
 * character back to the DOM text node and offset it came from. Searching the flat text
 * finds matches that cross element boundaries ("Hello <b>world</b>"), and the map turns
 * them into DOM Ranges for highlighting. The page's DOM is only read, never changed.
 *
 * Traversal follows the rendered ("flat") tree: it enters open and closed shadow roots and
 * visits slotted content where it's displayed. Text that can be revealed, inside a closed
 * <details> or a hidden="until-found" element, is indexed and flagged so it can be opened
 * when a match inside it is selected, as Chrome's own find does.
 *
 * Like Chrome's find, text only runs on inside one box of the layout. Block-level elements,
 * flex and grid items, and inline blocks with text in them each make a block of their own,
 * so the links "Home" and "About" in a flex menu never match as "HomeAbout".
 */
import { U32Builder } from './u32';

export interface TextIndex {
  /**
   * Visible text, with whitespace runs collapsed to one space and '\n' between blocks.
   * '\n' never appears in a query, so matches can't cross from one block into the next.
   */
  text: string;
  nodes: Text[];
  /** Per UTF-16 unit of `text`: index into `nodes`, and the [start, end) offsets in that node. */
  nodeOf: Uint32Array;
  startOf: Uint32Array;
  endOf: Uint32Array;
  /** Per node: hidden ancestors to reveal before its text can be seen, or null. */
  revealOf: (readonly Element[] | null)[];
  /** Shadow roots met during traversal (to observe for changes and style). */
  shadowRoots: ShadowRoot[];
}

export interface BuildOptions {
  root: Node;
  /** Whether an element is rendered. Subtrees of unrendered elements are skipped. */
  isRendered?: (el: Element) => boolean;
  /** Whether text directly inside `el` is visible (children can undo visibility:hidden). */
  isTextVisible?: (el: Element) => boolean;
  /** The element's computed `display`, which decides where blocks of text begin and end. */
  displayOf?: (el: Element) => string;
  getShadowRoot?: (el: Element) => ShadowRoot | null;
  /** Elements to leave out entirely, such as the extension's own UI. */
  skip?: (el: Element) => boolean;
}

const SPACE = 32;
const NEWLINE = 10;

/** Elements whose text isn't shown, or can't be highlighted with a Range. */
const EXCLUDED = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'canvas', 'video', 'audio', 'img',
  'picture', 'source', 'track', 'input', 'textarea', 'select', 'datalist', 'map', 'param',
  // SVG elements that aren't painted directly.
  'desc', 'defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'metadata',
]);

/**
 * How an element's box affects the text around it:
 * - inline: its text runs on with its neighbors' (spans, links, ruby, display:contents).
 * - atomic: an inline box of its own (inline-block, inline-flex...). Its text is a block of
 *   its own, but an empty one, like an icon, doesn't split the words around it.
 * - block: always a block of its own. That includes flex and grid items, floats and
 *   positioned elements, which the browser makes block-level whatever their tag.
 */
type Flow = 'inline' | 'atomic' | 'block';

function flowOf(display: string): Flow {
  if (display === '' || display === 'inline' || display === 'contents' || display === 'math') return 'inline';
  if (display.startsWith('ruby')) return 'inline';
  // inline-block, inline-flex, inline-grid, inline-table, -webkit-inline-box...
  return display.includes('inline') ? 'atomic' : 'block';
}

function isSpace(c: number): boolean {
  return (
    c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000
  );
}

/** Invisible characters pages put inside words (hyphenation hints, zero-width spaces). */
function isIgnorable(c: number): boolean {
  return c === 0xad || c === 0x200b || c === 0x2060 || c === 0xfeff;
}

function defaultIsRendered(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') {
    if (el.checkVisibility()) return true;
    // display:contents (e.g. every <slot>) has no box of its own, but its children do.
    return getComputedStyle(el).display === 'contents';
  }
  return getComputedStyle(el).display !== 'none';
}

function defaultIsTextVisible(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') {
    if (el.checkVisibility({ visibilityProperty: true })) return true;
    // display:contents elements (and every <slot>) have no box, so checkVisibility() is
    // false, yet text directly inside them is shown. Unrendered ancestors were already
    // pruned by the traversal, so only visibility is left to check.
    const style = getComputedStyle(el);
    return style.display === 'contents' && style.visibility === 'visible';
  }
  return getComputedStyle(el).visibility !== 'hidden';
}

function isUntilFound(el: Element): boolean {
  return el.getAttribute('hidden')?.toLowerCase() === 'until-found';
}

/** Marks where an element that makes a block (or an inline box) ends. */
const CLOSE_BLOCK = { close: 'block' } as const;
const CLOSE_ATOMIC = { close: 'atomic' } as const;

type Task = { node: Node; reveal: readonly Element[] | null } | typeof CLOSE_BLOCK | typeof CLOSE_ATOMIC;

export function buildTextIndex(opts: BuildOptions): TextIndex {
  const isRendered = opts.isRendered ?? defaultIsRendered;
  const isTextVisible = opts.isTextVisible ?? defaultIsTextVisible;
  const displayOf = opts.displayOf ?? ((el: Element) => getComputedStyle(el).display);
  const getShadowRoot = opts.getShadowRoot ?? ((el: Element) => el.shadowRoot);
  const skip = opts.skip;

  const pieces: string[] = [];
  let last = NEWLINE; // Treat the start like a block boundary: no leading space.
  const nodeOf = new U32Builder(4096);
  const startOf = new U32Builder(4096);
  const endOf = new U32Builder(4096);
  const nodes: Text[] = [];
  const revealOf: (readonly Element[] | null)[] = [];
  const shadowRoots: ShadowRoot[] = [];
  const textVisible = new Map<Element, boolean>();
  /**
   * Inline boxes entered that have no text yet. Their text starts a block of its own when
   * it comes; one that ends empty leaves the words around it joined.
   */
  let pendingAtomics = 0;

  const map = (nodeIndex: number, start: number, end: number) => {
    nodeOf.push(nodeIndex);
    startOf.push(start);
    endOf.push(end);
  };

  const boundary = () => {
    if (last === NEWLINE) return;
    if (last === SPACE) {
      // The space is always its own piece; turn it into the boundary.
      pieces[pieces.length - 1] = '\n';
    } else {
      pieces.push('\n');
      const end = endOf.at(endOf.length - 1);
      map(nodeOf.at(nodeOf.length - 1), end, end);
    }
    last = NEWLINE;
  };

  const emitText = (node: Text, reveal: readonly Element[] | null) => {
    const data = node.data;
    if (!data) return;
    if (!reveal) {
      const parent = node.parentElement ?? (node.parentNode as ShadowRoot | null)?.host ?? null;
      if (parent) {
        let visible = textVisible.get(parent);
        if (visible === undefined) {
          visible = isTextVisible(parent);
          textVisible.set(parent, visible);
        }
        if (!visible) return;
      }
    }
    const ni = nodes.length;
    let used = false;
    const n = data.length;
    for (let i = 0; i < n; ) {
      const c = data.charCodeAt(i);
      if (isSpace(c)) {
        let j = i + 1;
        while (j < n && isSpace(data.charCodeAt(j))) j++;
        if (last !== SPACE && last !== NEWLINE) {
          pieces.push(' ');
          map(ni, i, i + 1);
          last = SPACE;
          used = true;
        }
        i = j;
        continue;
      }
      if (isIgnorable(c)) {
        i++;
        continue;
      }
      let j = i;
      while (j < n) {
        const d = data.charCodeAt(j);
        if (isSpace(d) || isIgnorable(d)) break;
        j++;
      }
      if (pendingAtomics) {
        boundary();
        pendingAtomics = 0;
      }
      pieces.push(data.slice(i, j));
      for (let k = i; k < j; k++) {
        const d = data.charCodeAt(k);
        if (d >= 0xd800 && d <= 0xdbff && k + 1 < j) {
          map(ni, k, k + 2);
          map(ni, k, k + 2);
          k++;
        } else {
          map(ni, k, k + 1);
        }
      }
      last = data.charCodeAt(j - 1);
      used = true;
      i = j;
    }
    if (used) {
      nodes.push(node);
      revealOf.push(reveal);
    }
  };

  const stack: Task[] = [{ node: opts.root, reveal: null }];
  const pushChildren = (parent: Node, reveal: readonly Element[] | null) => {
    for (let c = parent.lastChild; c; c = c.previousSibling) stack.push({ node: c, reveal });
  };

  while (stack.length) {
    const task = stack.pop()!;
    if ('close' in task) {
      // An inline box that's still pending had no text: nothing to separate.
      if (task.close === 'atomic' && pendingAtomics) pendingAtomics--;
      else boundary();
      continue;
    }
    const { node, reveal } = task;
    const type = node.nodeType;
    if (type === Node.TEXT_NODE) {
      emitText(node as Text, reveal);
      continue;
    }
    if (type === Node.DOCUMENT_NODE || type === Node.DOCUMENT_FRAGMENT_NODE) {
      pushChildren(node, reveal);
      continue;
    }
    if (type !== Node.ELEMENT_NODE) continue;

    const el = node as Element;
    const tag = el.localName;
    if (EXCLUDED.has(tag) || el.hasAttribute('inert') || skip?.(el)) continue;

    let childReveal = reveal;
    if (isUntilFound(el)) {
      childReveal = [...(reveal ?? []), el];
    } else if (!reveal && !isRendered(el)) {
      continue;
    }
    // Also catches display:none inside hidden-but-revealable content, where nothing is
    // rendered yet and isRendered can't tell.
    const display = displayOf(el);
    if (display === 'none') continue;

    if (tag === 'br') {
      boundary();
      continue;
    }
    const flow = flowOf(display);
    if (flow === 'block') {
      boundary();
      stack.push(CLOSE_BLOCK);
    } else if (flow === 'atomic') {
      pendingAtomics++;
      stack.push(CLOSE_ATOMIC);
    }

    const shadow = getShadowRoot(el);
    if (shadow) {
      shadowRoots.push(shadow);
      pushChildren(shadow, childReveal);
    } else if (tag === 'slot') {
      const assigned = (el as HTMLSlotElement).assignedNodes({ flatten: true });
      for (let i = assigned.length - 1; i >= 0; i--) stack.push({ node: assigned[i]!, reveal: childReveal });
    } else if (tag === 'details' && !(el as HTMLDetailsElement).open) {
      // The first <summary> is always shown; everything else opens with the <details>.
      const hidden = [...(childReveal ?? []), el];
      const summary = Array.from(el.children).find((c) => c.localName === 'summary') ?? null;
      for (let c = el.lastChild; c; c = c.previousSibling) {
        stack.push({ node: c, reveal: c === summary ? childReveal : hidden });
      }
    } else {
      pushChildren(el, childReveal);
    }
  }

  // Drop the boundary after the last block.
  if (last === NEWLINE && pieces.length > 0) {
    pieces.pop();
    nodeOf.pop();
    startOf.pop();
    endOf.pop();
  }

  return {
    text: pieces.join(''),
    nodes,
    nodeOf: nodeOf.finish(),
    startOf: startOf.finish(),
    endOf: endOf.finish(),
    revealOf,
    shadowRoots,
  };
}
