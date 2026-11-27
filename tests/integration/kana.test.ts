import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { getKanaProgress, listKanaProgress } from '../../src/main/database/repositories/kana';
import { insertSegment, insertSession } from '../../src/main/database/repositories/study';
import { createProfile } from '../../src/main/services/profile';
import { setGoalVersion } from '../../src/main/services/planner';
import { getDashboard } from '../../src/main/services/planner';
import { AppError } from '../../src/shared/errors';
import {
  getKanaSummary,
  getKanaReviewQueue,
  submitKanaAttempt,
} from '../../src/main/services/kana';
import type { KanaAttemptInput } from '../../src/shared/schemas';

const DAY1 = Date.UTC(2026, 4, 17, 12);
const DAY2 = Date.UTC(2026, 4, 18, 12);

function input(patch: Partial<KanaAttemptInput> = {}): KanaAttemptInput {
  return {
    kanaId: 'h-ka',
    mode: 'typed',
    raw: 'ka',
    hintUsed: false,
    responseMs: 800,
    eventId: randomUUID(),
    ...patch,
  };
}

function count(db: Db, table: string): number {
  return (db.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;
}

describe('kana service', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-kana-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      db(),
      {
        displayName: '',
        startDate: '2026-05-17',
        horizonMonths: 12,
        timezone: 'UTC',
        initialLevel: 'complete-beginner',
        targetJlpt: null,
        interests: ['general'],
        dailyMinutes: 120,
        dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      },
      DAY1,
    );
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records a typed unhinted correct as one attempt, event and progress row', () => {
    const answer = input();
    const result = submitKanaAttempt(db(), answer, answer.eventId, DAY1);

    expect(result).toMatchObject({ correct: true, verified: false, duplicate: false });
    expect(count(db(), 'kana_attempts')).toBe(1);
    expect(count(db(), 'study_events')).toBe(1);
    expect(getKanaProgress(db(), 'x', 'h-ka')).toBeNull();

    const progress = listKanaProgress(db(), (db().prepare('select id from profiles').get() as { id: string }).id);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ correctUnhinted: 1, correctDays: 1, lapses: 0 });
  });

  it('returns the stored result for a duplicate event id without double counting', () => {
    const answer = input();
    const first = submitKanaAttempt(db(), answer, answer.eventId, DAY1);
    const again = submitKanaAttempt(db(), answer, answer.eventId, DAY1);

    expect(again).toEqual({ ...first, duplicate: true });
    expect(count(db(), 'kana_attempts')).toBe(1);
    expect(count(db(), 'study_events')).toBe(1);
  });

  it('does not count hinted or choice answers toward unhinted mastery', () => {
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    submitKanaAttempt(db(), input({ raw: 'ka', hintUsed: true }), randomUUID(), DAY1);
    submitKanaAttempt(db(), input({ raw: 'ka', mode: 'choice' }), randomUUID(), DAY2);

    const progress = getKanaProgress(db(), profileId, 'h-ka');
    expect(progress?.correctUnhinted).toBe(0);
    expect(progress?.verified).toBe(false);
  });

  it('clears verification and schedules tomorrow after a failure', () => {
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    submitKanaAttempt(db(), input(), randomUUID(), DAY1);
    submitKanaAttempt(db(), input(), randomUUID(), DAY1);
    const verified = submitKanaAttempt(db(), input(), randomUUID(), DAY2);
    expect(verified.verified).toBe(true);

    const failed = submitKanaAttempt(db(), input({ raw: 'ki' }), randomUUID(), DAY2);
    expect(failed).toMatchObject({ correct: false, verified: false });

    const progress = getKanaProgress(db(), profileId, 'h-ka');
    expect(progress).toMatchObject({ lapses: 1, intervalTier: 0, dueDay: '2026-05-19' });
  });

  it('builds a summary and review queue from stored records', () => {
    submitKanaAttempt(db(), input(), randomUUID(), DAY1);
    submitKanaAttempt(db(), input({ kanaId: 'h-ki', raw: 'ki' }), randomUUID(), DAY1);

    const summary = getKanaSummary(db());
    expect(summary.attempts).toBe(2);
    expect(summary.learning).toBe(2);
    expect(summary.verified).toBe(0);
    expect(summary.total).toBeGreaterThanOrEqual(92);

    const queue = getKanaReviewQueue(db());
    expect(queue.map((item) => item.kanaId)).toContain('h-ka');
    expect(queue.map((item) => item.kanaId)).toContain('h-ki');
  });

  it('keeps another profile isolated', () => {
    submitKanaAttempt(db(), input(), randomUUID(), DAY1);

    db().exec(`
      insert into profiles (id, display_name, start_date, horizon_months, timezone, initial_level,
                            target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at)
      values ('p2', 'Other', '2026-05-17', 12, 'UTC', 'complete-beginner', null, '[]', '{}', 0,
              '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z');
    `);
    expect(listKanaProgress(db(), 'p2')).toHaveLength(0);
    expect(getKanaProgress(db(), 'p2', 'h-ka')).toBeNull();
  });
});

