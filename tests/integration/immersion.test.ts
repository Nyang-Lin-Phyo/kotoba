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
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';
import { createProfile } from '../../src/main/services/profile';
import { addImmersionLog, correctImmersionLog, listImmersionLogs } from '../../src/main/database/repositories/immersion';

describe('immersion migration and repository', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-immersion-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    db.exec(migration001.sql);
    db.exec(migration002.sql);
    db.exec(migration003.sql);
    db.exec('create table schema_migrations (version integer primary key, applied_at text not null)');
    db.exec("insert into schema_migrations values (1,'t'),(2,'t'),(3,'t')");
    createProfile(
      db,
      {
        displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
        initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
        dailyMinutes: 120, dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      },
      Date.UTC(2026, 4, 17, 12),
    );
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades v3 to v4 without losing data', () => {
    let backups = 0;
    const result = migrate(db, {
      nowMs: Date.UTC(2026, 4, 17, 12),
      backupBeforeUpgrade: () => { backups += 1; },
    });
    expect(LATEST_SCHEMA_VERSION).toBe(4);
    expect(result.applied).toContain(4);
    expect(backups).toBe(1);
    expect(db.prepare('select count(*) c from profiles').get()).toEqual({ c: 1 });
  });

  it('adds a log and records a correction in one transaction', () => {
    migrate(db, { nowMs: Date.UTC(2026, 4, 17, 12) });
    const profileId = (db.prepare('select id from profiles').get() as { id: string }).id;
    const log = addImmersionLog(db, {
      id: 'log1', profileId, dayKey: '2026-05-17', startedAt: 't',
      durationSeconds: 1800, activityType: 'listening', title: 'Anime', notes: '', deliberate: true,
    });

    const corrected = correctImmersionLog(db, profileId, 'log1', {
      durationSeconds: 2400, title: 'Anime ep 2', reason: 'wrong duration',
    }, 't2');

    expect(corrected?.durationSeconds).toBe(2400);
    const entries = listImmersionLogs(db, profileId, 0, 10);
    expect(entries).toHaveLength(1);
    const corrections = db.prepare('select reason, before_json from immersion_corrections').all() as {
      reason: string; before_json: string;
    }[];
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.reason).toBe('wrong duration');
    expect(corrections[0]?.before_json).toContain('1800');
    expect(log.id).toBe('log1');
  });
});
