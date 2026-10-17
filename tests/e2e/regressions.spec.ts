/** Regression tests for bugs found in review. */
import { expect, findBar, goto, openActiveViaCommand, openViaCommand, search, status, test } from './harness';

test('after closing and reopening, live page updates are still picked up', async ({ page, sw }) => {
  await goto(page, 'dynamic.html');
  await openViaCommand(sw, page);
  let bar = await findBar(page);
  await search(bar, 'needle');
  await expect(status(bar)).toHaveText(/of 2$/);
  await bar.getByRole('textbox', { name: 'Find in page' }).press('Escape');
  await openViaCommand(sw, page);
  bar = await findBar(page);
  await expect(status(bar)).toHaveText(/of 2$/);
  await page.evaluate(() => (window as unknown as { addNeedles(n: number): void }).addNeedles(2));
  await expect(status(bar)).toHaveText(/of 4$/);
});

test('reopening scrolls back to the remembered match', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  let bar = await findBar(page);
  await search(bar, 'waited');
  await expect(status(bar)).toHaveText('1 of 1');
  await bar.getByRole('textbox', { name: 'Find in page' }).press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await openViaCommand(sw, page);
  bar = await findBar(page);
  await expect(status(bar)).toHaveText('1 of 1');
  await expect
    .poll(() => page.evaluate(() => document.getElementById('far')!.getBoundingClientRect().top < innerHeight))
    .toBe(true);
});

test('finds text directly inside display:contents elements and slot fallbacks', async ({ page, sw }) => {
  await goto(page, 'contents.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'zebra');
  await expect(status(bar)).toHaveText(/of 3$/);
});

test('a <details> the user closes stays closed while the bar is open', async ({ page, sw }) => {
  await goto(page, 'reveal.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'hidden marmalade');
  await expect(status(bar)).toHaveText('1 of 1');
  const details = page.locator('#details');
  await expect.poll(() => details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true);
  await details.evaluate((d) => ((d as HTMLDetailsElement).open = false));
  await page.waitForTimeout(1200); // longer than the live-update delay
  expect(await details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
});

test('scrolls to matches when <body> is the scroll container', async ({ page, sw }) => {
  await goto(page, 'body-scroller.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'quokka');
  await expect(status(bar)).toHaveText('1 of 1');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document.getElementById('bottom')!.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }),
    )
    .toBe(true);
});

test('Ctrl+F reaches the page again once every-site mode is turned off', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await page.evaluate(() => {
    (window as unknown as { __ctrlF: boolean[] }).__ctrlF = [];
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' && e.ctrlKey) (window as unknown as { __ctrlF: boolean[] }).__ctrlF.push(e.defaultPrevented);
    });
  });
  // What the background does when the permission is removed.
  await sw.evaluate(() => chrome.storage.local.set({ hotkeyEnabled: false }));
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(400);
  expect(page.frames().some((f) => f.url().includes('/findbar.html'))).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __ctrlF: boolean[] }).__ctrlF)).toEqual([false]);

  await sw.evaluate(() => chrome.storage.local.set({ hotkeyEnabled: true }));
  await page.keyboard.press('Control+f');
  await findBar(page);
});

test('Escape in a page text field does not close the bar', async ({ page, sw }) => {
  await goto(page, 'dynamic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'needle');
  await expect(status(bar)).toHaveText(/of 2$/);
  await page.locator('#editor').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(page.locator('accessible-find-overlay')).toHaveCount(1);
  // Escape elsewhere on the page still closes it.
  await page.locator('#counter').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('accessible-find-overlay')).toHaveCount(0);
});

test('explains instead of doing nothing on SVG and XML files', async ({ context, page, sw }) => {
  await context.route(`https://fixtures.test/drawing.svg`, (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="10" y="50">svg text</text></svg>',
    }),
  );
  await goto(page, 'drawing.svg');
  await openActiveViaCommand(sw);
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP' as never] });
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const badge = await chrome.action.getBadgeText({ tabId: tab!.id });
        return contexts.some((c) => c.documentUrl?.includes('reason=not-html')) || badge === '!';
      }),
    )
    .toBe(true);
});

