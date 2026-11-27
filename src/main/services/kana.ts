/**
 * Kana study service.
 *
 * Attempts, progress and the event log are written in one transaction, with
 * `eventId` as the idempotency key. A retry returns the stored result instead
 * of counting the same answer twice.
 */

import { randomUUID } from 'node:crypto';
import type {
  AttemptResult,
  KanaLesson,
  KanaReviewItem,
  KanaSummary,
} from '../../shared/contracts';
import { addDays, todayInZone, type DateKey } from '../../shared/date';
import { AppError } from '../../shared/errors';
import { kanaAnswerCorrect } from '../../shared/kanaAnswer';
import { findKanaItem, KANA_GROUPS } from '../../shared/kanaData';
import {
  classifyKana,
  dueDayAfterFailure,
  dueDayAfterSuccess,
  isKanaDue,
  masteryFromAttempts,
  orderReviewQueue,
  type KanaAttemptFact,
  type KanaProgressFacts,
  type KanaStatus,
  type ReviewQueueItem,
} from '../../shared/kanaRules';
import type { KanaAttemptInput, KanaLessonInput } from '../../shared/schemas';
import { transaction, type Db } from '../database/connection';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  countKanaAttempts,
  countRecentFailureDays,
  countUnhintedTyped,
  countUnhintedTypedCorrect,
  getKanaProgress,
  insertKanaAttempt,
  listKanaAttemptFacts,
  listKanaProgress,
  upsertKanaProgress,
  type KanaProgressRow,
} from '../database/repositories/kana';
import { getActiveProfile } from '../database/repositories/profiles';

function requireProfileId(db: Db): { readonly id: string; readonly timezone: string } {
  const profile = getActiveProfile(db);
  if (profile === null) {
    throw AppError.notFound('No profile exists yet. Finish setup first.');
  }
  return { id: profile.id, timezone: profile.timezone };
}

function emptyFacts(): KanaProgressFacts {
  return {
    correctUnhinted: 0,
    correctDays: 0,
    lastUnhintedCorrect: null,
    verified: false,
    lapses: 0,
    intervalTier: 0,
    lastAttemptCorrect: null,
    failureDaysLast7: 0,
    dueDay: null,
  };
}

function toFacts(row: KanaProgressRow, failureDaysLast7: number): KanaProgressFacts {
  return {
    correctUnhinted: row.correctUnhinted,
    correctDays: row.correctDays,
    // The row stores the last attempt's result, which may be hinted. Mastery
    // itself is computed from raw attempt facts, not from this flag.
    lastUnhintedCorrect: null,
    verified: row.verified,
    lapses: row.lapses,
    intervalTier: row.intervalTier,
    lastAttemptCorrect: row.lastAttemptCorrect,
    failureDaysLast7,
    dueDay: row.dueDay,
  };
}

export function getKanaCatalog(): readonly (typeof KANA_GROUPS)[number][] {
  return KANA_GROUPS;
}

export function submitKanaAttempt(
  db: Db,
  input: KanaAttemptInput,
  eventId: string,
  nowMs: number,
): AttemptResult {
  const profile = requireProfileId(db);
  const dayKey = todayInZone(profile.timezone, nowMs);
  const item = findKanaItem(input.kanaId);
  if (item === undefined) {
    throw AppError.validation('That kana character does not exist.', 'kanaId');
  }

  return transaction(db, () => {
    const existing = findEvent(db, eventId);
    if (existing !== null) {
      const previous = JSON.parse(existing.payloadJson) as AttemptResult;
      return { ...previous, duplicate: true };
    }

    const prior = getKanaProgress(db, profile.id, input.kanaId);
    const priorFacts = listKanaAttemptFacts(db, profile.id, input.kanaId);

    const correct = kanaAnswerCorrect(item, input.raw);
    const newFact: KanaAttemptFact = {
      dayKey,
      correct,
      hintUsed: input.hintUsed,
      mode: input.mode,
    };
    const allFacts = [...priorFacts, newFact];
    const verified = masteryFromAttempts(allFacts);

    const qualifying = allFacts.filter(
      (fact) => fact.correct && !fact.hintUsed && fact.mode === 'typed',
    );
    const correctDays = new Set(qualifying.map((fact) => fact.dayKey)).size;

    const intervalTier = !correct
      ? 0
      : verified
        ? Math.min(3, (prior?.intervalTier ?? 0) + 1)
        : (prior?.intervalTier ?? 0);
    const dueDay: DateKey = !correct
      ? dueDayAfterFailure(dayKey)
      : verified
        ? dueDayAfterSuccess(dayKey, Math.max(0, intervalTier - 1))
        : dayKey;

    const sinceKey = addDays(dayKey, -6);
    const failureDaysLast7 = countRecentFailureDays(db, profile.id, input.kanaId, dayKey, sinceKey);

    const updated: KanaProgressRow = {
      profileId: profile.id,
      kanaId: input.kanaId,
      correctUnhinted: qualifying.length,
      correctDays,
      firstCorrectDay: correct ? (prior?.firstCorrectDay ?? dayKey) : (prior?.firstCorrectDay ?? null),
      lastCorrectDay: correct ? dayKey : (prior?.lastCorrectDay ?? null),
      lastAttemptDay: dayKey,
      lastAttemptCorrect: correct,
      lapses: (prior?.lapses ?? 0) + (correct ? 0 : 1),
      dueDay,
      verified,
      intervalTier,
      schedulerVersion: 'interval-v1',
      updatedAt: new Date(nowMs).toISOString(),
    };

    const status: KanaStatus = classifyKana(toFacts(updated, failureDaysLast7));

    const result: AttemptResult = {
      correct,
      expected: item.reading,
      status,
      verified,
      eventId,
      duplicate: false,
    };

    upsertKanaProgress(db, updated);
    insertKanaAttempt(db, {
      id: randomUUID(),
      profileId: profile.id,
      kanaId: input.kanaId,
      dayKey,
      mode: input.mode,
      raw: input.raw,
      correct,
      hintUsed: input.hintUsed,
      responseMs: input.responseMs,
      attemptedAt: new Date(nowMs).toISOString(),
      eventId,
    });
    insertEvent(db, {
      eventId,
      profileId: profile.id,
      dayKey,
      type: 'kana.attempt',
      payloadJson: JSON.stringify(result),
      occurredAt: new Date(nowMs).toISOString(),
    });

    return result;
  });
}

