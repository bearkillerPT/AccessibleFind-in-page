import { browser, type Browser } from 'wxt/browser';
import { EXTENSION_PAGE_MESSAGE, FINDER_GLOBAL } from '../messages';
import { classifyInjectionError, showUnavailable } from './unavailable';

/*
 * These run inside the page (in the extension's isolated world), so they must be
 * self-contained: chrome.scripting serializes the function source, not its closure.
 */
interface Probe {
  loaded: boolean;
  pdf: boolean;
  html: boolean;
  /** Whether text is selected in the top frame. */
  selected: boolean;
}

function probePage(globalName: string): Probe {
  const scope = globalThis as unknown as Record<string, { alive(): boolean; destroy(): void } | undefined>;
  const existing = scope[globalName];
  if (existing && !existing.alive()) {
    try {
      existing.destroy();
    } catch {
      // Left over from a previous version of the extension.
    }
    delete scope[globalName];
  }
  return {
    loaded: Boolean(scope[globalName]),
    pdf: document.contentType === 'application/pdf',
    // SVG and XML files have no HTML document to put the find bar in.
    html: document.documentElement?.namespaceURI === 'http://www.w3.org/1999/xhtml',
    selected: Boolean(window.getSelection()?.toString().trim()),
  };
}

/** The selection in this frame, if it's the one with focus. */
function focusedFrameSelection(): string {
  return document.hasFocus() ? (window.getSelection()?.toString() ?? '') : '';
}

/** What the finder is asked to do: open the find bar, or read aloud. */
type FinderAction = 'open' | 'read';

/** True if the finder did it. Chrome doesn't reject executeScript when the function throws. */
function runInPage(globalName: string, method: 'open' | 'readAloud', selection: string): boolean {
  try {
    type Finder = Partial<Record<'open' | 'readAloud', (selection?: string) => void>>;
    const run = (globalThis as unknown as Record<string, Finder | undefined>)[globalName]?.[method];
    if (!run) return false;
    run(selection);
    return true;
  } catch (error) {
    console.error('Accessible Find could not run:', error);
    return false;
  }
}

/** Asks an extension page (the practice page) showing in the tab to do it with its own finder. */
async function askExtensionPage(tabId: number, action: FinderAction): Promise<boolean> {
  try {
    return (await browser.runtime.sendMessage({ type: EXTENSION_PAGE_MESSAGE, tabId, action })) === true;
  } catch {
    return false; // No extension page answered.
  }
}

/**
 * Text selected in an embedded frame. The top page can't see it, so ask the frames we're
 * allowed into (all of them in every-site mode, same-site ones otherwise).
 */
async function frameSelection(tabId: number): Promise<string> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: focusedFrameSelection,
    });
    return results.find((r) => r.frameId !== 0 && typeof r.result === 'string' && r.result.trim())?.result ?? '';
  } catch {
    return '';
  }
}

/**
 * Opens (or focuses) the find bar in a tab, or explains why it can't. `selection` is text
 * selected where Ctrl+F was pressed (sent by the every-site hotkey script, maybe from a frame).
 */
export function openFinder(tab: Browser.tabs.Tab | undefined, selection?: string): Promise<void> {
  return runFinder(tab, 'open', selection);
}

/**
 * Reads aloud in a tab (or stops reading), with or without the find bar: the selected text,
 * the current match, or the sentence at the caret (see Finder.readAloud).
 */
export function readAloud(tab: Browser.tabs.Tab | undefined): Promise<void> {
  return runFinder(tab, 'read');
}

/** Runs the finder in a tab's top frame, injecting it first if needed, or explains why it can't. */
async function runFinder(tab: Browser.tabs.Tab | undefined, action: FinderAction, selection?: string): Promise<void> {
  const tabId = tab?.id;
  if (!tab || tabId === undefined) return;
  const target = { tabId, frameIds: [0] };
  let probe: Probe | undefined;
  try {
    const [result] = await browser.scripting.executeScript({ target, func: probePage, args: [FINDER_GLOBAL] });
    probe = result?.result;
  } catch (error) {
    // Our own pages can't be scripted, but the practice page runs the finder itself.
    if (await askExtensionPage(tabId, action)) return;
    await showUnavailable(tab, await classifyInjectionError(error, tab.url));
    return;
  }
  if (!probe) {
    await showUnavailable(tab, 'unknown');
    return;
  }
  if (probe.pdf || !probe.html) {
    await showUnavailable(tab, probe.pdf ? 'pdf' : 'not-html');
    return;
  }
  try {
    if (!probe.loaded) await browser.scripting.executeScript({ target, files: ['/finder.js'] });
    const text = selection?.trim() ? selection : probe.selected ? '' : await frameSelection(tabId);
    const method = action === 'read' ? 'readAloud' : 'open';
    const [done] = await browser.scripting.executeScript({
      target,
      func: runInPage,
      args: [FINDER_GLOBAL, method, text],
    });
    if (done?.result !== true) await showUnavailable(tab, 'unknown');
  } catch (error) {
    // The tab navigated away mid-way, or the page became inaccessible.
    await showUnavailable(tab, await classifyInjectionError(error, tab.url));
  }
}
