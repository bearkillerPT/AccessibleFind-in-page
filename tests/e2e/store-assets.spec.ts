/**
 * Renders the Chrome Web Store images: five captioned 1280×800 screenshots of the real UI,
 * the small (440×280) and marquee (1400×560) promo tiles, and the 128 px store icon.
 * Only runs when STORE_ASSETS is set:  npm run store-assets  (writes to store/)
 */
import { chromium, type Browser, type Page, type Worker } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findBar, goto, launch, openViaCommand, search, test as base } from './harness';
import { dataUrl, ICON_EDGE, marked, render as renderArt, setEffects, setPrefs } from './store-art';

const OUT = process.env.STORE_ASSETS;
const test = base.extend({
  // Captured at twice the size and shown at half, so the UI stays sharp in the composition.
  context: async ({}, use) => {
    const context = await launch({ headless: true, deviceScaleFactor: 2 });
    await use(context);
    await context.close();
  },
});
test.skip(!OUT, 'Set STORE_ASSETS=<dir> to render the store images');
test.describe.configure({ mode: 'serial' });

/** The part of each screenshot that shows the UI, in CSS pixels (at the default text size). */
const SHOT = { width: 1180, height: 642 };

let composer: Browser;
test.beforeAll(async () => {
  composer = await chromium.launch();
  await mkdir(path.join(OUT ?? '.', 'screenshots'), { recursive: true });
});
test.afterAll(async () => composer?.close());

const render = (file: string, width: number, height: number, body: string) =>
  renderArt(composer, path.join(OUT!, file), { width, height }, body);

/** A captioned screenshot: `*word*` in the title is marked like the current match. */
async function compose(file: string, title: string, subtitle: string, shot: Buffer): Promise<void> {
  const image = `data:image/png;base64,${shot.toString('base64')}`;
  await render(
    `screenshots/${file}`,
    1280,
    800,
    `<div style="position:absolute;inset:0 48px auto;padding-top:30px;text-align:center">
       <h1 style="margin:0;font-size:52px;font-weight:750;letter-spacing:-0.01em;line-height:1.15">${marked(title)}</h1>
       <p style="margin:12px 0 0;font-size:26px;line-height:1.3;color:#C9D2EA">${subtitle}</p>
     </div>
     <div style="position:absolute;left:48px;top:160px;border:2px solid #34437A;border-bottom:0;
                 border-radius:18px 18px 0 0;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.55)">
       <img src="${image}" style="display:block;width:${SHOT.width}px;height:${SHOT.height}px">
     </div>`,
  );
}

async function searchArticle(page: Page, sw: Worker, query: string, steps = 0, css?: string) {
  await page.setViewportSize(SHOT);
  await goto(page, 'article.html');
  if (css) await page.addStyleTag({ content: css });
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, query);
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(300);
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Enter');
  }
  await page.waitForTimeout(2600); // let the blink and ring finish
  return bar;
}

test('1: the find bar', async ({ page, sw }) => {
  await setPrefs(sw, { theme: 'dark' });
  await setEffects(sw, { spotlight: { enabled: true, opacity: 0.4 }, magnifier: { enabled: true, fontSize: 32 } });
  // The match nearest the middle of the screen, with the page's title still in view.
  await searchArticle(page, sw, 'lighthouse');
  await compose(
    '1-find-bar.png',
    'Find in page, made *visible*',
    'Big, bright highlights for people with low vision. Opens with Ctrl+F.',
    await page.screenshot(),
  );
});

test('2: spotting the current match', async ({ page, sw }) => {
  await setPrefs(sw, { theme: 'dark' });
  await setEffects(sw, {
    spotlight: { enabled: true, opacity: 0.4 },
    guides: { enabled: true },
    magnifier: { enabled: true, fontSize: 32 },
  });
  const bar = await searchArticle(page, sw, 'cove');
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await page.waitForTimeout(400);
  await compose(
    '2-quick-settings.png',
    'Never lose the *current match*',
    'Turn on a spotlight, guide lines or a magnifier, right from the find bar.',
    await page.screenshot(),
  );
});

