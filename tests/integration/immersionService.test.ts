import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { addExternalLog, correctExternalLog, listExternalLogs } from '../../src/main/services/immersion';
import { getDailyActivity } from '../../src/main/database/repositories/dailyActivity';

const DAY1 = Date.UTC(2026, 4, 17, 12);

describe('immersion service', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();
  let profileId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-immersion-svc-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      db(),
      {
        displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
        initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
        dailyMinutes: 120, dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      }, DAY1,
    );
    profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores a deliberate log on the profile study day', () => {
    const log = addExternalLog(db(), {
      durationSeconds: 1800, activityType: 'listening', title: 'Anime', notes: '', deliberate: true,
    }, '11111111-1111-4111-8111-111111111111', DAY1);
    expect(log.dayKey).toBe('2026-05-17');
    expect(listExternalLogs(db(), 0, 10)).toHaveLength(1);
  });

  it('only counts deliberate minutes in daily activity', () => {
    addExternalLog(db(), {
      durationSeconds: 1800, activityType: 'listening', title: 'Passive', notes: '', deliberate: false,
    }, '44444444-4444-4444-8444-444444444444', DAY1);
    addExternalLog(db(), {
      durationSeconds: 900, activityType: 'reading', title: 'Deliberate', notes: '', deliberate: true,
    }, '55555555-5555-4555-8555-555555555555', DAY1);

    const activity = getDailyActivity(db(), profileId, '2026-05-17', '2026-05-18');
    expect(activity.get('2026-05-17')?.minutes).toBe(15);
  });

  it('records a correction without losing the original', () => {
    const log = addExternalLog(db(), {
      durationSeconds: 1800, activityType: 'listening', title: 'Anime', notes: '', deliberate: true,
    }, '66666666-6666-4666-8666-666666666666', DAY1);
    const updated = correctExternalLog(db(), log.id, {
      durationSeconds: 2400, reason: 'timer was wrong',
    }, '22222222-2222-4222-8222-222222222222', DAY1 + 1000);
    expect(updated?.durationSeconds).toBe(2400);
    const corrections = db().prepare('select count(*) c from immersion_corrections').get() as { c: number };
    expect(corrections.c).toBe(1);
  });
});

describe('immersion idempotency', () => {
  it('returns the same log for a repeated event id', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-immersion-idem-'));
    const manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      manager.get(),
      {
        displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
        initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
        dailyMinutes: 120, dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      }, DAY1,
    );
    const input = {
      durationSeconds: 1800, activityType: 'listening' as const, title: 'Anime', notes: '', deliberate: true,
    };
    const eventId = '33333333-3333-4333-8333-333333333333';
    const first = addExternalLog(manager.get(), input, eventId, DAY1);
    const again = addExternalLog(manager.get(), input, eventId, DAY1);
    expect(again.id).toBe(first.id);
    expect(listExternalLogs(manager.get(), 0, 10)).toHaveLength(1);

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
