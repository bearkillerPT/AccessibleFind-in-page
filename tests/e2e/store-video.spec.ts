/**
 * Records the demo video for the Chrome Web Store listing (upload it to YouTube): the real
 * extension, taken through its main features, with a caption for each.
 * Only runs when STORE_VIDEO is set:  npm run store-video  (writes store/demo.mp4, needs ffmpeg)
 */
import { chromium, type CDPSession, type Frame, type Locator, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, findBar, goto, launch, openViaCommand, test as base } from './harness';
import { dataUrl, ICON_EDGE, marked, NIGHT, render, setEffects, setPrefs } from './store-art';

const OUT = process.env.STORE_VIDEO;
const exec = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const VIDEO = { width: 1920, height: 1080 };
const FPS = 30;
/** Crossfade between scenes, in seconds. */
const FADE = 0.4;
/** The browser's page, in CSS pixels, shown 1.4 times as large in the video. */
const SCALE = 1.4;
const VIEW = { width: 1200, height: 660 };
const WINDOW = {
  left: 120,
  top: 156,
  width: Math.round(VIEW.width * SCALE),
  height: Math.round(VIEW.height * SCALE),
  radius: 22,
};

const test = base.extend({
  // The screencast sends device pixels only when Chrome itself is scaled; Playwright's own
  // deviceScaleFactor would be lost on the way.
  context: async ({}, use) => {
    const context = await launch({
      headless: true,
      viewport: null,
      args: [`--force-device-scale-factor=${SCALE}`, `--window-size=${VIEW.width},${VIEW.height}`, '--hide-scrollbars'],
    });
    await use(context);
    await context.close();
  },
});
test.skip(!OUT, 'Set STORE_VIDEO=<dir> to record the demo video');

/** Sizes the window so the page inside it is VIEW (to a pixel: scaling rounds). */
async function fitWindow(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 3; i++) {
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    const inner = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (inner.width === VIEW.width && inner.height === VIEW.height) break;
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        width: bounds.width! + VIEW.width - inner.width,
        height: bounds.height! + VIEW.height - inner.height,
      },
    });
  }
  await cdp.detach();
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  expect(Math.abs(inner[0]! - VIEW.width) + Math.abs(inner[1]! - VIEW.height)).toBeLessThanOrEqual(1);
}

interface Shot {
  t: number;
  file: string;
}
interface Clip {
  from: number;
  to: number;
  title: string;
  subtitle: string;
}

/** Keeps every frame Chrome paints, with when it came, and which stretches make the video. */
class Recorder {
  readonly shots: Shot[] = [];
  readonly clips: Clip[] = [];
  private readonly writes: Promise<void>[] = [];
  private cdp: CDPSession | null = null;

  constructor(private readonly dir: string) {}

  /** Films `page` from now on (a new page, or the same one after it navigated). */
  async watch(page: Page): Promise<void> {
    await this.cdp?.detach().catch(() => {});
    await page.bringToFront();
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', (frame) => {
      const file = path.join(this.dir, `${String(this.shots.length).padStart(6, '0')}.jpg`);
      this.shots.push({ t: Date.now() / 1000, file });
      this.writes.push(writeFile(file, Buffer.from(frame.data, 'base64')));
      void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 95,
      maxWidth: WINDOW.width,
      maxHeight: WINDOW.height,
    });
    this.cdp = cdp;
    await sleep(400);
  }

  /** One scene: `action`, filmed under a caption. What happens between scenes is cut. */
  async clip(title: string, subtitle: string, action: () => Promise<void>): Promise<void> {
    const from = Date.now() / 1000;
    await action();
    this.clips.push({ from, to: Date.now() / 1000, title, subtitle });
  }

  async done(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    await Promise.all(this.writes);
  }
}

