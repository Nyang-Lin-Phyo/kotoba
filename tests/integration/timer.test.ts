import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import {
  getRunningSession,
  getSession,
  insertSession,
  sumActiveSecondsForDay,
} from '../../src/main/database/repositories/study';
import { createProfile } from '../../src/main/services/profile';
import { TimerService } from '../../src/main/services/timer';
import { AppError } from '../../src/shared/errors';

const DAY1 = Date.UTC(2026, 4, 17, 12);

describe('TimerService', () => {
  let dir: string;
  let manager: DatabaseManager;
  let wall: number;
  let monotonic: number;
  let timer: TimerService;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-timer-'));
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

    wall = DAY1;
    monotonic = 1_000;
    timer = new TimerService(db, {
      now: () => wall,
      monotonic: () => monotonic,
      schedule: () => null,
    });
  });

  afterEach(() => {
    timer.dispose();
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const advance = (ms: number) => {
    wall += ms;
    monotonic += ms;
  };

  // Real checkpoints fire every 10 seconds; advance in that cadence so a long
  // active period is not mistaken for a missed suspend.
  const tick = (times: number) => {
    for (let index = 0; index < times; index += 1) {
      advance(10_000);
      timer.checkpoint();
    }
  };

  it('starts, checkpoints, pauses, resumes and stops with reconciled seconds', () => {
    const started = timer.start('kana');
    expect(started).toMatchObject({ active: true, status: 'running', elapsedSeconds: 0 });

    tick(9);
    expect(timer.status().elapsedSeconds).toBe(90);

    const paused = timer.pause();
    expect(paused.status).toBe('paused');

    timer.resume();
    tick(3);
    expect(timer.status().elapsedSeconds).toBe(120);

    const stopped = timer.stop();
    expect(stopped.active).toBe(false);

    const session = getSession(db(), started.sessionId as string);
    expect(session?.status).toBe('stopped');
    expect(session?.activeSeconds).toBe(120);

    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    expect(sumActiveSecondsForDay(db(), profileId, '2026-05-17')).toBe(120);
  });

  it('caps a long checkpoint gap so suspend time is not counted', () => {
    const started = timer.start('kana');
    advance(10 * 60_000);
    timer.checkpoint();

    expect(timer.status().elapsedSeconds).toBe(60);
    timer.stop();

    const session = getSession(db(), started.sessionId as string);
    expect(session?.activeSeconds).toBe(60);
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    expect(sumActiveSecondsForDay(db(), profileId, '2026-05-17')).toBe(60);
  });

  it('refuses a second simultaneous session', () => {
    timer.start('kana');
    expect(() => timer.start('vocabulary')).toThrow(AppError);
  });

  it('reports an inactive timer when no profile exists yet', () => {
    db().prepare('delete from profiles').run();

    expect(timer.status()).toMatchObject({ active: false, interruptedSessions: [] });
    expect(() => timer.pause()).toThrow();
  });

  it('recovers a paused session left behind by a restart', () => {
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    const first = new TimerService(db, {
      now: () => wall,
      monotonic: () => monotonic,
      schedule: () => null,
    });
    first.start('kana');
    first.pause();
    first.dispose();

    const restarted = new TimerService(db, {
      now: () => wall,
      monotonic: () => monotonic,
      schedule: () => null,
    });
    restarted.recover();

    expect(getRunningSession(db(), profileId)).toBeNull();
    expect(() => restarted.start('kana')).not.toThrow();
    restarted.stop();
    restarted.dispose();
  });

  it('marks crashed sessions interrupted without adding time', () => {
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    insertSession(db(), {
      id: 'crashed',
      profileId,
      activityType: 'kana',
      startedAt: new Date(DAY1).toISOString(),
      status: 'running',
      source: 'timer',
      lastCheckpointAt: new Date(DAY1).toISOString(),
    });
    db().prepare('update study_sessions set active_seconds = 45 where id = ?').run('crashed');

    timer.recover();

    expect(getSession(db(), 'crashed')?.status).toBe('interrupted');
    expect(getSession(db(), 'crashed')?.activeSeconds).toBe(45);
    expect(timer.status().interruptedSessions).toContain('crashed');

    timer.acknowledgeInterrupted('crashed');
    expect(getSession(db(), 'crashed')?.status).toBe('stopped');
  });
});
