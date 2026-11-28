import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { insertUserVocabulary } from '../../src/main/database/repositories/vocabulary';
import {
  listPersonalKanji,
  submitKanjiAttempt,
  getKanjiDetail,
} from '../../src/main/services/kanjiStudy';
import {
  listGrammarUnits,
  submitGrammarAttempt,
} from '../../src/main/services/grammarStudy';
import { grammarUnits, getGrammarUnit } from '../../src/shared/grammarData';
import type { DictionaryEntry } from '../../src/shared/contracts';

const DAY1 = Date.UTC(2026, 4, 17, 12);
const DAY2 = DAY1 + 86_400_000;
const DAY3 = DAY1 + 2 * 86_400_000;

function catEntry(): DictionaryEntry {
  return {
    id: 'jmdict:cat',
    sourceId: 'jmdict:cat',
    canonicalForm: '猫',
    forms: [{ text: '猫', common: true }],
    readings: [{ text: 'ねこ', common: true, appliesTo: ['猫'] }],
    senses: [{ partOfSpeech: 'n', english: 'cat', tags: [], appliesToForms: ['猫'], appliesToReadings: ['ねこ'] }],
    kanji: ['猫'],
    priority: 1,
    curriculumRank: 1,
  };
}

describe('M7 services', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = () => manager.get();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m7-svc-'));
    manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(db(), {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, DAY1);
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    insertUserVocabulary(db(), {
      id: 'uv1', profileId, itemKey: 'jmdict:cat', sourceEntryId: 'jmdict:cat',
      snapshot: catEntry(), introducedAt: new Date(DAY1).toISOString(),
      introducedDayKey: '2026-05-17', familiarityFlag: false, notes: '',
      createdAt: 't', updatedAt: 't',
    });
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds kanji in introduced vocabulary and keeps encounter separate from verification', () => {
    const before = listPersonalKanji(db(), DAY1);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ literal: '猫', status: 'encountered', verified: false });
    expect(before[0]?.wordContext).toBe('猫');

    submitKanjiAttempt(db(), {
      eventId: 'aaaaaaaa-1111-4111-8111-111111111111',
      literal: '猫', correct: true, hintUsed: false, responseMs: 900, wordContext: '猫',
    }, DAY1);
    submitKanjiAttempt(db(), {
      eventId: 'aaaaaaaa-2222-4222-8222-222222222222',
      literal: '猫', correct: true, hintUsed: false, responseMs: 800, wordContext: '猫',
    }, DAY2);
    submitKanjiAttempt(db(), {
      eventId: 'aaaaaaaa-3333-4333-8333-333333333333',
      literal: '猫', correct: true, hintUsed: false, responseMs: 700, wordContext: '猫',
    }, DAY3);

    const after = getKanjiDetail(db(), () => null, '猫', DAY3);
    expect(after?.status).toBe('verified');
    expect(after?.verified).toBe(true);
    expect(after?.intervalDays).toBeGreaterThanOrEqual(7);
    expect(after?.attempts).toHaveLength(3);
    expect(after?.dictionary).toBeNull(); // missing dictionary data is honest, not invented
  });

  it('respects grammar prerequisites and persists exercise progress', () => {
    const units = listGrammarUnits(db());
    expect(units.length).toBe(grammarUnits.length);
    const greetings = units.find((unit) => unit.id === 'greetings');
    const desuMasu = units.find((unit) => unit.id === 'desu-masu');
    expect(greetings?.unlocked).toBe(true);
    expect(desuMasu?.unlocked).toBe(false);

    const firstExercise = getGrammarUnit('greetings')?.exercises[0];
    expect(firstExercise).toBeDefined();
    if (firstExercise === undefined) return;

    const result = submitGrammarAttempt(db(), {
      eventId: 'bbbbbbbb-1111-4111-8111-111111111111',
      unitId: 'greetings', exerciseId: firstExercise.id, answerIndex: firstExercise.answerIndex,
    }, DAY1);
    expect(result.correct).toBe(true);
    expect(result.status).toBe('in-progress');

    for (const exercise of getGrammarUnit('greetings')?.exercises ?? []) {
      submitGrammarAttempt(db(), {
        eventId: `cccccccc-${exercise.id.slice(-1)}111-4111-8111-111111111111`,
        unitId: 'greetings', exerciseId: exercise.id, answerIndex: exercise.answerIndex,
      }, DAY1);
    }
    const completed = listGrammarUnits(db()).find((unit) => unit.id === 'greetings');
    expect(completed?.status).toBe('completed');
    expect(listGrammarUnits(db()).find((unit) => unit.id === 'desu-masu')?.unlocked).toBe(true);
  });

  it('replays a repeated event id without recording another attempt', () => {
    const input = {
      eventId: 'dddddddd-1111-4111-8111-111111111111',
      literal: '猫', correct: true, hintUsed: false, responseMs: 900, wordContext: '猫',
    };
    submitKanjiAttempt(db(), input, DAY1);
    submitKanjiAttempt(db(), input, DAY1);
    const detail = getKanjiDetail(db(), () => null, '猫', DAY1);
    expect(detail?.attempts).toHaveLength(1);
  });
});

