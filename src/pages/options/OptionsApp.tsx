import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  GraduationCap,
  HardDriveDownload,
  Highlighter,
  Keyboard,
  PanelTop,
  PartyPopper,
  Power,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { BrandMark } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePageStyle } from '@/hooks/use-page-style';
import { useSettings } from '@/hooks/use-settings';
import { ctrlFLabel, openPracticePage } from '@/lib/platform';
import { formatCombo } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { BackupSection } from './BackupSection';
import { DisplaySection } from './DisplaySection';
import { HighlightSection } from './HighlightSection';
import { OpeningSection } from './OpeningSection';
import { ReadAloudSection } from './ReadAloudSection';
import { ShortcutsSection } from './ShortcutsSection';

/** The settings come in pages, one at a time; the URL hash says which (#appearance...). */
const PAGES = [
  { id: 'activation', label: 'Opening it', icon: Power },
  { id: 'appearance', label: 'Highlight style', icon: Highlighter },
  { id: 'display', label: 'Find bar', icon: PanelTop },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'read-aloud', label: 'Read aloud', icon: Volume2 },
  { id: 'backup', label: 'Backup', icon: HardDriveDownload },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

type SettingsPage = (typeof PAGES)[number]['id'];

/** The page a hash shows. The welcome and what's new messages go with the first page. */
function pageFor(hash: string): SettingsPage {
  return PAGES.find((p) => p.id === hash)?.id ?? 'activation';
}

function Section(props: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={props.id} aria-labelledby={`${props.id}-title`} className="space-y-6">
      <div className="space-y-1">
        <h2 id={`${props.id}-title`} tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none">
          {props.title}
        </h2>
        {props.description && <div className="max-w-prose text-muted-foreground">{props.description}</div>}
      </div>
      {props.children}
    </section>
  );
}

function Banner({ hash }: { hash: string }) {
  if (hash !== 'welcome' && hash !== 'whats-new') return null;
  const welcome = hash === 'welcome';
  return (
    <Card className="border-2 border-primary bg-primary/5 text-base">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PartyPopper className="size-6 text-signal" aria-hidden />
          <CardTitle className="text-2xl">{welcome ? 'Welcome to Accessible Find' : 'What’s new in version 2'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {welcome ? (
          <ol className="list-decimal space-y-1.5 pl-6">
            <li>Choose how to open it, just below. Turning on {ctrlFLabel()} on every website is the easiest.</li>
            <li>
              Pick a{' '}
              <a href="#appearance" className="font-semibold underline underline-offset-2">
                highlight style
              </a>{' '}
              that’s easy for you to see. There are profiles for cataracts, light sensitivity and color blindness.
            </li>
            <li>
              If the current match is still hard to find, turn on an effect from the find bar’s quick settings: guide
              lines and the ring reach a narrow field of view, and the magnifier helps when the middle of your sight is
              missing.
            </li>
            <li>Go to any website and press {ctrlFLabel()}, or try it first on the practice page.</li>
          </ol>
        ) : (
          <ul className="space-y-2">
            {[
              <>
                <strong>{ctrlFLabel()} on every website:</strong> the browser’s own find takes over on pages extensions
                can’t run on, instead of {ctrlFLabel()} doing nothing.
              </>,
              'Highlights no longer change the page, so they work in web apps and editors that broke before.',
              'Finds text across links and formatting, with or without accents.',
              'New ways to spot the current match: a ring, plus a spotlight, guide lines and a magnifier you can turn on from the find bar.',
              'A larger find bar with match case, match accents and whole-word options, plus light and dark themes.',
              'A list of every match in large text, and recent searches with the arrow keys.',
              'Reading aloud: the current match, or text you select on any website.',
              'Highlight profiles for cataracts, light sensitivity, and red-green, blue-yellow or no color vision.',
              'Automatic style: matches on dark backgrounds, like dark websites or code blocks, take colors that stand out there.',
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {!welcome && (
          <p className="mt-3 text-sm text-muted-foreground">
            Your profiles and colors were kept. Enlarged matches now appear in the magnifier.
          </p>
        )}
        <Button className="mt-4" onClick={openPracticePage}>
          <GraduationCap aria-hidden />
          Try it on the practice page
        </Button>
      </CardContent>
    </Card>
  );
}

export function OptionsApp() {
  const api = useSettings();
  usePageStyle(api.state?.prefs);
  const [hash, setHash] = useState(() => location.hash.slice(1));
  /** Set once the user moves to another page, so only then does focus follow. */
  const navigated = useRef(false);
  useEffect(() => {
    const onHash = () => {
      navigated.current = true;
      setHash(location.hash.slice(1));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const page = pageFor(hash);
  useEffect(() => {
    if (!navigated.current) return;
    // Like loading a new page: start at the top, and screen readers hear its title.
    window.scrollTo(0, 0);
    document.getElementById(`${page}-title`)?.focus();
  }, [page]);
  const state = api.state;
  const version = browser.runtime.getManifest().version;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <BrandMark subtitle="Settings" heading />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={openPracticePage}>
              <GraduationCap aria-hidden />
              Practice page
            </Button>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Version {version}
            </Badge>
          </div>
        </div>
      </header>

      {/*
        Container queries, not media queries: these measure rem in the page's own text size,
        so with large text the sidebar turns into a row of tabs to leave room for the content.
      */}
      <div className="@container mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 @4xl:grid-cols-[13rem_minmax(0,1fr)] @4xl:gap-10">
          <nav aria-label="Settings pages">
            <ul className="flex flex-wrap gap-2 @4xl:sticky @4xl:top-8 @4xl:flex-col @4xl:gap-1">
              {PAGES.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    aria-current={id === page ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-lg border-2 px-3 py-1.5 font-medium hover:bg-muted @4xl:border-transparent',
                      'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      id === page
                        ? 'border-primary bg-accent text-foreground @4xl:border-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main className="@container min-w-0 space-y-8">
            {page === 'activation' && <Banner hash={hash} />}
            {page === 'activation' && (
              <Section id="activation" title="Opening Accessible Find">
                <OpeningSection />
              </Section>
            )}
            {page === 'appearance' && (
              <Section
                id="appearance"
                title="Highlight style"
                description={<p>Changes save automatically and show up straight away on any page you’re searching.</p>}
              >
                <HighlightSection api={api} />
              </Section>
            )}
            {page === 'display' && (
              <Section id="display" title="Find bar" description={<p>How the find bar looks and behaves.</p>}>
                <DisplaySection api={api} />
              </Section>
            )}
            {page === 'shortcuts' && (
              <Section
                id="shortcuts"
                title="Find bar shortcuts"
                description={
                  <p>
                    Keys for the find bar’s options. Change them if they clash with your system, for example a window
                    manager that uses Alt.
                  </p>
                }
              >
                <ShortcutsSection api={api} />
              </Section>
            )}
            {page === 'read-aloud' && (
              <Section
                id="read-aloud"
                title="Read aloud"
                description={
                  state && (
                    <p>
                      The speaker button in the find bar, or {formatCombo(state.prefs.shortcuts.readAloud)}, reads the
                      sentence around the current match. With nothing found, it reads the text you’ve selected.
                    </p>
                  )
                }
              >
                <ReadAloudSection api={api} />
              </Section>
            )}
            {page === 'backup' && (
              <Section
                id="backup"
                title="Backup and sharing"
                description={<p>Keep your settings safe, move them to another computer, or share a profile.</p>}
              >
                <BackupSection api={api} />
              </Section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