export function getKanaLesson(
  db: Db,
  lesson: KanaLessonInput,
  nowMs: number = Date.now(),
): KanaLesson {
  const profile = requireProfileId(db);
  const group = KANA_GROUPS.find(
    (entry) => entry.script === lesson.script && entry.id === lesson.groupId,
  );
  if (group === undefined) {
    throw AppError.notFound('That kana group does not exist.');
  }

  const todayKey = todayInZone(profile.timezone, nowMs);
  const byId = new Map(listKanaProgress(db, profile.id).map((row) => [row.kanaId, row]));

  return {
    script: group.script,
    groupId: group.id,
    label: group.label,
    items: [...group.items],
    statuses: group.items.map((item) => {
      const row = byId.get(item.id);
      const failureDays =
        row === undefined
          ? 0
          : countRecentFailureDays(db, profile.id, item.id, todayKey, addDays(todayKey, -6));
      return {
        kanaId: item.id,
        status: row === undefined ? classifyKana(emptyFacts()) : classifyKana(toFacts(row, failureDays)),
        dueDay: row?.dueDay ?? null,
      };
    }),
  };
}

export function getKanaReviewQueue(
  db: Db,
  nowMs: number = Date.now(),
): readonly KanaReviewItem[] {
  const profile = requireProfileId(db);
  const todayKey = todayInZone(profile.timezone, nowMs);

  const queueItems: ReviewQueueItem[] = listKanaProgress(db, profile.id).map((row) => ({
    kanaId: row.kanaId,
    dueDay: row.dueDay,
    lapses: row.lapses,
    failedToday: row.lastAttemptDay === todayKey && row.lastAttemptCorrect === false,
  }));

  return orderReviewQueue(queueItems, todayKey).flatMap((item) => {
    const kana = findKanaItem(item.kanaId);
    if (kana === undefined) return [];
    return [
      {
        kanaId: item.kanaId,
        character: kana.character,
        reading: kana.reading,
        dueDay: item.dueDay,
        lapses: item.lapses,
        failedToday: item.failedToday,
      },
    ];
  });
}

export function getKanaSummary(db: Db, nowMs: number = Date.now()): KanaSummary {
  const profile = requireProfileId(db);
  const todayKey = todayInZone(profile.timezone, nowMs);
  const rows = listKanaProgress(db, profile.id);
  const byId = new Map(rows.map((row) => [row.kanaId, row]));

  const counts = { unseen: 0, learning: 0, verified: 0, struggling: 0, due: 0 };
  const statuses: Record<string, KanaStatus> = {};
  const perScript = {
    hiragana: { total: 0, verified: 0 },
    katakana: { total: 0, verified: 0 },
  };

  for (const group of KANA_GROUPS) {
    perScript[group.script].total += group.items.length;
    for (const item of group.items) {
      const row = byId.get(item.id);
      const failureDays =
        row === undefined
          ? 0
          : countRecentFailureDays(db, profile.id, item.id, todayKey, addDays(todayKey, -6));
      const status = row === undefined ? classifyKana(emptyFacts()) : classifyKana(toFacts(row, failureDays));
      counts[status] += 1;
      statuses[item.id] = status;
      if (row !== undefined && isKanaDue(row.dueDay, todayKey)) {
        counts.due += 1;
      }
      if (status === 'verified') {
        perScript[group.script].verified += 1;
      }
    }
  }

  const unhintedTyped = countUnhintedTyped(db, profile.id);
  const unhintedTypedCorrect = countUnhintedTypedCorrect(db, profile.id);

  return {
    attempts: countKanaAttempts(db, profile.id),
    accuracy: unhintedTyped === 0 ? 0 : unhintedTypedCorrect / unhintedTyped,
    unseen: counts.unseen,
    learning: counts.learning,
    verified: counts.verified,
    struggling: counts.struggling,
    due: counts.due,
    total: KANA_GROUPS.reduce((sum, group) => sum + group.items.length, 0),
    perScript,
    statuses,
  };
}
