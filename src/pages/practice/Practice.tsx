/**
 * A safe place to try Accessible Find. Extensions can't inject scripts into their own pages,
 * so this page runs the finder itself: it handles Ctrl+F, and the background asks it to open
 * (or read aloud) when the toolbar button or a keyboard shortcut is used here.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { ExternalLink, Search, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import { BrandMark } from '@/components/brand';
import { ShortcutKeys } from '@/components/shortcut-keys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommandShortcut } from '@/hooks/use-command-shortcut';
import { usePageStyle } from '@/hooks/use-page-style';
import { useSettings } from '@/hooks/use-settings';
import { Finder } from '@/lib/finder/finder';
import { EXTENSION_PAGE_MESSAGE, OPEN_COMMAND, READ_ALOUD_COMMAND } from '@/lib/messages';
import { ctrlFLabel, isCtrlF, isMac, openBrowserPage, shortcutsUrl } from '@/lib/platform';
import { DEFAULT_SHORTCUTS, formatCombo, isLetterKey } from '@/lib/shortcuts';

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground">
        {n}
      </span>
      <div className="pt-0.5">{children}</div>
    </li>
  );
}

const Try = ({ children }: { children: ReactNode }) => (
  <strong className="rounded bg-muted px-1.5 py-0.5 font-mono">{children}</strong>
);

export function Practice() {
  const api = useSettings();
  usePageStyle(api.state?.prefs);
  const articleRef = useRef<HTMLElement>(null);
  const finderRef = useRef<Finder | null>(null);
  const shortcut = useCommandShortcut(OPEN_COMMAND) ?? '';
  const readShortcut = useCommandShortcut(READ_ALOUD_COMMAND);
  const keys = api.state?.prefs.shortcuts ?? DEFAULT_SHORTCUTS;

  useEffect(() => {
    const finder = new Finder({ root: () => articleRef.current ?? document.body });
    finderRef.current = finder;
    const mac = isMac();
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && !e.shiftKey && isLetterKey(e, 'f')) {
        e.preventDefault();
        finder.open();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);

    let tabId: number | undefined;
    void browser.tabs.getCurrent().then((tab) => (tabId = tab?.id));
    const onMessage = (message: unknown, _sender: unknown, sendResponse: (response: boolean) => void) => {
      const m = message as { type?: string; tabId?: number; action?: string } | null;
      if (m?.type !== EXTENSION_PAGE_MESSAGE || m.tabId !== tabId) return;
      if (m.action === 'read') finder.readAloud();
      else finder.open();
      sendResponse(true);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      browser.runtime.onMessage.removeListener(onMessage);
      finder.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <BrandMark subtitle="Practice page" />
          <Button variant="outline" onClick={() => void browser.runtime.openOptionsPage()}>
            <Settings aria-hidden />
            Settings
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="text-2xl">Try Accessible Find here</CardTitle>
            <CardDescription className="text-base">
              Nothing you do here changes anything. Only the article below is searched, so the words in these steps
              don’t count as matches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="space-y-3 text-lg">
              <Step n={1}>
                Press <ShortcutKeys shortcut={ctrlFLabel()} />
                {shortcut && !isCtrlF(shortcut) ? (
                  <>
                    {' '}
                    or <ShortcutKeys shortcut={shortcut} />
                  </>
                ) : null}{' '}
                and type <Try>lighthouse</Try>.
              </Step>
              <Step n={2}>
                Press <ShortcutKeys shortcut="Enter" /> for the next match and <ShortcutKeys shortcut="Shift+Enter" /> to
                go back. Watch how the current match is shown.
              </Step>
              <Step n={3}>
                To make it stand out more, press the{' '}
                <Settings role="img" aria-label="Quick settings" className="inline size-5 align-text-bottom" />{' '}
                button in the find bar and turn on Spotlight, Guide lines or Magnifier. They stay on, on every website,
                until you turn them off.
              </Step>
              <Step n={4}>
                Press <ShortcutKeys shortcut={formatCombo(keys.list)} /> to list every match, then use the arrow keys to
                move through them. <ShortcutKeys shortcut={formatCombo(keys.readAloud)} /> reads the match aloud.
              </Step>
              <Step n={5}>
                Search for <Try>camoes</Try>: it also finds “Camões”, because accents are ignored unless you turn on
                Match accents.
              </Step>
              <Step n={6}>
                Search for <Try>visitor’s postcard</Try>. It’s inside a closed section, which opens by itself.
              </Step>
              <Step n={7}>
                Press <ShortcutKeys shortcut="Escape" /> to close. The match stays selected.
              </Step>
              {readShortcut ? (
                <Step n={8}>
                  Select a sentence in the article and press <ShortcutKeys shortcut={readShortcut} /> to hear it, even
                  with the find bar closed.
                </Step>
              ) : readShortcut === '' ? (
                <Step n={8}>
                  <p>
                    To hear selected text with the find bar closed, give “Read aloud the selected text” a key in the
                    browser’s shortcut settings.
                  </p>
                  <Button variant="outline" className="mt-2" onClick={() => openBrowserPage(shortcutsUrl())}>
                    Open shortcut settings
                    <ExternalLink aria-hidden />
                  </Button>
                </Step>
              ) : null}
            </ol>
            <Button size="lg" onClick={() => finderRef.current?.open()}>
              <Search aria-hidden />
              Open the find bar
            </Button>
          </CardContent>
        </Card>

        <article
          ref={articleRef}
          className="space-y-5 rounded-2xl border bg-white p-8 font-serif text-lg leading-relaxed text-neutral-900 shadow-sm"
        >
          <h1 className="font-sans text-4xl font-bold leading-tight">The lighthouse at Cabo da Roca</h1>
          <p className="font-sans text-base text-neutral-600">Where the land ends and the sea begins</p>
          <p>
            Cabo da Roca is the westernmost point of mainland Europe. Its cliffs rise about 140 metres above the
            Atlantic, and near the edge stands a white <strong>lighthouse</strong> with a red lantern, first lit in
            1772.
          </p>
          <p>
            For two centuries, keepers climbed the stairs of the light<em>house</em> at dusk to light the lamp, and on
            foggy nights they kept watch until morning. Its beam still guides ships along the coast.
          </p>
          <h2 className="font-sans text-2xl font-bold">Getting there</h2>
          <p>
            The cape is in the Sintra-Cascais Natural Park, about forty minutes from Lisbon by car. Buses from Sintra
            and Cascais stop by the road, and a short path leads to the{' '}
            <a href="#visiting" className="text-blue-700 underline">
              viewpoint beside the lighthouse
            </a>
            .
          </p>
          <p>
            The wind here rarely stops. Bring a jacket, even in summer, and keep to the paths: the cliff edge is closer
            than it looks.
          </p>
          <details className="rounded-lg border border-neutral-300 p-4">
            <summary className="cursor-pointer font-sans font-semibold">From the archive</summary>
            <p className="mt-3">
              A visitor’s postcard, sent in August 1952: “Fog in the morning, sun by noon, and at night the beam sweeps
              across the water. We could see the light from our window.”
            </p>
          </details>
          <h2 id="visiting" className="font-sans text-2xl font-bold">
            Visiting
          </h2>
          <p>
            Next to the lighthouse stands a stone monument with a line by the poet Camões: “Onde a terra se acaba e o
            mar começa”, where the land ends and the sea begins.
          </p>
          <p>
            People come from all over the world to stand beside the lighthouse at the edge of the continent and look
            out at nothing but ocean.
          </p>
          <p>Stay for the sunset if you can. As the sun drops into the Atlantic, the cliffs turn gold and the beam comes on.</p>
        </article>
      </main>
    </div>
  );
}
