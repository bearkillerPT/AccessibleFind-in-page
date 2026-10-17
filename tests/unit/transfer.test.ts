import { describe, expect, it } from 'vitest';
import { BUILT_IN_PROFILES, DEFAULT_APPEARANCE, MAX_PROFILES } from '../../src/lib/settings/defaults';
import { profileKey, stateFromRaw } from '../../src/lib/settings/schema';
import {
  backupFile,
  fileName,
  FILE_VERSION,
  profileFile,
  readBackup,
  readProfile,
} from '../../src/lib/settings/transfer';

const stored = {
  schemaVersion: 2,
  profileOrder: ['default', 'night1'],
  activeProfileId: 'night1',
  [profileKey('default')]: { id: 'default', name: 'Default', appearance: DEFAULT_APPEARANCE },
  [profileKey('night1')]: { id: 'night1', name: 'Night', appearance: { ...DEFAULT_APPEARANCE, matchBg: '#123456' } },
  // A built-in profile the user changed.
  [profileKey('sys-colorblind')]: { appearance: { ...BUILT_IN_PROFILES[2]!.appearance, borderWidth: 9 } },
  prefs: { uiScale: 2, shortcuts: { list: 'Ctrl+Alt+KeyL' }, autoProfile: { enabled: true, dark: 'night1' } },
};

describe('backups', () => {
  it('round-trips all profiles and settings', () => {
    const state = stateFromRaw(stored);
    const text = JSON.stringify(backupFile(state, new Date('2026-10-14T10:00:00Z')));
    const result = readBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileCount).toBe(2);
    const restored = stateFromRaw(result.value.records);
    expect(restored.activeProfileId).toBe('night1');
    expect(restored.profiles.filter((p) => !p.builtIn)).toEqual(state.profiles.filter((p) => !p.builtIn));
    expect(restored.prefs).toEqual(state.prefs);
    // Changed built-in profiles come back too; unchanged ones aren't in the file at all.
    expect(restored.profiles).toEqual(state.profiles);
    expect(restored.profiles.find((p) => p.id === 'sys-colorblind')!.appearance.borderWidth).toBe(9);
    expect(JSON.parse(text).builtIns.map((b: { id: string }) => b.id)).toEqual(['sys-colorblind']);
  });

  it('still reads backups from version 1, before built-in profiles could change', () => {
    const v1 = { ...backupFile(stateFromRaw(stored)), version: 1, builtIns: undefined };
    const result = readBackup(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = stateFromRaw(result.value.records);
    expect(restored.profiles.find((p) => p.id === 'sys-colorblind')).toEqual(
      BUILT_IN_PROFILES.find((p) => p.id === 'sys-colorblind'),
    );
    expect(restored.activeProfileId).toBe('night1');
  });

  it('explains files of the wrong kind', () => {
    const profile = JSON.stringify(profileFile(stateFromRaw(stored).active));
    expect(readBackup(profile)).toEqual({ ok: false, error: expect.stringMatching(/single profile/) });
    expect(readBackup('{"hello": 1}')).toEqual({ ok: false, error: expect.stringMatching(/isn’t an Accessible Find backup/) });
    expect(readBackup('not json')).toEqual({ ok: false, error: expect.stringMatching(/couldn’t be read/) });
    const newer = JSON.stringify({ format: 'accessible-find-backup', version: FILE_VERSION + 1 });
    expect(readBackup(newer)).toEqual({ ok: false, error: expect.stringMatching(/newer version/) });
  });

  it('cleans up whatever a file contains', () => {
    const text = JSON.stringify({
      format: 'accessible-find-backup',
      version: 1,
      activeProfileId: 'missing',
      profiles: [
        { id: '<script>', name: '  A  ', appearance: { matchBg: 'red', borderWidth: 500 } },
        { id: 'sys-hc-dark', name: 'Sneaky', appearance: {} },
        { id: 'ok', name: 'B', appearance: {} },
        { id: 'ok', name: 'Duplicate id', appearance: {} },
      ],
      prefs: { uiScale: 99 },
    });
    const result = readBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = stateFromRaw(result.value.records);
    const users = state.profiles.filter((p) => !p.builtIn);
    expect(users).toHaveLength(4);
    expect(new Set(users.map((p) => p.id)).size).toBe(4);
    expect(users.every((p) => /^[\w-]+$/.test(p.id) && !p.id.startsWith('sys-'))).toBe(true);
    expect(users[0]!.name).toBe('A');
    expect(users[0]!.appearance.matchBg).toBe(DEFAULT_APPEARANCE.matchBg);
    expect(users[0]!.appearance.borderWidth).toBe(12);
    expect(state.activeProfileId).toBe(users[0]!.id);
    expect(state.prefs.uiScale).toBe(3);
  });

  it('limits the number of profiles', () => {
    const profiles = Array.from({ length: MAX_PROFILES + 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, appearance: {} }));
    const result = readBackup(JSON.stringify({ format: 'accessible-find-backup', version: 1, profiles }));
    expect(result.ok && result.value.profileCount).toBe(MAX_PROFILES);
  });
});

describe('shared profiles', () => {
  it('round-trips a profile', () => {
    const profile = stateFromRaw(stored).active;
    const result = readProfile(JSON.stringify(profileFile(profile)));
    expect(result).toEqual({ ok: true, value: { name: 'Night', appearance: profile.appearance } });
  });

  it('explains files of the wrong kind', () => {
    const backup = JSON.stringify(backupFile(stateFromRaw(stored)));
    expect(readProfile(backup)).toEqual({ ok: false, error: expect.stringMatching(/full backup/) });
    expect(readProfile(JSON.stringify({ format: 'accessible-find-profile', version: 1 }))).toEqual({
      ok: false,
      error: expect.stringMatching(/damaged/),
    });
  });

  it('makes readable file names', () => {
    expect(fileName('profile', 'Ação à noite!')).toBe('accessible-find-profile-acao-a-noite.json');
    expect(fileName('backup', '2026-10-14')).toBe('accessible-find-backup-2026-10-14.json');
  });
});
