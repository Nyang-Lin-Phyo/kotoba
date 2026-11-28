import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { getDashboard } from '../../src/main/services/planner';
import { getCalendarDay, getFullHistoryDays, getStats } from '../../src/main/services/stats';

const DAY1 = Date.UTC(2026, 4, 17, 12);

describe('stats service', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-stats-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(
      db(),
      {
        displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
        initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
        dailyMinutes: 120, dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      },
      DAY1,
    );
    getDashboard(db(), DAY1);
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns a calendar day with targets and zero actuals', () => {
    const result = getCalendarDay(db(), '2026-05-17');
    expect(result.day).toMatchObject({
      dayKey: '2026-05-17', eligible: true, targetMinutes: 120, targetWords: 15,
      minutes: 0, newWords: 0, reviews: 0,
    });
    expect(result.curriculumDay).toBe(1);
  });

  it('marks days outside the horizon as ineligible', () => {
    expect(getCalendarDay(db(), '2026-05-16').day.eligible).toBe(false);
    expect(getCalendarDay(db(), '2027-05-17').day.eligible).toBe(false);
  });

  it('returns bounded stats with a versioned definition', () => {
    const stats = getStats(db(), DAY1);
    expect(stats.version).toBe('stats-v1');
    expect(stats.week.weekStart).toBe('2026-05-11');
    expect(stats.month.monthKey).toBe('2026-05');
    expect(stats.streak).toBe(0);
    expect(stats.horizon.totalDays).toBe(365);
  });
});

describe('stats with a long history', () => {
  it('bounds the series to 12 months and reports a completed horizon', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-stats-long-'));
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

    const stats = getStats(manager.get(), Date.UTC(2027, 11, 27));
    expect(stats.version).toBe('stats-v1');
    expect(stats.month.days.length).toBeLessThanOrEqual(31);
    expect(stats.horizon.completed).toBe(true);
    expect(stats.streak).toBe(0);

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('stats include today', () => {
  it('counts today in week, month and target-to-date', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-stats-today-'));
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
    getDashboard(manager.get(), DAY1);

    const stats = getStats(manager.get(), DAY1);
    expect(stats.week.days.map((day) => day.dayKey)).toContain('2026-05-17');
    expect(stats.month.days.map((day) => day.dayKey)).toContain('2026-05-17');
    expect(stats.toDate.targetMinutes).toBe(120);
    expect(stats.toDate.targetWords).toBe(15);

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('full history for export', () => {
  it('returns every eligible day in the horizon', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-history-'));
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
    const days = getFullHistoryDays(manager.get(), DAY1);
    expect(days.map((day) => day.dayKey)).toContain('2026-05-17');
    expect(days.length).toBe(1);

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('stats exclude future days', () => {
  it('does not count activity on the day after today', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-future-'));
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
    const pid = (manager.get().prepare('select id from profiles').get() as { id: string }).id;
    manager.get().exec(`
      insert into study_sessions (id, profile_id, activity_type, started_at, status, source, last_checkpoint_at, active_seconds)
        values ('s1','${pid}','kana','t','stopped','timer','t',0);
      insert into session_segments (id, session_id, day_key, started_at, ended_at, active_seconds)
        values ('seg1','s1','2026-05-18','t','t',3600);
    `);
    expect(getStats(manager.get(), DAY1).toDate.actualMinutes).toBe(0);
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
