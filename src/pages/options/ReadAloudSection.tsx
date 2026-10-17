import { useId } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { RangeField, SwitchField } from '@/components/settings-fields';
import { ShortcutKeys } from '@/components/shortcut-keys';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommandShortcut } from '@/hooks/use-command-shortcut';
import type { SettingsApi } from '@/hooks/use-settings';
import { useVoices } from '@/hooks/use-voices';
import { READ_ALOUD_COMMAND } from '@/lib/messages';
import { openShortcutSettings } from '@/lib/platform';
import { LIMITS } from '@/lib/settings/sanitize';
import { formatCombo } from '@/lib/shortcuts';
import { speak, speechAvailable } from '@/lib/speech';

/** Voice, speed and auto-read for reading aloud, and reading without the find bar. */
export function ReadAloudSection({ api }: { api: SettingsApi }) {
  const voiceId = useId();
  const voices = useVoices();
  const browserShortcut = useCommandShortcut(READ_ALOUD_COMMAND);
  const state = api.state;
  if (!state) return null;
  const speech = state.prefs.speech;
  const set = (patch: Partial<typeof speech>) => api.updatePrefs({ speech: { ...speech, ...patch } });
  const sorted = [...voices].sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const online = sorted.filter((v) => !v.localService).length;
  // "Automatic" lets the browser pick one of these: with no voices on the device, an online one.
  const onlineNote =
    online === 0
      ? null
      : `Online voices send what’s read to your browser’s speech service. ${
          online === sorted.length
            ? 'This browser has no voices on the device, so Automatic is online too.'
            : 'The others work on this device. Automatic may use either.'
        }`;
  const key = formatCombo(state.prefs.shortcuts.readAloud);

  if (!speechAvailable()) {
    return (
      <Alert>
        <AlertDescription>This browser has no built-in voices, so reading aloud isn’t available.</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <Card>
        <CardContent>
          <FieldGroup className="gap-6">
            <SwitchField
              label="Read each match aloud when I move to it"
              description={`With Enter, the arrows or the results list. You can always press the speaker button or ${key}.`}
              checked={speech.autoRead}
              onCheckedChange={(autoRead) => set({ autoRead })}
            />
            <div className="grid gap-1.5">
              <Label htmlFor={voiceId}>Voice</Label>
              <NativeSelect
                id={voiceId}
                aria-describedby={onlineNote ? `${voiceId}-online` : undefined}
                className="w-full max-w-md"
                value={speech.voiceURI}
                onChange={(e) => set({ voiceURI: e.target.value })}
              >
                <NativeSelectOption value="">Automatic, in the page’s language</NativeSelectOption>
                {sorted.map((v) => (
                  <NativeSelectOption key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}{v.localService ? '' : ', online'})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {onlineNote && (
                <p id={`${voiceId}-online`} className="text-sm text-muted-foreground">
                  {onlineNote}
                </p>
              )}
            </div>
            <RangeField
              label="Speed"
              value={speech.rate}
              {...LIMITS.speechRate}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(rate) => set({ rate: Math.round(rate * 10) / 10 })}
            />
            <div>
              <Button
                variant="outline"
                onClick={() =>
                  speak('From the top of the mountain she could see the whole valley.', {
                    rate: speech.rate,
                    voiceURI: speech.voiceURI,
                    lang: 'en',
                  })
                }
              >
                <Play aria-hidden />
                Try this voice
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Without the find bar</CardTitle>
          <CardDescription className="text-base">
            Select text on any website and press the shortcut below to hear it. With nothing selected, it reads the
            sentence you last clicked in, or what you typed in a text box. Press it again, or Escape, to stop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Current:</span>
            {browserShortcut === null ? null : browserShortcut ? (
              <ShortcutKeys shortcut={browserShortcut} />
            ) : (
              <span className="font-semibold">None</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            In the browser’s shortcut page, look for “Read aloud the selected text”.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => openShortcutSettings()}>
            {browserShortcut === '' ? 'Choose a shortcut' : 'Change shortcut'}
            <ExternalLink aria-hidden />
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
