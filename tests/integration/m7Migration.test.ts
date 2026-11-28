import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { openDatabase } from '../../src/main/database/connection';
import { migrate } from '../../src/main/database/migrate';
import { migration001 } from '../../src/main/database/migrations/001_initial';
import { migration002 } from '../../src/main/database/migrations/002_kana';
import { migration003 } from '../../src/main/database/migrations/003_vocabulary';
import { migration004 } from '../../src/main/database/migrations/004_immersion';
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';
import { createProfile } from '../../src/main/services/profile';
import { upsertKanji, getKanji, listKanji, insertKanjiAttempt } from '../../src/main/database/repositories/kanjiProgress';
import { upsertGrammarProgress, getGrammarProgress, insertGrammarAttempt } from '../../src/main/database/repositories/grammarProgress';

const DAY1 = Date.UTC(2026, 4, 17, 12);

describe('M7 migration and repositories', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m7-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    migrate(db, { nowMs: DAY1 });
    createProfile(db, {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, DAY1);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades to v5 without losing existing data', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(5);
    expect(db.prepare('select count(*) c from profiles').get()).toEqual({ c: 1 });
    const second = migrate(db, { nowMs: DAY1 + 1000 });
    expect(second.applied).toEqual([]);
  });

  it('stores kanji progress and attempts per profile', () => {
    const profileId = (db.prepare('select id from profiles').get() as { id: string }).id;
    upsertKanji(db, {
      id: 'k1', profileId, literal: '猫', firstDayKey: '2026-05-17',
      status: 'encountered', dueDay: '2026-05-18', intervalDays: 1,
      reps: 0, lapses: 0, lastAttemptDay: null, updatedAt: 't',
    });
    expect(getKanji(db, profileId, '猫')?.status).toBe('encountered');
    expect(listKanji(db, profileId)).toHaveLength(1);

    insertKanjiAttempt(db, {
      id: 'a1', profileId, literal: '猫', dayKey: '2026-05-17',
      attemptedAt: 't', correct: true, hintUsed: false, responseMs: 800, wordContext: 'ねこ',
    });
    expect(db.prepare('select count(*) c from kanji_attempts').get()).toEqual({ c: 1 });
  });

  it('stores grammar progress and attempts', () => {
    const profileId = (db.prepare('select id from profiles').get() as { id: string }).id;
    upsertGrammarProgress(db, {
      profileId, unitId: 'greetings', status: 'available', attempts: 0, correct: 0,
      completedAt: null, updatedAt: 't',
    });
    expect(getGrammarProgress(db, profileId, 'greetings')?.status).toBe('available');
    insertGrammarAttempt(db, {
      id: 'g1', profileId, unitId: 'greetings', exerciseId: 'q1', dayKey: '2026-05-17',
      attemptedAt: 't', correct: true, answer: 'こんにちは',
    });
    expect(db.prepare('select count(*) c from grammar_attempts').get()).toEqual({ c: 1 });
  });
});

describe('v4 to v5 upgrade with real data', () => {
  it('preserves existing rows and keeps profiles isolated', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m7-upgrade-'));
    const upgradeDb = openDatabase(path.join(dir, 'profile.db'));
    upgradeDb.exec(migration001.sql);
    upgradeDb.exec(migration002.sql);
    upgradeDb.exec(migration003.sql);
    upgradeDb.exec(migration004.sql);
    upgradeDb.exec('create table schema_migrations (version integer primary key, applied_at text not null)');
    upgradeDb.exec("insert into schema_migrations values (1,'t'),(2,'t'),(3,'t'),(4,'t')");
    upgradeDb.exec(`
      insert into profiles (id, display_name, start_date, horizon_months, timezone, initial_level,
                            target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at)
      values ('p1', 'First', '2026-05-17', 12, 'UTC', 'complete-beginner', null, '[]', '{}', 1, 't', 't'),
             ('p2', 'Second', '2026-05-17', 12, 'UTC', 'complete-beginner', null, '[]', '{}', 0, 't', 't');
      insert into immersion_logs (id, profile_id, day_key, started_at, duration_seconds, activity_type,
        title, notes, deliberate, created_at, updated_at)
        values ('i1', 'p1', '2026-05-17', 't', 1800, 'listening', 'Anime', '', 1, 't', 't');
    `);

    let backups = 0;
    const outcome = migrate(upgradeDb, { nowMs: Date.UTC(2026, 4, 17, 12), backupBeforeUpgrade: () => { backups += 1; } });
    expect(outcome.applied).toEqual([5]);
    expect(backups).toBe(1);
    expect(upgradeDb.prepare('select count(*) c from profiles').get()).toEqual({ c: 2 });
    expect(upgradeDb.prepare('select title from immersion_logs where id = ?').get('i1')).toEqual({ title: 'Anime' });

    upsertKanji(upgradeDb, {
      id: 'k1', profileId: 'p1', literal: '猫', firstDayKey: '2026-05-17', status: 'encountered',
      dueDay: '2026-05-17', intervalDays: 0, reps: 0, lapses: 0, lastAttemptDay: null, updatedAt: 't',
    });
    expect(listKanji(upgradeDb, 'p1').map((row) => row.literal)).toEqual(['猫']);
    expect(listKanji(upgradeDb, 'p2')).toEqual([]);
    expect(getKanji(upgradeDb, 'p2', '猫')).toBeNull();

    upgradeDb.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
