import type { MatchContext } from './search/matcher';
import type { PageTone, SearchOptions } from './settings/types';

/** postMessage type the content script uses to hand the find bar its MessagePort. */
export const CONNECT_MESSAGE = 'accessible-find:connect';

/** Runtime message the every-site hotkey script sends when Ctrl+F is pressed. */
export const OPEN_FINDER_MESSAGE = 'accessible-find:open';

/** storage.local key: false tells hotkey scripts already running in tabs to stand down. */
export const HOTKEY_ENABLED_KEY = 'hotkeyEnabled';

/** Name of the keyboard command in the manifest. Kept from v1: Chrome stores shortcuts by name. */
export const OPEN_COMMAND = 'open_popup';

/**
 * Keyboard command for reading aloud, with or without the find bar (Alt+R by default). A
 * browser shortcut, because Chrome handles those before the page and its access keys.
 */
export const READ_ALOUD_COMMAND = 'read_aloud';

/**
 * Runtime message the background sends to extension pages (the practice page) when the
 * finder can't be injected into a tab because it's one of ours: `{ tabId, action }`, where
 * the action is 'open' (the find bar) or 'read' (aloud).
 */
export const EXTENSION_PAGE_MESSAGE = 'accessible-find:extension-page';

/** e2e builds only: what would be read aloud, sent to the service worker for the tests. */
export const E2E_SPOKEN_MESSAGE = 'accessible-find:e2e-spoken';

/** Global the finder content script registers in the extension's isolated world. */
export const FINDER_GLOBAL = '__accessibleFind';

export interface FinderApi {
  /** `selection`: text selected where the shortcut was pressed (maybe in a frame), to search for. */
  open(selection?: string): void;
  /** Reads aloud, or stops reading. `selection`: text selected in a frame, read first. */
  readAloud(selection?: string): void;
  /** False once the extension has been updated or reloaded underneath this script. */
  alive(): boolean;
  destroy(): void;
}

/** Messages from the find bar (iframe) to the finder (content script). */
export type BarMessage =
  | { t: 'ready' }
  | { t: 'search'; query: string; options: SearchOptions }
  | { t: 'nav'; dir: 1 | -1 }
  /** Jump to a match by its position (from the results list). */
  | { t: 'goto'; index: number }
  /** Whether the results list is showing, so results include every match's context. */
  | { t: 'list'; open: boolean }
  | { t: 'size'; width: number; height: number }
  | { t: 'close'; how: 'escape' | 'button' }
  /** Ctrl+Enter: follow the link (or press the button) the current match is in. */
  | { t: 'activate' }
  /** Read aloud, or stop reading. The finder speaks: the page has the user's activation too. */
  | { t: 'read' };

export interface Results {
  query: string;
  count: number;
  /** Zero-based index of the current match, or -1. */
  current: number;
  capped: boolean;
  context: MatchContext | null;
  /** Every match's context (up to a limit), only while the results list is open. */
  items: MatchContext[] | null;
}

/** Messages from the finder (content script) to the find bar (iframe). */
export type FinderMessage =
  | { t: 'init'; query: string }
  | { t: 'results'; results: Results }
  /** The page's tone, for automatic style. */
  | { t: 'page'; tone: PageTone }
  | { t: 'focus' }
  /** Whether something is being read aloud, so the speaker button can offer to stop. */
  | { t: 'speaking'; on: boolean };
