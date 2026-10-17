import { EffectsEditor } from '@/components/effects-editor';
import { ProfilePicker } from '@/components/profile-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SettingsApi } from '@/hooks/use-settings';
import { appearanceForPage } from '@/lib/settings/schema';
import { ColorsCard, lightColors, withLightColors } from './ColorsCard';

/**
 * Choosing a profile and changing it: its colors beside how they look on light and on dark
 * pages, then its effects.
 */
export function HighlightSection({ api }: { api: SettingsApi }) {
  const state = api.state;
  const reducedMotion = useReducedMotion(state?.prefs.motion ?? 'system');
  if (!state) return null;
  const a = state.active.appearance;
  const auto = state.prefs.autoProfile.enabled;
  return (
    <>
      <Card>
        <CardContent>
          <ProfilePicker api={api} />
        </CardContent>
      </Card>

      {/* Side by side, the cards share their rows (heading, sample, colors), so the samples line up. */}
      <div className="grid gap-4 @2xl:grid-cols-2 @2xl:gap-y-0">
        <ColorsCard
          preview={a}
          colors={lightColors(a)}
          underline={a.underline.enabled}
          onChange={(patch) => api.updateAppearance(withLightColors(a, patch))}
        />
        <ColorsCard
          dark
          preview={appearanceForPage(state, 'dark')}
          colors={auto ? a.dark : null}
          underline={a.underline.enabled}
          onChange={(patch) => api.updateAppearance({ ...a, dark: { ...a.dark, ...patch } })}
          emptyNote="Off: matches on a dark background use the colors for light pages."
          action={
            <div className="flex items-center gap-2">
              <Label htmlFor="automatic-style">Automatic style</Label>
              <Switch
                id="automatic-style"
                checked={auto}
                onCheckedChange={(enabled) => api.updatePrefs({ autoProfile: { enabled } })}
              />
            </div>
          }
        />
      </div>

      <EffectsEditor appearance={a} onChange={api.updateAppearance} reducedMotion={reducedMotion} />
    </>
  );
}
