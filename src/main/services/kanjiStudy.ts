/** Kanji drawn from the learner's own introduced vocabulary. */

import { randomUUID } from 'node:crypto';
import { addDays, todayInZone } from '../../shared/date';
import type { DictionaryKanji } from '../../shared/contracts';
import { AppError } from '../../shared/errors';
import { evaluateKanji } from '../../shared/kanjiRules';
import { transaction, type Db } from '../database/connection';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  getKanji,
  insertKanjiAttempt,
  listKanji,
  listKanjiAttempts,
  upsertKanji,
  type KanjiStatus,
} from '../database/repositories/kanjiProgress';
import { getActiveProfile } from '../database/repositories/profiles';
import { listUserVocabulary } from '../database/repositories/vocabulary';

export const KANJI_RULE_NOTE =
  'Encountered means the character appears in a word you have introduced. Verified recognition ' +
  'requires at least three unhinted correct answers on at least two different days, with the ' +
  'latest answer correct and a current interval of at least seven days (kanji-interval-v1). ' +
  'A missed or hinted answer resets the streak and the interval to one day.';

export type PersonalKanjiDTO = {
  readonly literal: string;
  readonly wordContext: string;
  readonly status: KanjiStatus | 'struggling';
  readonly verified: boolean;
  readonly dueDay: string | null;
  readonly intervalDays: number;
  readonly reps: number;
  readonly lapses: number;
  readonly firstDayKey: string;
};

export type KanjiAttemptDTO = {
  readonly dayKey: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly wordContext: string;
};

export type KanjiDetailDTO = PersonalKanjiDTO & {
  readonly dictionary: DictionaryKanji | null;
  readonly attempts: readonly KanjiAttemptDTO[];
  readonly quiz: { readonly word: string; readonly reading: string; readonly meaning: string } | null;
  readonly ruleNote: string;
};

export type KanjiAttemptInput = {
  readonly eventId: string;
  readonly literal: string;
  readonly correct: boolean;
  readonly hintUsed: boolean;
  readonly responseMs: number;
  readonly wordContext: string;
};

function requireProfile(db: Db) {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return profile;
}

function sourceWordForLiteral(db: Db, profileId: string, literal: string) {
  return listUserVocabulary(db, profileId).find(
    (word) => word.introducedAt !== null && word.snapshot.kanji.includes(literal),
  ) ?? null;
}

function wordContextsByLiteral(db: Db, profileId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of listUserVocabulary(db, profileId)) {
    if (row.introducedAt === null) continue;
    for (const literal of row.snapshot.kanji) {
      if (!map.has(literal)) map.set(literal, row.snapshot.canonicalForm);
    }
  }
  return map;
}

/** Idempotently discover kanji in introduced words. Returns the number of new characters. */
export function syncKanjiFromVocabulary(db: Db, nowMs: number): number {
  const profile = requireProfile(db);
  return transaction(db, () => {
    const todayKey = todayInZone(profile.timezone, nowMs);
    let added = 0;
    for (const literal of wordContextsByLiteral(db, profile.id).keys()) {
      const existing = getKanji(db, profile.id, literal);
      if (existing !== null) continue;
      upsertKanji(db, {
        id: randomUUID(),
        profileId: profile.id,
        literal,
        firstDayKey: sourceWordForLiteral(db, profile.id, literal)?.introducedDayKey ?? todayKey,
        status: 'encountered',
        dueDay: todayKey,
        intervalDays: 0,
        reps: 0,
        lapses: 0,
        lastAttemptDay: null,
        updatedAt: new Date(nowMs).toISOString(),
      });
      added += 1;
    }
    return added;
  });
}

function evaluateRow(db: Db, profileId: string, literal: string) {
  const attempts = listKanjiAttempts(db, profileId, literal);
  const evaluation = evaluateKanji(attempts);
  return { attempts, evaluation };
}

export function listPersonalKanji(db: Db, nowMs: number): readonly PersonalKanjiDTO[] {
  syncKanjiFromVocabulary(db, nowMs);
  const profile = requireProfile(db);
  const contexts = wordContextsByLiteral(db, profile.id);
  return listKanji(db, profile.id).map((row) => {
    const { evaluation } = evaluateRow(db, profile.id, row.literal);
    return {
      literal: row.literal,
      wordContext: contexts.get(row.literal) ?? '',
      status: evaluation.status,
      verified: evaluation.verified,
      dueDay: row.dueDay,
      intervalDays: evaluation.intervalDays,
      reps: row.reps,
      lapses: row.lapses,
      firstDayKey: row.firstDayKey,
    };
  });
}

