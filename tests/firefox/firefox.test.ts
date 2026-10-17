/**
 * The Firefox build in the Firefox installed here (npm run test:firefox). The Chromium suite
 * (tests/e2e) covers the features; this covers what differs in Firefox: content scripts behind
 * Xray wrappers, moz-extension:// addresses, and the pages Firefox keeps extensions off.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'puppeteer-core';
import {
  extensionPage,
  EXTENSION,
  type Firefox,
  hasHighlightRules,
  highlightSizes,
  launchFirefox,
  open,
  pressCtrlF,
  runCommand,
  sleep,
  spoken,
  until,
} from './harness';

let firefox: Firefox;
let ext: Page;

beforeAll(async () => {
  firefox = await launchFirefox();
  ext = await extensionPage(firefox);
});

afterAll(async () => {
  await firefox?.close();
});

describe('in Firefox', () => {
  it('Ctrl+F opens the find bar, and every match is lit in the profile’s colors', async () => {
    const page = await firefox.browser.newPage();
    await open(page, `${firefox.origin}/article.html`);
    await pressCtrlF(page);
    await until('the finder', () => page.evaluate(() => CSS.highlights.size > 0));
    await sleep(500);
    await page.keyboard.type('lighthouse');
    await until('five matches', async () => (await highlightSizes(page))['accessible-find-match'] === 5);
    // The colors come from a style sheet the content script hands the page through its Xray wrapper.
    expect(await hasHighlightRules(page)).toBe(true);
    await page.keyboard.press('Enter');
    await until('one current match', async () => (await highlightSizes(page))['accessible-find-current'] === 1);
    await page.close();
  });

  it('the keyboard shortcut opens it too, and read aloud reads the sentence around the match', async () => {
    const page = await firefox.browser.newPage();
    const url = `${firefox.origin}/basic.html`;
    await open(page, url);
    await page.bringToFront();
    await runCommand(ext, url, 'openFinder');
    await until('the finder', () => page.evaluate(() => CSS.highlights.size > 0));
    await sleep(500);
    await page.keyboard.type('stood on the rocks');
    await until('a match', async () => (await highlightSizes(page))['accessible-find-current'] === 1);
    await runCommand(ext, url, 'readAloud');
    await until('reading', async () => (await spoken(ext)).includes('The lighthouse stood on the rocks.'));
    await page.close();
  });

  it('the practice page runs its own finder', async () => {
    const page = await firefox.browser.newPage();
    await open(page, `${EXTENSION}/practice.html`);
    await pressCtrlF(page);
    await sleep(800);
    await page.keyboard.type('lighthouse');
    await until('matches', async () => ((await highlightSizes(page))['accessible-find-match'] ?? 0) > 0);
    expect(await hasHighlightRules(page)).toBe(true);
    await page.close();
  });

  it('the settings page and the “can’t run here” popup show', async () => {
    expect(await ext.evaluate(() => document.querySelector('h2')?.textContent)).toBe('Opening Accessible Find');
    const popup = await extensionPage(firefox, 'unavailable.html?reason=mozilla-site');
    expect(await popup.evaluate(() => document.body.innerText)).toContain('Firefox protects this site');
    await popup.close();
  });

  it('a PDF in Firefox’s own viewer is explained, not left without an answer', async () => {
    const page = await firefox.browser.newPage();
    const url = `${firefox.origin}/test.pdf`;
    await open(page, url);
    await runCommand(ext, url, 'openFinder');
    const popup = await ext.evaluate(async (url) => {
      const tab = (await browser.tabs.query({})).find((t) => t.url === url);
      return browser.action.getPopup({ tabId: tab!.id });
    }, url);
    expect(popup).toContain('reason=pdf');
    await page.close();
  });
});
