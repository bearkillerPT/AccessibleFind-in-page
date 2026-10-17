/**
 * Runs the e2e build in the Firefox installed on this computer, through WebDriver BiDi
 * (Playwright can't load extensions in Firefox; Puppeteer can). Set FIREFOX to use another
 * Firefox than the one on the PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURES = path.join(ROOT, 'tests/e2e/fixtures');
const ID = 'accessible-find@bearkillerpt';
/** Fixed, so the extension's pages have a known address (moz-extension://<this>/...). */
const UUID = '6c1b7e2a-1d5f-4a8e-9c3b-2f4d6e8a0b1c';
export const EXTENSION = `moz-extension://${UUID}`;

/** A one-page PDF with "lighthouse" in it, for Firefox's built-in viewer. */
const PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 18 Tf 20 100 Td (Hello lighthouse) Tj ET
endstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface Firefox {
  browser: Browser;
  /** Where the test pages are served (tests/e2e/fixtures, and /test.pdf). */
  origin: string;
  close(): Promise<void>;
}

function firefoxPath(): string {
  if (process.env.FIREFOX) return process.env.FIREFOX;
  try {
    return execFileSync('which', ['firefox'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Firefox not found: install it, or set FIREFOX to its path.');
  }
}

export async function launchFirefox(): Promise<Firefox> {
  const server = http.createServer(async (req, res) => {
    const file = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (file === '/test.pdf') {
      res.setHeader('content-type', 'application/pdf');
      res.end(PDF);
      return;
    }
    try {
      res.end(await readFile(path.join(FIXTURES, path.normalize(file))));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefoxPath(),
    headless: true,
    extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ [ID]: UUID }) },
  });
  await browser.installExtension(path.join(ROOT, '.output/firefox-mv3-e2e'));
  return {
    browser,
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      await browser.close();
      server.close();
    },
  };
}

/**
 * Opens a page and waits for it to load. Puppeteer isn't told when an extension page has
 * loaded, so this waits on the document instead.
 */
export async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { timeout: 4000 }).catch(() => {});
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10_000 });
  await sleep(300);
}

/** One of the extension's own pages, where the `browser` API is at hand. */
export async function extensionPage(firefox: Firefox, file = 'options.html'): Promise<Page> {
  const page = await firefox.browser.newPage();
  await open(page, `${EXTENSION}/${file}`);
  return page;
}

/** The e2e build's test hooks in the background script (see entrypoints/background.ts). */
interface Hooks {
  openFinder(tab: unknown): Promise<void>;
  readAloud(tab: unknown): Promise<void>;
  spoken: string[];
}

/**
 * Runs the background's openFinder or readAloud for the tab showing `url` (what the toolbar
 * button and the keyboard shortcuts do: tests can't press browser shortcuts).
 */
export async function runCommand(ext: Page, url: string, command: 'openFinder' | 'readAloud'): Promise<void> {
  await ext.evaluate(
    async (url, command) => {
      const bg = (await browser.runtime.getBackgroundPage()) as unknown as { __e2e: Hooks };
      // Not tabs.query({ url }): match patterns can't hold the test server's port.
      const tab = (await browser.tabs.query({})).find((t) => t.url === url);
      await bg.__e2e[command](tab);
    },
    url,
    command,
  );
}

/** What the e2e build would have read aloud so far. */
export function spoken(ext: Page): Promise<string[]> {
  return ext.evaluate(async () => {
    const bg = (await browser.runtime.getBackgroundPage()) as unknown as { __e2e: Hooks };
    return [...bg.__e2e.spoken];
  });
}

/** How many ranges each of Accessible Find's highlights holds, by name. */
export function highlightSizes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => Object.fromEntries([...CSS.highlights].map(([name, h]) => [name, h.size])));
}

/** Whether the page has adopted Accessible Find's ::highlight() rules. */
export function hasHighlightRules(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.adoptedStyleSheets].some((sheet) =>
      [...sheet.cssRules].some((rule) => rule.cssText.includes('accessible-find-match')),
    ),
  );
}

/** Polls `check` until it's true, or fails with `what`. */
export async function until(what: string, check: () => Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

export async function pressCtrlF(page: Page): Promise<void> {
  await page.keyboard.down('Control');
  await page.keyboard.press('f');
  await page.keyboard.up('Control');
}