/** A pointer drawn in the page or the find bar (headless Chrome shows none), moved onto `target`. */
async function pointAt(where: Page | Frame, target: Locator): Promise<void> {
  const to = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
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

async function click(where: Page | Frame, target: Locator): Promise<void> {
  await pointAt(where, target);
  await target.click();
}

async function hidePointer(where: Page | Frame): Promise<void> {
  await where.evaluate(() => document.getElementById('demo-pointer')?.style.setProperty('opacity', '0'));
}

test('demo video', async ({ context, page, sw }) => {
  test.setTimeout(10 * 60_000);
  // Absolute: ffmpeg reads the frames' paths relative to its list file.
  const work = path.resolve(OUT!, '.video');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const rec = new Recorder(work);

  await setPrefs(sw, { theme: 'dark', uiScale: 1.25, barPosition: 'top-right' });
  await setEffects(sw, {});
  await goto(page, 'article.html');
  await fitWindow(page);
  await rec.watch(page);

  let bar!: Frame;
  const input = () => bar.getByRole('textbox', { name: 'Find in page' });
  const gear = () => bar.getByRole('button', { name: 'Quick settings' });

  await rec.clip('Press *Ctrl+F* and type', 'Every match lights up in big, bright colors.', async () => {
    await sleep(800);
    await openViaCommand(sw, page);
    bar = await findBar(page);
    await sleep(600);
    await input().pressSequentially('lighthouse', { delay: 150 });
    await sleep(2800);
  });

  await rec.clip('*Enter* for the next match', 'A ring closes in on it, to catch your eye.', async () => {
    for (let i = 0; i < 3; i++) {
      await input().press('Enter');
      await sleep(1500);
    }
  });

  await rec.clip('Extra help to *spot the match*', 'Turn on a spotlight, a magnifier or guide lines, right from the find bar.', async () => {
    await click(bar, gear());
    await sleep(500);
    for (const name of ['Spotlight', 'Magnifier', 'Guide lines']) {
      await click(bar, bar.getByRole('switch', { name }));
      await sleep(500);
    }
    await click(bar, gear());
    await hidePointer(bar);
    for (let i = 0; i < 2; i++) {
      await input().press('Enter');
      await sleep(2000);
    }
  });

  await rec.clip('Every match, in *large text*', 'Press Alt+L, then move through them with the arrow keys.', async () => {
    await input().press('Alt+l');
    await sleep(1400);
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
      await input().press(key);
      await sleep(1200);
    }
    await input().press('Alt+l');
    await sleep(600);
  });

  await rec.clip('Text as *big* as you need', 'From 100% to 300%, in a light or a dark theme.', async () => {
    await sleep(400);
    for (const uiScale of [1.75, 2.5]) {
      await setPrefs(sw, { uiScale });
      await sleep(1400);
    }
    await setPrefs(sw, { theme: 'light' });
    await sleep(1500);
    await setPrefs(sw, { uiScale: 1.25 });
    await sleep(1300);
  });

  // The same article as a dark website shows it; automatic style picks the colors.
  await setPrefs(sw, { theme: 'dark' });
  await setEffects(sw, { magnifier: { enabled: true, fontSize: 32 } });
  await goto(page, 'article.html');
  await page.addStyleTag({
    content: 'body{background:#14161b;color:#d9dde6} header{background:#05070c} .meta{color:#9aa3b5}',
  });
  await rec.watch(page);
  await rec.clip('Made for *dark pages* too', 'Matches on dark backgrounds switch to colors that stand out.', async () => {
    await sleep(700);
    await openViaCommand(sw, page);
    bar = await findBar(page);
    await sleep(500);
    await input().pressSequentially('cliff', { delay: 150 });
    await sleep(2600);
    await input().press('Enter');
    await sleep(2200);
  });

  await setPrefs(sw, { theme: 'light' });
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  await fitWindow(settings);
  await rec.watch(settings);
  await rec.clip('Colors that *work for you*', 'High-contrast and colour-blind-friendly profiles, or make your own.', async () => {
    await sleep(900);
    const profile = settings.getByRole('combobox', { name: 'Profile' });
    await pointAt(settings, profile);
    for (const id of ['sys-colorblind', 'sys-hc-light', 'default']) {
      await profile.selectOption(id);
      await sleep(1700);
    }
  });
  await rec.done();

  await assemble(rec, work, path.join(OUT!, 'demo.mp4'));
  await rm(work, { recursive: true, force: true });
});

async function ffmpeg(args: string[]): Promise<void> {
  await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
}