function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m7-invariants-'));
    const manager = new DatabaseManager(dir);
    manager.open(DAY1);
    createProfile(manager.get(), {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, DAY1);
    const profileId = (manager.get().prepare('select id from profiles').get() as { id: string }).id;
    insertUserVocabulary(manager.get(), {
      id: 'uv1', profileId, itemKey: 'jmdict:cat', sourceEntryId: 'jmdict:cat',
      snapshot: catEntry(), introducedAt: new Date(DAY1).toISOString(),
      introducedDayKey: '2026-05-17', familiarityFlag: false, notes: '',
      createdAt: 't', updatedAt: 't',
    });
    return { dir, manager };
  }

describe('kanji attempt invariants', () => {
  it('rejects a character that is not in an introduced word', () => {
    const { dir, manager } = setup();
    expect(() => submitKanjiAttempt(manager.get(), {
      eventId: 'eeeeeeee-1111-4111-8111-111111111111',
      literal: '猫', correct: true, hintUsed: false, responseMs: 500, wordContext: '猫',
    }, DAY1)).not.toThrow(); // sync discovers it before the attempt

    const result = getKanjiDetail(manager.get(), () => null, '猫', DAY1);
    expect(result?.firstDayKey).toBe('2026-05-17');
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports a miss as struggling consistently and never verifies after one success', () => {
    const { dir, manager } = setup();
    const base = { literal: '猫', hintUsed: false, responseMs: 500, wordContext: '猫' };
    const ids = [
      'f1111111-1111-4111-8111-111111111111',
      'f2222222-2222-4222-8222-222222222222',
      'f3333333-3333-4333-8333-333333333333',
      'f4444444-4444-4444-8444-444444444444',
      'f5555555-5555-4555-8555-555555555555',
    ];
    [DAY1, DAY1 + 86_400_000, DAY1 + 2 * 86_400_000].forEach((day, index) => {
      submitKanjiAttempt(manager.get(), { ...base, eventId: ids[index] ?? '', correct: true }, day);
    });
    const miss = submitKanjiAttempt(manager.get(), { ...base, eventId: ids[3] ?? '', correct: false }, DAY1 + 3 * 86_400_000);
    expect(miss.status).toBe('struggling');
    expect(getKanjiDetail(manager.get(), () => null, '猫', DAY1 + 3 * 86_400_000)?.status).toBe('struggling');

    const recovery = submitKanjiAttempt(manager.get(), { ...base, eventId: ids[4] ?? '', correct: true }, DAY1 + 4 * 86_400_000);
    expect(recovery.verified).toBe(false);
    expect(recovery.intervalDays).toBe(1);
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