describe('goal changes after study activity', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-guard-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      db(),
      {
        displayName: '',
        startDate: '2026-05-17',
        horizonMonths: 12,
        timezone: 'UTC',
        initialLevel: 'complete-beginner',
        targetJlpt: null,
        interests: ['general'],
        dailyMinutes: 120,
        dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      },
      DAY1,
    );
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const goalChange = { effectiveDate: '2026-05-17', dailyMinutes: 90, dailyNewWords: 10 };

  it('refuses a same-day goal change after a kana attempt', () => {
    submitKanaAttempt(db(), input(), randomUUID(), DAY1);
    expect(() => setGoalVersion(db(), goalChange, DAY1)).toThrow(AppError);
    try {
      setGoalVersion(db(), goalChange, DAY1);
    } catch (cause) {
      expect((cause as AppError).code).toBe('CONFLICT');
    }
  });

  it('refuses a same-day goal change after a session segment', () => {
    insertSession(db(), {
      id: 's-guard',
      profileId: (db().prepare('select id from profiles').get() as { id: string }).id,
      activityType: 'kana',
      startedAt: new Date(DAY1).toISOString(),
      status: 'stopped',
      source: 'timer',
      lastCheckpointAt: new Date(DAY1).toISOString(),
    });
    insertSegment(db(), {
      id: 'seg-guard',
      sessionId: 's-guard',
      dayKey: '2026-05-17',
      startedAt: new Date(DAY1).toISOString(),
      endedAt: new Date(DAY1 + 60_000).toISOString(),
      activeSeconds: 60,
    });

    expect(() => setGoalVersion(db(), goalChange, DAY1)).toThrow(AppError);
  });

  it('still allows a same-day change when nothing was studied', () => {
    expect(setGoalVersion(db(), goalChange, DAY1)).toHaveLength(1);
  });
});

describe('dashboard actuals', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-actuals-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      db(),
      {
        displayName: '',
        startDate: '2026-05-17',
        horizonMonths: 12,
        timezone: 'UTC',
        initialLevel: 'complete-beginner',
        targetJlpt: null,
        interests: ['general'],
        dailyMinutes: 120,
        dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      },
      DAY1,
    );
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('breaks measured minutes down by activity type', () => {
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    for (const [sessionId, activity, seconds] of [
      ['s-kana', 'kana', 90],
      ['s-listening', 'listening', 60],
    ] as const) {
      insertSession(db(), {
        id: sessionId,
        profileId,
        activityType: activity,
        startedAt: new Date(DAY1).toISOString(),
        status: 'stopped',
        source: 'timer',
        lastCheckpointAt: new Date(DAY1).toISOString(),
      });
      insertSegment(db(), {
        id: `seg-${sessionId}`,
        sessionId,
        dayKey: '2026-05-17',
        startedAt: new Date(DAY1).toISOString(),
        endedAt: new Date(DAY1 + seconds * 1000).toISOString(),
        activeSeconds: seconds,
      });
    }

    const dashboard = getDashboard(db(), DAY1);
    expect(dashboard.actual.minutes).toBe(2);
    expect(dashboard.actual.minutesByActivity.kana).toBe(1);
    expect(dashboard.actual.minutesByActivity.listening).toBe(1);
    expect(dashboard.actual.minutesByActivity.vocabulary).toBeUndefined();
  });

  it('reports measured minutes from segments and leaves targets untouched', () => {
    const empty = getDashboard(db(), DAY1);
    expect(empty.actual.minutes).toBe(0);
    expect(empty.today.assignments).toHaveLength(6);
    expect(empty.today.targetMinutes).toBe(120);

    insertSession(db(), {
      id: 's-actual',
      profileId: (db().prepare('select id from profiles').get() as { id: string }).id,
      activityType: 'kana',
      startedAt: new Date(DAY1).toISOString(),
      status: 'stopped',
      source: 'timer',
      lastCheckpointAt: new Date(DAY1).toISOString(),
    });
    insertSegment(db(), {
      id: 'seg-actual',
      sessionId: 's-actual',
      dayKey: '2026-05-17',
      startedAt: new Date(DAY1).toISOString(),
      endedAt: new Date(DAY1 + 90_000).toISOString(),
      activeSeconds: 90,
    });

    const dashboard = getDashboard(db(), DAY1);
    expect(dashboard.actual.minutes).toBe(1);
    expect(dashboard.today.assignments).toHaveLength(6);
    expect(dashboard.today.assignments.reduce((sum, row) => sum + row.minutes, 0)).toBe(120);
    expect(dashboard.kana.total).toBeGreaterThanOrEqual(92);
  });
});
