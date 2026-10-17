import { browser } from 'wxt/browser';
import { OPEN_COMMAND } from './messages';

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const isEdge = () => navigator.userAgent.includes('Edg/');
/** Whether this is the Firefox build (decided when building, so each build keeps only its own code). */
export const isFirefox = import.meta.env.FIREFOX;

/** The browser's page for assigning extension keyboard shortcuts. */
export const shortcutsUrl = () => (isEdge() ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts');

/** This extension's details page (where "Allow access to file URLs" lives). */
export const extensionDetailsUrl = () =>
  `${isEdge() ? 'edge' : 'chrome'}://extensions/?id=${browser.runtime.id}`;

/** How to reach the browser's own find without Ctrl+F. */
export const nativeFindHint = () =>
  isFirefox
    ? 'open the ☰ menu and choose “Find in page…”'
    : isEdge()
      ? 'open the … menu and choose “Find on page”'
      : 'open the ⋮ menu and choose “Find and edit” → “Find…”';

/** Browser pages (chrome://…) can be opened from extension pages, but not with links. */
export function openBrowserPage(url: string): void {
  void browser.tabs.create({ url });
}

/** Opens the browser's page for extension keyboard shortcuts (Firefox has a call for it). */
export function openShortcutSettings(): void {
  if (isFirefox) {
    void (browser.commands as unknown as { openShortcutSettings(): Promise<void> }).openShortcutSettings();
  } else {
    openBrowserPage(shortcutsUrl());
  }
}

/** The shortcut assigned to one of the extension's commands (opening it, by default), or '' if none. */
export async function currentShortcut(command = OPEN_COMMAND): Promise<string> {
  const commands = await browser.commands.getAll();
  return commands.find((c) => c.name === command)?.shortcut ?? '';
}

/** Whether a shortcut string (as Chrome reports it) is Ctrl+F / ⌘F. */
export function isCtrlF(shortcut: string): boolean {
  const s = shortcut.replace(/\s+/g, '').toLowerCase();
  return s === 'ctrl+f' || s === '⌘f' || s === 'command+f' || s === 'cmd+f';
}

/** Ctrl+F written the way this platform labels it. */
export const ctrlFLabel = () => (isMac() ? '⌘F' : 'Ctrl+F');

/** Opens the practice page in a new tab. */
export function openPracticePage(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/practice.html') });
}

/** Opens the settings in a new tab, at one of its pages (`appearance`, `welcome`...) if given. */
export function openSettings(page?: string): void {
  void browser.tabs.create({ url: browser.runtime.getURL(`/options.html${page ? `#${page}` : ''}`) });
}
