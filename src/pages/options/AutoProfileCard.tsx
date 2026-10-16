import { SunMoon } from 'lucide-react';
import { EffectExample } from '@/components/preview';
import { ProfileSelect } from '@/components/profile-select';
import { SwitchField } from '@/components/settings-fields';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SettingsApi } from '@/hooks/use-settings';
import { withColorsFrom } from '@/lib/settings/schema';

/** Other highlight colors for matches on dark backgrounds. */
export function AutoProfileCard({ api }: { api: SettingsApi }) {
  const state = api.state;
  const reducedMotion = useReducedMotion(state?.prefs.motion ?? 'system');
  if (!state) return null;
  const auto = state.prefs.autoProfile;
  const dark = state.profiles.find((p) => p.id === auto.dark) ?? state.active;
  const set = (patch: Partial<typeof auto>) => api.updatePrefs({ autoProfile: { ...auto, ...patch } });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SunMoon className="size-5 text-signal" aria-hidden />
          <CardTitle className="text-lg">Automatic style</CardTitle>
        </div>
        <CardDescription>
          Colors that stand out on a white page can be hard to see on a dark one. When this is on, matches on a dark
          background, like a dark website or a code block, use the colors of the profile below. The others keep your
          profile’s colors, and blinking, spotlight and your other options stay the same everywhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SwitchField
          label="Use other colors on dark backgrounds"
          example={
            <EffectExample
              kind="auto-style"
              appearance={state.active.appearance}
              darkAppearance={withColorsFrom(state.active.appearance, dark.appearance)}
              reducedMotion={reducedMotion}
            />
          }
          checked={auto.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
        {auto.enabled && (
          <div className="max-w-md">
            <ProfileSelect
              label="Colors on dark backgrounds"
              profiles={state.profiles}
              value={auto.dark}
              onChange={(dark) => set({ dark })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
