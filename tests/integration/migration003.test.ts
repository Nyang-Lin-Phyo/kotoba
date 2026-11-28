import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { openDatabase } from '../../src/main/database/connection';
import { migrate, readSchemaVersion } from '../../src/main/database/migrate';
import { migration001 } from '../../src/main/database/migrations/001_initial';
import { migration002 } from '../../src/main/database/migrations/002_kana';
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';

const NOW = Date.UTC(2026, 4, 17, 12);

function seedV2(db: Db): void {
  db.exec(migration001.sql);
  db.exec(migration002.sql);
  db.exec('create table schema_migrations (version integer primary key, applied_at text not null)');
  db.exec("insert into schema_migrations values (1, 't'), (2, 't')");
  db.exec(`
    insert into profiles (id, display_name, start_date, horizon_months, timezone, initial_level,
      target_jlpt, interests_json, preferences_json, is_active, created_at, updated_at)
    values ('p1','Seed','2026-05-17',12,'UTC','complete-beginner',null,'[]','{}',1,'t','t');
    insert into goal_versions (id, profile_id, effective_date, daily_minutes, daily_new_words, created_at)
    values ('g1','p1','2026-05-17',120,15,'t');
    insert into daily_plans (id, profile_id, day_key, goal_version_id, curriculum_day, curriculum_week,
      curriculum_month, phase, target_minutes, target_words, plan_version, created_at)
    values ('pl1','p1','2026-05-17','g1',1,1,1,'foundation',120,15,1,'t');
    insert into kana_progress (profile_id, kana_id, correct_unhinted, correct_days, lapses, verified,
      interval_tier, scheduler_version, updated_at)
    values ('p1','h-ka',1,1,0,0,0,'interval-v1','t');
  `);
}

describe('migration 003', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m3-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    seedV2(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades v2 without changing existing rows', () => {
    const before = {
      profile: db.prepare('select * from profiles').all(),
      kana: db.prepare('select * from kana_progress').all(),
      plans: db.prepare('select * from daily_plans').all(),
    };
    let backups = 0;
    const outcome = migrate(db, {
      nowMs: NOW,
      backupBeforeUpgrade: () => {
        backups += 1;
      },
    });

    expect(LATEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
    expect(outcome.applied).toContain(3);
    expect(readSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(backups).toBe(1);
    expect({
      profile: db.prepare('select * from profiles').all(),
      kana: db.prepare('select * from kana_progress').all(),
      plans: db.prepare('select * from daily_plans').all(),
    }).toEqual(before);
  });

  it('creates the vocabulary and review tables with constraints', () => {
    migrate(db, { nowMs: NOW });

    for (const table of [
      'user_vocabulary',
      'daily_new_items',
      'review_cards',
      'review_logs',
      'familiarity_diagnostics',
    ]) {
      expect(
        db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(table),
        table,
      ).toBeDefined();
    }

    const profileId = 'p1';
    expect(() =>
      db
        .prepare(
          `insert into user_vocabulary (id, profile_id, item_key, source_entry_id, snapshot_json,
             familiarity_flag, created_at, updated_at) values (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run('v1', profileId, 'jmdict:1', '1', '{}', 't', 't'),
    ).not.toThrow();
    expect(() =>
      db
        .prepare(
          `insert into user_vocabulary (id, profile_id, item_key, source_entry_id, snapshot_json,
             familiarity_flag, created_at, updated_at) values (?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run('v2', profileId, 'jmdict:1', '1', '{}', 't', 't'),
    ).toThrow();

    const foreignKeys = db.prepare('pragma foreign_keys').get() as { foreign_keys: number };
    expect(foreignKeys.foreign_keys).toBe(1);
  });

  it('is idempotent', () => {
    migrate(db, { nowMs: NOW });
    const second = migrate(db, { nowMs: NOW + 1000 });
    expect(second.applied).toEqual([]);
  });
});
