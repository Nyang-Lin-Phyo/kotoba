import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { getDailyActivity } from '../../src/main/database/repositories/dailyActivity';

const DAY1 = Date.UTC(2026, 4, 17, 12);

describe('daily activity repository', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();
  let profileId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-activity-'));
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
    profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('aggregates minutes, words, reviews and kana attempts by day', () => {
    db().exec(`
      insert into study_sessions (id, profile_id, activity_type, started_at, status, source, last_checkpoint_at, active_seconds)
        values ('s1','${profileId}','kana','t','stopped','timer','t',0);
      insert into session_segments (id, session_id, day_key, started_at, ended_at, active_seconds)
        values ('seg1','s1','2026-05-17','t','t',180);
      insert into user_vocabulary (id, profile_id, item_key, source_entry_id, snapshot_json,
        introduced_at, introduced_day_key, familiarity_flag, created_at, updated_at)
        values ('v1','${profileId}','jmdict:1','1','{}','t','2026-05-17',0,'t','t');
      insert into review_cards (id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
        scheduler_state_json, created_at, updated_at)
        values ('c1','${profileId}','vocabulary','jmdict:1','meaning','v','t','{}','t','t');
      insert into review_logs (id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
        hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of)
        values ('l1','e1','c1','${profileId}','t','2026-05-17',3,1,0,500,'{}','{}','v',null);
      insert into kana_attempts (id, profile_id, kana_id, day_key, mode, raw, correct, hint_used,
        response_ms, attempted_at, event_id)
        values ('k1','${profileId}','h-a','2026-05-17','typed','a',1,0,500,'t','ke1');
    `);

    const activity = getDailyActivity(db(), profileId, '2026-05-17', '2026-05-18');
    expect(activity.get('2026-05-17')).toEqual({
      minutes: 3,
      newWords: 1,
      reviews: 1,
      kanaAttempts: 1,
    });
    expect(activity.has('2026-05-18')).toBe(false);
  });

  it('does not count undone reviews or another profile', () => {
    db().exec(`
      insert into review_cards (id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
        scheduler_state_json, created_at, updated_at)
        values ('c1','${profileId}','vocabulary','jmdict:1','meaning','v','t','{}','t','t');
      insert into review_logs (id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
        hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of)
        values ('l1','e1','c1','${profileId}','t','2026-05-17',3,1,0,500,'{}','{}','v','undone');
    `);
    const activity = getDailyActivity(db(), profileId, '2026-05-17', '2026-05-18');
    expect(activity.get('2026-05-17')?.reviews ?? 0).toBe(0);
  });
});

describe('undone reviews', () => {
  it('does not count a review that has a reversal', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-undone-'));
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
      insert into review_cards (id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
        scheduler_state_json, created_at, updated_at)
        values ('c1','${pid}','vocabulary','jmdict:1','meaning','v','t','{}','t','t');
      insert into review_logs (id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
        hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of)
        values ('original','e1','c1','${pid}','t','2026-05-17',3,1,0,500,'{}','{}','v',null);
      insert into review_logs (id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
        hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of)
        values ('reversal','e2','c1','${pid}','t','2026-05-17',3,1,0,500,'{}','{}','v','original');
    `);

    const activity = getDailyActivity(manager.get(), pid, '2026-05-17', '2026-05-18');
    expect(activity.get('2026-05-17')?.reviews ?? 0).toBe(0);

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('combined minute sources', () => {
  it('adds timer seconds and deliberate external seconds on the same day', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-combined-'));
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
        values ('seg1','s1','2026-05-17','t','t',90);
      insert into immersion_logs (id, profile_id, day_key, started_at, duration_seconds, activity_type,
        title, notes, deliberate, created_at, updated_at)
        values ('i1','${pid}','2026-05-17','t',120,'listening','Anime','',1,'t','t');
    `);

    const activity = getDailyActivity(manager.get(), pid, '2026-05-17', '2026-05-18');
    expect(activity.get('2026-05-17')?.minutes).toBe(3); // 90s + 120s = 210s -> 3 min

    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
