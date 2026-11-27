import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { migrate, readSchemaVersion } from '../../src/main/database/migrate';
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';
import {
  createBackup,
  listBackups,
  maybeDailyBackup,
  restoreBackup,
  validateBackupFile,
} from '../../src/main/services/backup';
import { createProfile, getProfileState, updateProfile } from '../../src/main/services/profile';
import { getDashboard, setGoalVersion } from '../../src/main/services/planner';
import { AppError } from '../../src/shared/errors';
import type { ProfileInput } from '../../src/shared/schemas';

/** 2026-05-17T12:00:00Z — midday UTC, so the study day is unambiguous. */
const NOW = Date.UTC(2026, 4, 17, 12, 0, 0);
const TODAY = '2026-05-17';

function profileInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    displayName: 'Original',
    startDate: TODAY,
    horizonMonths: 12,
    timezone: 'UTC',
    initialLevel: 'complete-beginner',
    targetJlpt: null,
    interests: ['general'],
    dailyMinutes: 120,
    dailyNewWords: 15,
    preferences: { romaji: true, furigana: true, audio: 'off' },
    ...overrides,
  };
}

function appErrorFrom(run: () => unknown): AppError {
  try {
    run();
  } catch (cause) {
    if (cause instanceof AppError) return cause;
    throw cause;
  }
  throw new Error('Expected an AppError, but nothing was thrown');
}

function count(db: Db, table: string): number {
  const row = db.prepare(`select count(*) as total from ${table}`).get() as
    | { total: number }
    | undefined;
  return row?.total ?? 0;
}

