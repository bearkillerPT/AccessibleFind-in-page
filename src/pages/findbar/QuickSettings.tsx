import { Settings } from 'lucide-react';
import { EffectExample, type ExampleKind } from '@/components/preview';
import { ProfilePicker } from '@/components/profile-picker';
import { SwitchField } from '@/components/settings-fields';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SettingsApi } from '@/hooks/use-settings';
import { openSettings } from '@/lib/platform';
import { UI_SCALES } from '@/lib/settings/defaults';
import { appearanceForPage, colorProfileForPage, withColorsFrom } from '@/lib/settings/schema';
import type { Appearance, PageTone } from '@/lib/settings/types';

/** The find bar's settings panel: profile, effects, automatic style and text size. */
export function QuickSettings({ api, tone }: { api: SettingsApi; tone: PageTone | null }) {
  const state = api.state;
  const reducedMotion = useReducedMotion(state?.prefs.motion ?? 'system');
  if (!state) return null;
  const auto = state.prefs.autoProfile;
  // Automatic style only changes colors; these switches always belong to the active profile.
  const profile = state.active;
  const colors = colorProfileForPage(state, tone);
  const dark = state.profiles.find((p) => p.id === auto.dark) ?? profile;
  const a = profile.appearance;
  // Examples look the way matches look on this page.
  const example = (kind: ExampleKind) => (
    <EffectExample
      kind={kind}
      appearance={appearanceForPage(state, tone)}
      darkPage={tone === 'dark'}
      reducedMotion={reducedMotion}
    />
  );
  const set = (patch: Partial<Appearance>) => api.updateProfileAppearance(profile.id, { ...a, ...patch });
  const scaleIndex = Math.max(0, UI_SCALES.findIndex((s) => s >= state.prefs.uiScale));
  const setScale = (i: number) =>
    api.updatePrefs({ uiScale: UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, i))]! });

  // Short descriptions, so effects that start off (spotlight, magnifier) say what they'd do.
  const effects = [
    {
      label: 'Blink',
      kind: 'blink' as const,
      description: 'Flashes the matches',
      checked: a.blink.enabled,
      set: (v: boolean) => set({ blink: { ...a.blink, enabled: v } }),
    },
    {
      label: 'Ring',
      kind: 'ring' as const,
      description: 'Closes in on the match',
      checked: a.ping.enabled,
      set: (v: boolean) => set({ ping: { enabled: v } }),
    },
    {
      label: 'Spotlight',
      kind: 'spotlight' as const,
      description: 'Dims the rest of the page',
      checked: a.spotlight.enabled,
      set: (v: boolean) => set({ spotlight: { ...a.spotlight, enabled: v } }),
    },
    {
      label: 'Magnifier',
      kind: 'magnifier' as const,
      description: 'Shows the match bigger',
      checked: a.magnifier.enabled,
      set: (v: boolean) => set({ magnifier: { ...a.magnifier, enabled: v } }),
    },
    {
      label: 'Guide lines',
      kind: 'guides' as const,
      description: 'Cross at the match',
      checked: a.guides.enabled,
      set: (v: boolean) => set({ guides: { enabled: v } }),
    },
    {
      label: 'Underline',
      kind: 'underline' as const,
      description: 'Under every match',
      checked: a.underline.enabled,
      set: (v: boolean) => set({ underline: { ...a.underline, enabled: v } }),
    },
  ];

  return (
    <section id="quick-settings" aria-label="Quick settings" className="mt-2 grid gap-4 rounded-xl border bg-background/60 p-3">
      <ProfilePicker api={api} compact />
      <div role="group" aria-label="Effects" className="grid grid-cols-2 gap-x-6 gap-y-3">
        {effects.map((e) => (
          <SwitchField
            key={e.label}
            label={e.label}
            description={e.description}
            example={example(e.kind)}
            checked={e.checked}
            onCheckedChange={e.set}
          />
        ))}
      </div>
      <SwitchField
        label="Automatic style"
        description={
          !auto.enabled
            ? 'Use other colors on dark backgrounds.'
            : tone === 'dark'
              ? `This page looks dark, so matches use the colors of “${colors.name}”.`
              : `On dark backgrounds, matches use the colors of “${dark.name}”.`
        }
        example={
          <EffectExample
            kind="auto-style"
            appearance={a}
            darkAppearance={withColorsFrom(a, dark.appearance)}
            reducedMotion={reducedMotion}
          />
        }
        checked={auto.enabled}
        onCheckedChange={(enabled) => api.updatePrefs({ autoProfile: { ...auto, enabled } })}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonGroup aria-label="Text size">
          <Button variant="outline" onClick={() => setScale(scaleIndex - 1)} aria-label="Smaller text">
            A−
          </Button>
          <ButtonGroupText className="min-w-18 justify-center tabular-nums" aria-live="polite">
            {Math.round(state.prefs.uiScale * 100)}%
          </ButtonGroupText>
          <Button variant="outline" onClick={() => setScale(scaleIndex + 1)} aria-label="Larger text">
            A+
          </Button>
        </ButtonGroup>
        <Button variant="secondary" onClick={() => openSettings('appearance')}>
          <Settings aria-hidden />
          All settings
        </Button>
      </div>
    </section>
  );
}
