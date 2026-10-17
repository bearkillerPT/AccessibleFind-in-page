/**
 * Feedback for pages the extension can't run on. Without this, the shortcut would do
 * nothing at all there, because it replaced the browser's own Ctrl+F.
 */
import { browser, type Browser } from 'wxt/browser';

export type UnavailableReason =
  | 'browser-page'
  | 'store'
  /** Mozilla's own sites, which Firefox keeps extensions off. */
  | 'mozilla-site'
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
  if (
    /extensions gallery|chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org/.test(
      text,
    )
  ) {
    return 'store';
  }
  if (/support\.mozilla\.org|accounts\.firefox\.com|install\.mozilla\.org|services\.mozilla\.com|cdn\.mozilla\.net/.test(text)) {
    return 'mozilla-site';
  }
  if (text.includes('file://')) {
    return (await browser.extension.isAllowedFileSchemeAccess()) ? 'blocked' : 'file';
  }
  if (/chrome-extension:|moz-extension:|\bextension:\/\//.test(text)) return 'extension-page';
  if (/\b(chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-untrusted|chrome-search|resource):/.test(text)) {
    return 'browser-page';
  }
  // Firefox's PDF viewer can't be scripted, and only the address tells it's a PDF.
  if (/\.pdf([?#]|$)/.test((url ?? '').toLowerCase())) return 'pdf';
  // Firefox hides the address of its own pages (about:, view-source:) from extensions.
  if (!url && text.includes('missing host permission')) return 'browser-page';
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
