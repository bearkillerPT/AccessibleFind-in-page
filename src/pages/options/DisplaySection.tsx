import { Monitor, Moon, Sun } from 'lucide-react';
import { EffectExample } from '@/components/preview';
import { ChoiceField, RangeField, SwitchField } from '@/components/settings-fields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SettingsApi } from '@/hooks/use-settings';
import { UI_SCALES } from '@/lib/settings/defaults';
import type { BarPosition, MotionPref, ThemePref } from '@/lib/settings/types';
import { RecentSearches } from './RecentSearches';

function PositionVisual({ position }: { position: BarPosition }) {
  const [v, h] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
  return (
    <span aria-hidden className="relative mb-1 block h-10 w-16 rounded-md border-2 bg-background">
      <span
        className={`absolute h-2 w-7 rounded-sm bg-signal ${v === 'top' ? 'top-1' : 'bottom-1'} ${
          h === 'left' ? 'left-1' : h === 'right' ? 'right-1' : 'left-1/2 -translate-x-1/2'
        }`}
      />
    </span>
  );
}

const POSITIONS: { value: BarPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
];

/** Text size, theme and position of the find bar, and how it behaves. */
export function DisplaySection({ api }: { api: SettingsApi }) {
  const state = api.state;
  const reducedMotion = useReducedMotion(state?.prefs.motion ?? 'system');
  if (!state) return null;
  const prefs = state.prefs;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it looks</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-8">
            <RangeField
              label="Text size"
              description="For the find bar and these settings."
              value={Math.max(0, UI_SCALES.findIndex((s) => s >= prefs.uiScale))}
              min={0}
              max={UI_SCALES.length - 1}
              format={(i) => `${Math.round((UI_SCALES[i] ?? 1) * 100)}%`}
              onChange={(i) => api.updatePrefs({ uiScale: UI_SCALES[i] ?? 1 })}
            />
            <ChoiceField<ThemePref>
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => api.updatePrefs({ theme })}
              options={[
                { value: 'system', label: 'Match my system', visual: <Monitor className="size-5" aria-hidden /> },
                { value: 'dark', label: 'Dark', visual: <Moon className="size-5" aria-hidden /> },
                { value: 'light', label: 'Light', visual: <Sun className="size-5" aria-hidden /> },
              ]}
            />
            <ChoiceField<BarPosition>
              label="Find bar position"
              value={prefs.barPosition}
              onChange={(barPosition) => api.updatePrefs({ barPosition })}
              columns="grid-cols-2 @xl:grid-cols-3"
              options={POSITIONS.map((p) => ({ ...p, visual: <PositionVisual position={p.value} /> }))}
            />
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-8">
            <SwitchField
              label="Show the words around the match in the find bar"
              description="Read the match without having to find it on the page."
              example={
                <EffectExample kind="bar-context" appearance={state.active.appearance} reducedMotion={reducedMotion} />
              }
              checked={prefs.showContextInBar}
              onCheckedChange={(showContextInBar) => api.updatePrefs({ showContextInBar })}
            />
            <SwitchField
              label="Search for the selected text"
              description="If you select text before opening the find bar, it’s searched right away."
              checked={prefs.prefillSelection}
              onCheckedChange={(prefillSelection) => api.updatePrefs({ prefillSelection })}
            />
            <ChoiceField<MotionPref>
              label="Blinking and animation"
              value={prefs.motion}
              onChange={(motion) => api.updatePrefs({ motion })}
              options={[
                { value: 'system', label: 'Match my system', description: 'Off if “reduce motion” is on.' },
                { value: 'reduce', label: 'Never', description: 'No blinking or moving effects.' },
                { value: 'allow', label: 'Always', description: 'Even if “reduce motion” is on.' },
              ]}
            />
            <RecentSearches api={api} />
          </FieldGroup>
        </CardContent>
      </Card>
    </>
  );
}
