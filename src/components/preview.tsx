/**
 * Sample text styled the way matches look on a page: the light and dark preview of the
 * highlight style, and the examples that show what each effect does. The effects are drawn
 * like the real ones in src/lib/finder/effects.ts, in the user's own colors.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { LIMITS } from '@/lib/settings/sanitize';
import type { Appearance } from '@/lib/settings/types';
import { cn } from '@/lib/utils';

interface Sample {
  words: string[];
  matches: ReadonlySet<number>;
  /** Which of `words` is the current match. */
  current: number;
}

/** "lighthouse" is found three times; the second one is the current match. */
const LONG: Sample = {
  words:
    'The lighthouse keeper climbed the stairs. From the top of the lighthouse she could see the bay, and another lighthouse far away.'.split(
      ' ',
    ),
  matches: new Set([1, 11, 19]),
  current: 11,
};

const SHORT: Sample = {
  words: 'The lighthouse keeper could see another lighthouse far away.'.split(' '),
  matches: new Set([1, 6]),
  current: 1,
};

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const grow = (b: Box, by: number): Box => ({
  left: b.left - by,
  top: b.top - by,
  width: b.width + by * 2,
  height: b.height + by * 2,
});

/** Where an overlay goes. Borders are drawn inside the box, as on the page. */
const at = (b: Box): CSSProperties => ({ left: b.left, top: b.top, width: b.width, height: b.height });

/** What a sample page draws besides the highlights and the border around the current match. */
interface SampleEffects {
  spotlight?: boolean;
  guides?: boolean;
  magnifier?: boolean;
  /** The ring closing in on the match, over and over ('play'), or where it ends ('still'). */
  ring?: 'play' | 'still';
  /** The other half of a blink: the words around the matches light up instead of the matches. */
  blinkOff?: boolean;
}

type Kind = 'current' | 'match' | 'context' | 'plain';

function SampleText(props: {
  sample: Sample;
  a: Appearance;
  blinkOff?: boolean;
  currentRef: (el: HTMLElement | null) => void;
}) {
  const { sample, a } = props;
  const nearMatch = (i: number) => [...sample.matches].some((m) => Math.abs(i - m) <= a.contextWords);
  const kind = (i: number): Kind => {
    if (props.blinkOff) return !sample.matches.has(i) && nearMatch(i) ? 'context' : 'plain';
    return i === sample.current ? 'current' : sample.matches.has(i) ? 'match' : 'plain';
  };
  const styles: Record<Kind, CSSProperties> = {
    current: { background: a.currentBg, color: a.currentText },
    match: {
      background: a.matchBg,
      color: a.matchText,
      textDecoration: a.underline.enabled
        ? `underline ${Math.max(2, Math.round(a.borderWidth * 0.75))}px solid ${a.underline.color}`
        : 'none',
      textUnderlineOffset: '2px',
    },
    context: { background: a.matchBg, color: a.matchText },
    plain: {},
  };
  const parts: ReactNode[] = [];
  for (let i = 0; i < sample.words.length; ) {
    const k = kind(i);
    let end = i + 1;
    // The words around a match light up together, with the spaces between them.
    while (k === 'context' && end < sample.words.length && kind(end) === 'context') end++;
    const text = sample.words.slice(i, end).join(' ');
    const current = i === sample.current;
    // The current match keeps its padding when unlit, so the border around it stays put.
    const style = current ? { ...styles[k], padding: '0 1px' } : styles[k];
    parts.push(
      <Fragment key={i}>
        {i > 0 && ' '}
        {k === 'plain' ? (
          <span ref={current ? props.currentRef : undefined} style={style}>
            {text}
          </span>
        ) : (
          <mark ref={current ? props.currentRef : undefined} style={style}>
            {text}
          </mark>
        )}
      </Fragment>,
    );
    i = end;
  }
  return <p>{parts}</p>;
}

