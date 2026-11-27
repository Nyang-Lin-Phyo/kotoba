/**
 * FSRS review flow. Every rating updates the card, appends a review log and
 * writes a study event in one transaction. Undo is a recorded reversal.
 */

import { randomUUID } from 'node:crypto';
import type { RatingInput, ReviewCardDetail } from '../../shared/contracts';
import type { Db } from '../database/connection';
import { transaction } from '../database/connection';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  getCard,
  listCards,
  updateCard,
  type ReviewCardRow,
} from '../database/repositories/reviewCards';
import { listUserVocabulary } from '../database/repositories/vocabulary';
import { getActiveProfile } from '../database/repositories/profiles';
import { todayInZone } from '../../shared/date';
import { AppError } from '../../shared/errors';
import { chooseTeaching, orderReviewQueue } from '../../shared/vocabularyRules';
import type { ReviewQueueFacts } from '../../shared/vocabularyRules';
import { gradeFromRating, getScheduler, reviveCard, SCHEDULER_VERSION } from './fsrsScheduler';

export type ReviewQueueItem = {
  readonly cardId: string;
  readonly itemKey: string;
  readonly skill: 'meaning' | 'reading';
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly dueAt: string;
  readonly lapses: number;
};

export type RatingResult = {
  readonly correct: boolean;
  readonly dueAtMs: number;
  readonly rating: number;
  readonly duplicate: boolean;
};

function requireProfile(db: Db): { readonly id: string; readonly timezone: string } {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return { id: profile.id, timezone: profile.timezone };
}

export function getCardDetail(db: Db, cardId: string): ReviewCardDetail | null {
  const profile = requireProfile(db);
  const row = getCard(db, profile.id, cardId);
  if (row === null) return null;
  return {
    cardId: row.id,
    itemKey: row.itemKey,
    skill: row.skill,
    stateJson: row.stateJson,
    dueAt: row.dueAt,
    reps: row.reps,
    lapses: row.lapses,
  };
}

export async function getReviewQueue(
  db: Db,
  nowMs: number,
  limit: number,
): Promise<{ readonly items: readonly ReviewQueueItem[]; readonly remaining: number }> {
  const profile = requireProfile(db);
  const rows = listCards(db, profile.id).filter((card) => Date.parse(card.dueAt) <= nowMs);
  const personal = new Map(
    listUserVocabulary(db, profile.id).map((row) => [row.itemKey, row]),
  );

  const facts: (ReviewQueueFacts & { readonly card: ReviewCardRow })[] = rows.map((card) => ({
    card,
    itemKey: card.itemKey,
    skill: card.skill,
    dueAtMs: Date.parse(card.dueAt),
    lapses: card.lapses,
  }));

  const items = orderReviewQueue(facts)
    .slice(0, limit)
    .flatMap(({ card }) => {
      const vocabulary = personal.get(card.itemKey);
      if (vocabulary === undefined) return [];
      const teaching = chooseTeaching(vocabulary.snapshot);
      if (teaching === null) return [];
      return [
        {
          cardId: card.id,
          itemKey: card.itemKey,
          skill: card.skill,
          form: teaching.form,
          reading: teaching.reading,
          english: teaching.sense.english,
          dueAt: card.dueAt,
          lapses: card.lapses,
        },
      ];
    });

  return { items, remaining: Math.max(0, rows.length - items.length) };
}

