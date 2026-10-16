import { RotateCcw } from 'lucide-react';
import { AppearanceEditor } from '@/components/appearance-editor';
import { Preview } from '@/components/preview';
import { ProfilePicker } from '@/components/profile-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { SettingsApi } from '@/hooks/use-settings';
import { DEFAULT_APPEARANCE } from '@/lib/settings/defaults';
import { appearanceForPage, sameAppearance } from '@/lib/settings/schema';
import type { SettingsState } from '@/lib/settings/types';
import { AutoProfileCard } from './AutoProfileCard';

/** Why matches on dark backgrounds show other colors than the profile being edited, if they do. */
function colorNote(state: SettingsState): string | undefined {
  const auto = state.prefs.autoProfile;
  const dark = state.profiles.find((p) => p.id === auto.dark);
  if (!auto.enabled || !dark || dark.id === state.active.id) return undefined;
  return (
    `Automatic style is on, so matches on dark backgrounds use the colors of “${dark.name}”. ` +
    'The colors below are for the others.'
  );
}

/** Choosing a profile, seeing how it looks, and changing it. */
export function HighlightSection({ api }: { api: SettingsApi }) {
  const state = api.state;
  const reducedMotion = useReducedMotion(state?.prefs.motion ?? 'system');
  if (!state) return null;
  const profile = state.active;
  // Built-in profiles reset to how they came, from the profile picker.
  const canReset = !profile.builtIn && !sameAppearance(profile.appearance, DEFAULT_APPEARANCE);
  return (
    <>
      <Card>
        <CardContent className="space-y-5">
          <ProfilePicker api={api} />
          <Preview
            light={appearanceForPage(state, 'light')}
            dark={appearanceForPage(state, 'dark')}
            note={colorNote(state)}
          />
        </CardContent>
      </Card>
      <AppearanceEditor appearance={profile.appearance} onChange={api.updateAppearance} reducedMotion={reducedMotion} />
      {canReset && (
        <Button variant="outline" onClick={() => void api.resetProfile(profile.id)}>
          <RotateCcw aria-hidden />
          Reset this profile to the default style
        </Button>
      )}
      <AutoProfileCard api={api} />
    </>
  );
}