test('3: every match in a list', async ({ page, sw }) => {
  await setPrefs(sw, { theme: 'dark' });
  const bar = await searchArticle(page, sw, 'lighthouse');
  await bar.getByRole('button', { name: /All matches/ }).click();
  await page.waitForTimeout(400);
  await compose(
    '3-results-list.png',
    'Every match, in *large text*',
    'Read them all in one list, and jump to any one with the arrow keys.',
    await page.screenshot(),
  );
});

test('4: highlight style', async ({ context, sw }) => {
  // At 100% text, both kinds of page fit side by side in the shot.
  await setPrefs(sw, { theme: 'light', uiScale: 1 });
  const page = await context.newPage();
  await page.setViewportSize(SHOT);
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  await page.waitForTimeout(600);
  await compose(
    '4-highlight-style.png',
    'Colors that *work for you*',
    'Profiles for cataracts, light sensitivity and color blindness, or your own.',
    await page.screenshot(),
  );
});

test('5: dark pages', async ({ page, sw }) => {
  await setPrefs(sw, { theme: 'dark' });
  await setEffects(sw, { magnifier: { enabled: true, fontSize: 32 } });
  // The same article as a dark website shows it; automatic style picks the colors.
  const dark = 'body{background:#14161b;color:#d9dde6} header{background:#05070c} .meta{color:#9aa3b5}';
  await searchArticle(page, sw, 'cliff', 1, dark);
  await compose(
    '5-dark-pages.png',
    'Made for *dark pages* too',
    'On dark websites, matches switch to colors that stand out on black.',
    await page.screenshot(),
  );
});

/** A page of text as lines of word blocks, with matches and the current match marked. */
function pageArt(opts: { width: number; lines: number; word: number; gap: number; current: [number, number] }): {
  svg: string;
  current: { x: number; y: number; w: number; h: number };
} {
  const { width, lines, word, gap, current } = opts;
  // Fixed word widths, so the picture is the same every time.
  const widths = [3.1, 5.4, 2.2, 4.6, 6.3, 2.8, 4.1, 3.6, 5.0, 2.5, 4.4, 3.3, 5.8, 2.9];
  const matches = new Set(['0,3', '1,1', '2,4', '3,2', '4,4', '5,1']);
  let svg = '';
  let found = { x: 0, y: 0, w: 0, h: 0 };
  let k = 0;
  for (let line = 0; line < lines; line++) {
    const y = line * gap;
    let x = 0;
    for (let i = 0; x < width; i++, k++) {
      const w = Math.min(widths[k % widths.length]! * word, width - x);
      if (w < word * 1.5) break;
      const key = `${line},${i}`;
      if (line === current[0] && i === current[1]) {
        found = { x, y, w, h: word * 1.6 };
        // Night lit in Beam, in a Signal frame: the default current match.
        svg += `<rect x="${x - 6}" y="${y - word * 0.3 - 6}" width="${w + 12}" height="${word * 1.6 + 12}" rx="${word * 0.4}" fill="#000"/>`;
        svg += `<rect x="${x - 4}" y="${y - word * 0.3 - 4}" width="${w + 8}" height="${word * 1.6 + 8}" rx="${word * 0.38}" fill="#FF8A00"/>`;
        svg += `<rect x="${x}" y="${y - word * 0.3}" width="${w}" height="${word * 1.6}" rx="${word * 0.3}" fill="#0B1020"/>`;
        svg += `<rect x="${x + w * 0.14}" y="${y + word * 0.12}" width="${w * 0.72}" height="${word * 0.76}" rx="${word * 0.38}" fill="#FFD60A"/>`;
      } else if (matches.has(key)) {
        svg += `<rect x="${x}" y="${y - word * 0.3}" width="${w}" height="${word * 1.6}" rx="${word * 0.25}" fill="#FFD60A"/>`;
        svg += `<rect x="${x}" y="${y + word * 1.1}" width="${w}" height="${word * 0.22}" fill="#B34700"/>`;
      } else {
        svg += `<rect x="${x}" y="${y}" width="${w}" height="${word}" rx="${word / 2}" fill="#AEB9D6"/>`;
      }
      x += w + word * 0.9;
    }
  }
  return { svg, current: found };
}