function SamplePage(props: {
  a: Appearance;
  effects: SampleEffects;
  sample?: Sample;
  dark?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const { a, effects, sample = LONG } = props;
  const pageRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLElement | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState<Box | null>(null);

  // Overlays go where the current match is, measured from the page's padding box (which
  // absolutely positioned children are placed in).
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => {
      const current = currentRef.current;
      if (!current) return;
      const p = page.getBoundingClientRect();
      const c = current.getBoundingClientRect();
      setHole({ left: c.left - p.left - page.clientLeft, top: c.top - p.top - page.clientTop, width: c.width, height: c.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    return () => observer.disconnect();
  }, [a.borderWidth, effects.magnifier, a.magnifier.fontSize]);

  // The ring closes in from the edges of the page every couple of seconds. Twice as slow as on
  // a page, where it crosses the whole screen: here it has only a few lines to cross.
  useEffect(() => {
    const ring = ringRef.current;
    const page = pageRef.current;
    if (effects.ring !== 'play' || !ring || !page || !hole) return;
    const end = grow(hole, 6 + a.borderWidth);
    const start: Box = { left: 2, top: 2, width: page.clientWidth - 4, height: page.clientHeight - 4 };
    const frame = (b: Box, opacity: number) => ({
      left: `${b.left}px`,
      top: `${b.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
      opacity,
    });
    const duration = a.ping.durationMs * 2;
    const play = () =>
      ring.animate([frame(start, 0.9), { ...frame(end, 1), offset: 0.75 }, frame(end, 0)], {
        duration,
        easing: 'ease-in-out',
      });
    play();
    const timer = window.setInterval(play, duration + 1000);
    return () => {
      window.clearInterval(timer);
      for (const animation of ring.getAnimations()) animation.cancel();
    };
  }, [effects.ring, hole, a.borderWidth, a.ping.durationMs]);

  const pad = 2 + a.borderWidth;
  const line = Math.max(2, a.borderWidth);
  return (
    <div
      ref={pageRef}
      className={cn(
        'relative overflow-hidden rounded-xl border-2',
        props.compact ? 'p-3 text-[0.8125rem] leading-[1.9]' : 'p-5 leading-loose',
        props.dark ? 'bg-neutral-900 text-neutral-100' : 'bg-white text-neutral-900',
      )}
      style={{ fontFamily: 'Georgia, serif' }}
    >
      {props.label && (
        <p className="mb-1 font-sans text-xs font-semibold tracking-wide uppercase opacity-70">{props.label}</p>
      )}
      <SampleText sample={sample} a={a} blinkOff={effects.blinkOff} currentRef={(el) => (currentRef.current = el)} />
      {effects.magnifier && (
        // Above the spotlight, as on the page.
        <div
          className="relative z-10 mt-2 inline-block rounded-[10px] px-[0.5em] py-[0.25em] font-sans font-semibold text-[#f4f6fc] shadow-lg"
          style={{
            background: '#0b1020',
            border: `3px solid ${a.currentBorder}`,
            fontSize: `${Math.min(a.magnifier.fontSize, 40) / 16}em`,
            lineHeight: 1.3,
          }}
        >
          {sample.words.slice(Math.max(0, sample.current - 3), sample.current).join(' ')}{' '}
          <mark
            style={{
              background: a.currentBg,
              color: a.currentText,
              borderRadius: 4,
              padding: '0 0.12em',
              margin: '0 0.1em',
              boxShadow: `0 0 0 0.08em ${a.currentBorder}`,
            }}
          >
            {sample.words[sample.current]}
          </mark>{' '}
          {sample.words.slice(sample.current + 1, sample.current + 3).join(' ')}
        </div>
      )}
      {hole && (
        <>
          {effects.spotlight && (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-[10px]"
              style={{ ...at(grow(hole, pad + 8)), boxShadow: `0 0 0 999px rgba(0, 0, 0, ${a.spotlight.opacity})` }}
            />
          )}
          {effects.guides && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-2"
                style={{
                  top: hole.top - pad - 4,
                  height: hole.height + (pad + 4) * 2,
                  borderBlock: `${line}px solid ${a.currentBorder}`,
                  boxShadow: '0 0 0 1px #000',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-y-2"
                style={{
                  left: hole.left - pad - 4,
                  width: hole.width + (pad + 4) * 2,
                  borderInline: `${line}px solid ${a.currentBorder}`,
                  boxShadow: '0 0 0 1px #000',
                }}
              />
            </>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[4px]"
            style={{
              ...at(grow(hole, pad)),
              border: `${a.borderWidth}px solid ${a.currentBorder}`,
              boxShadow: '0 0 0 1px #000, inset 0 0 0 1px #000',
            }}
          />
          {effects.ring && (
            <div
              ref={ringRef}
              aria-hidden
              className="pointer-events-none absolute rounded-[16px]"
              style={{
                ...at(grow(hole, 6 + a.borderWidth)),
                opacity: effects.ring === 'still' ? 1 : 0,
                border: `${a.ping.width}px solid ${a.currentBorder}`,
                boxShadow: '0 0 0 2px #000, inset 0 0 0 2px #000',
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Sample text on a light or a dark page, styled the way matches look there, with the profile's effects. */
export function PagePreview({ a, dark, label }: { a: Appearance; dark?: boolean; label: string }) {
  return (
    <div role="img" aria-label={label}>
      <SamplePage
        a={a}
        dark={dark}
        effects={{ spotlight: a.spotlight.enabled, guides: a.guides.enabled, magnifier: a.magnifier.enabled }}
      />
    </div>
  );
}

export type ExampleKind =
  | 'blink'
  | 'underline'
  | 'spotlight'
  | 'ring'
  | 'guides'
  | 'magnifier'
  | 'auto-style'
  | 'bar-context';

const EXAMPLES: Record<ExampleKind, { title: string; text: string; moves?: boolean }> = {
  blink: {
    title: 'Blinking',
    text: 'After you stop typing, and when you move to another match, the matches and the words around them take turns lighting up.',
    moves: true,
  },
  underline: { title: 'Underline', text: 'Every match is underlined too, a second cue that doesn’t rely on color.' },
  spotlight: {
    title: 'Spotlight',
    text: 'Everything but the current match is dimmed, so it’s the brightest thing on the screen. It also cuts glare from bright pages.',
  },
  ring: {
    title: 'Ring',
    text: 'When you move to a match, a ring shrinks from the edges of the screen onto it, to catch your eye even at the edge of your view.',
    moves: true,
  },
  guides: {
    title: 'Guide lines',
    text: 'Lines across the whole screen frame the match’s row and column. Follow either one to the match: they reach a narrow field of view wherever it is.',
  },
  magnifier: {
    title: 'Magnifier',
    text: 'The match and the words around it in large text, right next to it. Helpful when the middle of your sight is blurred or missing.',
  },
  'auto-style': {
    title: 'Automatic style',
    text: 'Matches on a dark background, like a dark page or a code block, switch to colors made for dark backgrounds. You can change those in the settings.',
  },
  'bar-context': {
    title: 'Words around the match',
    text: 'The find bar shows the current match with the words around it, so you can read it without finding it on the page.',
  },
};

/** Lit, unlit, as blinking goes: `count` blinks at `intervalMs`, then a pause, over and over. */
function useBlinkOff(active: boolean, count: number, intervalMs: number): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    setOff(false);
    if (!active) return;
    // Never faster than the find bar allows: at most 3 flashes a second.
    const interval = Math.max(LIMITS.blinkIntervalMs.min, intervalMs);
    let tick = 0;
    let timer = 0;
    const step = () => {
      tick = tick >= count * 2 ? 0 : tick + 1;
      setOff(tick % 2 === 1);
      timer = window.setTimeout(step, tick === 0 ? 1500 : interval);
    };
    timer = window.setTimeout(step, 800);
    return () => window.clearTimeout(timer);
  }, [active, count, intervalMs]);
  return off;
}

/** The find bar with the words around the match under the search box. */
function BarSample() {
  return (
    <div className="rounded-[16px] border-2 bg-card p-2 text-card-foreground">
      <div className="flex items-center gap-2">
        <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border bg-background px-2">
          <Search className="size-4 shrink-0" aria-hidden />
          lighthouse
        </span>
        <span className="font-semibold tabular-nums">2 of 3</span>
      </div>
      <p className="mt-2 rounded-lg bg-background px-2.5 py-1 text-base leading-snug">
        From the top of the <mark className="rounded bg-beam px-0.5 text-night">lighthouse</mark> she could see
      </p>
    </div>
  );
}

/**
 * What a feature looks like, for the hover cards next to its switch: drawn with `appearance`,
 * the effect turned on even if it's off. `darkAppearance` is for automatic style.
 */
export function EffectExample(props: {
  kind: ExampleKind;
  appearance: Appearance;
  darkAppearance?: Appearance;
  darkPage?: boolean;
  reducedMotion: boolean;
}) {
  const { kind, appearance: a, reducedMotion } = props;
  const info = EXAMPLES[kind];
  const blinkOff = useBlinkOff(kind === 'blink' && !reducedMotion, a.blink.count, a.blink.intervalMs);

  let picture: ReactNode;
  if (kind === 'auto-style') {
    picture = (
      <div className="grid grid-cols-2 gap-2">
        <SamplePage compact sample={SHORT} a={a} effects={{}} label="Light page" />
        <SamplePage compact sample={SHORT} a={props.darkAppearance ?? a} effects={{}} dark label="Dark page" />
      </div>
    );
  } else if (kind === 'bar-context') {
    picture = <BarSample />;
  } else {
    const shown = kind === 'underline' ? { ...a, underline: { ...a.underline, enabled: true } } : a;
    picture = (
      <SamplePage
        compact
        sample={SHORT}
        a={shown}
        dark={props.darkPage}
        effects={{
          spotlight: kind === 'spotlight',
          guides: kind === 'guides',
          magnifier: kind === 'magnifier',
          ring: kind === 'ring' ? (reducedMotion ? 'still' : 'play') : undefined,
          blinkOff: kind === 'blink' && blinkOff,
        }}
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-base font-semibold">{info.title}</p>
      <div aria-hidden>{picture}</div>
      <p>{info.text}</p>
      {info.moves && reducedMotion && (
        <p className="text-muted-foreground">This doesn’t happen while blinking and animation are turned off.</p>
      )}
    </div>
  );
}