export async function submitRating(
  db: Db,
  input: RatingInput,
  eventId: string,
  nowMs: number,
): Promise<RatingResult> {
  const profile = requireProfile(db);
  const retention = getActiveProfile(db)?.preferences.desiredRetention ?? 0.9;
  const scheduler = await getScheduler(retention);

  return transaction(db, () => {
    const existingEvent = findEvent(db, eventId);
    if (existingEvent !== null) {
      const previous = JSON.parse(existingEvent.payloadJson) as RatingResult;
      return { ...previous, duplicate: true };
    }

    const card = getCard(db, profile.id, input.cardId);
    if (card === null) throw AppError.notFound('That review card does not exist.');
    if (card.stateJson !== input.expectedStateJson) {
      throw new AppError(
        'CONFLICT',
        'This card changed elsewhere. Refresh before rating again.',
        undefined,
        {
          cardId: card.id,
          itemKey: card.itemKey,
          skill: card.skill,
          stateJson: card.stateJson,
          dueAt: card.dueAt,
          reps: card.reps,
          lapses: card.lapses,
        },
      );
    }
    if (input.responseMs < 0 || input.responseMs > 600_000) {
      throw AppError.validation('Response time is out of range.', 'responseMs');
    }

    const state = reviveCard<Record<string, unknown>>(card.stateJson);
    const nowIso = new Date(nowMs).toISOString();
    const result = scheduler.review({
      card: state,
      grade: gradeFromRating(input.rating),
      now: new Date(nowMs),
    } as never);
    const newStateJson = JSON.stringify(result.card);
    const dueAt = new Date(result.card.dueAt).toISOString();
    const correct = input.rating !== 1;
    const dayKey = todayInZone(profile.timezone, nowMs);

    updateCard(
      db,
      card.id,
      {
        dueAt,
        stateJson: newStateJson,
        lastReviewAt: nowIso,
        reps: result.card.reps,
        lapses: result.card.lapses,
      },
      nowIso,
    );

    db.prepare(
      `insert into review_logs (
         id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
         hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)`,
    ).run(
      randomUUID(),
      eventId,
      card.id,
      profile.id,
      nowIso,
      dayKey,
      input.rating,
      Number(correct),
      Number(input.hintUsed),
      input.responseMs,
      card.stateJson,
      newStateJson,
      SCHEDULER_VERSION,
    );

    insertEvent(db, {
      eventId,
      profileId: profile.id,
      dayKey,
      type: 'review.rated',
      payloadJson: JSON.stringify({ cardId: card.id, rating: input.rating, correct }),
      occurredAt: nowIso,
    });

    const payload: RatingResult = {
      correct,
      dueAtMs: Date.parse(dueAt),
      rating: input.rating,
      duplicate: false,
    };
    return payload;
  });
}

export function undoLast(
  db: Db,
  input: { readonly cardId: string; readonly eventId: string },
  nowMs: number,
): { readonly restored: boolean; readonly dueAtMs: number } {
  const profile = requireProfile(db);

  return transaction(db, () => {
    const existingEvent = findEvent(db, input.eventId);
    if (existingEvent !== null) {
      const previous = JSON.parse(existingEvent.payloadJson) as { restored: boolean; dueAtMs: number };
      return previous;
    }

    const last = db
      .prepare(
        `select * from review_logs
         where card_id = ? and profile_id = ? and undo_of is null
         order by reviewed_at desc, id desc limit 1`,
      )
      .get(input.cardId, profile.id) as
      | {
          id: string;
          rating: number;
          correct: number;
          hint_used: number;
          response_ms: number;
          prior_state_json: string;
          new_state_json: string;
        }
      | undefined;
    if (last === undefined) throw AppError.notFound('There is no review to undo.');

    const card = getCard(db, profile.id, input.cardId);
    if (card === null) throw AppError.notFound('That review card does not exist.');

    const prior = reviveCard<{ dueAt: string | Date; reps: number; lapses: number }>(
      last.prior_state_json,
    );
    const dueAt = new Date(prior.dueAt).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    const dayKey = todayInZone(profile.timezone, nowMs);

    updateCard(
      db,
      card.id,
      {
        dueAt,
        stateJson: last.prior_state_json,
        reps: prior.reps,
        lapses: prior.lapses,
        lastReviewAt: null,
      },
      nowIso,
    );

    db.prepare(
      `insert into review_logs (
         id, event_id, card_id, profile_id, reviewed_at, day_key, rating, correct,
         hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      input.eventId,
      card.id,
      profile.id,
      nowIso,
      dayKey,
      last.rating,
      last.correct,
      last.hint_used,
      last.response_ms,
      last.new_state_json,
      last.prior_state_json,
      SCHEDULER_VERSION,
      last.id,
    );

    const result = { restored: true, dueAtMs: Date.parse(dueAt) };
    insertEvent(db, {
      eventId: input.eventId,
      profileId: profile.id,
      dayKey,
      type: 'review.undo',
      payloadJson: JSON.stringify(result),
      occurredAt: nowIso,
    });
    return result;
  });
}
