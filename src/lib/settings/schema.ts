/**
 * Pure conversion between what's in `chrome.storage.sync` and a usable SettingsState,
 * including the upgrade from the v1 storage layout. No browser APIs here, so it's unit-testable.
 *
 * v2 layout (sync storage):
 *   schemaVersion: 2
 *   prefs: Prefs
 *   activeProfileId: string
 *   profileOrder: string[]            ids of user profiles, in display order
 *   "profile:<id>": { id, name, appearance }
 *                                     a user profile, or the user's changes to a built-in
 *                                     one (whose id is never in profileOrder)
 *
 * One key per profile keeps every item well under sync storage's 8 KB per-item limit.
 */
import { BUILT_IN_PROFILES, DEFAULT_PREFS, makeDefaultProfile } from './defaults';
import { sanitizeAppearance, sanitizeName, sanitizePrefs } from './sanitize';
import type { Appearance, PageTone, Profile, SettingsState } from './types';

export const SCHEMA_VERSION = 2;
export const PROFILE_PREFIX = 'profile:';
export const profileKey = (id: string) => `${PROFILE_PREFIX}${id}`;

/** Keys v1 stored that v2 no longer uses. */
export const V1_KEYS = ['settings', 'profiles'] as const;

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A built-in profile as it ships, before the user changed anything. */
export function builtInProfile(id: string): Profile | undefined {
  return BUILT_IN_PROFILES.find((p) => p.id === id);
}

export function isBuiltInId(id: string): boolean {
  return builtInProfile(id) !== undefined;
}

/** Whether two appearances are the same, once cleaned up. */
export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return JSON.stringify(sanitizeAppearance(a)) === JSON.stringify(sanitizeAppearance(b));
}

/** Whether a profile is a built-in one the user has changed, so it can be reset. */
export function isChangedBuiltIn(profile: Profile): boolean {
  const original = profile.builtIn ? builtInProfile(profile.id) : undefined;
  return original !== undefined && !sameAppearance(profile.appearance, original.appearance);
}

/** Converts v1 `Settings` (flat object) to a v2 Appearance. */
export function appearanceFromV1(input: unknown): Appearance {
  const v = isObj(input) ? input : {};
  const numBlinks = typeof v.numBlinks === 'number' ? v.numBlinks : 2;
  const fontSize = typeof v.matchFontSize === 'number' ? v.matchFontSize : 20;
  return sanitizeAppearance({
    matchBg: v.highlightBgColor,
    matchText: v.highlightTextColor,
    // v1's "outline" color was barely used on the page; it becomes the match underline.
    underline: { enabled: true, color: v.outlineColor },
    currentBg: v.selectedBgColor,
    currentText: v.selectedTextColor,
    currentBorder: v.selectedBorderColor,
    borderWidth: v.borderWidth,
    contextWords: v.numSurroundingWords,
    blink: { enabled: numBlinks > 0, count: numBlinks, intervalMs: v.blinkInterval },
    // v1 enlarged every match in the page. v2 never changes the page's layout and shows
    // the current match in a magnifier instead, so it gets a comfortably larger size.
    magnifier: { enabled: true, fontSize: Math.round(fontSize * 1.6) },
  });
}

/** Builds the v2 records for storage from a v1 storage snapshot. */
export function migrateV1(raw: Raw): Raw {
  const v1Profiles = Array.isArray(raw.profiles) ? raw.profiles.filter(isObj) : [];
  const users: Profile[] = v1Profiles
    .filter((p) => typeof p.id === 'string' && p.id && !isBuiltInId(p.id))
    .map((p) => ({
      id: p.id as string,
      name: sanitizeName(p.name, 'Profile'),
      appearance: appearanceFromV1(p.settings),
    }));
  if (users.length === 0) {
    const def = makeDefaultProfile();
    if (isObj(raw.settings)) def.appearance = appearanceFromV1(raw.settings);
    users.push(def);
  }
  const wanted = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : '';
  const activeProfileId =
    users.some((p) => p.id === wanted) || isBuiltInId(wanted) ? wanted : users[0]!.id;

  const out: Raw = {
    schemaVersion: SCHEMA_VERSION,
    prefs: DEFAULT_PREFS,
    activeProfileId,
    profileOrder: users.map((p) => p.id),
  };
  for (const p of users) out[profileKey(p.id)] = { id: p.id, name: p.name, appearance: p.appearance };
  return out;
}

/** Whether the snapshot still needs `migrateV1` before it can be written to. */
export function needsMigration(raw: Raw): boolean {
  return raw.schemaVersion !== SCHEMA_VERSION;
}

/** Turns a storage snapshot (any version, possibly empty or corrupted) into a valid state. */
export function stateFromRaw(input: Raw): SettingsState {
  const raw = needsMigration(input) ? migrateV1(input) : input;
  const order = Array.isArray(raw.profileOrder)
    ? raw.profileOrder.filter((id): id is string => typeof id === 'string')
    : [];
  const users: Profile[] = [];
  for (const id of new Set(order)) {
    const stored = raw[profileKey(id)];
    if (!isObj(stored) || isBuiltInId(id)) continue;
    users.push({
      id,
      name: sanitizeName(stored.name, 'Profile'),
      appearance: sanitizeAppearance(stored.appearance),
    });
  }
  if (users.length === 0) users.push(makeDefaultProfile());
  // Built-in profiles with the user's changes, if any. Anything missing comes from the original.
  const builtIns = BUILT_IN_PROFILES.map((p) => {
    const stored = raw[profileKey(p.id)];
    const profile = structuredClone(p);
    if (isObj(stored)) profile.appearance = sanitizeAppearance(stored.appearance, p.appearance);
    return profile;
  });

  const profiles = [...users, ...builtIns];
  const wanted = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : '';
  const active = profiles.find((p) => p.id === wanted) ?? users[0]!;
  const prefs = sanitizePrefs(raw.prefs);
  // The profile for dark pages may have been deleted.
  if (!profiles.some((p) => p.id === prefs.autoProfile.dark)) prefs.autoProfile.dark = DEFAULT_PREFS.autoProfile.dark;
  return { profiles, activeProfileId: active.id, active, prefs };
}

/**
 * The profile whose colors matches on a light or dark background use: on dark ones with
 * automatic style on, the one picked for them; otherwise the active profile.
 */
export function colorProfileForPage(state: SettingsState, tone: PageTone | null): Profile {
  const auto = state.prefs.autoProfile;
  if (!auto.enabled || tone !== 'dark') return state.active;
  return state.profiles.find((p) => p.id === auto.dark) ?? state.active;
}

/** `base` with the highlight colors of `source`. Effects, sizes and timings stay as in `base`. */
export function withColorsFrom(base: Appearance, source: Appearance): Appearance {
  return {
    ...base,
    matchBg: source.matchBg,
    matchText: source.matchText,
    underline: { ...base.underline, color: source.underline.color },
    currentBg: source.currentBg,
    currentText: source.currentText,
    currentBorder: source.currentBorder,
  };
}

/**
 * How matches look on a light or dark background. Automatic style only swaps the colors:
 * everything else (blinking, spotlight, magnifier, sizes...) always comes from the active profile.
 */
export function appearanceForPage(state: SettingsState, tone: PageTone | null): Appearance {
  const colors = colorProfileForPage(state, tone);
  return colors.id === state.active.id ? state.active.appearance : withColorsFrom(state.active.appearance, colors.appearance);
}
