/**
 * Single owner of the FSRS scheduler. The library's v6 API is asynchronous;
 * cards are plain JSON in SQLite and are revived before each scheduling call.
 */

import { randomUUID } from 'node:crypto';
import { DefaultScheduler, Rating, type Grade } from 'ts-fsrs';
import type { CardFactory } from './learning';

export const SCHEDULER_VERSION = 'ts-fsrs-6.0.1/FSRS-7';
export const DEFAULT_DESIRED_RETENTION = 0.9;
export const MIN_DESIRED_RETENTION = 0.8;
export const MAX_DESIRED_RETENTION = 0.95;

export function clampDesiredRetention(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DESIRED_RETENTION;
  return Math.min(MAX_DESIRED_RETENTION, Math.max(MIN_DESIRED_RETENTION, value));
}

export function gradeFromRating(rating: number): Grade {
  if (rating === Rating.Again) return Rating.Again;
  if (rating === Rating.Hard) return Rating.Hard;
  if (rating === Rating.Good) return Rating.Good;
  if (rating === Rating.Easy) return Rating.Easy;
  throw new Error(`Unknown rating: ${rating}`);
}

export type SchedulerInstance = Awaited<ReturnType<typeof DefaultScheduler>>;

const cache = new Map<number, Promise<SchedulerInstance>>();

/** Called when a profile changes desired retention; stored cards are untouched. */
export function clearSchedulerCache(): void {
  cache.clear();
}

export function getScheduler(
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): Promise<SchedulerInstance> {
  let scheduler = cache.get(desiredRetention);
  if (scheduler === undefined) {
    scheduler = DefaultScheduler({ desiredRetention, enableFuzz: false, enableShortTerm: true });
    cache.set(desiredRetention, scheduler);
  }
  return scheduler;
}

/** Used by tests and by the review service to get a fresh, isolated scheduler. */
export function createScheduler(desiredRetention: number = DEFAULT_DESIRED_RETENTION) {
  return DefaultScheduler({ desiredRetention, enableFuzz: false, enableShortTerm: true });
}

export async function createCardFactory(
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): Promise<CardFactory> {
  const scheduler = await getScheduler(desiredRetention);
  return (_itemKey, _skill, nowMs) => {
    const card = scheduler.newCard({ now: new Date(nowMs) });
    return {
      cardId: card.cardId === undefined ? randomUUID() : String(card.cardId),
      dueAt: new Date(card.dueAt).toISOString(),
      stateJson: JSON.stringify(card),
      schedulerVersion: SCHEDULER_VERSION,
    };
  };
}

/** Revive JSON card state, including Date fields the scheduler requires. */
export function reviveCard<T>(stateJson: string): T {
  const parsed = JSON.parse(stateJson) as Record<string, unknown>;
  for (const key of ['dueAt', 'lastReviewAt']) {
    const value = parsed[key];
    if (typeof value === 'string') {
      parsed[key] = new Date(value);
    }
  }
  return parsed as T;
}
