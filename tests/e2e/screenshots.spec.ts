/**
 * Captures screenshots of the UI for visual review and store listings.
 * Only runs when SCREENSHOTS is set:  SCREENSHOTS=out/dir npm run test:e2e -- screenshots
 */
import path from 'node:path';
import { findBar, goto, openViaCommand, search, test } from './harness';

const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, 'Set SCREENSHOTS=<dir> to capture screenshots');
const shot = (name: string) => path.join(OUT ?? '.', `${name}.png`);

async function setPrefs(sw: import('@playwright/test').Worker, prefs: Record<string, unknown>) {
  await sw.evaluate(async (p) => {
    const { prefs: current } = await chrome.storage.sync.get('prefs');
    await chrome.storage.sync.set({ schemaVersion: 2, prefs: { ...(current as object), ...p } });
  }, prefs);
}

/** The spotlight and magnifier start off; the pictures show them. */
async function showAllEffects(sw: import('@playwright/test').Worker) {
  await sw.evaluate(() =>
    chrome.storage.sync.set({
      profileOrder: ['default'],
      activeProfileId: 'default',
      'profile:default': {
        id: 'default',
        name: 'Default',
        appearance: { spotlight: { enabled: true, opacity: 0.4 }, magnifier: { enabled: true, fontSize: 32 } },
      },
    }),
  );
}

for (const theme of ['dark', 'light'] as const) {
  test(`find bar on a page (${theme})`, async ({ page, sw }) => {
    await setPrefs(sw, { theme });
    await showAllEffects(sw);
    await page.setViewportSize({ width: 1280, height: 800 });
    await goto(page, 'article.html');
    await openViaCommand(sw, page);
    const bar = await findBar(page);
    await search(bar, 'lighthouse');
    await page.waitForTimeout(2600); // let the blink and ring finish
    await page.screenshot({ path: shot(`findbar-${theme}`) });
    await bar.getByRole('button', { name: 'Quick settings' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`findbar-quick-settings-${theme}`) });
    await bar.getByRole('button', { name: 'All matches (Alt+L)' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`findbar-results-list-${theme}`) });
  });

  test(`practice page (${theme})`, async ({ context, sw }) => {
    await setPrefs(sw, { theme });
    const id = new URL(sw.url()).host;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`chrome-extension://${id}/practice.html`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`practice-${theme}`) });
  });

  test(`options page (${theme})`, async ({ context, sw }) => {
    await setPrefs(sw, { theme });
    const id = new URL(sw.url()).host;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const hash of ['whats-new', 'appearance', 'display', 'shortcuts', 'read-aloud', 'backup']) {
      await page.goto(`chrome-extension://${id}/options.html#${hash}`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot(`options-${hash === 'whats-new' ? 'top' : hash}-${theme}`) });
    }
  });

  test(`unavailable popup (${theme})`, async ({ context, sw }) => {
    await setPrefs(sw, { theme });
    const id = new URL(sw.url()).host;
    const page = await context.newPage();
    await page.setViewportSize({ width: 420, height: 420 });
    await page.goto(`chrome-extension://${id}/unavailable.html?reason=pdf`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot(`unavailable-${theme}`) });
  });
}
