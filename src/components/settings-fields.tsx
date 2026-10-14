/** Labelled settings controls built from shadcn/ui primitives. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { normalizeHex } from '@/lib/settings/sanitize';
import { cn } from '@/lib/utils';

/** Widest an example card gets, and the least room beside a field it needs, in rem. */
const EXAMPLE_REM = 22;
const EXAMPLE_MIN_REM = 13;
/** Space between the field and its example card, in px. */
const EXAMPLE_GAP = 6;

interface ExamplePlacement {
  side: 'left' | 'right' | 'bottom';
  width: number;
  /** From the help button, which the card is attached to, to just past the field. */
  offset: number;
}

/**
 * Beside the field where there's room, over the next column, so the card never covers the
 * field's own switch or the fields above and below it. Otherwise below it.
 */
function examplePlacement(field: HTMLElement | null, button: HTMLElement | null): ExamplePlacement {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const widest = EXAMPLE_REM * rem;
  if (!field || !button) return { side: 'bottom', width: widest, offset: EXAMPLE_GAP };
  const box = field.getBoundingClientRect();
  const from = button.getBoundingClientRect();
  const margin = rem;
  const right = window.innerWidth - box.right - margin;
  const left = box.left - margin;
  const room = Math.max(left, right);
  if (room >= EXAMPLE_MIN_REM * rem) {
    return right >= left
      ? { side: 'right', width: Math.min(widest, room), offset: box.right - from.right + EXAMPLE_GAP }
      : { side: 'left', width: Math.min(widest, room), offset: from.left - box.left + EXAMPLE_GAP };
  }
  return {
    side: 'bottom',
    width: Math.min(widest, window.innerWidth - margin),
    offset: box.bottom - from.bottom + EXAMPLE_GAP,
  };
}

export function SwitchField(props: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  /**
   * What the feature looks like, in a card shown from a help button beside the label: while
   * the pointer is on it, while it has focus, or after a click or tap. Visual only: the
   * label and description must say what it does.
   */
  example?: ReactNode;
}) {
  const id = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<ExamplePlacement>({ side: 'bottom', width: 0, offset: EXAMPLE_GAP });
  // One timer for showing and hiding. (Radix's own keeps one per way of opening and clears
  // only the last, so a click and a quick move away could leave the card open.)
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (next: boolean, delay = 0) => {
    window.clearTimeout(timer.current);
    const apply = () => {
      if (next) setPlacement(examplePlacement(fieldRef.current, buttonRef.current));
      setOpen(next);
    };
    if (delay) timer.current = window.setTimeout(apply, delay);
    else apply();
  };
  // The help button's events. preventDefault() tells Radix to skip its own handlers.
  const trigger = {
    onPointerEnter: (e: React.PointerEvent) => {
      e.preventDefault();
      if (e.pointerType !== 'touch') show(true, 300);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      e.preventDefault();
      if (e.pointerType !== 'touch') show(false, 200);
    },
    onFocus: (e: React.FocusEvent) => {
      e.preventDefault();
      show(true, 300);
    },
    onBlur: (e: React.FocusEvent) => {
      e.preventDefault();
      show(false);
    },
    // A tap, or a click before the pointer has rested on it.
    onClick: () => show(true),
  };
  return (
    <Field ref={fieldRef} orientation="horizontal" className={props.className}>
      <FieldContent>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
          {props.example && (
            <HoverCard open={open} onOpenChange={(next) => show(next)}>
              <HoverCardTrigger asChild>
                <Button
                  ref={buttonRef}
                  variant="ghost"
                  size="icon"
                  className="-my-2 text-muted-foreground"
                  aria-label={`Example: ${props.label}`}
                  {...trigger}
                >
                  <CircleHelp aria-hidden className="size-5" />
                </Button>
              </HoverCardTrigger>
              {/*
                Kept inside the window: in the find bar, that's the bar's own frame. It lets the
                pointer through, so it never stays open over the switch you're heading for.
              */}
              <HoverCardContent
                side={placement.side}
                sideOffset={placement.offset}
                align="start"
                style={{ width: placement.width }}
                className="pointer-events-none max-h-(--radix-hover-card-content-available-height) overflow-y-auto"
              >
                {props.example}
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
        {props.description && <FieldDescription>{props.description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </Field>
  );
}

export function ColorField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  const commit = (raw: string) => {
    const hex = normalizeHex(raw.startsWith('#') ? raw : `#${raw}`);
    if (hex) props.onChange(hex);
    else setText(props.value);
  };
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="min-w-[7.5rem]">
        {props.label}
      </FieldLabel>
      <InputGroup className="w-auto max-w-[11rem]">
        <InputGroupAddon>
          <input
            type="color"
            aria-label={`${props.label}: pick a color`}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            className="size-7 cursor-pointer appearance-none rounded-md border-2 border-input bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[0.3rem] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={text}
          spellCheck={false}
          maxLength={7}
          aria-label={`${props.label} (hex code)`}
          className="font-mono uppercase"
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
        />
      </InputGroup>
    </Field>
  );
}

export function RangeField(props: {
  label: string;
  description?: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the value is shown and spoken, e.g. v => `${v} px`. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const shown = props.format ? props.format(props.value) : String(props.value);
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel id={id}>{props.label}</FieldLabel>
        <Badge variant="secondary" className="tabular-nums">
          {shown}
        </Badge>
      </div>
      <Slider
        aria-labelledby={id}
        thumbLabel={props.label}
        valueText={shown}
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onValueChange={([v]) => v !== undefined && props.onChange(v)}
        className="py-2"
      />
      {props.description && <FieldDescription>{props.description}</FieldDescription>}
    </Field>
  );
}

/** A radio group shown as selectable tiles, in columns when the page (an @container) is wide enough. */
export function ChoiceField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; description?: ReactNode; visual?: ReactNode }[];
  onChange: (value: T) => void;
  columns?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <p id={id} className="font-medium">
        {props.label}
      </p>
      <RadioGroup
        aria-labelledby={id}
        value={props.value}
        onValueChange={(v) => props.onChange(v as T)}
        className={cn('grid gap-2', props.columns ?? '@xl:grid-cols-3')}
      >
        {props.options.map((o) => {
          const itemId = `${id}-${o.value}`;
          return (
            <FieldLabel
              key={o.value}
              htmlFor={itemId}
              className="rounded-xl border-2 has-data-checked:border-primary has-data-checked:bg-accent dark:has-data-checked:border-primary dark:has-data-checked:bg-accent"
            >
              <Field orientation="horizontal" className="items-start">
                <RadioGroupItem value={o.value} id={itemId} className="mt-0.5" />
                <FieldContent>
                  {o.visual}
                  <span className="font-semibold">{o.label}</span>
                  {o.description && <FieldDescription>{o.description}</FieldDescription>}
                </FieldContent>
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>
    </div>
  );
}
