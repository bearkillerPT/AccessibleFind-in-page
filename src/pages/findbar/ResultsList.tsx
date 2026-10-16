import { useEffect, useRef } from 'react';
import type { MatchContext } from '@/lib/search/matcher';

/**
 * Every match with the words around it, in large text. Reading results in one place is
 * easier than scanning the page with a narrow field of view.
 */
export function ResultsList(props: {
  items: MatchContext[] | null;
  count: number;
  capped: boolean;
  current: number;
  onGoto: (index: number) => void;
}) {
  const { items, count, capped, current, onGoto } = props;
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the current match visible in the list as it changes.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, items]);

  const move = (from: number, to: number) => {
    const total = items?.length ?? 0;
    if (!total) return;
    const next = (to + total) % total;
    if (next === from) return;
    onGoto(next);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };

  let summary = 'Type to see every match here.';
  if (items && count === 0) summary = 'No matches.';
  else if (items && items.length < count) summary = `Showing the first ${items.length} of ${count}${capped ? '+' : ''} matches.`;
  else if (items) summary = `${count} ${count === 1 ? 'match' : 'matches'}.`;

  return (
    <section id="results-list" aria-label="All matches" className="mt-2 rounded-xl border bg-background/60">
      <p className="px-3 pt-2 text-sm text-muted-foreground last:pb-2">{summary}</p>
      {items && items.length > 0 && (
        <ol ref={listRef} className="max-h-[20rem] space-y-1 overflow-y-auto p-1.5">
          {items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                data-index={i}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => onGoto(i)}
                onKeyDown={(e) => {
                  const keys: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
                  const to = keys[e.key];
                  if (to === undefined) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(i, to);
                }}
                className="flex w-full gap-3 rounded-lg border-2 border-transparent px-3 py-2 text-left text-lg leading-snug hover:bg-muted aria-[current=true]:border-primary aria-[current=true]:bg-accent"
              >
                <span className="min-w-[2.5ch] pt-0.5 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  {item.before}
                  <mark className="rounded bg-beam px-0.5 text-night">{item.match}</mark>
                  {item.after}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
