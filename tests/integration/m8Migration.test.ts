import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { openDatabase } from '../../src/main/database/connection';
import { migrate } from '../../src/main/database/migrate';
import { LATEST_SCHEMA_VERSION } from '../../src/main/database/migrations';
import { createProfile } from '../../src/main/services/profile';
import {
  insertMinedItem,
  listMinedItems,
  countQueuedOnDay,
  markMinedStatus,
} from '../../src/main/database/repositories/minedItems';
import {
  insertMedia,
  getMedia,
  listMedia,
  insertMediaTokens,
  listMediaTokens,
} from '../../src/main/database/repositories/media';
import { insertComprehensionAttempt, listComprehensionAttempts } from '../../src/main/database/repositories/comprehension';

const NOW = Date.UTC(2026, 4, 17, 12);

describe('M8 migration and repositories', () => {
  let dir: string;
  let db: Db;
  let profileId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m8-'));
    db = openDatabase(path.join(dir, 'profile.db'));
    migrate(db, { nowMs: NOW });
    createProfile(db, {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, NOW);
    profileId = (db.prepare('select id from profiles').get() as { id: string }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrades to v6 idempotently and preserves existing rows', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(6);
    expect(db.prepare('select count(*) c from profiles').get()).toEqual({ c: 1 });
    expect(migrate(db, { nowMs: NOW + 1000 }).applied).toEqual([]);
  });

  it('deduplicates mined items and enforces profile isolation', () => {
    const row = {
      id: 'm1', profileId, sourceEntryId: 'jmdict:cat', itemKey: 'jmdict:cat|ねこ',
      snapshotJson: '{"canonicalForm":"猫"}', sentence: '猫が すきです', sourceTitle: 'Pasted',
      sourceType: 'paste' as const, position: 0, status: 'queued' as const, eventId: 'e1',
      createdDayKey: '2026-05-17', createdAt: 't',
    };
    expect(insertMinedItem(db, row).id).toBe('m1');
    expect(insertMinedItem(db, { ...row, id: 'm2' }).id).toBe('m1');
    expect(listMinedItems(db, profileId, 'queued', 0, 10)).toHaveLength(1);
    expect(countQueuedOnDay(db, profileId, '2026-05-17')).toBe(1);
    expect(listMinedItems(db, 'other-profile', 'queued', 0, 10)).toHaveLength(0);

    expect(markMinedStatus(db, profileId, 'm1', 'introduced')?.status).toBe('introduced');
    expect(listMinedItems(db, profileId, 'queued', 0, 10)).toHaveLength(0);
  });

  it('caches tokens for user media and records comprehension attempts', () => {
    insertMedia(db, {
      id: 'media1', profileId, title: 'Dialogue', kind: 'paste', textContent: '猫が すきです',
      sourceName: '', dayKey: '2026-05-17', createdAt: 't',
    });
    expect(getMedia(db, profileId, 'media1')?.textContent).toBe('猫が すきです');
    expect(listMedia(db, profileId, 0, 10)).toHaveLength(1);

    insertMediaTokens(db, 'media1', profileId, [
      { position: 0, surface: '猫', basicForm: '猫', reading: 'ネコ', pos: '名詞', wordType: 'KNOWN', entryId: 'jmdict:cat', knownReading: true, knownMeaning: true },
      { position: 1, surface: 'が', basicForm: 'が', reading: 'ガ', pos: '助詞', wordType: 'KNOWN', entryId: null, knownReading: false, knownMeaning: false },
    ]);
    const tokens = listMediaTokens(db, 'media1');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.entryId).toBe('jmdict:cat');
    expect(tokens[1]?.entryId).toBeNull();

    insertComprehensionAttempt(db, {
      id: 'c1', profileId, skill: 'reading', materialId: 'p1', exerciseId: 'q1',
      dayKey: '2026-05-17', attemptedAt: 't', correct: true, answer: 'ねこ',
    });
    expect(listComprehensionAttempts(db, profileId, 'reading', 'p1')).toHaveLength(1);
  });
});
