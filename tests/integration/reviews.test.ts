import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/database/connection';
import { DatabaseManager } from '../../src/main/database/manager';
import { listCards } from '../../src/main/database/repositories/reviewCards';
import { createProfile } from '../../src/main/services/profile';
import { getDashboard } from '../../src/main/services/planner';
import { getLesson, introduceWord } from '../../src/main/services/learning';
import { createCardFactory } from '../../src/main/services/fsrsScheduler';
import {
  getCardDetail,
  getReviewQueue,
  submitRating,
  undoLast,
} from '../../src/main/services/reviews';
import { AppError } from '../../src/shared/errors';
import type { RatingInput } from '../../src/shared/contracts';

const DAY1 = Date.UTC(2026, 4, 17, 12);

function stubDictionary() {
  return {
    listCandidateIds: (limit: number) =>
      Array.from({ length: limit }, (_, index) => `jmdict:${index + 1}`),
    getEntry: (id: string) => ({
      id,
      sourceId: id.replace('jmdict:', ''),
      canonicalForm: '猫',
      forms: [{ text: '猫', common: true }],
      readings: [{ text: 'ねこ', common: true, appliesTo: [] }],
      senses: [
        {
          partOfSpeech: 'n',
          english: 'cat',
          tags: [],
          appliesToForms: [],
          appliesToReadings: [],
        },
      ],
      kanji: ['猫'],
      priority: 5,
      curriculumRank: null,
    }),
  };
}

describe('review service (M5c)', () => {
  let dir: string;
  let manager: DatabaseManager;
  const db = (): Db => manager.get();
  let profileId: string;
  let cardId: string;
  let stateJson: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-reviews-'));
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
    getDashboard(db(), DAY1);
    profileId = (db().prepare('select id from profiles').get() as { id: string }).id;
    const dictionary = stubDictionary();
    const item = getLesson(db(), dictionary, DAY1).items[0]!;
    await introduceWord(db(), dictionary, { itemId: item.itemKey }, randomUUID(), DAY1, await createCardFactory());

    const cards = listCards(db(), profileId);
    cardId = cards[0]!.id;
    stateJson = cards[0]!.stateJson;
  });

  afterEach(() => {
    manager.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const input = (patch: Partial<RatingInput> = {}): RatingInput => ({
    cardId,
    rating: 3,
    expectedStateJson: stateJson,
    responseMs: 900,
    hintUsed: false,
    eventId: randomUUID(),
    ...patch,
  });

  it('writes card, log and event atomically and is idempotent', async () => {
    const eventId = randomUUID();
    const result = await submitRating(db(), input(), eventId, DAY1);
    expect(result.correct).toBe(true);
    expect((db().prepare('select count(*) c from review_logs').get() as { c: number }).c).toBe(1);
    expect((db().prepare('select count(*) c from study_events').get() as { c: number }).c).toBe(2);

    const again = await submitRating(db(), input(), eventId, DAY1);
    expect(again.duplicate).toBe(true);
    expect((db().prepare('select count(*) c from review_logs').get() as { c: number }).c).toBe(1);
  });

  it('rejects stale card state with a conflict and the refreshed card', async () => {
    await submitRating(db(), input(), randomUUID(), DAY1);
    let error: AppError | null = null;
    try {
      await submitRating(db(), input(), randomUUID(), DAY1);
    } catch (cause) {
      if (cause instanceof AppError) error = cause;
    }
    expect(error?.code).toBe('CONFLICT');
    const refreshed = error?.toPayload().data as { stateJson?: string } | undefined;
    expect(refreshed?.stateJson).toBeDefined();
  });

  it('restores prior state and records a reversal when undone', async () => {
    const before = getCardDetail(db(), cardId);
    await submitRating(db(), input(), randomUUID(), DAY1);

    const result = undoLast(db(), { cardId, eventId: randomUUID() }, DAY1);
    expect(result.restored).toBe(true);

    const after = getCardDetail(db(), cardId);
    expect(after?.stateJson).toBe(before?.stateJson);
    expect((db().prepare('select count(*) c from review_logs').get() as { c: number }).c).toBe(2);
  });

  it('bounds the due queue by session limit', async () => {
    const queue = await getReviewQueue(db(), DAY1, 1);
    expect(queue.items).toHaveLength(1);
    expect(queue.remaining).toBeGreaterThanOrEqual(1);
    expect(queue.items[0]?.form).toBe('猫');
  });

  it('requeues a failed card promptly', async () => {
    const result = await submitRating(db(), input({ rating: 1 }), randomUUID(), DAY1);
    expect(result.correct).toBe(false);
    expect(result.dueAtMs).toBeLessThanOrEqual(DAY1 + 60 * 60_000);
  });
});

describe('learning metrics from review logs', () => {
  let metricsDir: string;
  let metricsManager: DatabaseManager;
  let metricsProfile: string;

  beforeEach(async () => {
    metricsDir = mkdtempSync(path.join(tmpdir(), 'kotoba-metrics-'));
    metricsManager = new DatabaseManager(metricsDir);
    metricsManager.open(DAY1);
    createProfile(
      metricsManager.get(),
      {
        displayName: '', startDate: '2026-05-17', horizonMonths: 12, timezone: 'UTC',
        initialLevel: 'complete-beginner', targetJlpt: null, interests: ['general'],
        dailyMinutes: 120, dailyNewWords: 15,
        preferences: { romaji: true, furigana: true, audio: 'off' },
      }, DAY1,
    );
    getDashboard(metricsManager.get(), DAY1);
    metricsProfile = (metricsManager.get().prepare('select id from profiles').get() as { id: string }).id;
    const dictionary = stubDictionary();
    const item = getLesson(metricsManager.get(), dictionary, DAY1).items[0]!;
    await introduceWord(metricsManager.get(), dictionary, { itemId: item.itemKey }, randomUUID(), DAY1, await createCardFactory());
  });

  afterEach(() => {
    metricsManager.close();
    rmSync(metricsDir, { recursive: true, force: true });
  });

  it('reports real struggling and accuracy after ratings', async () => {
    const { getSummary } = await import('../../src/main/services/learning');
    const prior = getSummary(metricsManager.get(), DAY1);
    expect(prior.accuracy).toBe(0);

    const cards = listCards(metricsManager.get(), metricsProfile);
    await submitRating(
      metricsManager.get(),
      {
        cardId: cards[0]!.id,
        rating: 1,
        expectedStateJson: cards[0]!.stateJson,
        responseMs: 800,
        hintUsed: false,
        eventId: randomUUID(),
      },
      randomUUID(),
      DAY1,
    );

    const after = getSummary(metricsManager.get(), DAY1);
    expect(after.struggling).toBe(1);
    expect(after.accuracy).toBe(0);
  });
});
