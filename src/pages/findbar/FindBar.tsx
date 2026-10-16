/**
 * The find bar, shown in an iframe on top of the page. It talks to the content script
 * over a private MessagePort and reads and writes settings directly.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, List, Search, Settings, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Toggle } from '@/components/ui/toggle';
import { usePageStyle } from '@/hooks/use-page-style';
import { useSettings } from '@/hooks/use-settings';
import { addToHistory, clearHistory, loadHistory, rememberSearch } from '@/lib/history';
import type { BarMessage, FinderMessage, Results } from '@/lib/messages';
import { isMac } from '@/lib/platform';
import { DEFAULT_PREFS } from '@/lib/settings/defaults';
import { actionFor, formatCombo, isAltGraph, isLetterKey } from '@/lib/shortcuts';
import type { PageTone, SearchOptions } from '@/lib/settings/types';
import { speechAvailable } from '@/lib/speech';
import { cn } from '@/lib/utils';
import { onPort } from './channel';
import { QuickSettings } from './QuickSettings';
import { ResultsList } from './ResultsList';

/**
 * Bar width in rem, so it grows with the text size setting. Opening a panel doesn't change
 * it, so the buttons never move away from under the pointer.
 */
const WIDTH_REM = 32;

type Panel = 'none' | 'settings' | 'list';

