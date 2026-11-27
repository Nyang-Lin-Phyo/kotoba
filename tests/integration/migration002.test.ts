import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { openDatabase } from '../../src/main/database/connection';
import { migrate, readSchemaVersion } from '../../src/main/database/migrate';
import { migration001 } from '../../src/main/database/migrations/001_initial';
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';
import { AppError } from '../../src/shared/errors';
import {
  getKanaProgress,
  insertKanaAttempt,
  listKanaProgress,
  upsertKanaProgress,
} from '../../src/main/database/repositories/kana';
import { findEvent, insertEvent } from '../../src/main/database/repositories/events';
import {
  getRunningSession,
  getSession,
  insertSegment,
  insertSession,
  listInterruptedSessions,
  markInterrupted,
  sumActiveSecondsForDay,
  updateSession,
} from '../../src/main/database/repositories/study';

const NOW = Date.UTC(2026, 4, 17, 12);

function seedV1(db: Db): void {
  db.exec(migration001.sql);
  db.exec('create table schema_migrations (version integer primary key, applied_at text not null)');
  db.prepare('insert into schema_migrations (version, applied_at) values (1, ?)').run(
    new Date(NOW).toISOString(),
  );
  db.exec(`
    insert into profiles (id, display_name, start_date, horizon_months, timezone, initial_level,
                          target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at)
    values ('p1', 'Seed', '2026-05-17', 12, 'UTC', 'complete-beginner', null, '[]', '{}', 1,
            '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z');
    insert into goal_versions (id, profile_id, effective_date, daily_minutes, daily_new_words, created_at)
    values ('g1', 'p1', '2026-05-17', 120, 15, '2026-05-17T00:00:00.000Z');
    insert into daily_plans (id, profile_id, day_key, goal_version_id, curriculum_day, curriculum_week,
                             curriculum_month, phase, target_minutes, target_words, plan_version, created_at)
    values ('pl1', 'p1', '2026-05-17', 'g1', 1, 1, 1, 'foundation', 120, 15, 1, '2026-05-17T00:00:00.000Z');
    insert into daily_assignments (id, plan_id, activity_type, minutes, words, sequence)
    values ('a1', 'pl1', 'kana', 30, null, 0);
  `);
}

function snapshot(db: Db): Record<string, unknown> {
  return {
    profiles: db.prepare('select * from profiles').all(),
    goals: db.prepare('select * from goal_versions').all(),
    plans: db.prepare('select * from daily_plans').all(),
    assignments: db.prepare('select * from daily_assignments').all(),
  };
}

describe('migration 002', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m2-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    seedV1(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades a seeded v1 database without changing existing rows', () => {
    const before = snapshot(db);
    let backups = 0;
    const outcome = migrate(db, {
      nowMs: NOW,
      backupBeforeUpgrade: () => {
        backups += 1;
      },
    });

    expect(LATEST_SCHEMA_VERSION).toBe(2);
    expect(readSchemaVersion(db)).toBe(2);
    expect(outcome.from).toBe(1);
    expect(outcome.applied).toEqual([2]);
    expect(backups).toBe(1);
    expect(snapshot(db)).toEqual(before);
  });

  it('creates all five new tables with foreign keys on', () => {
    migrate(db, { nowMs: NOW });

    for (const table of [
      'kana_progress',
      'kana_attempts',
      'study_events',
      'study_sessions',
      'session_segments',
    ]) {
      const row = db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table);
      expect(row, table).toBeDefined();
    }

    const foreignKeys = db.prepare('pragma foreign_keys').get() as { foreign_keys: number };
    expect(foreignKeys.foreign_keys).toBe(1);
  });

  it('is idempotent when run again', () => {
    migrate(db, { nowMs: NOW });
    const second = migrate(db, { nowMs: NOW + 1000 });

    expect(second.applied).toEqual([]);
    expect(second.from).toBe(2);
    expect(second.to).toBe(2);
  });

  it('refuses a database from a newer build', () => {
    db.prepare('insert into schema_migrations (version, applied_at) values (999, ?)').run(
      new Date(NOW).toISOString(),
    );

    let captured: AppError | null = null;
    try {
      migrate(db, { nowMs: NOW });
    } catch (cause) {
      captured = cause instanceof AppError ? cause : null;
    }
    expect(captured?.code).toBe('DATA_MISSING');
  });
});

