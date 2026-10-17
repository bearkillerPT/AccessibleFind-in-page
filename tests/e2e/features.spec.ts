import type { Frame, Worker } from '@playwright/test';
import { expect, findBar, goto, openActiveViaCommand, openViaCommand, readViaCommand, search, status, test } from './harness';

const input = (bar: Frame) => bar.getByRole('textbox', { name: 'Find in page' });

async function setPrefs(sw: Worker, prefs: Record<string, unknown>) {
  await sw.evaluate((p) => chrome.storage.sync.set({ schemaVersion: 2, prefs: p }), prefs);
}

/** What would have been read aloud so far. Tests can't listen; e2e builds report it (see speech.ts). */
const spoken = (sw: Worker) =>
  sw.evaluate(() => (globalThis as unknown as { __e2e: { spoken: string[] } }).__e2e.spoken.slice());

/** Selects the first occurrence of `text` in a page or frame. */
async function select(frame: import('@playwright/test').Page | Frame, text: string) {
  await frame.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(t);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + t.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
    throw new Error(`text not found: ${t}`);
  }, text);
}

const highlightCss = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    document.adoptedStyleSheets.flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n'),
  );

test('the results list shows every match and jumps to the one picked', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/of 4$/);
  await input(bar).press('Alt+l');
  const list = bar.locator('#results-list');
  await expect(list.getByRole('button')).toHaveCount(4);
  await expect(list).toContainText('4 matches.');
  await list.getByRole('button').nth(3).click();
  await expect(status(bar)).toHaveText('4 of 4');
  await expect(list.locator('[aria-current="true"]')).toHaveAttribute('data-index', '3');
  // Arrow keys on a list item move through the list.
  await list.getByRole('button').nth(3).press('ArrowUp');
  await expect(status(bar)).toHaveText('3 of 4');
  // With the list open, the arrows in the search box move through matches too.
  await input(bar).press('ArrowDown');
  await expect(status(bar)).toHaveText('4 of 4');
});

test('up and down arrows bring back recent searches', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  for (const q of ['beam', 'rocks']) {
    await search(bar, q);
    await expect(status(bar)).toHaveText('1 of 1');
    await input(bar).press('Enter');
  }
  await search(bar, 'draft');
  await input(bar).press('ArrowUp');
  await expect(input(bar)).toHaveValue('rocks');
  await input(bar).press('ArrowUp');
  await expect(input(bar)).toHaveValue('beam');
  await input(bar).press('ArrowDown');
  await input(bar).press('ArrowDown');
  await expect(input(bar)).toHaveValue('draft');
  const stored = await sw.evaluate(async () => (await chrome.storage.local.get('searchHistory')).searchHistory);
  expect(stored).toEqual(['rocks', 'beam']);
});

test('reads the sentence around the match aloud', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'beam');
  await expect(status(bar)).toHaveText('1 of 1');
  await bar.getByRole('button', { name: 'Read aloud (Alt+R)' }).click();
  await expect.poll(() => spoken(sw)).toEqual(['Every night the lighthouse beam swept the bay.']);
});

test('can read each match aloud while moving through them', async ({ page, sw }) => {
  await setPrefs(sw, { speech: { autoRead: true, rate: 1, voiceURI: '' } });
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/of 4$/);
  await page.waitForTimeout(300);
  expect(await spoken(sw)).toEqual([]); // Not while typing.
  await input(bar).press('Enter');
  await expect.poll(() => spoken(sw)).toHaveLength(1);
  expect((await spoken(sw))[0]).toMatch(/lighthouse/i);
});

test('with no match, read aloud reads the selected text, or says that nothing was found', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'zebra');
  await expect(status(bar)).toHaveText('No results');
  const readAloud = bar.getByRole('button', { name: 'Read aloud (Alt+R)' });
  await select(page, 'Far below');
  await readAloud.click();
  await expect.poll(() => spoken(sw)).toEqual(['Far below']);
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await expect(readAloud).toBeVisible(); // Not "Stop reading": tests have no voices, so it ends at once.
  await input(bar).press('Alt+r');
  await expect.poll(() => spoken(sw)).toEqual(['Far below', 'No results for “zebra”.']);
});