/** The page of text on a card, with the lens over the current match, as one SVG. */
function illustration(opts: {
  width: number;
  height: number;
  pad: number;
  word: number;
  gap: number;
  lines: number;
  current: [number, number];
  lens: number;
}): string {
  const { width, height, pad, word, gap, lines, lens } = opts;
  const art = pageArt({ width: width - pad * 2, lines, word, gap, current: opts.current });
  const cx = pad + art.current.x + art.current.w / 2;
  const cy = pad + art.current.y + art.current.h / 2 - word * 0.3;
  const stroke = lens * 0.26;
  const handle = lens * 0.72;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + lens * 2}" height="${height + lens * 2}"
      viewBox="${-lens} ${-lens} ${width + lens * 2} ${height + lens * 2}" style="overflow:visible">
    <rect width="${width}" height="${height}" rx="${pad * 0.6}" fill="#F4F6FC"/>
    <g transform="translate(${pad} ${pad})">${art.svg}</g>
    <circle cx="${cx}" cy="${cy}" r="${lens}" fill="rgba(255,255,255,0.06)" stroke="#000" stroke-opacity="0.35" stroke-width="${stroke + 6}"/>
    <circle cx="${cx}" cy="${cy}" r="${lens}" fill="none" stroke="#FFD60A" stroke-width="${stroke}"/>
    <path d="M${cx + lens * 0.72} ${cy + lens * 0.72} l${handle} ${handle}" stroke="#FFD60A"
      stroke-width="${stroke * 1.4}" stroke-linecap="round"/>
  </svg>`;
}

test('promo tiles and store icon', async () => {
  const icon = await dataUrl('assets/brand/icon.svg', 'image/svg+xml');

  // Small tile, 440×280: shown at half size in places, so few, large shapes.
  await render(
    'promo-small.png',
    440,
    280,
    `<div style="position:absolute;left:28px;top:26px;display:flex;align-items:center;gap:14px">
       <img src="${icon}" style="width:58px;height:58px;border-radius:13px;${ICON_EDGE}">
       <span style="font-size:34px;font-weight:750;letter-spacing:-0.01em">Accessible Find</span>
     </div>
     <div style="position:absolute;left:28px;top:112px">
       ${illustration({ width: 384, height: 200, pad: 26, word: 13, gap: 36, lines: 5, current: [2, 2], lens: 40 })
         .replace('<svg ', '<svg style="margin:-40px" ')}
     </div>`,
  );

  // Marquee, 1400×560.
  await render(
    'promo-marquee.png',
    1400,
    560,
    `<div style="position:absolute;left:96px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center">
       <img src="${icon}" style="width:112px;height:112px;border-radius:25px;${ICON_EDGE}">
       <h1 style="margin:36px 0 0;font-size:76px;font-weight:750;letter-spacing:-0.015em;line-height:1.05">Accessible Find</h1>
       <p style="margin:18px 0 0;font-size:38px;line-height:1.25;color:#C9D2EA">Find in page, made <mark>visible</mark>.</p>
     </div>
     <div style="position:absolute;left:720px;top:70px">
       ${illustration({ width: 640, height: 520, pad: 44, word: 18, gap: 54, lines: 9, current: [4, 2], lens: 74 })
         .replace('<svg ', '<svg style="margin:-74px" ')}
     </div>`,
  );

  // The store icon is the extension's own 128 px icon (made by npm run icons).
  await copyFile('public/icon/128.png', path.join(OUT!, 'icon-128.png'));
});
