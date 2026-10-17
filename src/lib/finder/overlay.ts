/**
 * The extension's own layer on top of the page: one element holding a closed shadow root
 * with the visual effects and the find bar iframe. It's shown as a popover so it lives in
 * the browser's top layer, above the page's own stacking contexts and fullscreen content.
 */
import { browser } from 'wxt/browser';
import { CONNECT_MESSAGE, type BarMessage, type FinderMessage } from '../messages';
import type { BarPosition } from '../settings/types';
import { intersects, viewportBox, type Box } from './geometry';

const HOST_TAG = 'accessible-find-overlay';
const GAP = 12;

/** The sides of an edge to try, nearest first. */
const SIDES = {
  left: ['left', 'center', 'right'],
  center: ['center', 'right', 'left'],
  right: ['right', 'center', 'left'],
} as const;

/**
 * Where the bar may go when it would cover the current match, best first: along the same
 * edge, nearest first, then the same order along the other edge.
 */
export function placesFor(chosen: BarPosition): BarPosition[] {
  const [edge, side] = chosen.split('-') as ['top' | 'bottom', keyof typeof SIDES];
  const other = edge === 'top' ? 'bottom' : 'top';
  return [edge, other].flatMap((e) => SIDES[side].map((s) => `${e}-${s}` as BarPosition));
}

const HOST_STYLE: Record<string, string> = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
  'max-width': 'none',
  'max-height': 'none',
  'pointer-events': 'none',
  'z-index': '2147483647',
  display: 'block',
  opacity: '1',
  visibility: 'visible',
  transform: 'none',
  filter: 'none',
  'clip-path': 'none',
  contain: 'none',
};

const SHADOW_CSS = `
* { box-sizing: border-box; }
.layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.bar { position: fixed; pointer-events: auto; }
.bar iframe {
  display: block; border: 0; background: transparent; color-scheme: dark;
  border-radius: 16px; box-shadow: 0 10px 40px rgba(11, 16, 32, 0.45), 0 2px 8px rgba(11, 16, 32, 0.35);
}
.top-right { top: ${GAP}px; right: ${GAP}px; }
.top-left { top: ${GAP}px; left: ${GAP}px; }
.top-center { top: ${GAP}px; left: 50%; transform: translateX(-50%); }
.bottom-right { bottom: ${GAP}px; right: ${GAP}px; }
.bottom-left { bottom: ${GAP}px; left: ${GAP}px; }
.bottom-center { bottom: ${GAP}px; left: 50%; transform: translateX(-50%); }
`;

export interface OverlayHandlers {
  onMessage(message: BarMessage): void;
  /** The find bar loaded and the message channel is open. */
  onConnect(): void;
}

export class Overlay {
  readonly host: HTMLElement;
  /** Container for visual effects, under the find bar. */
  readonly layer: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly iframe: HTMLIFrameElement;
  private port: MessagePort | null = null;
  /** The find bar's size at the default text size, until it reports its own. */
  private size = { width: 640, height: 128 };
  /** Where the user put the bar. It leaves only to uncover the current match. */
  private position: BarPosition = 'top-right';

  constructor(private readonly handlers: OverlayHandlers) {
    this.host = document.createElement(HOST_TAG);
    for (const [prop, value] of Object.entries(HOST_STYLE)) {
      this.host.style.setProperty(prop, value, 'important');
    }
    // Closed, so page scripts can't reach the find bar iframe or read the search.
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    this.bar = document.createElement('div');
    this.bar.className = 'bar top-right';
    this.iframe = document.createElement('iframe');
    this.iframe.title = 'Accessible Find';
    this.iframe.setAttribute('allow', '');
    const nonce = crypto.randomUUID();
    this.iframe.src = `${browser.runtime.getURL('/findbar.html')}#${nonce}`;
    this.iframe.addEventListener('load', () => this.connect(nonce));
    this.bar.append(this.iframe);
    root.append(style, this.layer, this.bar);
    this.applySize();
    document.documentElement.append(this.host);
    this.raise();
  }