export function getKanjiDetail(
  db: Db,
  lookup: (literal: string) => DictionaryKanji | null,
  literal: string,
  nowMs: number,
): KanjiDetailDTO | null {
  syncKanjiFromVocabulary(db, nowMs);
  const profile = requireProfile(db);
  const row = getKanji(db, profile.id, literal);
  if (row === null) return null;
  const { attempts, evaluation } = evaluateRow(db, profile.id, literal);
  const contexts = wordContextsByLiteral(db, profile.id);
  const sourceWord = sourceWordForLiteral(db, profile.id, literal);
  const quiz = sourceWord === null
    ? null
    : {
        word: sourceWord.snapshot.canonicalForm,
        reading:
          sourceWord.snapshot.readings.find((reading) =>
            reading.appliesTo.includes(sourceWord.snapshot.canonicalForm))?.text
          ?? sourceWord.snapshot.readings[0]?.text
          ?? '',
        meaning: sourceWord.snapshot.senses[0]?.english ?? '',
      };
  return {
    literal,
    wordContext: contexts.get(literal) ?? '',
    status: evaluation.status,
    verified: evaluation.verified,
    dueDay: row.dueDay,
    intervalDays: evaluation.intervalDays,
    reps: row.reps,
    lapses: row.lapses,
    firstDayKey: row.firstDayKey,
    dictionary: lookup(literal),
    quiz,
    attempts: attempts.map((attempt) => ({
      dayKey: attempt.dayKey,
      correct: attempt.correct,
      hintUsed: attempt.hintUsed,
      responseMs: attempt.responseMs,
      wordContext: attempt.wordContext,
    })),
    ruleNote: KANJI_RULE_NOTE,
  };
}

export function submitKanjiAttempt(db: Db, input: KanjiAttemptInput, nowMs: number): PersonalKanjiDTO {
  const profile = requireProfile(db);
  if ([...input.literal].length !== 1) {
    throw AppError.validation('A kanji attempt must name a single character.', 'literal');
  }
  if (!Number.isInteger(input.responseMs) || input.responseMs < 0 || input.responseMs > 600_000) {
    throw AppError.validation('Response time must be between 0 and 600000 milliseconds.', 'responseMs');
  }
  if (input.wordContext.length > 80) {
    throw AppError.validation('Word context is too long.', 'wordContext');
  }

  syncKanjiFromVocabulary(db, nowMs);
  return transaction(db, () => {
    const previous = findEvent(db, input.eventId);
    if (previous !== null) {
      if (previous.type !== 'kanji.attempted') {
        throw AppError.conflict('That event id belongs to a different action.', 'eventId');
      }
      const payload = JSON.parse(previous.payloadJson) as { literal: string };
      const existing = getKanji(db, profile.id, payload.literal);
      if (existing === null) throw AppError.notFound('The original kanji record no longer exists.');
      const { evaluation } = evaluateRow(db, profile.id, payload.literal);
      const contexts = wordContextsByLiteral(db, profile.id);
      return {
        literal: payload.literal,
        wordContext: contexts.get(payload.literal) ?? '',
        status: evaluation.status,
        verified: evaluation.verified,
        dueDay: existing.dueDay,
        intervalDays: evaluation.intervalDays,
        reps: existing.reps,
        lapses: existing.lapses,
        firstDayKey: existing.firstDayKey,
      };
    }

    const existing = getKanji(db, profile.id, input.literal);
    if (existing === null) {
      throw AppError.notFound('Introduce a word containing this character before studying it.');
    }
    const todayKey = todayInZone(profile.timezone, nowMs);
    insertKanjiAttempt(db, {
      id: randomUUID(),
      profileId: profile.id,
      literal: input.literal,
      dayKey: todayKey,
      attemptedAt: new Date(nowMs).toISOString(),
      correct: input.correct,
      hintUsed: input.hintUsed,
      responseMs: input.responseMs,
      wordContext: input.wordContext,
    });
    const { attempts, evaluation } = evaluateRow(db, profile.id, input.literal);
    const row = {
      id: existing.id,
      profileId: profile.id,
      literal: input.literal,
      firstDayKey: existing.firstDayKey,
      status: evaluation.status === 'struggling' ? 'learning' : evaluation.status,
      dueDay: addDays(todayKey, evaluation.intervalDays),
      intervalDays: evaluation.intervalDays,
      reps: attempts.length,
      lapses: attempts.filter((attempt) => !attempt.correct).length,
      lastAttemptDay: todayKey,
      updatedAt: new Date(nowMs).toISOString(),
    };
    upsertKanji(db, row);
    insertEvent(db, {
      eventId: input.eventId,
      profileId: profile.id,
      dayKey: todayKey,
      type: 'kanji.attempted',
      payloadJson: JSON.stringify({ literal: input.literal }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    const contexts = wordContextsByLiteral(db, profile.id);
    return {
      literal: row.literal,
      wordContext: contexts.get(row.literal) ?? '',
      status: evaluation.status,
      verified: evaluation.verified,
      dueDay: row.dueDay,
      intervalDays: row.intervalDays,
      reps: row.reps,
      lapses: row.lapses,
      firstDayKey: row.firstDayKey,
    };
  });
}
