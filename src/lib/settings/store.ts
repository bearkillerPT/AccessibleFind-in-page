/**
 * Reads and writes settings in `chrome.storage.sync`. Every extension context (background,
 * content script, find bar, options page) uses this directly and listens for changes, so
 * there's no settings copy in the service worker to go stale.
 */
import { browser } from 'wxt/browser';
import { MAX_PROFILES, makeDefaultProfile } from './defaults';
import { NAME_MAX, sanitizeAppearance, sanitizeName, sanitizePrefs } from './sanitize';
import {
  builtInProfile,
  isBuiltInId,
  migrateV1,
  needsMigration,
  PROFILE_PREFIX,
  profileKey,
  stateFromRaw,
  V1_KEYS,
} from './schema';
import type { Appearance, Prefs, SettingsState } from './types';

const area = () => browser.storage.sync;

export { MAX_PROFILES };

export async function readState(): Promise<SettingsState> {
  return stateFromRaw(await area().get(null));
}

/** Calls `onChange` with the new state whenever settings change in any context. */
export function subscribe(onChange: (state: SettingsState) => void): () => void {
  const listener = (_changes: unknown, areaName: string) => {
    if (areaName === 'sync') void readState().then(onChange);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** Upgrades a v1 store in place. Safe to call repeatedly and from several contexts. */
export async function ensureMigrated(): Promise<void> {
  const raw = await area().get(null);
  if (!needsMigration(raw)) return;
  await area().set(migrateV1(raw));
  await area().remove([...V1_KEYS]);
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await ensureMigrated();
  await area().set({ prefs: sanitizePrefs(prefs) });
}

export async function saveAppearance(profileId: string, appearance: Appearance): Promise<void> {
  await ensureMigrated();
  const original = builtInProfile(profileId);
  if (original) {
    // The user's version of a built-in profile; resetBuiltIn removes it again.
    const { id, name } = original;
    await area().set({ [profileKey(id)]: { id, name, appearance: sanitizeAppearance(appearance) } });
    return;
  }
  const state = await readState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  await writeProfile(profile.id, profile.name, appearance, state);
}

export async function setActiveProfile(profileId: string): Promise<void> {
  await ensureMigrated();
  const state = await readState();
  if (!state.profiles.some((p) => p.id === profileId)) return;
  await area().set({ activeProfileId: profileId });
}

/** Creates a profile, makes it active and returns its id. */
export async function createProfile(name: string, appearance: Appearance): Promise<string | null> {
  await ensureMigrated();
  const state = await readState();
  const users = state.profiles.filter((p) => !p.builtIn);
  if (users.length >= MAX_PROFILES) return null;
  const id = crypto.randomUUID().slice(0, 8);
  await area().set({
    [profileKey(id)]: { id, name: sanitizeName(name, 'New profile'), appearance: sanitizeAppearance(appearance) },
    profileOrder: [...users.map((p) => p.id), id],
    activeProfileId: id,
  });
  return id;
}

/** Puts a built-in profile back the way it ships. */
export async function resetBuiltIn(profileId: string): Promise<void> {
  if (isBuiltInId(profileId)) await area().remove(profileKey(profileId));
}

export async function renameProfile(profileId: string, name: string): Promise<void> {
  if (isBuiltInId(profileId)) return;
  await ensureMigrated();
  const state = await readState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  await writeProfile(profile.id, sanitizeName(name, profile.name), profile.appearance, state);
}

export async function deleteProfile(profileId: string): Promise<void> {
  if (isBuiltInId(profileId)) return;
  await ensureMigrated();
  const state = await readState();
  let users = state.profiles.filter((p) => !p.builtIn && p.id !== profileId);
  const writes: Record<string, unknown> = {};
  if (users.length === 0) {
    const def = makeDefaultProfile();
    users = [def];
    writes[profileKey(def.id)] = { id: def.id, name: def.name, appearance: def.appearance };
  }
  writes.profileOrder = users.map((p) => p.id);
  if (state.activeProfileId === profileId) writes.activeProfileId = users[0]!.id;
  await area().set(writes);
  await area().remove(profileKey(profileId));
}

async function writeProfile(id: string, name: string, appearance: Appearance, state: SettingsState) {
  const users = state.profiles.filter((p) => !p.builtIn);
  await area().set({
    [profileKey(id)]: { id, name, appearance: sanitizeAppearance(appearance) },
    // stateFromRaw may have synthesized a Default profile that isn't stored yet.
    profileOrder: users.map((p) => p.id),
  });
}

/** Replaces every setting and profile with `records` (from a backup; see transfer.ts). */
export async function replaceAll(records: Record<string, unknown>): Promise<void> {
  const current = await area().get(null);
  const stale = Object.keys(current).filter(
    (key) => (key.startsWith(PROFILE_PREFIX) && !(key in records)) || (V1_KEYS as readonly string[]).includes(key),
  );
  await area().set(records);
  if (stale.length) await area().remove(stale);
}

/**
 * Adds a shared profile, renamed if the name is taken ("Night (2)"), and makes it active.
 * Returns the name it got, or null if there are too many profiles.
 */
export async function importProfile(name: string, appearance: Appearance): Promise<string | null> {
  const state = await readState();
  const names = new Set(state.profiles.map((p) => p.name));
  const base = sanitizeName(name, 'Imported profile');
  let unique = base;
  for (let i = 2; names.has(unique); i++) {
    const suffix = ` (${i})`;
    unique = `${base.slice(0, NAME_MAX - suffix.length)}${suffix}`;
  }
  return (await createProfile(unique, appearance)) ? unique : null;
}
