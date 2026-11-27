import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import {
  clampDesiredRetention,
  createScheduler,
  gradeFromRating,
  reviveCard,
  SCHEDULER_VERSION,
} from '../../src/main/services/fsrsScheduler';

const NOW = new Date('2026-05-17T12:00:00.000Z');

describe('FSRS scheduler helpers', () => {
  it('exposes the pinned scheduler version', () => {
    expect(SCHEDULER_VERSION).toContain('ts-fsrs-6.0.1');
  });

  it('maps ratings to the library enum', () => {
    expect([1, 2, 3, 4].map(gradeFromRating)).toEqual([
      Rating.Again,
      Rating.Hard,
      Rating.Good,
      Rating.Easy,
    ]);
    expect(() => gradeFromRating(0)).toThrow();
    expect(() => gradeFromRating(5)).toThrow();
  });

  it('clamps desired retention to the safe range', () => {
    expect(clampDesiredRetention(0.5)).toBe(0.8);
    expect(clampDesiredRetention(0.99)).toBe(0.95);
    expect(clampDesiredRetention(0.9)).toBe(0.9);
  });

  it('creates a new card due at the injected time', async () => {
    const scheduler = await createScheduler();
    const card = scheduler.newCard({ now: NOW });
    expect(card.state).toBe(State.New);
    expect(new Date(card.dueAt).toISOString()).toBe(NOW.toISOString());
  });

  it('schedules all four grades from the same card without mutating it', async () => {
    const scheduler = await createScheduler();
    const card = scheduler.newCard({ now: NOW });
    const snapshot = JSON.stringify(card);

    const results = [1, 2, 3, 4].map((rating) =>
      scheduler.review({ card, grade: gradeFromRating(rating), now: NOW }),
    );

    expect(JSON.stringify(card)).toBe(snapshot);
    for (const result of results) {
      expect(Date.parse(String(result.card.dueAt))).toBeGreaterThanOrEqual(NOW.getTime());
      expect(result.revlog).toBeDefined();
    }
  });

  it('keeps separate schedulers per desired retention', async () => {
    const { getScheduler } = await import('../../src/main/services/fsrsScheduler');
    expect(await getScheduler(0.8)).not.toBe(await getScheduler(0.95));
  });

  it('round-trips a card through SQLite JSON and can still schedule it', async () => {
    const scheduler = await createScheduler();
    const first = scheduler.review({
      card: scheduler.newCard({ now: NOW }),
      grade: Rating.Good,
      now: NOW,
    });
    const stored = JSON.stringify(first.card);
    const revived = reviveCard<typeof first.card>(stored);

    const later = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const result = scheduler.review({ card: revived, grade: Rating.Good, now: later });

    expect(result.card.reps).toBe(2);
    expect(Date.parse(String(result.card.dueAt))).toBeGreaterThan(later.getTime());
  });
});
