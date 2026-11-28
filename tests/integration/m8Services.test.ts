import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../../src/main/database/manager';
import { createProfile } from '../../src/main/services/profile';
import { TokenizerService } from '../../src/main/services/tokenizer';
import {
  analyzeText,
  mineToken,
  listMiningQueue,
  submitComprehension,
} from '../../src/main/services/immersionStudy';
import { passages } from '../../src/shared/readingData';
import { insertMinedItem, markMinedIntroducedForEntry } from '../../src/main/database/repositories/minedItems';
import { insertUserVocabulary } from '../../src/main/database/repositories/vocabulary';

const NOW = Date.UTC(2026, 4, 17, 12);

const fakeTokenizer = new TokenizerService('/unused', async () => ({
  tokenize: () => [
    { surface_form: '猫', basic_form: '猫', reading: 'ネコ', pos: '名詞', word_type: 'KNOWN' },
    { surface_form: 'が', basic_form: '*', reading: '*', pos: '助詞', word_type: 'KNOWN' },
  ],
}) as never);

describe('M8 immersion services', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = () => manager.get();
  const dictionary = {
    resolveForms: () => new Map([['猫', [{
      id: 'jmdict:cat', canonicalForm: '猫', reading: 'ねこ', english: 'cat',
      priority: 1, curriculumRank: null,
    }]]]),
    getEntry: () => ({
      id: 'jmdict:cat', sourceId: 'jmdict:cat', canonicalForm: '猫',
      forms: [{ text: '猫', common: true }],
      readings: [{ text: 'ねこ', common: true, appliesTo: ['猫'] }],
      senses: [{ partOfSpeech: 'n', english: 'cat', tags: [], appliesToForms: ['猫'], appliesToReadings: ['ねこ'] }],
      kanji: ['猫'], priority: 1, curriculumRank: null,
    }),
    metadata: () => ({ release: 'test-release', licence: 'test', source: 'test', generatedAt: 'test', entryCount: '1' }),
  } as never;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m8-svc-'));
    manager = new DatabaseManager(dir);
    manager.open(NOW);
    createProfile(db(), {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, NOW);
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('analyzes pasted text, resolves entries and reports coverage with a denominator', async () => {
    const result = await analyzeText(db(), dictionary, fakeTokenizer, {
      text: '猫が', title: 'Pasted', sourceName: '', kind: 'paste',
    }, NOW);
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]?.entryId).toBe('jmdict:cat');
    expect(result.tokens[1]?.entryId).toBeNull(); // particle has no dictionary entry
    expect(result.coverage.eligible).toBe(1);
    expect(result.coverage.excludedFunctionTokens).toBe(1);
    expect(result.coverage.unseen).toBe(1);
    expect(result.dictionaryRelease).toBe('test-release');
  });

  it('mines a token once and respects the daily cap', async () => {
    const analysis = await analyzeText(db(), dictionary, fakeTokenizer, {
      text: '猫が', title: 'Pasted', sourceName: '', kind: 'paste',
    }, NOW);
    const input = {
      eventId: 'aaaaaaaa-1111-4111-8111-111111111111',
      entryId: 'jmdict:cat', reading: 'ねこ',
      sentence: '猫が', sourceTitle: 'Pasted', sourceType: 'paste' as const,
    };
    const first = mineToken(db(), dictionary, input, NOW);
    const repeat = mineToken(db(), dictionary, input, NOW);
    expect(first.mined).toBe(true);
    expect(repeat.mined).toBe(false);
    expect(repeat.duplicate).toBe(true);
    expect(listMiningQueue(db(), 0, 10)).toHaveLength(1);

    for (let i = 2; i <= 3; i += 1) {
      const mined = mineToken(db(), dictionary, {
        ...input,
        eventId: `aaaaaaaa-${String(i).padStart(4, '0')}-4111-8111-111111111111`,
        sentence: `猫が ${i}`,
      }, NOW);
      expect(mined.mined).toBe(true);
    }
    const capped = mineToken(db(), dictionary, {
      ...input,
      eventId: 'aaaaaaaa-9999-4111-8111-111111111111',
      sentence: '猫が over cap',
    }, NOW);
    expect(capped.mined).toBe(false);
    expect(capped.capReached).toBe(true);
    expect(analysis.mediaId.length).toBeGreaterThan(0);
  });

  it('removes a mined item from the queue when its word is introduced', () => {
    const snapshot = {
      id: 'jmdict:cat', sourceId: 'jmdict:cat', canonicalForm: '猫',
      forms: [{ text: '猫', common: true }],
      readings: [{ text: 'ねこ', common: true, appliesTo: ['猫'] }],
      senses: [{ partOfSpeech: 'n', english: 'cat', tags: [], appliesToForms: ['猫'], appliesToReadings: ['ねこ'] }],
      kanji: ['猫'], priority: 1, curriculumRank: null,
    };
    const profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    insertMinedItem(db(), {
      id: 'm1', profileId, sourceEntryId: 'jmdict:cat', itemKey: 'jmdict:cat|ねこ',
      snapshotJson: JSON.stringify(snapshot), sentence: '猫が', sourceTitle: 'Pasted',
      sourceType: 'paste', position: 0, status: 'queued',
      eventId: 'e1', createdDayKey: '2026-05-17', createdAt: 't',
    });
    const changed = markMinedIntroducedForEntry(db(), profileId, 'jmdict:cat');
    expect(changed).toBe(1);
    expect(listMiningQueue(db(), 0, 10)).toHaveLength(0);
  });

  it('records comprehension answers with an answer key and idempotency', () => {
    const passage = passages[0];
    if (passage === undefined) return;
    const exercise = passage.exercises[0];
    if (exercise === undefined) return;
    const input = {
      eventId: 'bbbbbbbb-1111-4111-8111-111111111111',
      skill: 'reading' as const, materialId: passage.id,
      exerciseId: exercise.id, answerIndex: exercise.answerIndex,
    };
    const first = submitComprehension(db(), input, NOW);
    expect(first.correct).toBe(true);
    const again = submitComprehension(db(), input, NOW);
    expect(again.correct).toBe(true);
    expect(db().prepare('select count(*) c from comprehension_attempts').get()).toEqual({ c: 1 });
  });
});