/** "3 of 12", or "No results". */
function statusText(results: Results): string {
  if (results.count === 0) return 'No results';
  return `${results.current + 1} of ${results.count}${results.capped ? '+' : ''}`;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
  controls?: string;
  active?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={props.buttonRef}
      variant={props.active ? 'secondary' : 'ghost'}
      size="icon"
      className="size-10"
      aria-label={props.label}
      title={props.label}
      aria-expanded={props.expanded}
      aria-controls={props.controls}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

export function FindBar() {
  const api = useSettings();
  const prefs = api.state?.prefs ?? DEFAULT_PREFS;
  usePageStyle(api.state?.prefs);
  const [port, setPort] = useState<MessagePort | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [tone, setTone] = useState<PageTone | null>(null);
  /** Reading aloud happens in the page (see Finder.readAloud), which tells the bar about it. */
  const [speaking, setSpeaking] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const queryRef = useRef('');
  queryRef.current = query;
  /** Position while browsing history with ↑/↓ (-1: the text being typed), and that text. */
  const historyPos = useRef(-1);
  const draft = useRef('');

  const focusInput = () =>
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

  const handler = useRef<(m: FinderMessage) => void>(() => {});
  handler.current = (m) => {
    if (m.t === 'init') {
      historyPos.current = -1;
      setQuery(m.query);
      focusInput();
    } else if (m.t === 'results') {
      if (m.results.query === queryRef.current) setResults(m.results);
    } else if (m.t === 'focus') {
      focusInput();
    } else if (m.t === 'page') {
      setTone(m.tone);
    } else if (m.t === 'speaking') {
      setSpeaking(m.on);
    }
  };

  useEffect(
    () =>
      onPort((p) => {
        // Messages sent before this point were queued by the port.
        p.onmessage = (ev: MessageEvent<FinderMessage>) => handler.current(ev.data);
        p.postMessage({ t: 'ready' } satisfies BarMessage);
        setPort(p);
      }),
    [],
  );

  const send = (m: BarMessage) => port?.postMessage(m);

  const { caseSensitive, matchDiacritics, wholeWord } = prefs.search;
  useEffect(() => {
    if (!port) return;
    const options: SearchOptions = { caseSensitive, matchDiacritics, wholeWord };
    port.postMessage({ t: 'search', query, options } satisfies BarMessage);
  }, [port, query, caseSensitive, matchDiacritics, wholeWord]);

  // The results include every match's context only while the list is showing.
  useEffect(() => {
    port?.postMessage({ t: 'list', open: panel === 'list' } satisfies BarMessage);
  }, [port, panel]);

  useEffect(() => {
    if (prefs.rememberSearches) {
      void loadHistory().then(setHistory);
    } else {
      setHistory([]);
      // Remembering may have been turned off elsewhere (another computer, a restored
      // backup); forget this device's searches too.
      void clearHistory();
    }
  }, [prefs.rememberSearches]);

  // Tell the content script how big to make the iframe.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!port || !el) return;
    const report = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = WIDTH_REM * rem;
      port.postMessage({ t: 'size', width, height: Math.ceil(el.getBoundingClientRect().height) } satisfies BarMessage);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [port, prefs.uiScale]);

  const fresh = results !== null && results.query === query;
  const count = fresh ? results.count : 0;
  const status = useMemo(() => {
    if (!query.trim() || !fresh) return '';
    return statusText(results);
  }, [query, fresh, results]);
  // On screen, the previous count stays until this search's arrives (a few ms later), so it
  // doesn't blink out at every key.
  const shownStatus = query.trim() && results?.query.trim() ? statusText(results) : '';
  const context = fresh && prefs.showContextInBar ? results.context : null;
  const announcement = useDebounced(
    status && fresh && results.context
      ? `${status}: ${results.context.before}${results.context.match}${results.context.after}`
      : status,
    600,
  );

  /** Saves a search that found something, for ↑/↓ later. Only on this device. */
  const remember = () => {
    const clean = query.trim();
    if (!prefs.rememberSearches || !clean || count === 0 || history[0] === clean) return;
    setHistory(addToHistory(history, clean));
    void rememberSearch(clean);
  };

  const nav = (dir: 1 | -1) => {
    if (count === 0) return;
    remember();
    send({ t: 'nav', dir });
  };
  const goto = (index: number) => {
    remember();
    send({ t: 'goto', index });
  };
  const close = (how: 'escape' | 'button') => {
    remember();
    send({ t: 'close', how });
  };
  const togglePanel = (which: Exclude<Panel, 'none'>) => setPanel((p) => (p === which ? 'none' : which));
  /** Reads the current match aloud; with none, the text selected on the page. Or stops. */
  const readAloud = () => send({ t: 'read' });

  const browseHistory = (older: boolean) => {
    let pos = historyPos.current + (older ? 1 : -1);
    if (pos === 0 && history[0] === query.trim()) pos = older ? 1 : -1;
    if (pos < -1 || pos >= history.length) return;
    if (historyPos.current === -1) draft.current = query;
    historyPos.current = pos;
    setQuery(pos === -1 ? draft.current : history[pos]!);
  };

  const setOption = (key: keyof SearchOptions, value: boolean) =>
    api.updatePrefs({ search: { ...prefs.search, [key]: value } });

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys pressed while composing text (Chinese, Japanese, Korean input) belong to the IME.
    if (e.nativeEvent.isComposing) return;
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (e.key === 'Escape') {
      // An Escape that closed an example card (in the quick settings) is used up.
      if (e.nativeEvent.defaultPrevented) return;
      e.preventDefault();
      const inPanel = (id: string) => document.getElementById(id)?.contains(e.target as Node);
      if (panel === 'settings' && inPanel('quick-settings')) {
        setPanel('none');
        settingsButtonRef.current?.focus();
      } else if (panel === 'list' && inPanel('results-list')) {
        setPanel('none');
        listButtonRef.current?.focus();
      } else {
        close('escape');
      }
    } else if (e.key === 'F3' || (mod && isLetterKey(e, 'g'))) {
      e.preventDefault();
      nav(e.shiftKey ? -1 : 1);
    } else if (mod && isLetterKey(e, 'f')) {
      e.preventDefault();
      focusInput();
    } else if (!isAltGraph(e.nativeEvent)) {
      const action = actionFor(e.nativeEvent, prefs.shortcuts);
      if (!action) return;
      e.preventDefault();
      if (action === 'matchCase') setOption('caseSensitive', !prefs.search.caseSensitive);
      else if (action === 'matchAccents') setOption('matchDiacritics', !prefs.search.matchDiacritics);
      else if (action === 'wholeWord') setOption('wholeWord', !prefs.search.wholeWord);
      else if (action === 'list') togglePanel('list');
      else readAloud();
    }
  };

  const keys = (action: keyof typeof prefs.shortcuts) => formatCombo(prefs.shortcuts[action]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isMac() ? e.metaKey : e.ctrlKey) {
        remember();
        send({ t: 'activate' });
      } else {
        nav(e.shiftKey ? -1 : 1);
      }
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      // With the list open, the arrows move through the matches; otherwise through history.
      if (panel === 'list') nav(e.key === 'ArrowDown' ? 1 : -1);
      else browseHistory(e.key === 'ArrowUp');
    }
  };

  const optionToggle = (key: keyof SearchOptions, label: string, content: ReactNode) => (
    <Toggle
      variant="outline"
      aria-label={label}
      title={label}
      pressed={prefs.search[key]}
      onPressedChange={(v) => setOption(key, v)}
      className="h-10 min-w-10 px-2 text-base font-bold"
    >
      {content}
    </Toggle>
  );

  return (
    <div ref={contentRef} onKeyDown={onKeyDown} className="rounded-[16px] border-2 bg-card p-2 text-card-foreground">
      <div className="flex items-center gap-1.5">
        <InputGroup className="h-10 min-w-0 flex-1 bg-background dark:bg-background">
          <InputGroupAddon>
            <Search aria-hidden className="size-5" />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={query}
            onChange={(e) => {
              historyPos.current = -1;
              setQuery(e.target.value);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Find in page"
            aria-label="Find in page"
            aria-describedby="find-status find-help"
            aria-controls={panel === 'list' ? 'results-list' : undefined}
            spellCheck={false}
            autoComplete="off"
            className="text-base"
          />
        </InputGroup>
        {/*
          Outside the search box, so it never covers what's typed. Its room is kept even when
          empty, so the box doesn't change width as you type.
        */}
        <span
          id="find-status"
          data-pending={(query.trim() && !fresh) || undefined}
          className={cn(
            'min-w-22 shrink-0 px-1 font-semibold whitespace-nowrap tabular-nums',
            results?.count === 0 ? 'text-destructive' : 'text-foreground',
          )}
        >
          {shownStatus}
        </span>
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Previous match (Shift+Enter)"
            title="Previous match (Shift+Enter)"
            onClick={() => nav(-1)}
          >
            <ChevronUp className="size-5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-10"
            aria-label="Next match (Enter)"
            title="Next match (Enter)"
            onClick={() => nav(1)}
          >
            <ChevronDown className="size-5" aria-hidden />
          </Button>
        </ButtonGroup>
        <IconButton label="Close (Esc)" onClick={() => close('button')}>
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <ButtonGroup aria-label="Search options">
          {optionToggle('caseSensitive', `Match case (${keys('matchCase')})`, 'Aa')}
          {optionToggle('matchDiacritics', `Match accents (${keys('matchAccents')})`, 'á')}
          {optionToggle(
            'wholeWord',
            `Whole words only (${keys('wholeWord')})`,
            <span className="underline decoration-2 underline-offset-2">ab</span>,
          )}
        </ButtonGroup>
        <div className="ml-auto flex items-center gap-1.5">
          {speechAvailable() && (
            <IconButton
              label={speaking ? `Stop reading (${keys('readAloud')})` : `Read aloud (${keys('readAloud')})`}
              onClick={readAloud}
              active={speaking}
            >
              {speaking ? <Square className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </IconButton>
          )}
          <IconButton
            buttonRef={listButtonRef}
            label={`All matches (${keys('list')})`}
            expanded={panel === 'list'}
            controls="results-list"
            active={panel === 'list'}
            onClick={() => togglePanel('list')}
          >
            <List className="size-5" aria-hidden />
          </IconButton>
          <IconButton
            buttonRef={settingsButtonRef}
            label="Quick settings"
            expanded={panel === 'settings'}
            controls="quick-settings"
            active={panel === 'settings'}
            onClick={() => togglePanel('settings')}
          >
            <Settings className="size-5" aria-hidden />
          </IconButton>
        </div>
      </div>
      <p id="find-help" className="sr-only">
        Enter for the next match, Shift+Enter for the previous one. Up and down arrows recall recent searches, or move
        through matches when the list is open. {keys('list')} lists all matches, {keys('readAloud')} reads the match
        aloud (or the text selected on the page), Control+Enter opens a link at the match, Escape closes.
      </p>
      {context && (
        <p className="mt-2 rounded-lg bg-background px-3 py-1.5 text-lg leading-snug">
          {context.before}
          <mark className="rounded bg-beam px-0.5 text-night">{context.match}</mark>
          {context.after}
        </p>
      )}
      {panel === 'list' && (
        <ResultsList
          items={fresh && query.trim() ? results.items : null}
          count={count}
          capped={fresh && results.capped}
          current={fresh ? results.current : -1}
          onGoto={goto}
        />
      )}
      {panel === 'settings' && <QuickSettings api={api} tone={tone} />}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
