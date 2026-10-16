/**
 * Backup files (all settings and profiles) and shared profile files. Pure functions: they
 * build the JSON to save, and turn a file's text back into clean, validated data. Anything
 * read from a file goes through the same sanitizing as stored settings.
 */
import { MAX_PROFILES, makeDefaultProfile } from './defaults';
import { sanitizeAppearance, sanitizeName, sanitizePrefs } from './sanitize';
import { builtInProfile, isBuiltInId, isChangedBuiltIn, profileKey, SCHEMA_VERSION } from './schema';
import type { Appearance, Prefs, Profile, SettingsState } from './types';

export const BACKUP_FORMAT = 'accessible-find-backup';
export const PROFILE_FORMAT = 'accessible-find-profile';
/**
 * Bump when the file layout changes; older files must keep importing.
 * 2: backups also hold the built-in profiles the user changed (`builtIns`).
 */
export const FILE_VERSION = 2;
const MAX_FILE_CHARS = 1_000_000;
const SAFE_ID = /^[\w-]{1,64}$/;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  activeProfileId: string;
  profiles: { id: string; name: string; appearance: Appearance }[];
  /** Built-in profiles the user changed. */
  builtIns: { id: string; appearance: Appearance }[];
  prefs: Prefs;
}

export interface ProfileFile {
  format: typeof PROFILE_FORMAT;
  version: number;
  name: string;
  appearance: Appearance;
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function backupFile(state: SettingsState, now = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: FILE_VERSION,
    exportedAt: now.toISOString(),
    activeProfileId: state.activeProfileId,
    profiles: state.profiles.filter((p) => !p.builtIn).map(({ id, name, appearance }) => ({ id, name, appearance })),
    builtIns: state.profiles.filter(isChangedBuiltIn).map(({ id, appearance }) => ({ id, appearance })),
    prefs: state.prefs,
  };
}

export function profileFile(profile: Profile): ProfileFile {
  return { format: PROFILE_FORMAT, version: FILE_VERSION, name: profile.name, appearance: profile.appearance };
}

/** A file name like "accessible-find-profile-night-reading.json". */
export function fileName(kind: 'backup' | 'profile', label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `accessible-find-${kind}${slug ? `-${slug}` : ''}.json`;
}

type Obj = Record<string, unknown>;

function parseObject(text: string): ReadResult<Obj> {
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'This file is too big to be an Accessible Find file.' };
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return { ok: true, value: value as Obj };
  } catch {
    // Fall through.
  }
  return { ok: false, error: 'This file couldn’t be read. Choose a file exported from Accessible Find.' };
}

function checkVersion(file: Obj): string | null {
  const version = typeof file.version === 'number' ? file.version : NaN;
  if (!Number.isFinite(version)) return 'This file is damaged: it has no version.';
  if (version > FILE_VERSION) {
    return 'This file comes from a newer version of Accessible Find. Update the extension and try again.';
  }
  return null;
}

/**
 * Reads a backup into the records to put in sync storage (the same layout as schema.ts).
 * Profile ids are kept when safe, so automatic-style choices still point at the right ones.
 */
export function readBackup(text: string): ReadResult<{ records: Obj; profileCount: number }> {
  const parsed = parseObject(text);
  if (!parsed.ok) return parsed;
  const file = parsed.value;
  if (file.format === PROFILE_FORMAT) {
    return { ok: false, error: 'This file is a single profile. Use “Import a profile” below instead.' };
  }
  if (file.format !== BACKUP_FORMAT) return { ok: false, error: 'This isn’t an Accessible Find backup.' };
  const versionProblem = checkVersion(file);
  if (versionProblem) return { ok: false, error: versionProblem };

  const records: Obj = { schemaVersion: SCHEMA_VERSION };
  const ids: string[] = [];
  const list = Array.isArray(file.profiles) ? file.profiles : [];
  for (const item of list.slice(0, MAX_PROFILES)) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Obj;
    let id = typeof p.id === 'string' && SAFE_ID.test(p.id) && !isBuiltInId(p.id) ? p.id : '';
    if (!id || ids.includes(id)) id = crypto.randomUUID().slice(0, 8);
    ids.push(id);
    records[profileKey(id)] = { id, name: sanitizeName(p.name, 'Profile'), appearance: sanitizeAppearance(p.appearance) };
  }
  for (const item of Array.isArray(file.builtIns) ? file.builtIns : []) {
    const p = typeof item === 'object' && item !== null ? (item as Obj) : {};
    const original = typeof p.id === 'string' ? builtInProfile(p.id) : undefined;
    if (!original) continue;
    const { id, name } = original;
    records[profileKey(id)] = { id, name, appearance: sanitizeAppearance(p.appearance, original.appearance) };
  }
  if (ids.length === 0) {
    const def = makeDefaultProfile();
    ids.push(def.id);
    records[profileKey(def.id)] = { id: def.id, name: def.name, appearance: def.appearance };
  }
  const active = typeof file.activeProfileId === 'string' ? file.activeProfileId : '';
  records.activeProfileId = ids.includes(active) || isBuiltInId(active) ? active : ids[0];
  records.profileOrder = ids;
  records.prefs = sanitizePrefs(file.prefs);
  return { ok: true, value: { records, profileCount: ids.length } };
}

export function readProfile(text: string): ReadResult<{ name: string; appearance: Appearance }> {
  const parsed = parseObject(text);
  if (!parsed.ok) return parsed;
  const file = parsed.value;
  if (file.format === BACKUP_FORMAT) {
    return { ok: false, error: 'This file is a full backup. Use “Restore a backup” above instead.' };
  }
  if (file.format !== PROFILE_FORMAT) return { ok: false, error: 'This isn’t an Accessible Find profile.' };
  const versionProblem = checkVersion(file);
  if (versionProblem) return { ok: false, error: versionProblem };
  if (typeof file.appearance !== 'object' || file.appearance === null) {
    return { ok: false, error: 'This profile is damaged: it has no colors or effects.' };
  }
  return {
    ok: true,
    value: { name: sanitizeName(file.name, 'Imported profile'), appearance: sanitizeAppearance(file.appearance) },
  };
}