test('the ring is as slow and as thick as the profile says', async ({ page, sw }) => {
  await sw.evaluate(() =>
    chrome.storage.sync.set({
      profileOrder: ['default'],
      activeProfileId: 'default',
      'profile:default': {
        id: 'default',
        name: 'Default',
        appearance: { ping: { enabled: true, durationMs: 1600, width: 7 } },
      },
    }),
  );
  await goto(page, 'basic.html');
  // The ring is in the overlay's closed shadow root, out of the page's reach; DevTools sees every animation.
  const cdp = await page.context().newCDPSession(page);
  const durations: number[] = [];
  cdp.on('Animation.animationStarted', (e) => durations.push(e.animation.source?.duration ?? 0));
  await cdp.send('Animation.enable');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await input(bar).press('Enter');
  await expect.poll(() => durations).toContain(1600);
  // DevTools also reaches into the closed shadow root for the ring's style.
  type DomNode = { attributes?: string[]; children?: DomNode[]; shadowRoots?: DomNode[] };
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })) as { root: DomNode };
  const attr = (n: DomNode, name: string) => n.attributes?.[n.attributes.indexOf(name) + 1] ?? '';
  const find = (n: DomNode): DomNode | undefined =>
    attr(n, 'class').split(' ').includes('ping')
      ? n
      : [...(n.children ?? []), ...(n.shadowRoots ?? [])].map(find).find(Boolean);
  expect(attr(find(root)!, 'style')).toContain('border-width: 7px');
});

test('a whole sentence searched for is read alone, not with the sentence after it', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  const sentence = await page.evaluate(() => {
    const text = document.querySelector('p')!.textContent!;
    return text.slice(0, text.search(/[.!?] /) + 1);
  });
  await search(bar, sentence);
  await expect(status(bar)).toHaveText(/^1 of/);
  await input(bar).press('Alt+r');
  await expect.poll(() => spoken(sw)).toEqual([sentence]);
});

test('text pasted into the find bar to be heard is read as it is, not as a search with no results', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  const pasted = 'Bring a warm jacket: the wind at the cape is strong, even in summer.';
  // Even over text selected on the page, as when the bar was opened with Ctrl+F on a selection.
  await select(page, 'Far below');
  await input(bar).focus();
  await page.keyboard.insertText(pasted);
  await expect(status(bar)).toHaveText('No results');
  await input(bar).press('Alt+r');
  await expect.poll(() => spoken(sw)).toEqual([pasted]);
});

test('the read aloud shortcut is Alt+R, a browser shortcut, so websites can’t take the key', async ({ sw }) => {
  // On Windows and Linux, a page's access keys fire on Alt+letter even when a script cancels
  // the key press: Alt+R caught in the page also opened "Recent changes" on Wikipedia.
  // Browser shortcuts are handled before the page. (real-keys.spec.ts presses the real keys.)
  const commands = await sw.evaluate(async () => (await chrome.commands.getAll()).map((c) => [c.name, c.shortcut]));
  expect(commands).toContainEqual(['read_aloud', 'Alt+R']);
});

test('the read aloud shortcut works on any page, without the find bar', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  // Selected text is read...
  await select(page, 'swept the bay');
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toEqual(['swept the bay']);
  expect(page.frames().some((f) => f.url().includes('/findbar.html'))).toBe(false);
  // ...and with nothing selected, the sentence where the user clicked.
  await page.locator('#far').click({ position: { x: 40, y: 8 } });
  await page.waitForTimeout(200);
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toEqual(['swept the bay', 'Far below, another lighthouse waited.']);
});

test('the read aloud shortcut reads what’s typed in a form field, but never a password', async ({ page, sw }) => {
  await goto(page, 'form.html');
  // The search box has focus when the page opens, as on many sites.
  await expect(page.locator('#search')).toBeFocused();
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toEqual(['lighthouse keeper']);
  await page.locator('#notes').click();
  await page.locator('#notes').evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(16, 16));
  await page.waitForTimeout(200);
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toHaveLength(2);
  expect((await spoken(sw))[1]).toBe('The second sentence is here.');
  await page.locator('#pin').click();
  await page.locator('#pin').evaluate((el: HTMLInputElement) => el.select());
  await page.waitForTimeout(200);
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toHaveLength(3);
  expect((await spoken(sw))[2]).not.toContain('1234');
});

