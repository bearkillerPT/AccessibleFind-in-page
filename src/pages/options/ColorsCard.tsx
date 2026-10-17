import { useId, type ReactNode } from 'react';
import { CircleCheck, Moon, Sun, TriangleAlert } from 'lucide-react';
import { PagePreview } from '@/components/preview';
import { ColorField } from '@/components/settings-fields';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { contrastRatio, MIN_TEXT_CONTRAST } from '@/lib/settings/contrast';
import type { Appearance, DarkColors } from '@/lib/settings/types';

/** How readable text in these colors is, with a warning below the recommended contrast. */
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

/** A profile's colors for light pages, in the same shape as the ones for dark pages. */
export function lightColors(a: Appearance): DarkColors {
  return {
    matchBg: a.matchBg,
    matchText: a.matchText,
    underline: a.underline.color,
    currentBg: a.currentBg,
    currentText: a.currentText,
    currentBorder: a.currentBorder,
  };
}

/** `a` with some of its colors for light pages changed. */
export function withLightColors(a: Appearance, patch: Partial<DarkColors>): Appearance {
  const { underline, ...rest } = patch;
  return { ...a, ...rest, underline: { ...a.underline, color: underline ?? a.underline.color } };
}

/**
 * How matches look on light or on dark pages: a sample page, and the colors that make it,
 * right under it.
 */
export function ColorsCard(props: {
  dark?: boolean;
  /** How matches look on this kind of page, with the profile's effects. */
  preview: Appearance;
  /** The colors to edit here, or null when there are none of their own (automatic style off). */
  colors: DarkColors | null;
  /** Whether matches are underlined; the switch is with the effects. */
  underline: boolean;
  onChange: (patch: Partial<DarkColors>) => void;
  /** At the top right: the automatic style switch, on the dark page card. */
  action?: ReactNode;
  /** In place of the colors when there are none of their own. */
  emptyNote?: string;
}) {
  const id = useId();
  const { colors, onChange } = props;
  const title = props.dark ? 'On dark pages' : 'On light pages';
  const Icon = props.dark ? Moon : Sun;
  return (
    <Card role="region" aria-labelledby={`${id}-title`} className="@2xl:row-span-3 @2xl:grid @2xl:grid-rows-subgrid">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-signal" aria-hidden />
          <CardTitle id={`${id}-title`} className="text-lg">
            {title}
          </CardTitle>
        </div>
        <CardDescription>
          {props.dark ? 'Dark websites and code blocks.' : 'White and light websites.'}
        </CardDescription>
        {props.action && <CardAction>{props.action}</CardAction>}
      </CardHeader>
      <CardContent>
        <PagePreview a={props.preview} dark={props.dark} label={`How matches look ${title.toLowerCase()}`} />
      </CardContent>
      <CardContent>
        {!colors && props.emptyNote && <p className="text-muted-foreground">{props.emptyNote}</p>}
        {colors && (
          <div className="space-y-6">
            <section aria-labelledby={`${id}-matches`} className="space-y-3">
              <h4 id={`${id}-matches`} className="font-semibold">
                All matches
              </h4>
              <FieldGroup className="gap-4">
                <ColorField label="Background" value={colors.matchBg} onChange={(matchBg) => onChange({ matchBg })} />
                <ColorField label="Text" value={colors.matchText} onChange={(matchText) => onChange({ matchText })} />
                <ContrastNote bg={colors.matchBg} fg={colors.matchText} />
                {props.underline && (
                  <ColorField label="Underline" value={colors.underline} onChange={(underline) => onChange({ underline })} />
                )}
              </FieldGroup>
            </section>
            <section aria-labelledby={`${id}-current`} className="space-y-3">
              <h4 id={`${id}-current`} className="font-semibold">
                Current match
              </h4>
              <FieldGroup className="gap-4">
                <ColorField label="Background" value={colors.currentBg} onChange={(currentBg) => onChange({ currentBg })} />
                <ColorField label="Text" value={colors.currentText} onChange={(currentText) => onChange({ currentText })} />
                <ContrastNote bg={colors.currentBg} fg={colors.currentText} />
                <ColorField
                  label="Border"
                  value={colors.currentBorder}
                  onChange={(currentBorder) => onChange({ currentBorder })}
                />
              </FieldGroup>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
