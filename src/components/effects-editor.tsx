import type { ReactNode } from 'react';
import { EffectExample, type ExampleKind } from '@/components/preview';
import { RangeField, SwitchField } from '@/components/settings-fields';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, FieldSeparator } from '@/components/ui/field';
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

/**
 * How a profile marks matches and helps find the current one; its colors are edited with the
 * light and dark previews. Options of an effect show while it's on, and each effect's help
 * button shows an example of it.
 */
export function EffectsEditor(props: {
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
      <Group
        title="Underline, border and blinking"
        description="Cues that don’t rely on color, and blinking to catch your eye."
      >
        <SwitchField
          label="Underline"
          description="Every match is underlined, in the colors above."
          example={example('underline')}
          checked={a.underline.enabled}
          onCheckedChange={(enabled) => set({ underline: { ...a.underline, enabled } })}
        />
        <RangeField
          label="Border width"
          description="Around the current match."
          value={a.borderWidth}
          {...LIMITS.borderWidth}
          format={(v) => `${v} px`}
          onChange={(borderWidth) => set({ borderWidth })}
        />
        <FieldSeparator />
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
          onCheckedChange={(enabled) => set({ ping: { ...a.ping, enabled } })}
        />
        {a.ping.enabled && (
          <RangeField
            label="Ring duration"
            description="How long it takes to close in. Slower is easier to follow."
            value={a.ping.durationMs}
            {...LIMITS.pingDurationMs}
            step={50}
            format={(v) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} s`}
            onChange={(durationMs) => set({ ping: { ...a.ping, durationMs } })}
          />
        )}
        {a.ping.enabled && (
          <RangeField
            label="Ring thickness"
            value={a.ping.width}
            {...LIMITS.pingWidth}
            format={(v) => `${v} px`}
            onChange={(width) => set({ ping: { ...a.ping, width } })}
          />
        )}
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
