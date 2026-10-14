/**
 * Every-site mode: a tiny script registered on all pages (only after the user grants
 * access) that turns Ctrl+F (Cmd+F on macOS) into "open Accessible Find".
 *
 * Pages extensions can't run on (browser settings, the Web Store, PDFs) never get this
 * script, so the browser's own find keeps working there instead of Ctrl+F doing nothing.
 *
 * Reading aloud is a browser shortcut (the read_aloud command), not a key caught here: on
 * Windows and Linux, a page's access keys fire on Alt+letter even when the key press is
 * cancelled, so Alt+R caught here would also follow Wikipedia's "Recent changes" link.
 */
import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { HOTKEY_ENABLED_KEY, OPEN_FINDER_MESSAGE } from '../lib/messages';
import { isLetterKey } from '../lib/shortcuts';

const GLOBAL = '__accessibleFindHotkey';

export default defineUnlistedScript(() => {
  // Chrome's PDF viewer: leave Ctrl+F to the viewer's own find.
  if (document.contentType === 'application/pdf') return;

  // After an extension update the script is injected again; only the newest copy acts.
  const token = {};
  const scope = globalThis as unknown as Record<string, object | undefined>;
  scope[GLOBAL] = token;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  const alive = () => {
    try {
      return Boolean(browser.runtime?.id);
    } catch {
      return false;
    }
  };

  // Turning every-site mode off unregisters this script for new pages, but copies already
  // running in open tabs must stop too, or Ctrl+F would do nothing there.
  let enabled = true;
  const area = browser.storage.local;
  void area.get(HOTKEY_ENABLED_KEY).then((v) => {
    if (v[HOTKEY_ENABLED_KEY] === false) enabled = false;
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    const change = changes[HOTKEY_ENABLED_KEY];
    if (areaName === 'local' && change) enabled = change.newValue !== false;
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (scope[GLOBAL] !== token || !alive()) {
      // Superseded or orphaned: step aside so the browser's find works.
      window.removeEventListener('keydown', onKeyDown, true);
      return;
    }
    if (!enabled) return;
    const modifier = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!modifier || e.altKey || e.shiftKey || e.isComposing || !isLetterKey(e, 'f')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Send along what's selected here: in a frame, the top page can't see it.
    const selection = window.getSelection()?.toString() ?? '';
    browser.runtime.sendMessage({ type: OPEN_FINDER_MESSAGE, selection }).catch(() => {});
  };
  window.addEventListener('keydown', onKeyDown, true);
});