/** Cards and scenes, crossfaded into one video. */
async function assemble(rec: Recorder, work: string, out: string): Promise<void> {
  const composer = await chromium.launch();
  const icon = await dataUrl('assets/brand/icon.svg', 'image/svg+xml');
  const pieces: { file: string; seconds: number }[] = [];

  const card = async (name: string, seconds: number, body: string) => {
    const png = path.join(work, `${name}.png`);
    const file = path.join(work, `${name}.mp4`);
    await render(composer, png, VIDEO, body);
    await ffmpeg(['-loop', '1', '-framerate', `${FPS}`, '-t', `${seconds}`, '-i', png, ...encoding(), file]);
    pieces.push({ file, seconds });
  };

  await card(
    'title',
    3.5,
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
       <img src="${icon}" style="width:190px;height:190px;border-radius:42px;${ICON_EDGE}">
       <h1 style="margin:48px 0 0;font-size:104px;font-weight:750;letter-spacing:-0.015em">Accessible Find</h1>
       <p style="margin:22px 0 0;font-size:52px;color:#C9D2EA">Find in page, made <mark>visible</mark>.</p>
     </div>`,
  );

  for (const [i, clip] of rec.clips.entries()) {
    // What was on screen when the scene began, then every frame until it ended.
    const before = rec.shots.filter((s) => s.t <= clip.from).at(-1);
    const shots = [...(before ? [before] : []), ...rec.shots.filter((s) => s.t > clip.from && s.t < clip.to)];
    let list = 'ffconcat version 1.0\n';
    shots.forEach((shot, k) => {
      const start = Math.max(shot.t, clip.from);
      const end = shots[k + 1]?.t ?? clip.to;
      list += `file '${shot.file}'\nduration ${Math.max(end - start, 0.001).toFixed(4)}\n`;
    });
    list += `file '${shots.at(-1)!.file}'\n`; // The last duration only counts with a file after it.
    const listFile = path.join(work, `scene-${i}.txt`);
    await writeFile(listFile, list);

    const caption = path.join(work, `scene-${i}.png`);
    await render(
      composer,
      caption,
      VIDEO,
      `<div style="position:absolute;inset:0 80px auto;padding-top:22px;text-align:center">
         <h1 style="margin:0;font-size:60px;font-weight:750;letter-spacing:-0.01em;line-height:1.15">${marked(clip.title)}</h1>
         <p style="margin:8px 0 0;font-size:31px;line-height:1.3;color:#C9D2EA">${clip.subtitle}</p>
       </div>
       <div style="position:absolute;left:${WINDOW.left - 2}px;top:${WINDOW.top - 2}px;width:${WINDOW.width + 4}px;
                   height:${WINDOW.height + 40}px;border:2px solid #34437A;border-radius:${WINDOW.radius + 2}px"></div>`,
      { ...WINDOW, height: WINDOW.height + 40 },
    );
    const seconds = clip.to - clip.from;
    const file = path.join(work, `scene-${i}.mp4`);
    await ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-loop', '1', '-framerate', `${FPS}`, '-i', caption,
      '-filter_complex',
      `[0:v]fps=${FPS},scale=${WINDOW.width}:${WINDOW.height}:flags=lanczos,` +
        `pad=${VIDEO.width}:${VIDEO.height}:${WINDOW.left}:${WINDOW.top}:color=${NIGHT}[page];` +
        `[page][1:v]overlay=0:0`,
      '-t', seconds.toFixed(3), ...encoding(), file,
    ]);
    pieces.push({ file, seconds });
  }

  await card(
    'end',
    5,
    `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
       <div style="display:flex;align-items:center;gap:36px">
         <img src="${icon}" style="width:150px;height:150px;border-radius:33px;${ICON_EDGE}">
         <h1 style="margin:0;font-size:96px;font-weight:750;letter-spacing:-0.015em">Accessible Find</h1>
       </div>
       <p style="margin:56px 0 0;font-size:40px;line-height:1.45;color:#C9D2EA;max-width:1400px">
         Also: read aloud, recent searches, your own shortcuts,<br>backups and shared profiles.</p>
       <p style="margin:48px 0 0;font-size:46px;font-weight:650">Free on the Chrome Web Store, and open source.</p>
     </div>`,
  );
  await composer.close();

  // Crossfade each piece into the next.
  const inputs = pieces.flatMap((p) => ['-i', p.file]);
  let chain = '';
  let last = '[0:v]';
  let offset = 0;
  for (let k = 1; k < pieces.length; k++) {
    offset += pieces[k - 1]!.seconds - FADE;
    const label = `[x${k}]`;
    chain += `${last}[${k}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
    last = label;
  }
  const total = offset + pieces.at(-1)!.seconds;
  await ffmpeg([
    ...inputs,
    // A silent sound track: some players and upload checks expect one.
    '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', chain.slice(0, -1),
    '-map', last, '-map', `${pieces.length}:a`,
    ...encoding(), '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
}

/** H.264 at a steady frame rate, as YouTube recommends. */
function encoding(): string[] {
  return ['-r', `${FPS}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p'];
}
