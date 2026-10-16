/** What the store images and the demo video share: the brand look, rendering, and settings. */
import type { Browser, Worker } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const NIGHT = '#0B1020';
/** The icon is dark too; a faint light edge keeps it from sinking into the background. */
export const ICON_EDGE = 'box-shadow:0 0 0 2px rgba(244,246,252,0.22)';

export const dataUrl = async (file: string, type: string) =>
  `data:${type};base64,${(await readFile(file)).toString('base64')}`;

/** `*word*` marked like the current match. */
export const marked = (text: string) => text.replace(/\*(.+?)\*/g, '<mark>$1</mark>');

export async function brandCss(): Promise<string> {
  const latin = await dataUrl('public/fonts/AtkinsonHyperlegibleNext-latin.woff2', 'font/woff2');
  const ext = await dataUrl('public/fonts/AtkinsonHyperlegibleNext-latin-ext.woff2', 'font/woff2');
  return `
    @font-face { font-family: Atkinson; font-weight: 200 800; src: url(${latin}) format("woff2"); }
    @font-face { font-family: Atkinson; font-weight: 200 800; src: url(${ext}) format("woff2");
      unicode-range: U+0100-02BA, U+1E00-1EFF; }
    * { box-sizing: border-box; }
    /* Full height: the content is all positioned, and the background needs a box to fill. */
    html, body { margin: 0; height: 100%; overflow: hidden; }
    body { font-family: Atkinson, system-ui, sans-serif; color: #F4F6FC; -webkit-font-smoothing: antialiased; }
    .night { position: absolute; inset: 0;
      background: radial-gradient(120% 140% at 0% 0%, #1F2C55 0%, #121A33 45%, ${NIGHT} 100%); }
    /* The brand's "find" palette: the current match, orange in a yellow frame. */
    mark { background: #FF8C00; color: #0B1020; border-radius: 0.18em; padding: 0 0.14em;
      box-shadow: 0 0 0 0.07em #FFFF00, 0 0 0 0.11em #000; }
  `;
}

/**
 * Renders HTML on the night background at an exact size, to a PNG. `hole` leaves a
 * rounded window in the background (transparent), for a video to show through.
 */
export async function render(
  browser: Browser,
  file: string,
  size: { width: number; height: number },
  body: string,
  hole?: { left: number; top: number; width: number; height: number; radius: number },
): Promise<void> {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  let mask = '';
  if (hole) {
    const { left: x, top: y, width: w, height: h, radius: r } = hole;
    const path = `M0 0H${size.width}V${size.height}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h}H${x}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><path fill-rule="evenodd" d="${path}"/></svg>`;
    mask = `-webkit-mask-image:url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }
  await page.setContent(
    `<!doctype html><html><head><style>${await brandCss()}</style></head>` +
      `<body><div class="night" style='${mask}'></div>${body}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, type: 'png', omitBackground: Boolean(hole) });
  await page.close();
}

export async function setPrefs(sw: Worker, prefs: Record<string, unknown>): Promise<void> {
  await sw.evaluate(async (p) => {
    const { prefs: current } = await chrome.storage.sync.get('prefs');
    await chrome.storage.sync.set({ schemaVersion: 2, prefs: { ...(current as object), ...p } });
  }, prefs);
}

/** Changes the Default profile's look (effects that start off, turned on for the pictures). */
export async function setEffects(sw: Worker, appearance: Record<string, unknown>): Promise<void> {
  await sw.evaluate(
    (a) =>
      chrome.storage.sync.set({
        profileOrder: ['default'],
        activeProfileId: 'default',
        'profile:default': { id: 'default', name: 'Default', appearance: a },
      }),
    appearance,
  );
}
