/**
 * Real key presses and real speech, for what Playwright's keys can't show: they skip browser
 * shortcuts and page access keys, and Playwright's evaluate() counts as a user gesture, which
 * Chrome's speech requires. A fake voice (fake-tts/) records what Chrome really says.
 *
 * It moves the pointer and types through X11, so it runs only when asked, on a virtual display:
 *
 *   REAL_KEYS=1 xvfb-run -a npm run test:e2e -- real-keys
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test as base, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { findBar, goto, launch, status } from './harness';

const test = base.extend<{ context: BrowserContext; voice: Worker; page: Page }>({
  context: async ({}, use) => {
    const context = await launch({ headless: false, extensions: [path.resolve('tests/e2e/fake-tts')] });
    await use(context);
    await context.close();
  },
  voice: async ({ context }, use) => {
    const worker = (url: string) => context.serviceWorkers().find((w) => w.url().endsWith(url));
    await expect.poll(() => Boolean(worker('/sw.js') && worker('/background.js'))).toBe(true);
    const sw = worker('/background.js')!;
    // The every-site hotkey script is registered on install; wait so new pages get it.
    await expect
      .poll(() => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length))
      .toBe(1);
    await use(worker('/sw.js')!);
  },
  page: async ({ context, voice }, use) => {
    void voice;
    await use(await context.newPage());
  },
});

test.skip(!process.env.REAL_KEYS, 'Presses real keys: REAL_KEYS=1 xvfb-run -a npm run test:e2e -- real-keys');

/**
 * Real key presses, like `xdotool key alt+r`. Without a window manager, X sends keys to the
 * window under the pointer, so the pointer goes over the browser first.
 */
function press(...keys: string[]) {
  execFileSync('xdotool', ['mousemove', '600', '500']);
  execFileSync('xdotool', ['key', '--clearmodifiers', ...keys]);
}

function type(text: string) {
  execFileSync('xdotool', ['type', '--delay', '60', text]);
}

/** What the fake voice was asked to say. */
const said = (voice: Worker) => voice.evaluate(() => (globalThis as unknown as { said: string[] }).said.slice());

test('Alt+R reads the selected text, and the page’s own Alt+R access key stays quiet', async ({ page, voice }) => {
  await goto(page, 'access-keys.html');
  await page.locator('#text').click({ clickCount: 3 });
  press('alt+r');
  await expect
    .poll(() => said(voice))
    .toEqual(['speak: The lighthouse stood on the rocks. Every night its beam swept the bay.']);
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => (window as unknown as { keysSeen: string[] }).keysSeen)).not.toContain('r');
});

test('Alt+R reads the sentence at the caret in a text box', async ({ page, voice }) => {
  await goto(page, 'access-keys.html');
  await page.locator('#notes').click();
  await page.locator('#notes').evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(16, 16));
  press('alt+r');
  await expect.poll(() => said(voice)).toEqual(['speak: The second sentence is here.']);
  expect(new URL(page.url()).hash).toBe('');
});

test('Alt+R in the find bar reads the current match, and again stops reading', async ({ page, voice }) => {
  await goto(page, 'access-keys.html');
  await page.locator('#text').click();
  press('ctrl+f');
  const bar = await findBar(page);
  type('beam');
  await expect(status(bar)).toHaveText('1 of 1');
  press('alt+r');
  await expect.poll(() => said(voice)).toEqual(['speak: Every night its beam swept the bay.']);
  press('alt+r');
  await expect.poll(() => said(voice)).toContain('stop');
  expect(new URL(page.url()).hash).toBe('');
});
