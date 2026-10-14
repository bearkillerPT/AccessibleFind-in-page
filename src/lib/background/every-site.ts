/**
 * "Ctrl+F on every website": with the optional all-sites permission granted, a small
 * hotkey script runs on every page, so the extension catches Ctrl+F where it can run and
 * the browser's own find handles it everywhere else.
 */
import { browser } from 'wxt/browser';
import { HOTKEY_ENABLED_KEY } from '../messages';

export const EVERY_SITE_ORIGINS = ['<all_urls>'];
const SCRIPT_ID = 'accessible-find-hotkey';

export function hasEverySiteAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: EVERY_SITE_ORIGINS });
}

/**
 * Registers or unregisters the hotkey script to match the permission. `refresh`
 * re-registers it and re-injects into open tabs (after an install or update).
 */
export async function syncHotkeyScript({ refresh = false } = {}): Promise<void> {
  const granted = await hasEverySiteAccess();
  await browser.storage.local.set({ [HOTKEY_ENABLED_KEY]: granted });
  const registered = (await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0;
  if (registered && (!granted || refresh)) {
    await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
  if (!granted || (registered && !refresh)) return;
  await browser.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      js: ['hotkey.js'],
      matches: ['<all_urls>'],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: 'document_start',
      persistAcrossSessions: true,
    },
  ]);
  // Registered scripts only reach pages loaded from now on; cover already-open tabs too.
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? undefined
        : browser.scripting
            .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['/hotkey.js'] })
            .catch(() => undefined),
    ),
  );
}
