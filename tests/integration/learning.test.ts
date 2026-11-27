import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { getDashboard } from '../../src/main/services/planner';
import { AppError } from '../../src/shared/errors';
import type { DictionaryEntry } from '../../src/shared/contracts';

const DAY1 = Date.UTC(2026, 4, 17, 12);

function entry(id: string): DictionaryEntry {
  return {
    id,
    sourceId: id.replace('jmdict:', ''),
    canonicalForm: `語${id}`,
    forms: [{ text: `語${id}`, common: true }],
    readings: [{ text: 'ご', common: true, appliesTo: [] }],
    senses: [
      { partOfSpeech: 'n', english: `word ${id}`, tags: [], appliesToForms: [], appliesToReadings: [] },
    ],
    kanji: [],
    priority: 5,
    curriculumRank: null,
  };
}

function stubDictionary(ids: string[], words = new Map<string, DictionaryEntry>()) {
  return {
    listCandidateIds: (limit: number) => ids.slice(0, limit),
    getEntry: (id: string) => words.get(id) ?? entry(id),
  };
}

function stubCardFactory() {
  let counter = 0;
  return (itemKey: string, skill: 'meaning' | 'reading', nowMs: number) => {
    counter += 1;
    return {
      cardId: `card-${counter}`,
      dueAt: new Date(nowMs).toISOString(),
      stateJson: JSON.stringify({ itemKey, skill, due: nowMs }),
      schedulerVersion: 'stub-v1',
    };
  };
}

function slangEntry(id: string): DictionaryEntry {
  return {
    ...entry(id),
    senses: [
      {
        partOfSpeech: 'n',
        english: 'vulgar term',
        tags: ['vulg'],
        appliesToForms: [],
        appliesToReadings: [],
      },
    ],
  };
}

describe('learning service (M5b)', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-learn-'));
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
    getDashboard(db(), DAY1); // creates today's plan
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('assigns a stable 15-word lesson', async () => {
    const { getLesson } = await import('../../src/main/services/learning');
    const ids = Array.from({ length: 20 }, (_, index) => `jmdict:${index + 1}`);
    const dictionary = stubDictionary(ids);
    const first = getLesson(db(), dictionary, DAY1);
    const second = getLesson(db(), dictionary, DAY1);

    expect(first.items).toHaveLength(15);
    expect(second.items.map((item) => item.itemKey)).toEqual(first.items.map((item) => item.itemKey));
    expect(new Set(first.items.map((item) => item.itemKey)).size).toBe(15);
  });

  it('replaces words with no beginner-suitable sense instead of showing fewer than 15', async () => {
    const { getLesson } = await import('../../src/main/services/learning');
    const ids = Array.from({ length: 20 }, (_, index) => `jmdict:${index + 1}`);
    const words = new Map([
      ['jmdict:1', slangEntry('jmdict:1')],
      ['jmdict:2', slangEntry('jmdict:2')],
    ]);
    const lesson = getLesson(db(), stubDictionary(ids, words), DAY1);

    expect(lesson.items).toHaveLength(15);
    expect(lesson.items.map((item) => item.itemKey)).not.toContain('jmdict:1');
    expect(lesson.items.map((item) => item.itemKey)).not.toContain('jmdict:2');
  });

  it('introduces a word once with two cards and one event', async () => {
    const { getLesson, introduceWord } = await import('../../src/main/services/learning');
    const dictionary = stubDictionary([`jmdict:1`]);
    const lesson = getLesson(db(), dictionary, DAY1);
    const itemKey = lesson.items[0]!.itemKey;
    const eventId = randomUUID();

    const result = introduceWord(db(), dictionary, { itemId: itemKey }, eventId, DAY1, stubCardFactory());
    expect(result).toMatchObject({ duplicate: false, introduced: true });

    const again = introduceWord(db(), dictionary, { itemId: itemKey }, eventId, DAY1, stubCardFactory());
    expect(again.duplicate).toBe(true);

    expect((db().prepare('select count(*) c from user_vocabulary').get() as { c: number }).c).toBe(1);
    expect((db().prepare('select count(*) c from review_cards').get() as { c: number }).c).toBe(2);
    expect((db().prepare('select count(*) c from study_events').get() as { c: number }).c).toBe(1);

    expect(() =>
      introduceWord(db(), dictionary, { itemId: itemKey }, randomUUID(), DAY1, stubCardFactory()),
    ).toThrow(AppError);
  });

  it('excludes familiar items and clears the flag on a failed diagnostic', async () => {
    const { getLesson, setFamiliar } = await import('../../src/main/services/learning');
    const dictionary = stubDictionary([`jmdict:1`, `jmdict:2`]);
    const first = getLesson(db(), dictionary, DAY1);
    const target = first.items[0]!.itemKey;

    setFamiliar(db(), dictionary, { itemId: target, familiar: true, diagnosticCorrect: true }, DAY1);
    const after = getLesson(db(), dictionary, DAY1);
    expect(after.items.map((item) => item.itemKey)).not.toContain(target);
    expect(after.summary.familiar).toBe(1);
    expect(after.summary.introduced).toBe(0);

    setFamiliar(db(), dictionary, { itemId: target, familiar: false, diagnosticCorrect: false }, DAY1);
    expect(getLesson(db(), dictionary, DAY1).items.map((item) => item.itemKey)).toContain(target);
  });
});

describe('library DTO', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-library-'));
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
    getDashboard(db(), DAY1);
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns word detail with skills and history', async () => {
    const { getDetail, introduceWord } = await import('../../src/main/services/learning');
    const dictionary = stubDictionary(['jmdict:1']);
    await introduceWord(db(), dictionary, { itemId: 'jmdict:1' }, randomUUID(), DAY1, stubCardFactory());

    const detail = getDetail(db(), 'jmdict:1');
    expect(detail?.skills.map((skill) => skill.skill)).toEqual(['meaning', 'reading']);
    expect(detail?.history).toEqual([]);
    expect(detail?.senses).toContain('word jmdict:1');
  });

  it('returns display fields rather than raw repository rows', async () => {
    const { getLibrary, introduceWord } = await import('../../src/main/services/learning');
    const dictionary = stubDictionary(['jmdict:1']);
    await introduceWord(db(), dictionary, { itemId: 'jmdict:1' }, randomUUID(), DAY1, stubCardFactory());

    const result = getLibrary(db(), { offset: 0, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      itemKey: 'jmdict:1',
      form: '語jmdict:1',
      reading: 'ご',
      english: 'word jmdict:1',
    });
    expect(result.items[0]).not.toHaveProperty('snapshot');
  });
});
