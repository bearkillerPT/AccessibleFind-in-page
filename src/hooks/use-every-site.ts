import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const ALL_SITES = { origins: ['<all_urls>'] };

/**
 * Whether "Ctrl+F on every website" (access to all sites) is on, null while checking, and a
 * way to turn it on or off.
 */
export function useEverySite() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const refresh = useCallback(() => void browser.permissions.contains(ALL_SITES).then(setGranted), []);
  useEffect(() => {
    refresh();
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, [refresh]);
  const set = async (on: boolean) => {
    if (on) setGranted(await browser.permissions.request(ALL_SITES));
    else {
      await browser.permissions.remove(ALL_SITES);
      refresh();
    }
  };
  return { granted, set };
}
