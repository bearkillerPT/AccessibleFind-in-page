export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const boxWidth = (b: Box) => b.right - b.left;
export const boxHeight = (b: Box) => b.bottom - b.top;

/** Viewport boxes of the ranges, one per line of text. */
export function lineBoxes(ranges: readonly Range[]): Box[] {
  const boxes: Box[] = [];
  for (const range of ranges) {
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue;
      boxes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  boxes.sort((a, b) => a.top - b.top || a.left - b.left);
  // Inline elements inside a match produce several rects per line; merge them.
  const merged: Box[] = [];
  for (const b of boxes) {
    const prev = merged[merged.length - 1];
    const overlap = prev ? Math.min(prev.bottom, b.bottom) - Math.max(prev.top, b.top) : 0;
    if (prev && overlap > 0.5 * Math.min(boxHeight(prev), boxHeight(b)) && b.left <= prev.right + 6) {
      prev.left = Math.min(prev.left, b.left);
      prev.top = Math.min(prev.top, b.top);
      prev.right = Math.max(prev.right, b.right);
      prev.bottom = Math.max(prev.bottom, b.bottom);
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

export function unionBox(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((u, b) => ({
    left: Math.min(u.left, b.left),
    top: Math.min(u.top, b.top),
    right: Math.max(u.right, b.right),
    bottom: Math.max(u.bottom, b.bottom),
  }));
}

export function viewportBox(): Box {
  const vv = window.visualViewport;
  return {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth || window.innerWidth,
    bottom: vv ? Math.min(window.innerHeight, vv.height + vv.offsetTop) : window.innerHeight,
  };
}

export function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Parent in the rendered (flat) tree: through slots and out of shadow roots. */
function flatParent(node: Node): Element | null {
  const slot = (node as Element | Text).assignedSlot;
  if (slot) return slot;
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function isScrollContainer(el: Element): boolean {
  // The page's main scroller is scrolled through window.scrollBy. <body> can still be a
  // scroller of its own (html { overflow: hidden } body { overflow: auto; height: 100% }).
  if (el === document.scrollingElement) return false;
  const style = getComputedStyle(el);
  const scrolls = (v: string) => v === 'auto' || v === 'scroll' || v === 'overlay';
  return (
    (scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
    (scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 1)
  );
}

/**
 * The part of `view` that `cover` (the find bar) leaves free, on whichever side of it has
 * more room, when it spans `target` horizontally. A bar beside the target, or one that leaves
 * too little room, keeps the whole view.
 */
export function freeArea(view: Box, target: Box, cover: Box | null): Box {
  if (!cover || cover.right <= target.left || target.right <= cover.left) return view;
  const below = view.bottom - cover.bottom >= cover.top - view.top;
  const free = below ? { ...view, top: cover.bottom } : { ...view, bottom: cover.top };
  return boxHeight(free) >= Math.max(boxHeight(target) * 2, boxHeight(view) * 0.25) ? free : view;
}

export type ScrollMode = 'center' | 'if-needed';

/**
 * Scrolls every scroll container around the ranges, then the page, so the ranges end up
 * in view. "center" always centers vertically (a predictable place to look); "if-needed"
 * leaves alone a match that's already comfortably visible. On the page, that's the part
 * of the screen `cover` (the find bar) leaves free.
 */
export function scrollIntoView(ranges: readonly Range[], mode: ScrollMode, cover: Box | null = null): void {
  const first = ranges[0];
  if (!first) return;
  const scrollers: Element[] = [];
  for (let el = flatParent(first.startContainer); el; el = flatParent(el)) {
    if (isScrollContainer(el)) scrollers.push(el);
  }
  for (const s of scrollers) {
    const box = s.getBoundingClientRect();
    const view: Box = {
      left: box.left + s.clientLeft,
      top: box.top + s.clientTop,
      right: box.left + s.clientLeft + s.clientWidth,
      bottom: box.top + s.clientTop + s.clientHeight,
    };
    const delta = scrollDelta(ranges, view, mode);
    if (delta) s.scrollBy({ left: delta.x, top: delta.y, behavior: 'instant' });
  }
  const delta = scrollDelta(ranges, viewportBox(), mode, cover);
  if (delta) window.scrollBy({ left: delta.x, top: delta.y, behavior: 'instant' });
}

function scrollDelta(
  ranges: readonly Range[],
  whole: Box,
  mode: ScrollMode,
  cover: Box | null = null,
): { x: number; y: number } | null {
  const target = unionBox(lineBoxes(ranges));
  if (!target) return null;
  const view = freeArea(whole, target, cover);
  const viewH = boxHeight(view);
  const margin = viewH * 0.2;
  let y = 0;
  const comfortable = target.top >= view.top + margin && target.bottom <= view.bottom - margin;
  if (mode === 'center' || !comfortable) {
    y = boxHeight(target) > viewH * 0.8
      ? target.top - view.top - margin
      : (target.top + target.bottom) / 2 - (view.top + view.bottom) / 2;
  }
  let x = 0;
  if (target.left < view.left) x = target.left - view.left - 24;
  else if (target.right > view.right) x = Math.min(target.right - view.right + 24, target.left - view.left - 24);
  if (Math.abs(x) < 1 && Math.abs(y) < 1) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