describe('v2 repositories', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-v2repo-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    seedV1(db);
    migrate(db, { nowMs: NOW });
    db.exec(`
      insert into profiles (id, display_name, start_date, horizon_months, timezone, initial_level,
                            target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at)
      values ('p2', 'Other', '2026-05-17', 12, 'UTC', 'complete-beginner', null, '[]', '{}', 0,
              '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z');
    `);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upserts progress idempotently', () => {
    const row = {
      profileId: 'p1',
      kanaId: 'h-ka',
      correctUnhinted: 1,
      correctDays: 1,
      firstCorrectDay: '2026-05-17',
      lastCorrectDay: '2026-05-17',
      lastAttemptDay: '2026-05-17',
      lastAttemptCorrect: true,
      lapses: 0,
      dueDay: '2026-05-24',
      verified: false,
      intervalTier: 0,
      schedulerVersion: 'interval-v1',
      updatedAt: new Date(NOW).toISOString(),
    };
    upsertKanaProgress(db, row);
    upsertKanaProgress(db, { ...row, correctUnhinted: 2 });

    const stored = getKanaProgress(db, 'p1', 'h-ka');
    expect(stored?.correctUnhinted).toBe(2);
    expect((db.prepare('select count(*) c from kana_progress').get() as { c: number }).c).toBe(1);
  });

  it('keeps attempts and events append-only with unique ids', () => {
    insertKanaAttempt(db, {
      id: 'att1',
      profileId: 'p1',
      kanaId: 'h-ka',
      dayKey: '2026-05-17',
      mode: 'typed',
      raw: 'ka',
      correct: true,
      hintUsed: false,
      responseMs: 800,
      attemptedAt: new Date(NOW).toISOString(),
      eventId: 'evt1',
    });
    insertEvent(db, {
      eventId: 'evt1',
      profileId: 'p1',
      dayKey: '2026-05-17',
      type: 'kana.attempt',
      payloadJson: '{}',
      occurredAt: new Date(NOW).toISOString(),
    });

    expect(findEvent(db, 'evt1')).not.toBeNull();
    expect(() =>
      insertEvent(db, {
        eventId: 'evt1',
        profileId: 'p1',
        dayKey: '2026-05-17',
        type: 'kana.attempt',
        payloadJson: '{}',
        occurredAt: new Date(NOW).toISOString(),
      }),
    ).toThrow();
  });

  it('reconciles session seconds with its day-key segments', () => {
    insertSession(db, {
      id: 's1',
      profileId: 'p1',
      activityType: 'kana',
      startedAt: new Date(NOW).toISOString(),
      status: 'running',
      source: 'timer',
      lastCheckpointAt: new Date(NOW).toISOString(),
    });
    insertSegment(db, {
      id: 'seg1',
      sessionId: 's1',
      dayKey: '2026-05-17',
      startedAt: new Date(NOW).toISOString(),
      endedAt: new Date(NOW + 60_000).toISOString(),
      activeSeconds: 60,
    });
    insertSegment(db, {
      id: 'seg2',
      sessionId: 's1',
      dayKey: '2026-05-18',
      startedAt: new Date(NOW + 60_000).toISOString(),
      endedAt: new Date(NOW + 90_000).toISOString(),
      activeSeconds: 30,
    });

    expect(sumActiveSecondsForDay(db, 'p1', '2026-05-17')).toBe(60);
    expect(sumActiveSecondsForDay(db, 'p1', '2026-05-18')).toBe(30);
    expect(sumActiveSecondsForDay(db, 'p2', '2026-05-17')).toBe(0);

    updateSession(db, 's1', { activeSeconds: 90, status: 'stopped', endedAt: new Date(NOW + 90_000).toISOString() });
    expect(getSession(db, 's1')?.activeSeconds).toBe(90);
    expect(getRunningSession(db, 'p1')).toBeNull();
  });

  it('isolates profiles and cascades deletes', () => {
    insertKanaAttempt(db, {
      id: 'att2',
      profileId: 'p2',
      kanaId: 'h-ka',
      dayKey: '2026-05-17',
      mode: 'typed',
      raw: 'ka',
      correct: true,
      hintUsed: false,
      responseMs: 500,
      attemptedAt: new Date(NOW).toISOString(),
      eventId: 'evt2',
    });
    expect(listKanaProgress(db, 'p2')).toHaveLength(0);
    expect(
      (db.prepare('select count(*) c from kana_attempts where profile_id = ?').get('p2') as { c: number }).c,
    ).toBe(1);

    db.prepare('delete from profiles where id = ?').run('p2');
    expect(
      (db.prepare('select count(*) c from kana_attempts where profile_id = ?').get('p2') as { c: number }).c,
    ).toBe(0);
  });

  it('marks running sessions interrupted and lists them', () => {
    insertSession(db, {
      id: 's2',
      profileId: 'p1',
      activityType: 'kana',
      startedAt: new Date(NOW).toISOString(),
      status: 'running',
      source: 'timer',
      lastCheckpointAt: new Date(NOW).toISOString(),
    });
    expect(getRunningSession(db, 'p1')?.id).toBe('s2');

    markInterrupted(db, 's2');
    expect(getRunningSession(db, 'p1')).toBeNull();
    expect(listInterruptedSessions(db, 'p1').map((session) => session.id)).toContain('s2');
  });
});