describe('subtitle import', () => {
  it('imports a validated local subtitle file through a native-chosen path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m8-import-'));
    const manager = new DatabaseManager(dir);
    manager.open(NOW);
    createProfile(manager.get(), {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, NOW);
    const file = path.join(dir, 'clip.srt');
    (await import('node:fs')).writeFileSync(file, '1\n00:00:01,000 --> 00:00:02,000\n猫が\n');
    const { importSubtitleFile } = await import('../../src/main/services/immersionStudy');
    const dictionary = {
      resolveForms: () => new Map([['猫', [{ id: 'jmdict:cat', canonicalForm: '猫', reading: 'ねこ', english: 'cat', priority: 1, curriculumRank: null }]]]),
      getEntry: () => null,
      metadata: () => ({ release: 'test-release' }),
    } as never;
    const result = await importSubtitleFile(manager.get(), dictionary, fakeTokenizer, file, NOW);
    expect(result.title).toBe('clip');
    expect(result.tokens.length).toBeGreaterThan(0);
    await expect(importSubtitleFile(manager.get(), dictionary, fakeTokenizer, path.join(dir, 'bad.vtt'), NOW)).rejects.toThrow();
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

function setupWithRealIds() {
    const dir = mkdtempSync(path.join(tmpdir(), 'kotoba-m8-ids-'));
    const manager = new DatabaseManager(dir);
    manager.open(NOW);
    createProfile(manager.get(), {
      displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
      initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
      dailyMinutes: 120, dailyNewWords: 15,
      preferences: { romaji: true, furigana: true, audio: 'off' },
    }, NOW);
    const entry = {
      id: 'jmdict:cat', sourceId: 'cat', canonicalForm: '猫',
      forms: [{ text: '猫', common: true }],
      readings: [{ text: 'ねこ', common: true, appliesTo: ['猫'] }],
      senses: [{ partOfSpeech: 'n', english: 'cat', tags: [], appliesToForms: ['猫'], appliesToReadings: ['ねこ'] }],
      kanji: ['猫'], priority: 1, curriculumRank: null,
    };
    const dictionary = {
      getEntry: () => entry,
      resolveForms: () => new Map(),
      metadata: () => ({ release: 'test' }),
    } as never;
    return { dir, manager, dictionary };
  }

describe('canonical ids and listening answers', () => {

  it('mines with a canonical id and leaves the queue when the stripped-id word is introduced', () => {
    const { dir, manager, dictionary } = setupWithRealIds();
    const result = mineToken(manager.get(), dictionary, {
      eventId: 'cccccccc-1111-4111-8111-111111111111',
      entryId: 'jmdict:cat', reading: 'ねこ', sentence: '猫が',
      sourceTitle: 'Pasted', sourceType: 'paste',
    }, NOW);
    expect(result.item?.entryId).toBe('jmdict:cat');
    const profileId = (manager.get().prepare('select id from profiles').get() as { id: string }).id;
    markMinedIntroducedForEntry(manager.get(), profileId, 'jmdict:cat');
    expect(listMiningQueue(manager.get(), 0, 10)).toHaveLength(0);

    // A word already introduced cannot be mined again, even with a stripped sourceId.
    insertUserVocabulary(manager.get(), {
      id: 'uv1', profileId, itemKey: 'jmdict:cat', sourceEntryId: 'cat',
      snapshot: {
        id: 'jmdict:cat', sourceId: 'cat', canonicalForm: '猫', forms: [],
        readings: [], senses: [], kanji: [], priority: 1, curriculumRank: null,
      },
      introducedAt: new Date(NOW).toISOString(), introducedDayKey: '2026-05-17',
      familiarityFlag: false, notes: '', createdAt: 't', updatedAt: 't',
    });
    const again = mineToken(manager.get(), dictionary, {
      eventId: 'cccccccc-2222-4222-8222-222222222222',
      entryId: 'jmdict:cat', reading: 'ねこ', sentence: '猫が',
      sourceTitle: 'Pasted', sourceType: 'paste',
    }, NOW);
    expect(again.duplicate).toBe(true);
    expect(again.mined).toBe(false);
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records listening answers and replays the original correctness', () => {
    const { dir, manager } = setupWithRealIds();
    const passage = passages[0];
    const exercise = passage?.exercises[0];
    if (passage === undefined || exercise === undefined) return;
    const input = {
      eventId: 'dddddddd-1111-4111-8111-111111111111',
      skill: 'listening' as const, materialId: passage.id,
      exerciseId: exercise.id, answerIndex: 999,
    };
    expect(() => submitComprehension(manager.get(), input, NOW)).toThrow();
    const valid = { ...input, answerIndex: exercise.answerIndex };
    expect(submitComprehension(manager.get(), valid, NOW).correct).toBe(true);
    expect(submitComprehension(manager.get(), { ...valid, answerIndex: 0 }, NOW).correct).toBe(true);
    expect(manager.get().prepare('select count(*) c from comprehension_attempts').get()).toEqual({ c: 1 });
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