test('in the find bar, the read aloud shortcut reads the current match, like the speaker button', async ({
  page,
  sw,
}) => {
  await goto(page, 'basic.html');
  await select(page, 'The keeper');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'beam');
  await expect(status(bar)).toHaveText('1 of 1');
  // "The keeper" is still selected on the page, but the find bar has focus.
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toEqual(['Every night the lighthouse beam swept the bay.']);
});

test('automatic style, on from the start, changes only the colors on dark pages', async ({ page, sw }) => {
  // The user's own profile: no underline, and the magnifier on.
  await sw.evaluate(() =>
    chrome.storage.sync.set({
      schemaVersion: 2,
      profileOrder: ['default'],
      activeProfileId: 'default',
      'profile:default': {
        id: 'default',
        name: 'Default',
        appearance: { underline: { enabled: false, color: '#ff8c00' }, magnifier: { enabled: true, fontSize: 32 } },
      },
    }),
  );
  await goto(page, 'dark.html');
  await openViaCommand(sw, page);
  let bar = await findBar(page);
  await search(bar, 'needle');
  await expect(status(bar)).toHaveText(/of 2$/);
  // The profile's colors for dark backgrounds: amber matches, and a white current one. The user's
  // "no underline" stays.
  await expect
    .poll(() => highlightCss(page))
    .toContain('highlight(accessible-find-match-dark) { background-color: rgb(198, 139, 0); color: rgb(0, 0, 0); text-decoration: none;');
  expect(await highlightCss(page)).toContain('highlight(accessible-find-current-dark) { background-color: rgb(255, 255, 255);');
  expect(await page.evaluate(() => CSS.highlights.get('accessible-find-match-dark')?.size)).toBe(2);
  // The profile picker and the switches stay available, showing the user's own options.
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await expect(bar.getByText('This page looks dark, so matches use colors made for dark backgrounds.')).toBeVisible();
  await expect(bar.getByRole('combobox', { name: 'Profile' })).toHaveValue('default');
  await expect(bar.getByRole('switch', { name: 'Magnifier' })).toBeChecked();
  await expect(bar.getByRole('switch', { name: 'Spotlight' })).not.toBeChecked();
  await expect(bar.getByRole('switch', { name: 'Underline' })).not.toBeChecked();
  await input(bar).press('Escape');

  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  bar = await findBar(page);
  await search(bar, 'beam');
  await expect(status(bar)).toHaveText('1 of 1');
  // On a light page, the profile's own yellow.
  await expect.poll(() => highlightCss(page)).toContain('highlight(accessible-find-match) { background-color: rgb(255, 214, 10)');
});

test('automatic style colors each match for the background it’s on', async ({ page, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { motion: 'reduce' } }));
  await goto(page, 'mixed.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'needle');
  await expect(status(bar)).toHaveText(/of 3$/);
  const sizes = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ['match', 'match-dark', 'current', 'current-dark'].map((n) => [n, CSS.highlights.get(`accessible-find-${n}`)?.size]),
      ),
    );
  // The paragraph's match in the profile's yellow; the ones in the code block and over the
  // dark picture in the colors for dark backgrounds.
  await expect.poll(sizes).toMatchObject({ match: 1, 'match-dark': 2 });
  const css = await highlightCss(page);
  expect(css).toContain('highlight(accessible-find-match) { background-color: rgb(255, 214, 10)');
  expect(css).toContain('highlight(accessible-find-match-dark) { background-color: rgb(198, 139, 0)');
  // The current match goes wherever it is, one at a time.
  const where = async () => {
    const s = await sizes();
    return s.current === 1 && s['current-dark'] === 0 ? 'light' : s.current === 0 && s['current-dark'] === 1 ? 'dark' : '?';
  };
  const seen: string[] = [];
  for (let i = 0; i < 3; i++) {
    const before = await status(bar).textContent();
    await input(bar).press('Enter');
    await expect(status(bar)).not.toHaveText(before!);
    seen.push(await where());
  }
  expect(seen.sort()).toEqual(['dark', 'dark', 'light']);

  // Without automatic style, every match uses the profile's own colors.
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await bar.getByRole('switch', { name: 'Automatic style' }).click();
  await expect
    .poll(() => highlightCss(page))
    .toContain('highlight(accessible-find-match-dark) { background-color: rgb(255, 214, 10)');
});

