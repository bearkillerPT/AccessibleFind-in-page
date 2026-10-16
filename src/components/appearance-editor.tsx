import type { ReactNode } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { EffectExample, type ExampleKind } from '@/components/preview';
import { ColorField, RangeField, SwitchField } from '@/components/settings-fields';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, FieldSeparator } from '@/components/ui/field';
import { contrastRatio, MIN_TEXT_CONTRAST } from '@/lib/settings/contrast';
import { LIMITS } from '@/lib/settings/sanitize';
import type { Appearance } from '@/lib/settings/types';

function Group(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{props.title}</CardTitle>
        {props.description && <CardDescription>{props.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-5">{props.children}</FieldGroup>
      </CardContent>
    </Card>
  );
}

function ContrastNote({ bg, fg }: { bg: string; fg: string }) {
  const ratio = contrastRatio(bg, fg);
  if (ratio === null) return null;
  const ok = ratio >= MIN_TEXT_CONTRAST;
  const Icon = ok ? CircleCheck : TriangleAlert;
  return (
    <p className={`flex items-start gap-2 text-sm ${ok ? 'text-muted-foreground' : 'font-semibold text-warning-foreground'}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-success' : ''}`} aria-hidden />
      <span>
        Text contrast {ratio.toFixed(1)}:1.{' '}
        {ok ? 'Easy to read.' : `Below the recommended ${MIN_TEXT_CONTRAST}:1, so it may be hard to read.`}
      </span>
    </p>
  );
}

/**
 * Every visual setting of a profile, grouped into cards. Options of an effect show while
 * it's on, and hovering an effect shows an example of it.
 */
export function AppearanceEditor(props: {
  appearance: Appearance;
  onChange: (next: Appearance) => void;
  /** No blinking or moving examples. */
  reducedMotion: boolean;
}) {
  const a = props.appearance;
  const set = (patch: Partial<Appearance>) => props.onChange({ ...a, ...patch });
  const example = (kind: ExampleKind) => (
    <EffectExample kind={kind} appearance={a} reducedMotion={props.reducedMotion} />
  );

  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
      <Group title="All matches" description="Every place the text appears.">
        <ColorField label="Background" value={a.matchBg} onChange={(matchBg) => set({ matchBg })} />
        <ColorField label="Text" value={a.matchText} onChange={(matchText) => set({ matchText })} />
        <ContrastNote bg={a.matchBg} fg={a.matchText} />
        <FieldSeparator />
        <SwitchField
          label="Underline"
          description="A second cue that doesn’t rely on color."
          example={example('underline')}
          checked={a.underline.enabled}
          onCheckedChange={(enabled) => set({ underline: { ...a.underline, enabled } })}
        />
        {a.underline.enabled && (
          <ColorField
            label="Underline color"
            value={a.underline.color}
            onChange={(color) => set({ underline: { ...a.underline, color } })}
          />
        )}
      </Group>

      <Group title="Current match" description="The one you’re on, with a border around it.">
        <ColorField label="Background" value={a.currentBg} onChange={(currentBg) => set({ currentBg })} />
        <ColorField label="Text" value={a.currentText} onChange={(currentText) => set({ currentText })} />
        <ContrastNote bg={a.currentBg} fg={a.currentText} />
        <FieldSeparator />
        <ColorField
          label="Border"
          value={a.currentBorder}
          onChange={(currentBorder) => set({ currentBorder })}
        />
        <RangeField
          label="Border width"
          value={a.borderWidth}
          {...LIMITS.borderWidth}
          format={(v) => `${v} px`}
          onChange={(borderWidth) => set({ borderWidth })}
        />
      </Group>

      <Group title="Blinking" description="Matches and the words around them take turns lighting up.">
        <SwitchField
          label="Blink"
          description="After you stop typing, and when you move to another match."
          example={example('blink')}
          checked={a.blink.enabled}
          onCheckedChange={(enabled) => set({ blink: { ...a.blink, enabled } })}
        />
        {a.blink.enabled && (
          <>
            <RangeField
              label="Number of blinks"
              value={a.blink.count}
              {...LIMITS.blinkCount}
              onChange={(count) => set({ blink: { ...a.blink, count } })}
            />
            <RangeField
              label="Speed"
              description="Time per step. Kept under 3 flashes a second, a safe rate for photosensitivity."
              value={a.blink.intervalMs}
              {...LIMITS.blinkIntervalMs}
              step={50}
              format={(v) => `${v} ms`}
              onChange={(intervalMs) => set({ blink: { ...a.blink, intervalMs } })}
            />
            <RangeField
              label="Words around the match"
              value={a.contextWords}
              {...LIMITS.contextWords}
              format={(v) => (v === 0 ? 'None' : `${v} each side`)}
              onChange={(contextWords) => set({ contextWords })}
            />
          </>
        )}
      </Group>

      <Group title="Spotting the current match" description="Extra help to find it on the screen.">
        <SwitchField
          label="Spotlight"
          description="Dims the rest of the page."
          example={example('spotlight')}
          checked={a.spotlight.enabled}
          onCheckedChange={(enabled) => set({ spotlight: { ...a.spotlight, enabled } })}
        />
        {a.spotlight.enabled && (
          <RangeField
            label="Dimming"
            value={Math.round(a.spotlight.opacity * 100)}
            min={LIMITS.spotlightOpacity.min * 100}
            max={LIMITS.spotlightOpacity.max * 100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => set({ spotlight: { ...a.spotlight, opacity: v / 100 } })}
          />
        )}
        <SwitchField
          label="Ring"
          description="A ring shrinks from the edges of the screen onto the match."
          example={example('ring')}
          checked={a.ping.enabled}
          onCheckedChange={(enabled) => set({ ping: { enabled } })}
        />
        <SwitchField
          label="Guide lines"
          description="Lines across the whole screen that cross at the match."
          example={example('guides')}
          checked={a.guides.enabled}
          onCheckedChange={(enabled) => set({ guides: { enabled } })}
        />
        <SwitchField
          label="Magnifier"
          description="The match and nearby words in large text, right next to it."
          example={example('magnifier')}
          checked={a.magnifier.enabled}
          onCheckedChange={(enabled) => set({ magnifier: { ...a.magnifier, enabled } })}
        />
        {a.magnifier.enabled && (
          <RangeField
            label="Magnifier text size"
            value={a.magnifier.fontSize}
            {...LIMITS.magnifierFontSize}
            step={2}
            format={(v) => `${v} px`}
            onChange={(fontSize) => set({ magnifier: { ...a.magnifier, fontSize } })}
          />
        )}
      </Group>
    </div>
  );
}
