import { useLayoutEffect } from 'react';
import { DEFAULT_PREFS } from '@/lib/settings/defaults';
import type { Prefs } from '@/lib/settings/types';

/** Applies the text size and light/dark theme preferences to the current page. */
export function usePageStyle(prefs: Prefs | undefined): void {
  const scale = prefs?.uiScale ?? DEFAULT_PREFS.uiScale;
  const theme = prefs?.theme ?? DEFAULT_PREFS.theme;
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${16 * scale}px`;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [scale, theme]);
}
