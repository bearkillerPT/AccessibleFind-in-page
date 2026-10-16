/**
 * The find-in-page engine, injected into a tab's top frame on demand (keyboard shortcut,
 * toolbar button, or Ctrl+F in every-site mode). It registers itself on a global in the
 * extension's isolated world so later injections reuse the running instance.
 */
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { Finder } from '../lib/finder/finder';
import { FINDER_GLOBAL, type FinderApi } from '../lib/messages';

export default defineUnlistedScript(() => {
  const scope = globalThis as unknown as Record<string, FinderApi | undefined>;
  const existing = scope[FINDER_GLOBAL];
  if (existing?.alive()) return;
  existing?.destroy();

  const finder = new Finder();
  scope[FINDER_GLOBAL] = {
    open: (selection) => finder.open(selection),
    readAloud: (selection) => finder.readAloud(selection),
    alive: () => finder.alive(),
    destroy: () => finder.destroy(),
  };
});