  /**
   * Hands the find bar a private MessagePort. The nonce in the iframe URL proves the
   * message comes from this script: the page shares our window, so it could post too,
   * but it can't see inside the closed shadow root to learn the nonce.
   */
  private connect(nonce: string): void {
    this.port?.close();
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (e: MessageEvent<BarMessage>) => this.handlers.onMessage(e.data);
    // Not new URL(src).origin: with use_dynamic_url, src has a per-session id, but the
    // document runs under the extension's real origin (chrome-extension://<id>, or
    // moz-extension://<this install's id> in Firefox).
    const origin = new URL(browser.runtime.getURL('/')).origin;
    this.iframe.contentWindow?.postMessage({ type: CONNECT_MESSAGE, nonce }, origin, [channel.port2]);
    this.handlers.onConnect();
  }

  post(message: FinderMessage): void {
    this.port?.postMessage(message);
  }

  focusBar(): void {
    this.iframe.focus();
    this.post({ t: 'focus' });
  }

  /**
   * Moves the overlay under `parent`. While a modal <dialog> is open, everything outside it
   * is inert (can't be clicked or focused), so the overlay has to live inside the dialog.
   * moveBefore() keeps the find bar iframe alive; a plain append would reload it.
   */
  moveInto(parent: Element): void {
    if (this.host.parentNode === parent) return;
    const move = (parent as Element & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
    try {
      if (typeof move === 'function') move.call(parent, this.host, null);
      else parent.append(this.host);
    } catch {
      parent.append(this.host);
    }
    this.raise();
  }

  /** Moves the overlay back to the top of the top layer (e.g. after a video goes fullscreen). */
  raise(): void {
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover();
      this.host.setAttribute('popover', 'manual');
      this.host.showPopover();
    } catch {
      // Without popover support the max z-index is the fallback.
    }
  }

  /** Moves the bar where the user put it, unless that's already where it belongs. */
  setPosition(position: BarPosition): void {
    // Settings arrive again with every change (a switch flipped in the bar), which mustn't
    // undo a move out of the match's way.
    if (position === this.position) return;
    this.position = position;
    this.place(position);
  }

  private place(position: BarPosition): void {
    this.bar.className = `bar ${position}`;
  }

  /** The bar's box at a position, at its current size. */
  private boxAt(position: BarPosition): Box {
    const view = viewportBox();
    const width = this.iframe.offsetWidth;
    const height = this.iframe.offsetHeight;
    const [edge, side] = position.split('-');
    const left = side === 'left' ? GAP : side === 'right' ? view.right - GAP - width : (view.right - width) / 2;
    const top = edge === 'top' ? GAP : view.bottom - GAP - height;
    return { left, top, right: left + width, bottom: top + height };
  }

  /** Where the bar is when it's where the user put it. */
  chosenBox(): Box {
    return this.boxAt(this.position);
  }

  /**
   * Like the browser's find bar: if the bar would cover `target` (the current match, which
   * the page couldn't scroll clear of it), moves it along the same edge, or else to the other
   * one. It goes back to where the user put it once that place is clear again.
   */
  uncover(target: Box | null): void {
    const clear = (position: BarPosition) => {
      if (!target) return true;
      const box = this.boxAt(position);
      const around = { left: box.left - GAP, top: box.top - GAP, right: box.right + GAP, bottom: box.bottom + GAP };
      return !intersects(around, target);
    };
    this.place(placesFor(this.position).find(clear) ?? this.position);
  }

  setBarSize(width: number, height: number): void {
    this.size = { width, height };
    this.applySize();
  }

  applySize(): void {
    const maxW = Math.max(240, window.innerWidth - GAP * 2);
    const maxH = Math.max(60, window.innerHeight - GAP * 2);
    this.iframe.style.width = `${Math.min(Math.ceil(this.size.width), maxW)}px`;
    this.iframe.style.height = `${Math.min(Math.ceil(this.size.height), maxH)}px`;
  }

  barBox(): Box {
    const r = this.iframe.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  destroy(): void {
    this.port?.close();
    this.port = null;
    this.host.remove();
  }
}
