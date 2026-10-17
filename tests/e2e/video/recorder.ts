/** Films the browser for the demo video, and notes what the editing should do over it. */
import type { CDPSession, Frame, Locator, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Line } from './narration';

/** The page, in CSS pixels. The video shows it 1.5 times as large, so 1920×1080. */
export const VIEW = { width: 1280, height: 720 };
/** Device pixels per CSS pixel: enough to zoom in 1.5 times and stay sharp. */
export const SCALE = 2.25;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const now = () => Date.now() / 1000;

/** Where the camera looks (a point on the page, in CSS pixels) and how close. */
export interface Camera {
  cx: number;
  cy: number;
  zoom: number;
}
/** The bottom of the video the subtitles cover, in output pixels; framing keeps clear of it. */
const SUBTITLES = 190;
/** Output pixels per page pixel with the camera all the way out. */
const K = 1920 / VIEW.width;

/** A narrow field of view: what's left visible around (x, y), on the page. `a` (0 to 1) is how strongly the rest is veiled (see compose.ts). */
export interface Mask {
  x: number;
  y: number;
  r: number;
  a: number;
}
export const WHOLE_PAGE: Camera = { cx: VIEW.width / 2, cy: VIEW.height / 2, zoom: 1 };
export const NO_MASK: Mask = { x: VIEW.width / 2, y: VIEW.height / 2, r: 1600, a: 0 };

/** A change that starts at `t` and takes `seconds` to get to `to`. */
export interface Move<T> {
  t: number;
  seconds: number;
  to: T;
}

export interface Scene {
  name: string;
  from: number;
  to: number;
  camera: Move<Camera>[];
  mask: Move<Mask>[];
  keys: { t: number; label: string }[];
  lines: { t: number; line: Line }[];
}

export interface Shot {
  t: number;
  file: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Recorder {
  readonly shots: Shot[] = [];
  readonly scenes: Scene[] = [];
  private scene: Scene | null = null;
  private cdp: CDPSession | null = null;
  private readonly writes: Promise<void>[] = [];

  constructor(private readonly dir: string) {}

  /** Films `page` from now on (a new page, or the same one after it navigated). */
  async watch(page: Page): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    await this.cdp?.detach().catch(() => {});
    await page.bringToFront();
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', (frame) => {
      const file = path.join(this.dir, `shot-${String(this.shots.length).padStart(6, '0')}.jpg`);
      this.shots.push({ t: now(), file });
      this.writes.push(writeFile(file, Buffer.from(frame.data, 'base64')));
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: Math.round(VIEW.width * SCALE),
      maxHeight: Math.round(VIEW.height * SCALE),
    });
    this.cdp = cdp;
    await sleep(500);
  }

  /** One scene of the video. What happens between scenes (setting things up) is cut. */
  async film(name: string, action: () => Promise<void>): Promise<void> {
    this.scene = { name, from: now(), to: 0, camera: [], mask: [], keys: [], lines: [] };
    await action();
    this.scene.to = now();
    this.scenes.push(this.scene);
    this.scene = null;
  }

  private get current(): Scene {
    if (!this.scene) throw new Error('Only inside film()');
    return this.scene;
  }

  camera(to: Camera, seconds = 0.9): void {
    this.current.camera.push({ t: now(), seconds, to });
  }

  /** Moves the camera to show `box` (CSS pixels) above the subtitles, as close as `zoom` allows. */
  frame(box: Box, zoom: number, seconds = 0.9, pad = 40): void {
    const free = VIEW.height - SUBTITLES / K;
    const z = Math.max(1, Math.min(zoom, VIEW.width / (box.width + pad * 2), free / (box.height + pad * 2)));
    // Centered in the part of the screen above the subtitles.
    const cy = box.y + box.height / 2 + SUBTITLES / K / z / 2;
    this.camera({ cx: box.x + box.width / 2, cy, zoom: z }, seconds);
  }

  mask(to: Mask, seconds = 0.9): void {
    this.current.mask.push({ t: now(), seconds, to });
  }

  /** Shows the key being pressed, as keycaps. */
  key(label: string): void {
    this.current.keys.push({ t: now(), label });
  }

  /** Starts a narration line; the promise ends with it, plus a breath. */
  say(line: Line): Promise<void> {
    this.current.lines.push({ t: now(), line });
    return sleep(line.seconds * 1000 + 500);
  }

  async done(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    await Promise.all(this.writes);
  }
}

/** The find bar's frame on the page, in CSS pixels. */
export async function frameBox(bar: Frame): Promise<Box> {
  const box = await (await bar.frameElement()).boundingBox();
  if (!box) throw new Error('The find bar is not on screen');
  return box;
}

/** The current match on the page, in CSS pixels. */
export async function currentMatch(page: Page): Promise<Box | null> {
  // While it blinks, the current match is unhighlighted every other 400 ms or so.
  for (let tries = 0; tries < 10; tries++) {
    const box = await currentMatchNow(page);
    if (box) return box;
    await sleep(100);
  }
  return null;
}

function currentMatchNow(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const ranges = ['accessible-find-current', 'accessible-find-current-dark'].flatMap(
      (name) => [...(CSS.highlights.get(name) ?? [])] as Range[],
    );
    const rects = ranges.flatMap((r) => [...r.getClientRects()]);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    return {
      x: left,
      y: top,
      width: Math.max(...rects.map((r) => r.right)) - left,
      height: Math.max(...rects.map((r) => r.bottom)) - top,
    };
  });
}

export const centerOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** A pointer drawn in the page or the find bar (headless Chrome shows none), moved onto a target. */
export async function pointAt(where: Page | Frame, target: Locator): Promise<void> {
  const to = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await pointTo(where, to);
}

/** The pointer onto a point of `where`, in its CSS pixels. */
export async function pointTo(where: Page | Frame, to: { x: number; y: number }): Promise<void> {
  await where.evaluate(({ x, y }) => {
    let pointer = document.getElementById('demo-pointer');
    if (!pointer) {
      pointer = document.createElement('img');
      pointer.id = 'demo-pointer';
      (pointer as HTMLImageElement).src =
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="34" viewBox="0 0 30 34">' +
            '<path d="M3 2v26l7-7 5 11 5-2-5-11h10z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>',
        );
      Object.assign(pointer.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '2147483647',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
        transform: `translate(${innerWidth - 60}px, ${y + 40}px)`,
      });
      document.documentElement.append(pointer);
      pointer.getBoundingClientRect(); // So the first move glides too.
      pointer.style.transition = 'transform 500ms cubic-bezier(0.3, 0.7, 0.3, 1), opacity 200ms';
    }
    pointer.style.opacity = '1';
    // The arrow's tip is 3 px in.
    pointer.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
  }, to);
  await sleep(600);
}

export async function hidePointer(where: Page | Frame): Promise<void> {
  await where.evaluate(() => document.getElementById('demo-pointer')?.style.setProperty('opacity', '0'));
}
