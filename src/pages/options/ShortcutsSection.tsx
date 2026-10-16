import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ShortcutKeys } from '@/components/shortcut-keys';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardContent } from '@/components/ui/card';
import type { SettingsApi } from '@/hooks/use-settings';
import {
  ALT_GRAPH_PROBLEM,
  comboFromEvent,
  currentPreset,
  DEFAULT_SHORTCUTS,
  detectPlatform,
  formatCombo,
  isAltGraph,
  modifierPresets,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  shortcutProblem,
  shortcutsWith,
  type ShortcutAction,
  type Shortcuts,
} from '@/lib/shortcuts';

function ShortcutRow(props: {
  action: ShortcutAction;
  shortcuts: Shortcuts;
  onChange: (value: string) => void;
}) {
  const { action, shortcuts } = props;
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const warningId = useId();
  const label = SHORTCUT_LABELS[action];
  const value = shortcuts[action];
  // The saved shortcut may not work on this computer, say if it was set up on another one.
  const warning = recording || problem ? null : shortcutProblem(value, action, shortcuts);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    if (e.key === 'Tab') {
      setRecording(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(false);
      setProblem(null);
      return;
    }
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return; // Only modifiers so far: wait for the key.
    // The find bar ignores keys typed with AltGr, so a shortcut recorded with it would never work.
    const issue = isAltGraph(e.nativeEvent) ? ALT_GRAPH_PROBLEM : shortcutProblem(combo, action, shortcuts);
    if (issue) {
      setProblem(`${formatCombo(combo)}: ${issue}`);
      return; // Keep listening so another combination can be tried.
    }
    setProblem(null);
    setRecording(false);
    props.onChange(combo);
  };

  return (
    <li className="grid gap-2 border-b py-3 last:border-b-0 @xl:grid-cols-[minmax(0,1fr)_auto_auto] @xl:items-center">
      <span className="font-medium">{label}</span>
      <span className="min-w-[8rem]">
        {recording ? (
          <span className="font-semibold text-signal">Press the new keys…</span>
        ) : (
          <ShortcutKeys shortcut={formatCombo(value)} />
        )}
      </span>
      <span className="flex gap-2">
        <Button
          variant={recording ? 'default' : 'outline'}
          aria-label={recording ? `Recording a new shortcut for ${label}. Press the keys, or Escape to cancel.` : `Change the shortcut for ${label}`}
          aria-describedby={warning ? warningId : undefined}
          onClick={() => {
            setProblem(null);
            setRecording((r) => !r);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setRecording(false)}
        >
          {recording ? 'Cancel' : 'Change'}
        </Button>
        {value !== DEFAULT_SHORTCUTS[action] && !recording && (
          <Button
            variant="ghost"
            onClick={() => {
              const issue = shortcutProblem(DEFAULT_SHORTCUTS[action], action, shortcuts);
              if (issue) setProblem(`${formatCombo(DEFAULT_SHORTCUTS[action])}: ${issue}`);
              else props.onChange(DEFAULT_SHORTCUTS[action]);
            }}
          >
            Reset
          </Button>
        )}
      </span>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-destructive @xl:col-span-3">
          {problem}
        </p>
      )}
      {warning && (
        <p id={warningId} className="text-sm font-semibold text-destructive @xl:col-span-3">
          {formatCombo(value)} won’t work here. {warning}
        </p>
      )}
    </li>
  );
}

/** The find bar's own shortcuts, for systems where Alt is taken (window managers like i3). */
export function ShortcutsSection({ api }: { api: SettingsApi }) {
  const state = api.state;
  if (!state) return null;
  const shortcuts = state.prefs.shortcuts;
  const preset = currentPreset(shortcuts);
  const platform = detectPlatform();
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="font-medium">Use for all of them</p>
          <ButtonGroup aria-label="Modifier keys for all shortcuts">
            {modifierPresets(platform).map((m) => (
              <Button
                key={m}
                variant={preset === m ? 'default' : 'outline'}
                aria-pressed={preset === m}
                onClick={() => api.updatePrefs({ shortcuts: shortcutsWith(m) })}
              >
                {formatCombo(`${m}+KeyX`, platform).replace(/\+?X$/, '')}
              </Button>
            ))}
          </ButtonGroup>
          {platform === 'windows' && (
            <p className="text-sm text-muted-foreground">
              On Windows, Ctrl+Alt is the same as the AltGr key, which some keyboards use to type letters like ą or ł.
            </p>
          )}
          {platform === 'other' && (
            <p className="text-sm text-muted-foreground">
              Super is the key with the Windows logo. Many desktops use it for their own shortcuts, like Super+L to
              lock the screen. Choose it only if yours doesn’t.
            </p>
          )}
        </div>
        <ul aria-label="Shortcuts">
          {SHORTCUT_ACTIONS.map((action) => (
            <ShortcutRow
              key={action}
              action={action}
              shortcuts={shortcuts}
              onChange={(value) => api.updatePrefs({ shortcuts: { ...shortcuts, [action]: value } })}
            />
          ))}
        </ul>
        {preset !== 'Alt' && (
          <Button variant="outline" onClick={() => api.updatePrefs({ shortcuts: DEFAULT_SHORTCUTS })}>
            <RotateCcw aria-hidden />
            Reset all to the defaults
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
