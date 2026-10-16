import { expect, findBar, goto, highlightSize, openActiveViaCommand, openViaCommand, search, status, test } from './harness';

test.describe('finding', () => {
  test('Ctrl+F opens the find bar and highlights without touching the page DOM', async ({ page }) => {
    await goto(page, 'basic.html');
    const before = await page.evaluate(() => document.body.innerHTML);
    await page.keyboard.press('Control+f');
    const bar = await findBar(page);
    await search(bar, 'lighthouse');
    // "light<b>house</b>" counts too: matches cross inline elements.
    await expect(status(bar)).toHaveText(/^\d of 4$/);
    expect(await highlightSize(page, 'match')).toBe(4);
    expect(await highlightSize(page, 'current')).toBe(1);
    expect(await page.evaluate(() => document.body.innerHTML)).toBe(before);
  });

  test('page text that looks like HTML stays text', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'onerror');
    await expect(status(bar)).toHaveText('1 of 1');
    await search(bar, '<div>');
    await expect(status(bar)).toHaveText('1 of 1');
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Escape');
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator('#code img').count()).toBe(0);
  });

  test('ignores accents and case by default; options narrow it down', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'acao');
    await expect(status(bar)).toHaveText(/of 2$/);
    await bar.getByRole('button', { name: 'Match accents (Alt+A)' }).click();
    await expect(status(bar)).toHaveText('No results');
    await search(bar, 'ação');
    // Case is still ignored, so "AÇÃO" matches too.
    await expect(status(bar)).toHaveText(/of 2$/);
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Alt+a');
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Alt+c');
    await search(bar, 'AÇÃO');
    await expect(status(bar)).toHaveText('1 of 1');
  });

  test('Enter, Shift+Enter and F3 move between matches and scroll to them', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    const input = bar.getByRole('textbox', { name: 'Find in page' });
    await search(bar, 'lighthouse');
    // The first match selected is the one nearest the middle of the screen.
    await expect(status(bar)).toHaveText(/^[1-3] of 4$/);
    const first = Number((await status(bar).textContent())!.split(' ')[0]);
    await input.press('Enter');
    await expect(status(bar)).toHaveText(`${first + 1} of 4`);
    for (let i = first + 1; i > 0; i--) await input.press('Shift+Enter');
    // Wraps around from the first match to the last.
    await expect(status(bar)).toHaveText('4 of 4');
    // Match 4 is far down the page; it must have been scrolled into view.
    await expect.poll(() => page.evaluate(() => {
      const r = document.getElementById('far')!.getBoundingClientRect();
      return r.top > 0 && r.bottom < innerHeight;
    })).toBe(true);
    // Focus the page (left edge, away from the bar), then use the page-level shortcut.
    await page.locator('#far').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('F3');
    await expect(status(bar)).toHaveText('1 of 4');
  });

  test('Escape closes, removes highlights and leaves the match selected', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'beam');
    await expect(status(bar)).toHaveText('1 of 1');
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Escape');
    await expect(page.locator('accessible-find-overlay')).toHaveCount(0);
    expect(await highlightSize(page, 'match')).toBe(0);
    expect(await page.evaluate(() => getSelection()?.toString())).toBe('beam');
  });

  test('Ctrl+Enter follows a link at the current match', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'lighthouse link');
    await expect(status(bar)).toHaveText('1 of 1');
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Control+Enter');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#linked');
  });

  test('reopening offers the previous search', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    let bar = await findBar(page);
    await search(bar, 'beam');
    await bar.getByRole('textbox', { name: 'Find in page' }).press('Escape');
    await page.evaluate(() => getSelection()?.removeAllRanges());
    await openViaCommand(sw, page);
    bar = await findBar(page);
    await expect(bar.getByRole('textbox', { name: 'Find in page' })).toHaveValue('beam');
    await expect(status(bar)).toHaveText('1 of 1');
  });
});