test('quick settings show an example of each effect, inside the find bar', async ({ page, sw }) => {
  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await bar.getByRole('button', { name: 'Quick settings' }).click();
  await bar.getByRole('button', { name: 'Example: Magnifier' }).hover();
  const card = bar.locator('[data-slot=hover-card-content]');
  await expect(card).toContainText('in large text');
  // The bar's frame is sized to the bar, so the card must fit inside it to be seen whole.
  const inside = await card.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  expect(inside).toBe(true);
  // Escape closes the example, not the quick settings or the find bar.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(bar.locator('#quick-settings')).toBeVisible();
});

test('the practice page works with Ctrl+F and the toolbar button, and searches only the article', async ({
  context,
  sw,
}) => {
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/practice.html`);
  await page.bringToFront();
  await expect(page.getByRole('heading', { name: 'Try Accessible Find here' })).toBeVisible();
  // The extension's own shortcut is taught alongside Ctrl+F.
  await expect(page.getByLabel('Alt+Shift+F')).toBeVisible();
  await page.keyboard.press('Control+f');
  let bar = await findBar(page);
  await search(bar, 'lighthouse');
  // Six in the article; the instructions mention it too but aren't searched.
  await expect(status(bar)).toHaveText(/of 6$/);
  await search(bar, 'camoes');
  await expect(status(bar)).toHaveText('1 of 1');
  await search(bar, "visitor's postcard");
  await expect(status(bar)).toHaveText('1 of 1');
  await expect.poll(() => page.locator('details').evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true);
  await input(bar).press('Escape');
  await expect(page.locator('accessible-find-overlay')).toHaveCount(0);

  // Reading aloud works here too, with the find bar closed.
  await select(page, 'the cliffs turn gold');
  await readViaCommand(sw);
  await expect.poll(() => spoken(sw)).toEqual(['the cliffs turn gold']);

  // The toolbar button and keyboard shortcut go through the background.
  await openActiveViaCommand(sw);
  bar = await findBar(page);
  await expect(input(bar)).toBeVisible();
});

test.describe('searching for the selected text', () => {
  test('opening with Ctrl+F searches for the selection', async ({ page }) => {
    await goto(page, 'basic.html');
    await select(page, 'swept');
    await page.keyboard.press('Control+f');
    const bar = await findBar(page);
    await expect(input(bar)).toHaveValue('swept');
    await expect(status(bar)).toHaveText('1 of 1');
  });

  test('Ctrl+F with new text selected while the bar is open switches to it', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'beam');
    await expect(status(bar)).toHaveText('1 of 1');
    await page.locator('#first').click({ position: { x: 4, y: 4 } });
    await select(page, 'swept');
    await page.keyboard.press('Control+f');
    await expect(input(bar)).toHaveValue('swept');
  });

  test("Ctrl+F in the find bar doesn't replace what's being typed", async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await select(page, 'swept');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await expect(input(bar)).toHaveValue('swept');
    await search(bar, 'rocks');
    // The page selection is still "swept"; the shortcut pressed with the bar focused keeps "rocks".
    await openViaCommand(sw, page);
    await page.waitForTimeout(300);
    await expect(input(bar)).toHaveValue('rocks');
  });

  test('long selections are shortened at a word instead of ignored', async ({ page }) => {
    await goto(page, 'selections.html');
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('long')!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.keyboard.press('Control+f');
    const bar = await findBar(page);
    await expect(input(bar)).toHaveValue(/^This is a long paragraph that goes on and on\./);
    const value = await input(bar).inputValue();
    const full = await page.evaluate(() => document.getElementById('long')!.textContent!.replace(/\s+/g, ' ').trim());
    expect(full.length).toBeGreaterThan(300);
    expect(value.length).toBeLessThanOrEqual(300);
    // Cut at a word boundary.
    expect(full.startsWith(value)).toBe(true);
    expect(full[value.length]).toBe(' ');
    await expect(status(bar)).toHaveText('1 of 1');
  });

  test('a selection inside an embedded frame is used', async ({ page }) => {
    await goto(page, 'selections.html');
    const frame = page.frames().find((f) => f.url().startsWith('about:srcdoc'))!;
    await frame.locator('p').click({ position: { x: 2, y: 2 } });
    await select(frame, 'octopus');
    await frame.locator('p').press('Control+f');
    const bar = await findBar(page);
    await expect(input(bar)).toHaveValue('octopus');
  });
});
