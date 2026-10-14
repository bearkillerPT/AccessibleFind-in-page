/**
 * Recent searches for ↑/↓ in the search box. Kept in storage.local, so they stay on this
 * device and are never synced.
 */
import { browser } from 'wxt/browser';

const KEY = 'searchHistory';
export const HISTORY_LIMIT = 30;

/** Most recent first, without duplicates (ignoring case and spacing). */
export function addToHistory(history: readonly string[], query: string, limit = HISTORY_LIMIT): string[] {
  const clean = query.replace(/\s+/g, ' ').trim();
  if (!clean) return [...history];
  const key = clean.toLowerCase();
  return [clean, ...history.filter((q) => q.toLowerCase() !== key)].slice(0, limit);
}

export async function loadHistory(): Promise<string[]> {
  const stored = (await browser.storage.local.get(KEY))[KEY];
  return Array.isArray(stored) ? stored.filter((q): q is string => typeof q === 'string').slice(0, HISTORY_LIMIT) : [];
}

export async function rememberSearch(query: string): Promise<void> {
  await browser.storage.local.set({ [KEY]: addToHistory(await loadHistory(), query) });
}

export async function clearHistory(): Promise<void> {
  await browser.storage.local.remove(KEY);
}