describe('profile database', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-it-'));
    manager = new DatabaseManager(dir);
    manager.open(NOW);
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('migrations', () => {
    it('applies the schema once and is idempotent', () => {
      expect(readSchemaVersion(db())).toBe(LATEST_SCHEMA_VERSION);

      const second = migrate(db(), { nowMs: NOW });
      expect(second.applied).toEqual([]);
      expect(second.from).toBe(LATEST_SCHEMA_VERSION);
      expect(second.to).toBe(LATEST_SCHEMA_VERSION);
    });

    it('enables foreign keys on the connection', () => {
      const row = db().prepare('pragma foreign_keys').get() as { foreign_keys: number };
      expect(row.foreign_keys).toBe(1);
    });

    it('uses WAL for the on-disk database', () => {
      const row = db().prepare('pragma journal_mode').get() as { journal_mode: string };
      expect(row.journal_mode).toBe('wal');
    });
  });

  describe('profile creation', () => {
    it('writes the profile and its first goal version together', () => {
      const state = createProfile(db(), profileInput(), NOW);

      expect(state.profile.displayName).toBe('Original');
      expect(state.profile.startDate).toBe(TODAY);
      expect(state.profile.timezone).toBe('UTC');
      expect(state.goals).toHaveLength(1);
      expect(state.goals[0]).toMatchObject({
        effectiveDate: TODAY,
        dailyMinutes: 120,
        dailyNewWords: 15,
      });

      expect(getProfileState(db())?.profile.id).toBe(state.profile.id);
      expect(count(db(), 'profiles')).toBe(1);
      expect(count(db(), 'goal_versions')).toBe(1);
    });

    it('refuses a second profile instead of silently switching', () => {
      createProfile(db(), profileInput(), NOW);
      const error = appErrorFrom(() => createProfile(db(), profileInput(), NOW));

      expect(error.code).toBe('CONFLICT');
      expect(count(db(), 'profiles')).toBe(1);
    });

    it('rolls back completely if the goal insert fails', () => {
      // A horizon the CHECK constraint rejects, injected past the Zod schema.
      const broken = { ...profileInput(), horizonMonths: 500 };
      expect(() => createProfile(db(), broken, NOW)).toThrow();

      expect(count(db(), 'profiles')).toBe(0);
      expect(count(db(), 'goal_versions')).toBe(0);
    });

    it('persists across a close and reopen', () => {
      const created = createProfile(db(), profileInput(), NOW);
      manager.close();
      manager.open(NOW + 1000);

      expect(getProfileState(db())?.profile.id).toBe(created.profile.id);
      expect(readSchemaVersion(db())).toBe(LATEST_SCHEMA_VERSION);
    });

    it('stores an updated profile without touching goal history', () => {
      const created = createProfile(db(), profileInput(), NOW);
      const updated = updateProfile(db(), { displayName: 'Renamed' }, NOW + 1000);

      expect(updated.profile.id).toBe(created.profile.id);
      expect(updated.profile.displayName).toBe('Renamed');
      expect(updated.goals).toEqual(created.goals);
    });
  });

  describe('daily plans', () => {
    it('creates one frozen plan per day and reuses it', () => {
      createProfile(db(), profileInput(), NOW);

      const first = getDashboard(db(), NOW);
      const second = getDashboard(db(), NOW);

      expect(first.today.eligible).toBe(true);
      expect(first.today.dayKey).toBe(TODAY);
      expect(first.today.curriculumDay).toBe(1);
      expect(first.today.curriculumWeek).toBe(1);
      expect(first.today.curriculumMonth).toBe(1);
      expect(first.today.phase).toBe('foundation');
      expect(first.today.targetMinutes).toBe(120);
      expect(first.today.targetWords).toBe(15);

      expect(second.today.goalVersionId).toBe(first.today.goalVersionId);
      expect(count(db(), 'daily_plans')).toBe(1);

      const row = db().prepare('select id, target_minutes from daily_plans').get() as {
        id: string;
        target_minutes: number;
      };
      expect(row.target_minutes).toBe(120);
      expect(row.id.length).toBeGreaterThan(0);
    });

    it('splits the day into assignments that sum to the target', () => {
      createProfile(db(), profileInput(), NOW);
      const { today } = getDashboard(db(), NOW);

      const minutes = today.assignments.reduce((sum, row) => sum + row.minutes, 0);
      const vocabulary = today.assignments.find((row) => row.activityType === 'vocabulary');

      expect(today.assignments).toHaveLength(6);
      expect(minutes).toBe(120);
      expect(vocabulary?.words).toBe(15);
    });

    it('survives a restart without duplicating the plan', () => {
      createProfile(db(), profileInput(), NOW);
      const before = getDashboard(db(), NOW);
      const planId = (
        db().prepare('select id from daily_plans where day_key = ?').get(TODAY) as { id: string }
      ).id;

      manager.close();
      manager.open(NOW + 60_000);
      const after = getDashboard(db(), NOW + 60_000);

      expect(after.today.goalVersionId).toBe(before.today.goalVersionId);
      expect(after.today.targetMinutes).toBe(120);
      expect(count(db(), 'daily_plans')).toBe(1);
      expect(
        (db().prepare('select id from daily_plans where day_key = ?').get(TODAY) as { id: string }).id,
      ).toBe(planId);
    });

    it('never schedules a day before the start date', () => {
      createProfile(db(), profileInput({ startDate: '2026-06-01' }), NOW);
      const dashboard = getDashboard(db(), NOW);

      expect(dashboard.today.eligible).toBe(false);
      expect(dashboard.today.status).toBe('before-start');
      expect(dashboard.today.targetMinutes).toBe(0);
      expect(dashboard.today.assignments).toEqual([]);
      expect(dashboard.horizon.beforeStart).toBe(true);
      expect(dashboard.horizon.dayIndex).toBeNull();
      expect(count(db(), 'daily_plans')).toBe(0);
    });

    it('never schedules a day on or after the exclusive end date', () => {
      createProfile(db(), profileInput({ startDate: '2026-05-17', horizonMonths: 1 }), NOW);
      const dashboard = getDashboard(db(), Date.UTC(2026, 5, 17, 12));

      expect(dashboard.today.eligible).toBe(false);
      expect(dashboard.today.status).toBe('after-horizon');
      expect(dashboard.horizon.completed).toBe(true);
      expect(count(db(), 'daily_plans')).toBe(0);
    });

    it('counts this calendar month from the start date only', () => {
      createProfile(db(), profileInput(), NOW);
      const { month } = getDashboard(db(), NOW);

      expect(month.monthKey).toBe('2026-05');
      expect(month.targetDays).toBe(15);
      expect(month.targetMinutes).toBe(1_800);
      expect(month.targetWords).toBe(225);
      expect(month.elapsedDays).toBe(1);
    });
  });

  describe('goal versions', () => {
    it('rejects a goal change dated in the past', () => {
      // The profile must already have started, or the earlier "before the start
      // date" check fires first and this would test the wrong branch.
      createProfile(db(), profileInput({ startDate: '2026-05-01' }), NOW);
      const error = appErrorFrom(() =>
        setGoalVersion(db(), { effectiveDate: '2026-05-16', dailyMinutes: 90, dailyNewWords: 10 }, NOW),
      );

      expect(error.code).toBe('CONFLICT');
      expect(count(db(), 'goal_versions')).toBe(1);
    });

    it('rejects a goal change before the study start date', () => {
      createProfile(db(), profileInput({ startDate: '2026-06-01' }), NOW);
      const error = appErrorFrom(() =>
        setGoalVersion(db(), { effectiveDate: '2026-05-20', dailyMinutes: 90, dailyNewWords: 10 }, NOW),
      );

      expect(error.code).toBe('VALIDATION');
    });

    it('rebuilds today when a goal change takes effect today', () => {
      createProfile(db(), profileInput(), NOW);
      const before = getDashboard(db(), NOW);
      const planIdBefore = (
        db().prepare('select id from daily_plans where day_key = ?').get(TODAY) as { id: string }
      ).id;

      const goals = setGoalVersion(
        db(),
        { effectiveDate: TODAY, dailyMinutes: 90, dailyNewWords: 10 },
        NOW,
      );
      const after = getDashboard(db(), NOW);
      const planIdAfter = (
        db().prepare('select id from daily_plans where day_key = ?').get(TODAY) as { id: string }
      ).id;

      // A same-day edit updates that day's version in place rather than adding a
      // duplicate row, so the goal version id is unchanged but the plan is rebuilt.
      expect(goals).toHaveLength(1);
      expect(goals[0]?.id).toBe(before.today.goalVersionId);
      expect(planIdAfter).not.toBe(planIdBefore);
      expect(after.today.targetMinutes).toBe(90);
      expect(after.today.targetWords).toBe(10);
      expect(after.today.assignments.reduce((sum, row) => sum + row.minutes, 0)).toBe(90);
      expect(count(db(), 'daily_plans')).toBe(1);
    });

    it('leaves today alone when a goal change starts tomorrow', () => {
      createProfile(db(), profileInput(), NOW);
      getDashboard(db(), NOW);

      const goals = setGoalVersion(
        db(),
        { effectiveDate: '2026-05-18', dailyMinutes: 60, dailyNewWords: 5 },
        NOW,
      );
      const today = getDashboard(db(), NOW);

      expect(goals).toHaveLength(2);
      expect(today.today.targetMinutes).toBe(120);
      expect(today.today.targetWords).toBe(15);
      expect(count(db(), 'daily_plans')).toBe(1);
    });

    it('applies the new version from its effective date onward', () => {
      createProfile(db(), profileInput(), NOW);
      const today = getDashboard(db(), NOW);
      setGoalVersion(db(), { effectiveDate: '2026-05-18', dailyMinutes: 60, dailyNewWords: 5 }, NOW);

      const tomorrow = getDashboard(db(), Date.UTC(2026, 4, 18, 12));

      // Today keeps the target it was frozen with; tomorrow uses the new version.
      expect(today.today.targetMinutes).toBe(120);
      expect(tomorrow.today.targetMinutes).toBe(60);
      expect(tomorrow.today.targetWords).toBe(5);
      expect(count(db(), 'daily_plans')).toBe(2);
    });
  });

  describe('constraints', () => {
    it('enforces foreign keys on child rows', () => {
      expect(() =>
        db()
          .prepare(
            `insert into goal_versions (id, profile_id, effective_date, daily_minutes, daily_new_words, created_at)
             values (?, ?, ?, ?, ?, ?)`,
          )
          .run('goal-x', 'missing-profile', TODAY, 120, 15, new Date(NOW).toISOString()),
      ).toThrow();
    });

    it('cascades deletes from a profile to its plans and goals', () => {
      const state = createProfile(db(), profileInput(), NOW);
      getDashboard(db(), NOW);

      expect(count(db(), 'daily_assignments')).toBeGreaterThan(0);

      db().prepare('delete from profiles where id = ?').run(state.profile.id);

      expect(count(db(), 'goal_versions')).toBe(0);
      expect(count(db(), 'daily_plans')).toBe(0);
      expect(count(db(), 'daily_assignments')).toBe(0);
    });

    it('rejects a malformed calendar date at the SQL layer too', () => {
      const state = createProfile(db(), profileInput(), NOW);
      expect(() =>
        db()
          .prepare(
            `insert into goal_versions (id, profile_id, effective_date, daily_minutes, daily_new_words, created_at)
             values (?, ?, ?, ?, ?, ?)`,
          )
          .run('goal-bad', state.profile.id, '2026-6-1', 120, 15, new Date(NOW).toISOString()),
      ).toThrow();
    });
  });

  describe('backups', () => {
    it('creates a verifiable snapshot and restores it', () => {
      createProfile(db(), profileInput(), NOW);
      const backup = createBackup(db(), manager.backupsDir, NOW, 'manual');

      expect(backup.fileName).toMatch(/^kotoba-\d{8}-\d{6}-manual\.db$/);
      expect(backup.sizeBytes).toBeGreaterThan(0);
      expect(validateBackupFile(path.join(manager.backupsDir, backup.fileName))).toBe(
        LATEST_SCHEMA_VERSION,
      );

      updateProfile(db(), { displayName: 'Changed' }, NOW + 1000);
      expect(getProfileState(db())?.profile.displayName).toBe('Changed');

      const result = restoreBackup(manager, backup.fileName, NOW + 2000);

      expect(result.restored).toBe(backup.fileName);
      expect(result.safetyBackup).not.toBeNull();
      expect(getProfileState(db())?.profile.displayName).toBe('Original');

      const names = listBackups(manager.backupsDir).map((info) => info.fileName);
      expect(names).toContain(backup.fileName);
      expect(names).toContain(result.safetyBackup as string);
    });

    it('keeps working after a restore (writes still commit)', () => {
      createProfile(db(), profileInput(), NOW);
      const backup = createBackup(db(), manager.backupsDir, NOW, 'manual');
      restoreBackup(manager, backup.fileName, NOW + 1000);

      const state = updateProfile(db(), { displayName: 'After restore' }, NOW + 2000);
      expect(state.profile.displayName).toBe('After restore');

      manager.close();
      manager.open(NOW + 3000);
      expect(getProfileState(db())?.profile.displayName).toBe('After restore');
    });

    it('rejects a file that is not a Kotoba database', () => {
      const corrupt = path.join(manager.backupsDir, 'kotoba-20260101-000000-manual.db');
      writeFileSync(corrupt, 'this is not a sqlite database');

      const error = appErrorFrom(() => validateBackupFile(corrupt));
      expect(error.code).toBe('DATA_MISSING');

      expect(existsSync(corrupt)).toBe(true);
    });

    it('rejects a backup name that escapes the backups directory', () => {
      createProfile(db(), profileInput(), NOW);

      const traversal = appErrorFrom(() => restoreBackup(manager, '../profile.db', NOW));
      expect(traversal.code).toBe('VALIDATION');

      const absolute = appErrorFrom(() => restoreBackup(manager, '/etc/passwd', NOW));
      expect(absolute.code).toBe('VALIDATION');
    });

    it('takes at most one automatic daily backup per day', () => {
      createProfile(db(), profileInput(), NOW);

      const first = maybeDailyBackup(db(), manager.backupsDir, NOW, TODAY);
      expect(first).not.toBeNull();
      expect(listBackups(manager.backupsDir)).toHaveLength(1);

      const second = maybeDailyBackup(db(), manager.backupsDir, NOW + 60_000, TODAY);
      expect(second).toBeNull();
      expect(listBackups(manager.backupsDir)).toHaveLength(1);

      const nextDay = maybeDailyBackup(db(), manager.backupsDir, NOW + 86_400_000, '2026-05-18');
      expect(nextDay).not.toBeNull();
      expect(listBackups(manager.backupsDir)).toHaveLength(2);
    });

    it('does not prune files it did not create', () => {
      createProfile(db(), profileInput(), NOW);
      const foreign = path.join(manager.backupsDir, 'my-own-export.db');
      writeFileSync(foreign, 'not ours');

      createBackup(db(), manager.backupsDir, NOW, 'manual');

      expect(existsSync(foreign)).toBe(true);
    });
  });
});