test.describe('hard pages', () => {
  test('searches open and closed shadow roots and slotted content', async ({ page, sw }) => {
    await goto(page, 'shadow.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'needle');
    await expect(status(bar)).toHaveText(/of 4$/);
  });

  test('reveals closed <details> and hidden=until-found content', async ({ page, sw }) => {
    await goto(page, 'reveal.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    const input = bar.getByRole('textbox', { name: 'Find in page' });
    await search(bar, 'marmalade');
    // The plain hidden div is not searchable; details and until-found are.
    await expect(status(bar)).toHaveText(/of 3$/);
    await input.press('Enter');
    await input.press('Enter');
    await input.press('Enter');
    expect(await page.evaluate(() => (document.getElementById('details') as HTMLDetailsElement).open)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('until')!.hasAttribute('hidden'))).toBe(false);
  });

  test("doesn't break pages that update their own text, and picks up new content", async ({ page, sw }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await goto(page, 'dynamic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'needle');
    await expect(status(bar)).toHaveText(/of 2$/);
    const ticks = await page.evaluate(() => (window as unknown as { __ticks(): number }).__ticks());
    await page.evaluate(() => (window as unknown as { addNeedles(n: number): void }).addNeedles(3));
    await expect(status(bar)).toHaveText(/of 5$/);
    await expect(page.locator('#counter')).not.toHaveText(`tick ${ticks}`);
    expect(errors).toEqual([]);
  });

  test('stays on top of modal dialogs and maximum z-index elements', async ({ page, sw }) => {
    await goto(page, 'dialog.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).showModal());
    await search(bar, 'dialog');
    await expect(status(bar)).toHaveText('1 of 1');
    const onTop = await page.evaluate(() => {
      const host = document.querySelector('accessible-find-overlay')!;
      // Probe the top-right corner, where the bar is.
      return document.elementFromPoint(innerWidth - 40, 30) === host;
    });
    expect(onTop).toBe(true);
  });
});

test.describe('settings and feedback', () => {
  test('appearance changes apply to the open page right away', async ({ page, sw }) => {
    await goto(page, 'basic.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'beam');
    await expect(status(bar)).toHaveText('1 of 1');
    await sw.evaluate(async () => {
      const all = await chrome.storage.sync.get(null);
      const key = `profile:${all.activeProfileId ?? 'default'}`;
      const profile = (all[key] as { appearance: Record<string, unknown> } | undefined) ?? {
        id: 'default',
        name: 'Default',
        appearance: {},
      };
      profile.appearance = { ...profile.appearance, matchBg: '#00ff00' };
      await chrome.storage.sync.set({ schemaVersion: 2, profileOrder: ['default'], [key]: profile });
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.adoptedStyleSheets.some((s) => [...s.cssRules].some((r) => r.cssText.includes('rgb(0, 255, 0)'))),
        ),
      )
      .toBe(true);
  });

  test('explains instead of failing silently on browser pages', async ({ context, sw }) => {
    const page = await context.newPage();
    await page.goto('chrome://version');
    await page.bringToFront();
    await openActiveViaCommand(sw);
    const shown = await sw.evaluate(async () => {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP' as never] });
      const popupUrl = contexts.map((c) => c.documentUrl).join(' ');
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const badge = await chrome.action.getBadgeText({ tabId: tab!.id });
      return { popupUrl, badge };
    });
    expect(shown.popupUrl.includes('unavailable.html?reason=browser-page') || shown.badge === '!').toBe(true);
  });

  test('the old v1 settings are migrated', async ({ sw }) => {
    const state = await sw.evaluate(async () => {
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set({
        settings: { highlightBgColor: '#123456', selectedTextColor: '#ffffff', matchFontSize: 30 },
        profiles: [{ id: 'default', name: 'Default', settings: { highlightBgColor: '#123456', matchFontSize: 30 } }],
        activeProfileId: 'default',
      });
      // Simulate the update event's migration step.
      const { ensureMigrated } = (globalThis as unknown as { __e2e: { ensureMigrated?: () => Promise<void> } }).__e2e;
      if (ensureMigrated) await ensureMigrated();
      return chrome.storage.sync.get(null);
    });
    expect(state.schemaVersion).toBe(2);
    expect((state['profile:default'] as { appearance: { matchBg: string } }).appearance.matchBg).toBe('#123456');
    expect(state.settings).toBeUndefined();
  });
});
