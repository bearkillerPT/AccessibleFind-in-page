/**
 * Feedback for pages the extension can't run on. Without this, the shortcut would do
 * nothing at all there, because it replaced the browser's own Ctrl+F.
 */
import { browser, type Browser } from 'wxt/browser';

export type UnavailableReason =
  | 'browser-page'
  | 'store'
  | 'pdf'
  | 'not-html'
  | 'file'
  | 'extension-page'
  | 'error-page'
  | 'blocked'
  | 'unknown';

export async function classifyInjectionError(error: unknown, url?: string): Promise<UnavailableReason> {
  const message = error instanceof Error ? error.message : String(error);
  const text = `${url ?? ''} ${message}`.toLowerCase();
  if (/extensions gallery|chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons/.test(text)) {
    return 'store';
  }
  if (text.includes('file://')) {
    return (await browser.extension.isAllowedFileSchemeAccess()) ? 'blocked' : 'file';
  }
  if (/chrome-extension:|moz-extension:|\bextension:\/\//.test(text)) return 'extension-page';
  if (/\b(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-untrusted|chrome-search):/.test(text)) {
    return 'browser-page';
  }
  if (text.includes('error page')) return 'error-page';
  if (/cannot access|permission/.test(text)) return 'blocked';
  return 'unknown';
}

/**
 * Opens the toolbar popup with an explanation; falls back to a badge on the icon. Chrome
 * resets these per-tab settings itself when the tab navigates, so nothing needs undoing.
 */
export async function showUnavailable(tab: Browser.tabs.Tab, reason: UnavailableReason): Promise<void> {
  const tabId = tab.id;
  if (tabId === undefined) return;
  await browser.action.setPopup({ tabId, popup: `/unavailable.html?reason=${reason}&tab=${tabId}` });
  try {
    await browser.action.openPopup({ windowId: tab.windowId });
  } catch {
    await browser.action.setBadgeText({ tabId, text: '!' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
    await browser.action.setTitle({ tabId, title: "Accessible Find can't run on this page. Click for details." });
  }
}
