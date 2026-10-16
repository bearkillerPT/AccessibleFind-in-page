import { test as base, chromium, expect, type BrowserContext, type Frame, type Page, type Worker } from '@playwright/test';
import path from 'node:path';

const EXTENSION = path.resolve('.output/chrome-mv3-e2e');
const FIXTURES = path.resolve('tests/e2e/fixtures');
export const ORIGIN = 'https://fixtures.test';

type Fixtures = { context: BrowserContext; sw: Worker; page: Page };

/** A browser with the e2e build (and any other extensions given), serving the fixtures at ORIGIN. */
export async function launch(options: {
  headless: boolean;
  extensions?: string[];
  /** Pixels per CSS pixel, for sharper screenshots. */
  deviceScaleFactor?: number;
  /** null: the window's own size, from --window-size in `args`. */
  viewport?: { width: number; height: number } | null;
  /** More Chromium switches. */
  args?: string[];
}): Promise<BrowserContext> {
  const extensions = [EXTENSION, ...(options.extensions ?? [])].join(',');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: options.headless,
    viewport: options.viewport === undefined ? { width: 1200, height: 800 } : options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    args: [`--disable-extensions-except=${extensions}`, `--load-extension=${extensions}`, ...(options.args ?? [])],
  });
  await context.route(`${ORIGIN}/**`, (route) => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'basic.html';
    return route.fulfill({ path: path.join(FIXTURES, name), contentType: 'text/html; charset=utf-8' });
  });
  return context;
}

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await launch({ headless: true });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    // The every-site hotkey script is registered on install; wait so new pages get it.
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length))
      .toBe(1);
    await use(sw);
  },
  page: async ({ context, sw }, use) => {
    void sw;
    const page = await context.newPage();
    await use(page);
  },
});

export { expect };

export async function goto(page: Page, fixture: string): Promise<void> {
  await page.goto(`${ORIGIN}/${fixture}`);
  await page.bringToFront();
}

/** Opens the finder through the background, like the toolbar button or keyboard command. */
export async function openViaCommand(sw: Worker, page: Page): Promise<void> {
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await (globalThis as unknown as { __e2e: { openFinder(t: unknown): Promise<void> } }).__e2e.openFinder(tab);
  }, page.url());
}

/** Same, for the active tab (browser pages can't be looked up by URL). */
export async function openActiveViaCommand(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    const e2e = (globalThis as unknown as { __e2e: { openFinder(t: unknown): Promise<void>; activeTab(): Promise<unknown> } }).__e2e;
    await e2e.openFinder(await e2e.activeTab());
  });
}

/** What the read aloud shortcut (a browser shortcut, Alt+R) does in the active tab. */
export async function readViaCommand(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    const e2e = (globalThis as unknown as { __e2e: { readAloud(t: unknown): Promise<void>; activeTab(): Promise<unknown> } }).__e2e;
    await e2e.readAloud(await e2e.activeTab());
  });
}

/** The find bar iframe, once it has loaded and connected. */
export async function findBar(page: Page): Promise<Frame> {
  let bar: Frame | undefined;
  await expect
    .poll(() => {
      bar = page.frames().find((f) => f.url().includes('/findbar.html'));
      return Boolean(bar);
    })
    .toBe(true);
  await expect(bar!.getByRole('textbox', { name: 'Find in page' })).toBeVisible();
  return bar!;
}

export async function search(bar: Frame, query: string): Promise<void> {
  await bar.getByRole('textbox', { name: 'Find in page' }).fill(query);
}

/** The match count, once it's for what's typed (until then it shows the previous one). */
export const status = (bar: Frame) => bar.locator('#find-status:not([data-pending])');

export function highlightSize(page: Page, name: 'match' | 'current' | 'context'): Promise<number> {
  return page.evaluate((n) => CSS.highlights.get(`accessible-find-${n}`)?.size ?? 0, name);
}
