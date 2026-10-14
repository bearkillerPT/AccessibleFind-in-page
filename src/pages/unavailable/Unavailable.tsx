/** Toolbar popup shown when the find bar can't open on the current page. */
import { useEffect, useState } from 'react';
import { CircleOff, ExternalLink, FileLock, FileText, Lightbulb, LockKeyhole, Settings, Store } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { usePageStyle } from '@/hooks/use-page-style';
import { useSettings } from '@/hooks/use-settings';
import type { UnavailableReason } from '@/lib/background/unavailable';
import { ctrlFLabel, extensionDetailsUrl, nativeFindHint, openBrowserPage } from '@/lib/platform';

const REASONS: Record<UnavailableReason, { icon: typeof CircleOff; title: string; body: string }> = {
  'browser-page': {
    icon: LockKeyhole,
    title: 'This is a browser page',
    body: 'Browsers don’t let any extension read their own pages, like settings, history or the new tab page.',
  },
  store: {
    icon: Store,
    title: 'The extension store is protected',
    body: 'Browsers don’t let extensions run on their extension store.',
  },
  pdf: {
    icon: FileText,
    title: 'PDFs can’t be searched yet',
    body: 'This PDF is shown by the browser’s built-in viewer, which extensions can’t read.',
  },
  'not-html': {
    icon: FileText,
    title: 'This isn’t a web page',
    body: 'It’s a file such as an image, SVG or XML document, which Accessible Find can’t search.',
  },
  file: {
    icon: FileLock,
    title: 'Allow access to files first',
    body: 'This page is a file on your computer. Turn on “Allow access to file URLs” on the extension’s details page to search it.',
  },
  'extension-page': {
    icon: LockKeyhole,
    title: 'This page belongs to another extension',
    body: 'Extensions can’t read each other’s pages.',
  },
  'error-page': {
    icon: CircleOff,
    title: 'This page didn’t load',
    body: 'There’s nothing to search on an error page.',
  },
  blocked: {
    icon: LockKeyhole,
    title: 'Access to this page is blocked',
    body: 'The extension isn’t allowed on this site. Your organization may block it, or site access may be off in the extension’s settings.',
  },
  unknown: {
    icon: CircleOff,
    title: 'Accessible Find couldn’t open here',
    body: 'Something stopped it from running on this page. Reloading the page may help.',
  },
};

export function Unavailable() {
  const api = useSettings();
  usePageStyle(api.state?.prefs ? { ...api.state.prefs, uiScale: Math.min(api.state.prefs.uiScale, 1.25) } : undefined);
  const params = new URLSearchParams(location.search);
  const reason = (params.get('reason') as UnavailableReason) || 'unknown';
  const info = REASONS[reason] ?? REASONS.unknown;
  const Icon = info.icon;
  const [everySite, setEverySite] = useState<boolean | null>(null);

  useEffect(() => {
    // Back to normal: the next toolbar click tries to open the find bar again.
    const tabId = Number(params.get('tab'));
    if (Number.isInteger(tabId)) {
      void browser.action.setPopup({ tabId, popup: '' });
      void browser.action.setBadgeText({ tabId, text: '' });
    }
    void browser.permissions.contains({ origins: ['<all_urls>'] }).then(setEverySite);
  }, []);

  return (
    <main className="space-y-4 p-5 text-base">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-signal">
          <Icon className="size-6" aria-hidden />
        </span>
        <h1 className="pt-1 text-xl leading-snug font-bold">{info.title}</h1>
      </div>
      <p>{info.body}</p>
      <p className="rounded-lg bg-muted p-3 text-sm">
        To search this page, use the browser’s own find: {nativeFindHint()}.
      </p>
      {everySite === false && reason !== 'file' && (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
          Turn on “{ctrlFLabel()} on every website” in the settings, and pages like this will open the browser’s own
          find automatically.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {reason === 'file' && (
          <Button autoFocus onClick={() => openBrowserPage(extensionDetailsUrl())}>
            Open extension details
            <ExternalLink aria-hidden />
          </Button>
        )}
        <Button
          autoFocus={reason !== 'file'}
          variant={reason === 'file' ? 'outline' : 'default'}
          onClick={() => {
            void browser.runtime.openOptionsPage();
            window.close();
          }}
        >
          <Settings aria-hidden />
          Settings
        </Button>
      </div>
    </main>
  );
}
