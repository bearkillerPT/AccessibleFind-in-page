// Renders the brand icon SVGs to the PNG sizes the extension needs, using Playwright's
// Chromium. Run with: npm run icons
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// The 128 px icon is the one Chrome shows when installing and the Web Store shows on the
// listing. Like other extensions' icons there, its artwork is 96 px with 16 px of
// transparent padding per side (developer.chrome.com/docs/webstore/images).
const SIZES = [
  { size: 16, svg: 'assets/brand/icon-small.svg' },
  { size: 32, svg: 'assets/brand/icon-small.svg' },
  { size: 48, svg: 'assets/brand/icon.svg' },
  { size: 128, svg: 'assets/brand/icon.svg', padding: 16 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await mkdir('public/icon', { recursive: true });
for (const { size, svg, padding = 0 } of SIZES) {
  const source = await readFile(svg, 'utf8');
  const art = size - padding * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${art}px;height:${art}px;margin:${padding}px}</style>${source}`,
  );
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(`public/icon/${size}.png`, png);
  console.log(`public/icon/${size}.png`);
}
await browser.close();
