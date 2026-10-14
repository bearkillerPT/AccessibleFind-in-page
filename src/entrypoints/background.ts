import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { syncHotkeyScript } from '../lib/background/every-site';
import { openFinder, readAloud } from '../lib/background/open-finder';
import { E2E_SPOKEN_MESSAGE, OPEN_COMMAND, OPEN_FINDER_MESSAGE, READ_ALOUD_COMMAND } from '../lib/messages';
import { openSettings } from '../lib/platform';
import { ensureMigrated } from '../lib/settings/store';

async function activeTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
    await ensureMigrated();
    await syncHotkeyScript({ refresh: true });
    if (reason === 'install') {
      openSettings('welcome');
    } else if (reason === 'update' && previousVersion && Number(previousVersion.split('.')[0]) < 2) {
      openSettings('whats-new');
    }
  });
  browser.runtime.onStartup.addListener(() => void syncHotkeyScript());
  browser.permissions.onAdded.addListener(() => void syncHotkeyScript({ refresh: true }));
  browser.permissions.onRemoved.addListener(() => void syncHotkeyScript());

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command === OPEN_COMMAND) await openFinder(tab ?? (await activeTab()));
    else if (command === READ_ALOUD_COMMAND) await readAloud(tab ?? (await activeTab()));
  });
  browser.action.onClicked.addListener((tab) => void openFinder(tab));
  // From the every-site hotkey script.
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const m = message as { type?: string; selection?: unknown } | null;
    if (m?.type !== OPEN_FINDER_MESSAGE || !sender.tab) return;
    void openFinder(sender.tab, typeof m.selection === 'string' ? m.selection : undefined);
  });

  if (import.meta.env.MODE === 'e2e') {
    // Hooks for the Playwright tests, which can't press the browser's own shortcuts or hear speech.
    const spoken: string[] = [];
    browser.runtime.onMessage.addListener((message: unknown) => {
      const m = message as { type?: string; text?: unknown } | null;
      if (m?.type === E2E_SPOKEN_MESSAGE && typeof m.text === 'string') spoken.push(m.text);
    });
    const __e2e = { openFinder, readAloud, activeTab, syncHotkeyScript, ensureMigrated, spoken };
    Object.assign(globalThis, { __e2e });
  }
});