test('a page shortening its text while you type does not break the search', async ({ page, sw }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await goto(page, 'dynamic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'walrus');
  await expect(status(bar)).toHaveText(/of 3$/);
  // Typing right after reuses the index for a moment, though the page has changed under it.
  await page.evaluate(() => (window as unknown as { shrink(): void }).shrink());
  await search(bar, 'walru');
  await expect(status(bar)).toHaveText('No results');
  expect(errors).toEqual([]);
});

test('text in separate boxes is kept apart, like the browser’s find', async ({ page, sw }) => {
  await goto(page, 'layout.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  // Flex and grid items don't run into each other...
  await search(bar, 'homeabout');
  await expect(status(bar)).toHaveText('No results');
  await search(bar, 'alphabeta');
  await expect(status(bar)).toHaveText('No results');
  // ...so a menu item is a whole word.
  await bar.getByRole('button', { name: /^Whole words only/ }).click();
  await search(bar, 'about');
  await expect(status(bar)).toHaveText(/of 2$/);
  // An empty inline box, like an icon, doesn't split the words around it.
  await search(bar, 'read about');
  await expect(status(bar)).toHaveText('1 of 1');
});

test('the match count sits beside the search box and never hides what’s typed', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  const input = bar.getByRole('textbox', { name: 'Find in page' });
  await search(bar, 'lighthouse keeper on the rocks');
  await expect(status(bar)).toHaveText('No results');
  expect(await status(bar).evaluate((el) => el.closest('[data-slot="input-group"]'))).toBeNull();
  // The whole search fits in the box, at the default text size.
  expect(await input.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // Nothing is greyed out, even with nothing found.
  await expect(bar.locator(':disabled')).toHaveCount(0);
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await expect(bar.locator(':disabled, [data-disabled]')).toHaveCount(0);
});

test('Ctrl+G and Ctrl+F work in the find bar with non-Latin keyboard layouts', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/^\d of 4$/);
  const before = await status(bar).textContent();
  // What a Russian layout sends: other letters, from the same physical keys.
  const handled = await bar.evaluate(() => {
    const input = document.querySelector('input')!;
    const press = (key: string, code: string) => {
      const e = new KeyboardEvent('keydown', { key, code, ctrlKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return [press('п', 'KeyG'), press('а', 'KeyF')];
  });
  // Handled by the find bar, so the browser's own find bar doesn't open over it.
  expect(handled).toEqual([true, true]);
  await expect(status(bar)).not.toHaveText(before!);
});

test('recent searches turned off on another computer are forgotten here too', async ({ page, sw }) => {
  await sw.evaluate(async () => {
    await chrome.storage.local.set({ searchHistory: ['beam', 'rocks'] });
    // Only the synced setting changed, as it would when changed elsewhere.
    await chrome.storage.sync.set({ schemaVersion: 2, prefs: { rememberSearches: false } });
  });
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  await findBar(page);
  await expect
    .poll(() => sw.evaluate(async () => (await chrome.storage.local.get('searchHistory')).searchHistory))
    .toBeUndefined();
});

/** The current match's box and the find bar's, in the page's viewport. Blinking would hide the match now and then. */
async function matchAndBar(page: import('@playwright/test').Page, bar: import('@playwright/test').Frame) {
  const match = await page.evaluate(() => {
    const ranges = [...(CSS.highlights.get('accessible-find-current') ?? [])] as Range[];
    const rects = ranges.flatMap((r) => [...r.getClientRects()]);
    return {
      left: Math.min(...rects.map((r) => r.left)),
      top: Math.min(...rects.map((r) => r.top)),
      right: Math.max(...rects.map((r) => r.right)),
      bottom: Math.max(...rects.map((r) => r.bottom)),
    };
  });
  const b = (await (await bar.frameElement()).boundingBox())!;
  const box = { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height };
  const overlaps =
    match.left < box.right && box.left < match.right && match.top < box.bottom && box.top < match.bottom;
  return { match, bar: box, overlaps };
}

test('the find bar steps aside when it would cover a match the page can’t scroll clear', async ({ page, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { barPosition: 'bottom-center', motion: 'reduce' } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await goto(page, 'article.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  // The last line of a page that can't scroll any further, right under the bar.
  await search(bar, 'Camões');
  await expect(status(bar)).toHaveText('1 of 1');
  await expect.poll(async () => (await matchAndBar(page, bar)).overlaps).toBe(false);
  // Along the same edge, where the user expects it.
  expect((await matchAndBar(page, bar)).bar.bottom).toBeGreaterThan(700);
  // And back where the user put it once the match is elsewhere.
  await search(bar, 'automated');
  await expect(status(bar)).toHaveText('1 of 1');
  await expect
    .poll(async () => {
      const { bar: box } = await matchAndBar(page, bar);
      return Math.round((box.left + box.right) / 2);
    })
    .toBe(640);
});

test('a tall find bar never hides the match it moves to', async ({ page, sw }) => {
  // 300% text in a short window: the bar takes the top half of the screen.
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { uiScale: 3, motion: 'reduce' } }));
  await page.setViewportSize({ width: 1280, height: 600 });
  await goto(page, 'article.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/of 5$/);
  for (let i = 0; i < 5; i++) {
    const before = await status(bar).textContent();
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Enter');
    await expect(status(bar)).not.toHaveText(before!);
    await expect.poll(async () => (await matchAndBar(page, bar)).overlaps).toBe(false);
  }
});

test('the practice page uses light-page colors for its white article, even in the dark theme', async ({ context, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { theme: 'dark' } }));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${id}/practice.html`);
  await page.getByRole('button', { name: 'Open the find bar' }).click();
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/of 6$/);
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await expect(bar.locator('#quick-settings')).toContainText('On dark backgrounds, matches switch to colors made for them.');
  await expect(bar.locator('#quick-settings')).not.toContainText('This page looks dark');
});

test('the results list asks for a search instead of saying nothing was found', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await bar.getByRole('button', { name: /All matches/ }).click();
  await expect(bar.locator('#results-list')).toContainText('Type to see every match here.');
  await search(bar, 'lighthouse');
  await expect(bar.locator('#results-list')).toContainText('4 matches.');
  await search(bar, '');
  await expect(bar.locator('#results-list')).toContainText('Type to see every match here.');
  await expect(bar.locator('#results-list')).not.toContainText('No matches');
});

test('the search box keeps its width while typing, finding nothing and clearing', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  const input = bar.getByRole('textbox', { name: 'Find in page' });
  // Every width the box is painted at, frame by frame.
  await bar.evaluate(() => {
    const group = document.querySelector('[data-slot="input-group"]')!;
    const widths = new Set<number>();
    (window as unknown as { widths: Set<number> }).widths = widths;
    const sample = () => {
      widths.add(Math.round(group.getBoundingClientRect().width));
      requestAnimationFrame(sample);
    };
    sample();
  });
  await input.pressSequentially('lighthouse', { delay: 60 });
  await expect(status(bar)).toHaveText(/of 4$/);
  await input.pressSequentially('zz', { delay: 60 });
  await expect(status(bar)).toHaveText('No results');
  await input.press('Control+a');
  await input.press('Backspace');
  await page.waitForTimeout(300);
  expect(await bar.evaluate(() => [...(window as unknown as { widths: Set<number> }).widths])).toHaveLength(1);
});
