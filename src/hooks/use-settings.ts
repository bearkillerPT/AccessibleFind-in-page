import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_APPEARANCE } from '@/lib/settings/defaults';
import { builtInProfile } from '@/lib/settings/schema';
import * as store from '@/lib/settings/store';
import type { Appearance, Prefs, SettingsState } from '@/lib/settings/types';

const WRITE_DELAY_MS = 300;

/**
 * Settings for React pages. Edits show up immediately and are written to storage after a
 * short pause (color pickers fire on every drag step, and sync storage limits writes).
 * Pending writes are flushed when the page goes away, so a quick close doesn't lose them.
 */
export function useSettings() {
  const [state, setState] = useState<SettingsState | null>(null);
  /** The latest state, even before React renders it, so quick successive edits build on each other. */
  const stateRef = useRef<SettingsState | null>(null);
  const show = useCallback((next: SettingsState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  /** Number of local edits not yet written; storage events are ignored meanwhile. */
  const unsaved = useRef(0);
  const timers = useRef(new Map<string, { timer: number; write: () => Promise<unknown> }>());

  const refresh = useCallback(async () => {
    const next = await store.readState();
    if (unsaved.current === 0) show(next);
  }, [show]);

  useEffect(() => {
    void refresh();
    return store.subscribe(() => void refresh());
  }, [refresh]);

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      try {
        await write();
      } catch (error) {
        console.warn('Accessible Find: could not save settings', error);
      } finally {
        unsaved.current--;
        void refresh();
      }
    },
    [refresh],
  );

  const later = useCallback(
    (key: string, write: () => Promise<unknown>) => {
      const pending = timers.current.get(key);
      if (pending) window.clearTimeout(pending.timer);
      else unsaved.current++;
      const timer = window.setTimeout(() => {
        timers.current.delete(key);
        void run(write);
      }, WRITE_DELAY_MS);
      timers.current.set(key, { timer, write });
    },
    [run],
  );

  const now = useCallback(
    (write: () => Promise<unknown>) => {
      unsaved.current++;
      return run(write);
    },
    [run],
  );

  /** Drops a write that's still waiting. */
  const cancel = useCallback((key: string) => {
    const pending = timers.current.get(key);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    timers.current.delete(key);
    unsaved.current--;
  }, []);

  /** Shows a profile with a new appearance straight away. */
  const showAppearance = useCallback(
    (profileId: string, appearance: Appearance) => {
      const s = stateRef.current;
      const profile = s?.profiles.find((p) => p.id === profileId);
      if (!s || !profile) return false;
      const updated = { ...profile, appearance };
      show({
        ...s,
        active: s.active.id === profileId ? updated : s.active,
        profiles: s.profiles.map((p) => (p.id === profileId ? updated : p)),
      });
      return true;
    },
    [show],
  );

  useEffect(() => {
    const flush = () => {
      for (const [key, { timer, write }] of timers.current) {
        window.clearTimeout(timer);
        timers.current.delete(key);
        void run(write);
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [run]);

  /** Edits any profile. Changes to a built-in one can be undone with resetProfile. */
  const updateProfileAppearance = useCallback(
    (profileId: string, appearance: Appearance) => {
      if (showAppearance(profileId, appearance)) {
        later(`appearance:${profileId}`, () => store.saveAppearance(profileId, appearance));
      }
    },
    [later, showAppearance],
  );

  /** Puts a built-in profile back the way it ships, or a user profile back to the default style. */
  const resetProfile = useCallback(
    (profileId: string) => {
      const original = builtInProfile(profileId);
      if (!original) {
        updateProfileAppearance(profileId, structuredClone(DEFAULT_APPEARANCE));
        return Promise.resolve();
      }
      // A change still waiting to be saved would bring the old look back.
      cancel(`appearance:${profileId}`);
      showAppearance(profileId, structuredClone(original.appearance));
      return now(() => store.resetBuiltIn(profileId));
    },
    [cancel, now, showAppearance, updateProfileAppearance],
  );

  const updateAppearance = useCallback(
    (appearance: Appearance) => {
      const s = stateRef.current;
      if (s) updateProfileAppearance(s.active.id, appearance);
    },
    [updateProfileAppearance],
  );

  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => {
      const s = stateRef.current;
      if (!s) return;
      const prefs = { ...s.prefs, ...patch };
      show({ ...s, prefs });
      later('prefs', () => store.savePrefs(prefs));
    },
    [later, show],
  );

  const selectProfile = useCallback(
    (id: string) => {
      const s = stateRef.current;
      const active = s?.profiles.find((p) => p.id === id);
      if (s && active) show({ ...s, active, activeProfileId: id });
      return now(() => store.setActiveProfile(id));
    },
    [now, show],
  );

  const duplicateProfile = useCallback(() => {
    const s = stateRef.current;
    if (!s) return Promise.resolve();
    const base = s.active.name.replace(/ \(copy( \d+)?\)$/, '');
    const names = new Set(s.profiles.map((p) => p.name));
    let name = `${base} (copy)`;
    for (let i = 2; names.has(name); i++) name = `${base} (copy ${i})`;
    return now(() => store.createProfile(name, s.active.appearance));
  }, [now]);

  const renameProfile = useCallback((id: string, name: string) => now(() => store.renameProfile(id, name)), [now]);
  const deleteProfile = useCallback((id: string) => now(() => store.deleteProfile(id)), [now]);

  return {
    state,
    updateAppearance,
    updateProfileAppearance,
    resetProfile,
    updatePrefs,
    selectProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  };
}

export type SettingsApi = ReturnType<typeof useSettings>;
