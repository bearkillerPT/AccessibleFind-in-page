import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { SwitchField } from '@/components/settings-fields';
import { Button } from '@/components/ui/button';
import type { SettingsApi } from '@/hooks/use-settings';
import { clearHistory, loadHistory } from '@/lib/history';

/** Whether to remember recent searches, and a way to forget them. */
export function RecentSearches({ api }: { api: SettingsApi }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => void loadHistory().then((h) => setCount(h.length));
    refresh();
    const onChanged = (_changes: unknown, area: string) => area === 'local' && refresh();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  const remember = api.state?.prefs.rememberSearches;
  useEffect(() => {
    // Turned off elsewhere (another computer, a restored backup): forget them here too.
    if (remember === false) void clearHistory();
  }, [remember]);
  const state = api.state;
  if (!state) return null;
  return (
    <div className="space-y-3">
      <SwitchField
        label="Remember recent searches"
        description="Bring them back with the up and down arrows in the find bar. They’re kept on this device only; turning this off also clears them."
        checked={state.prefs.rememberSearches}
        onCheckedChange={(rememberSearches) => {
          api.updatePrefs({ rememberSearches });
          if (!rememberSearches) void clearHistory();
        }}
      />
      {count > 0 && (
        <Button variant="outline" onClick={() => void clearHistory()}>
          <Trash2 aria-hidden />
          Clear {count} recent {count === 1 ? 'search' : 'searches'}
        </Button>
      )}
    </div>
  );
}
