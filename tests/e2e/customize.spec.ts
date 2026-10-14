/** Changing the find bar's shortcuts, and backing up / sharing settings, from the settings page. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, findBar, goto, openViaCommand, search, status, test } from './harness';

/** Opens a page of the settings, like '#shortcuts'. */
async function openSettings(context: BrowserContext, sw: Worker, hash: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html${hash}`);
  await expect(page.locator(`${hash}-title`)).toBeVisible();
  return page;
}

const storedPrefs = (sw: Worker) =>
  sw.evaluate(async () => (await chrome.storage.sync.get('prefs')).prefs as { shortcuts: Record<string, string> });

test('a shortcut can be re-recorded, and the find bar follows it', async ({ context, sw, page }) => {
  const settings = await openSettings(context, sw, '#shortcuts');
  const change = settings.getByRole('button', { name: 'Change the shortcut for Show all matches' });
  await change.click();
  // A plain letter would type into the search box: refused, still recording.
  await settings.keyboard.press('KeyK');
  await expect(settings.getByRole('alert')).toContainText('modifier');
  await settings.keyboard.press('Control+Alt+KeyL');
  await expect.poll(async () => (await storedPrefs(sw))?.shortcuts?.list).toBe('Ctrl+Alt+KeyL');
  await expect(settings.getByRole('list', { name: 'Shortcuts' })).toContainText('Ctrl');

  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  await expect(status(bar)).toHaveText(/of 4$/);
  const input = bar.getByRole('textbox', { name: 'Find in page' });
  await input.press('Alt+KeyL');
  await expect(bar.locator('#results-list')).toHaveCount(0);
  await input.press('Control+Alt+KeyL');
  await expect(bar.locator('#results-list')).toBeVisible();
  await expect(bar.getByRole('button', { name: 'All matches (Ctrl+Alt+L)' })).toBeVisible();
});

test('a combination typed with AltGr is refused, since the find bar ignores it', async ({ context, sw }) => {
  const settings = await openSettings(context, sw, '#shortcuts');
  const change = settings.getByRole('button', { name: 'Change the shortcut for Show all matches' });
  await change.click();
  // Playwright can't hold AltGr, so send the focused button what Chrome does for AltGr+A
  // (Ctrl+Alt on Windows).
  await settings.evaluate(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyA', key: 'ą', ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true,
      } as KeyboardEventInit),
    ),
  );
  await expect(settings.getByRole('alert')).toContainText('AltGr');
  expect((await storedPrefs(sw))?.shortcuts?.list).not.toBe('Ctrl+Alt+KeyA');
  // Still recording: a real combination goes through.
  await settings.keyboard.press('Control+Alt+KeyL');
  await expect.poll(async () => (await storedPrefs(sw))?.shortcuts?.list).toBe('Ctrl+Alt+KeyL');
});

test('a saved shortcut that won’t work here is pointed out', async ({ context, sw }) => {
  // As if set up on another computer, or before these checks existed.
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { shortcuts: { list: 'Ctrl+F4' } } }));
  const settings = await openSettings(context, sw, '#shortcuts');
  const warning = settings.getByText('Ctrl+F4 won’t work here. That shortcut closes the tab or the window.');
  await expect(warning).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Change the shortcut for Show all matches' })).toHaveAccessibleDescription(
    /won’t work here/,
  );
  await expect(settings.getByText('won’t work here')).toHaveCount(1); // Only that row.
  await settings.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(warning).toHaveCount(0);
});

test('a preset changes all the shortcuts at once', async ({ context, sw }) => {
  const settings = await openSettings(context, sw, '#shortcuts');
  await settings.getByRole('button', { name: 'Ctrl+Alt', exact: true }).click();
  await expect
    .poll(async () => (await storedPrefs(sw))?.shortcuts)
    .toEqual({
      matchCase: 'Ctrl+Alt+KeyC',
      matchAccents: 'Ctrl+Alt+KeyA',
      wholeWord: 'Ctrl+Alt+KeyW',
      list: 'Ctrl+Alt+KeyL',
      readAloud: 'Ctrl+Alt+KeyR',
    });
  await settings.getByRole('button', { name: 'Reset all to the defaults' }).click();
  await expect.poll(async () => (await storedPrefs(sw))?.shortcuts?.list).toBe('Alt+KeyL');
});

test('the Ctrl+Shift preset keeps clear of Ctrl+Shift+W, which closes the window', async ({ context, sw, page }) => {
  const settings = await openSettings(context, sw, '#shortcuts');
  await settings.getByRole('button', { name: 'Ctrl+Shift', exact: true }).click();
  await expect.poll(async () => (await storedPrefs(sw))?.shortcuts?.wholeWord).toBe('Ctrl+Shift+KeyO');
  await expect(settings.getByRole('button', { name: 'Ctrl+Shift', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  const wholeWord = bar.getByRole('button', { name: 'Whole words only (Ctrl+Shift+O)' });
  await expect(wholeWord).toHaveAttribute('aria-pressed', 'false');
  await bar.getByRole('textbox', { name: 'Find in page' }).press('Control+Shift+KeyO');
  await expect(wholeWord).toHaveAttribute('aria-pressed', 'true');
});

test('the Super (Windows logo) key preset works in the find bar on Linux', async ({ context, sw, page }) => {
  const settings = await openSettings(context, sw, '#shortcuts');
  await expect(settings.getByText('Super is the key with the Windows logo.')).toBeVisible();
  await settings.getByRole('button', { name: 'Super', exact: true }).click();
  await expect
    .poll(async () => (await storedPrefs(sw))?.shortcuts)
    .toEqual({
      matchCase: 'Meta+KeyC',
      matchAccents: 'Meta+KeyA',
      wholeWord: 'Meta+KeyW',
      list: 'Meta+KeyL',
      readAloud: 'Meta+KeyR',
    });
  await expect(settings.getByRole('button', { name: 'Super', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await goto(page, 'basic.html');
  await openViaCommand(sw, page);
  const bar = await findBar(page);
  await search(bar, 'lighthouse');
  const input = bar.getByRole('textbox', { name: 'Find in page' });
  await input.press('Alt+KeyL');
  await expect(bar.locator('#results-list')).toHaveCount(0);
  await input.press('Meta+KeyL');
  await expect(bar.locator('#results-list')).toBeVisible();
  await expect(bar.getByRole('button', { name: 'All matches (Super+L)' })).toBeVisible();
});

test('a backup can be downloaded and restored', async ({ context, sw }, testInfo) => {
  const settings = await openSettings(context, sw, '#backup');
  // Something to back up: a custom text size.
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { uiScale: 2 } }));

  const [download] = await Promise.all([
    settings.waitForEvent('download'),
    settings.getByRole('button', { name: 'Download a backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^accessible-find-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const backup = JSON.parse(await readFile(file, 'utf8'));
  expect(backup.format).toBe('accessible-find-backup');
  expect(backup.prefs.uiScale).toBe(2);

  // Change things, then restore.
  await sw.evaluate(() => chrome.storage.sync.set({ prefs: { uiScale: 1 } }));
  const [chooser] = await Promise.all([
    settings.waitForEvent('filechooser'),
    settings.getByRole('button', { name: 'Restore a backup' }).click(),
  ]);
  await chooser.setFiles(file);
  await expect(settings.getByRole('alertdialog')).toContainText('will replace all your current ones');
  await settings.getByRole('button', { name: 'Replace' }).click();
  await expect(settings.getByRole('status').filter({ hasText: 'Restored' })).toBeVisible();
  await expect.poll(async () => ((await storedPrefs(sw)) as unknown as { uiScale: number }).uiScale).toBe(2);
});

test('a wrong file is explained, not imported', async ({ context, sw }, testInfo) => {
  const settings = await openSettings(context, sw, '#backup');
  const file = testInfo.outputPath('notes.json');
  await writeFile(file, '{"shopping": ["bread"]}');
  const [chooser] = await Promise.all([
    settings.waitForEvent('filechooser'),
    settings.getByRole('button', { name: 'Restore a backup' }).click(),
  ]);
  await chooser.setFiles(file);
  await expect(settings.getByText('This isn’t an Accessible Find backup.')).toBeVisible();
  await expect(settings.getByRole('alertdialog')).toHaveCount(0);
});

test('a profile can be exported and imported to share it', async ({ context, sw }, testInfo) => {
  const settings = await openSettings(context, sw, '#backup');
  const [download] = await Promise.all([
    settings.waitForEvent('download'),
    settings.getByRole('button', { name: 'Export this profile' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('accessible-find-profile-default.json');
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  const shared = JSON.parse(await readFile(file, 'utf8'));
  expect(shared).toMatchObject({ format: 'accessible-find-profile', name: 'Default' });

  const [chooser] = await Promise.all([
    settings.waitForEvent('filechooser'),
    settings.getByRole('button', { name: 'Import a profile' }).click(),
  ]);
  await chooser.setFiles(path.resolve(file));
  // The name was taken, so the copy is renamed (and the message says so), and it becomes the active profile.
  await expect(settings.getByText('Added “Default (2)” to your profiles and switched to it.')).toBeVisible();
  await expect(settings.getByText('Save the profile you’re using, “Default (2)”')).toBeVisible();
  const names = await sw.evaluate(async () => {
    const all = await chrome.storage.sync.get(null);
    const order = all.profileOrder as string[];
    return { names: order.map((id) => (all[`profile:${id}`] as { name: string }).name), active: all.activeProfileId };
  });
  expect(names.names).toEqual(['Default', 'Default (2)']);
  expect(names.active).not.toBe('default');
});
