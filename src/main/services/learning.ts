/**
 * Daily vocabulary lesson and personal library.
 *
 * Introduction is one transaction: snapshot + item + two skill cards + event.
 * The renderer never owns counts; every figure is derived from these rows.
 */

import { randomUUID } from 'node:crypto';
import type { DictionaryEntry, LearningSummary, VocabularyDetail, VocabularyLibraryResult } from '../../shared/contracts';
import { addDays, todayInZone, type DateKey } from '../../shared/date';
import { AppError } from '../../shared/errors';
import { normalizeKanaInput } from '../../shared/kanaAnswer';
import {
  accuracyFromRatings,
  chooseTeaching,
  classifyWord,
  isVerifiedRecognition,
  selectNewItems,
  type SkillMetricFacts,
} from '../../shared/vocabularyRules';
import { transaction, type Db } from '../database/connection';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  getDailyNewItems,
  getByItem,
  insertDailyNewItems,
  insertDiagnostic,
  insertUserVocabulary,
  listUserVocabulary,
  setDailyNewItemState,
  updateUserVocabulary,
  type DailyNewItemRow,
} from '../database/repositories/vocabulary';
import { markMinedIntroducedForEntry } from '../database/repositories/minedItems';
import { getCardForSkill, insertCard, listCards } from '../database/repositories/reviewCards';
import { getActiveProfile } from '../database/repositories/profiles';

export type LessonDictionary = {
  readonly listCandidateIds: (limit: number) => string[];
  readonly getEntry: (id: string) => DictionaryEntry | null;
};

export type NewCardValues = {
  readonly cardId: string;
  readonly dueAt: string;
  readonly stateJson: string;
  readonly schedulerVersion: string;
};

export type CardFactory = (
  itemKey: string,
  skill: 'meaning' | 'reading',
  nowMs: number,
) => NewCardValues;

export type LessonItem = {
  readonly itemKey: string;
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly state: DailyNewItemRow['state'];
};

export type LessonResult = {
  readonly dayKey: DateKey;
  readonly items: readonly LessonItem[];
  readonly summary: LearningSummary;
};

function requireProfile(db: Db): { readonly id: string; readonly timezone: string } {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet. Finish setup first.');
  return { id: profile.id, timezone: profile.timezone };
}

function todayPlan(db: Db, profileId: string, dayKey: DateKey): { id: string; targetWords: number } {
  const row = db
    .prepare('select id, target_words from daily_plans where profile_id = ? and day_key = ?')
    .get(profileId, dayKey) as { id: string; target_words: number } | undefined;
  if (row === undefined) throw AppError.notFound('No plan exists for today.');
  return { id: row.id, targetWords: row.target_words };
}

function buildSummary(db: Db, profileId: string, nowMs: number): LearningSummary {
  const rows = listUserVocabulary(db, profileId);
  const introduced = rows.filter((row) => row.introducedAt !== null).length;
  const introducedRows = rows.filter((row) => row.introducedAt !== null);
  const familiar = rows.filter((row) => row.familiarityFlag && row.introducedAt === null).length;
  const due = (
    db
      .prepare(
        `select count(*) c from review_cards
         where profile_id = ? and item_type = 'vocabulary' and due_at <= ?`,
      )
      .get(profileId, new Date(nowMs).toISOString()) as { c: number }
  ).c;

  const dayKey = todayInZone(requireProfile(db).timezone, nowMs);
  const sinceKey = addDays(dayKey, -6);
  const logs = db
    .prepare(
      `select l.day_key, l.rating, l.correct, l.hint_used, c.item_key, c.skill
       from review_logs l join review_cards c on c.id = l.card_id
       where l.profile_id = ? and l.undo_of is null`,
    )
    .all(profileId) as {
    day_key: string;
    rating: number;
    correct: number;
    hint_used: number;
    item_key: string;
    skill: 'meaning' | 'reading';
  }[];

  const statuses = introducedRows.map((row) => {
    const skills: SkillMetricFacts[] = (['meaning', 'reading'] as const).flatMap((skill) => {
      const card = getCardForSkill(db, profileId, row.itemKey, skill);
      if (card === null) return [];
      const skillLogs = logs
        .filter((log) => log.item_key === row.itemKey && log.skill === skill)
        .toSorted((left, right) => left.day_key.localeCompare(right.day_key));
      const latest = skillLogs.at(-1);
      const state = JSON.parse(card.stateJson) as { scheduledDays?: number };
      return [
        {
          distinctSuccessDays: new Set(
            skillLogs.filter((log) => log.correct === 1 && log.hint_used === 0).map((log) => log.day_key),
          ).size,
          latestSuccess: latest?.correct === 1 && latest.hint_used === 0,
          intervalDays: Math.floor(Number(state.scheduledDays ?? 0)),
          lapses7d: skillLogs.filter((log) => log.correct === 0 && log.day_key >= sinceKey).length,
          latestRatingAgain: latest?.rating === 1,
        },
      ];
    });
    return skills.length === 2 && isVerifiedRecognition(skills)
      ? ('verified' as const)
      : classifyWord(skills);
  });

  const verified = statuses.filter((status) => status === 'verified').length;
  const struggling = statuses.filter((status) => status === 'struggling').length;

  return {
    introduced,
    familiar,
    learning: Math.max(0, introduced - verified),
    struggling,
    verified,
    due,
    accuracy: accuracyFromRatings(
      logs.map((log) => ({ correct: log.correct === 1, hintUsed: log.hint_used === 1 })),
    ),
  };
}

export function getLesson(
  db: Db,
  dictionary: LessonDictionary,
  nowMs: number = Date.now(),
): LessonResult {
  const profile = requireProfile(db);
  const dayKey = todayInZone(profile.timezone, nowMs);
  const plan = todayPlan(db, profile.id, dayKey);

  transaction(db, () => {
    if (getDailyNewItems(db, plan.id).length > 0) return;

    const personal = listUserVocabulary(db, profile.id);
    const introduced = new Set(personal.filter((row) => row.introducedAt !== null).map((row) => row.itemKey));
    const familiar = new Set(personal.filter((row) => row.familiarityFlag).map((row) => row.itemKey));
    const teachable = dictionary.listCandidateIds(200).filter((itemKey) => {
      const entry = dictionary.getEntry(itemKey);
      return entry !== null && chooseTeaching(entry) !== null;
    });
    const selected = selectNewItems(teachable, introduced, familiar, plan.targetWords);
    insertDailyNewItems(
      db,
      selected.map((itemKey, position) => ({
        id: randomUUID(),
        planId: plan.id,
        profileId: profile.id,
        itemKey,
        position,
        state: 'assigned' as const,
      })),
    );
  });

  const assigned = getDailyNewItems(db, plan.id).filter((row) => row.state !== 'familiar');
  const items = assigned.flatMap((row) => {
    const entry = dictionary.getEntry(row.itemKey);
    if (entry === null) return [];
    const teaching = chooseTeaching(entry);
    if (teaching === null) return [];
    return [
      {
        itemKey: row.itemKey,
        form: teaching.form,
        reading: teaching.reading,
        english: teaching.sense.english,
        state: row.state,
      },
    ];
  });

  return { dayKey, items, summary: buildSummary(db, profile.id, nowMs) };
}

export function getSummary(db: Db, nowMs: number = Date.now()): LearningSummary {
  const profile = requireProfile(db);
  return buildSummary(db, profile.id, nowMs);
}

export function introduceWord(
  db: Db,
  dictionary: LessonDictionary,
  input: { readonly itemId: string },
  eventId: string,
  nowMs: number,
  createCard: CardFactory,
): { readonly introduced: boolean; readonly duplicate: boolean; readonly itemKey: string } {
  const profile = requireProfile(db);
  const dayKey = todayInZone(profile.timezone, nowMs);
  const nowIso = new Date(nowMs).toISOString();

  return transaction(db, () => {
    const existingEvent = findEvent(db, eventId);
    if (existingEvent !== null) {
      return { introduced: false, duplicate: true, itemKey: input.itemId };
    }

    const existing = getByItem(db, profile.id, input.itemId);
    if (existing !== null) {
      throw AppError.conflict('This word is already in your personal library.');
    }

    const snapshot = dictionary.getEntry(input.itemId);
    if (snapshot === null) throw AppError.notFound('That dictionary entry does not exist.');

    insertUserVocabulary(db, {
      id: randomUUID(),
      profileId: profile.id,
      itemKey: input.itemId,
      sourceEntryId: snapshot.sourceId,
      snapshot,
      introducedAt: nowIso,
      introducedDayKey: dayKey,
      familiarityFlag: false,
      notes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    markMinedIntroducedForEntry(db, profile.id, snapshot.id);
    markMinedIntroducedForEntry(db, profile.id, snapshot.sourceId);

    for (const skill of ['meaning', 'reading'] as const) {
      const card = createCard(input.itemId, skill, nowMs);
      insertCard(db, {
        id: randomUUID(),
        profileId: profile.id,
        itemType: 'vocabulary',
        itemKey: input.itemId,
        skill,
        schedulerVersion: card.schedulerVersion,
        dueAt: card.dueAt,
        stateJson: card.stateJson,
        lastReviewAt: null,
        reps: 0,
        lapses: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    const plan = db
      .prepare('select id from daily_plans where profile_id = ? and day_key = ?')
      .get(profile.id, dayKey) as { id: string } | undefined;
    if (plan !== undefined) setDailyNewItemState(db, plan.id, input.itemId, 'introduced');

    insertEvent(db, {
      eventId,
      profileId: profile.id,
      dayKey,
      type: 'vocabulary.introduced',
      payloadJson: JSON.stringify({ itemKey: input.itemId }),
      occurredAt: nowIso,
    });

    return { introduced: true, duplicate: false, itemKey: input.itemId };
  });
}

export function setFamiliar(
  db: Db,
  dictionary: LessonDictionary,
  input: { readonly itemId: string; readonly familiar: boolean; readonly diagnosticCorrect: boolean },
  nowMs: number,
): LearningSummary {
  const profile = requireProfile(db);
  const dayKey = todayInZone(profile.timezone, nowMs);
  const nowIso = new Date(nowMs).toISOString();

  transaction(db, () => {
    const existing = getByItem(db, profile.id, input.itemId);
    if (existing === null) {
      const snapshot = dictionary.getEntry(input.itemId);
      if (snapshot === null) throw AppError.notFound('That dictionary entry does not exist.');
      insertUserVocabulary(db, {
        id: randomUUID(),
        profileId: profile.id,
        itemKey: input.itemId,
        sourceEntryId: snapshot.sourceId,
        snapshot,
        introducedAt: null,
        introducedDayKey: null,
        familiarityFlag: input.familiar,
        notes: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else {
      updateUserVocabulary(db, existing.id, { familiarityFlag: input.familiar }, nowIso);
    }

    insertDiagnostic(db, {
      id: randomUUID(),
      profileId: profile.id,
      itemKey: input.itemId,
      correct: input.diagnosticCorrect,
      respondedAt: nowIso,
      dayKey,
    });

    const plan = db
      .prepare('select id from daily_plans where profile_id = ? and day_key = ?')
      .get(profile.id, dayKey) as { id: string } | undefined;
    if (plan !== undefined) {
      setDailyNewItemState(db, plan.id, input.itemId, input.familiar ? 'familiar' : 'assigned');
    }
  });

  return buildSummary(db, profile.id, nowMs);
}

/** Opt a self-reported familiar item into one early meaning review. */
export function scheduleFamiliar(
  db: Db,
  createCard: CardFactory,
  input: { readonly itemId: string },
  nowMs: number,
): { readonly scheduled: boolean } {
  const profile = requireProfile(db);
  const nowIso = new Date(nowMs).toISOString();

  return transaction(db, () => {
    const existing = getByItem(db, profile.id, input.itemId);
    if (existing === null) throw AppError.notFound('Mark the word familiar first.');
    const already = getCardForSkill(db, profile.id, input.itemId, 'meaning');
    if (already !== null) throw AppError.conflict('An early review is already scheduled for this word.');

    const card = createCard(input.itemId, 'meaning', nowMs);
    insertCard(db, {
      id: card.cardId,
      profileId: profile.id,
      itemType: 'vocabulary',
      itemKey: input.itemId,
      skill: 'meaning',
      schedulerVersion: card.schedulerVersion,
      dueAt: card.dueAt,
      stateJson: card.stateJson,
      lastReviewAt: null,
      reps: 0,
      lapses: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return { scheduled: true };
  });
}

export function getDetail(db: Db, itemId: string): VocabularyDetail | null {
  const profile = requireProfile(db);
  const row = getByItem(db, profile.id, itemId);
  if (row === null) return null;
  const teaching = chooseTeaching(row.snapshot);
  const cards = listCards(db, profile.id).filter((card) => card.itemKey === itemId);
  const logs = db
    .prepare(
      `select reviewed_at, day_key, rating, correct, hint_used from review_logs
       where profile_id = ? and card_id in (
         select id from review_cards where profile_id = ? and item_key = ?
       ) and undo_of is null order by reviewed_at desc limit 20`,
    )
    .all(profile.id, profile.id, itemId) as {
    reviewed_at: string;
    day_key: string;
    rating: number;
    correct: number;
    hint_used: number;
  }[];

  return {
    itemKey: itemId,
    form: teaching?.form ?? row.snapshot.canonicalForm,
    reading: teaching?.reading ?? row.snapshot.readings[0]?.text ?? '',
    english: teaching?.sense.english ?? row.snapshot.senses[0]?.english ?? '',
    senses: row.snapshot.senses.map((sense) => sense.english),
    notes: row.notes,
    introducedAt: row.introducedAt,
    familiar: row.familiarityFlag,
    skills: (['meaning', 'reading'] as const).map((skill) => {
      const card = cards.find((entry) => entry.skill === skill);
      return {
        skill,
        dueAt: card?.dueAt ?? null,
        reps: card?.reps ?? 0,
        lapses: card?.lapses ?? 0,
        state: card === undefined ? 'no card' : JSON.parse(card.stateJson)?.scheduleStatus ?? 'scheduled',
      };
    }),
    history: logs.map((log) => ({
      reviewedAt: log.reviewed_at,
      dayKey: log.day_key,
      rating: log.rating,
      correct: log.correct === 1,
      hintUsed: log.hint_used === 1,
    })),
  };
}

export function setNotes(db: Db, itemId: string, notes: string): { readonly saved: boolean } {
  const profile = requireProfile(db);
  const row = getByItem(db, profile.id, itemId);
  if (row === null) throw AppError.notFound('That word is not in your library.');
  transaction(db, () => {
    updateUserVocabulary(db, row.id, { notes }, new Date().toISOString());
  });
  return { saved: true };
}

export function getLibrary(
  db: Db,
  query: { readonly text?: string; readonly offset: number; readonly limit: number },
): VocabularyLibraryResult {
  const profile = requireProfile(db);
  const all = listUserVocabulary(db, profile.id);
  const raw = query.text?.trim() ?? '';
  const normalized = raw.length === 0 ? '' : normalizeKanaInput(raw).toLowerCase();
  const filtered =
    raw.length === 0
      ? all
      : all.filter((row) =>
          [
            row.snapshot.canonicalForm,
            ...row.snapshot.readings.map((reading) => reading.text),
            ...row.snapshot.senses.map((sense) => sense.english),
            normalized,
          ]
            .join(' ')
            .toLowerCase()
            .includes(raw.toLowerCase()) ||
          row.snapshot.readings.some((reading) => reading.text.toLowerCase().includes(normalized)),
        );

  return {
    items: filtered.slice(query.offset, query.offset + query.limit).map((row) => {
      const teaching = chooseTeaching(row.snapshot);
      return {
        itemKey: row.itemKey,
        form: teaching?.form ?? row.snapshot.canonicalForm,
        reading: teaching?.reading ?? row.snapshot.readings[0]?.text ?? '',
        english: teaching?.sense.english ?? row.snapshot.senses[0]?.english ?? '',
        introducedAt: row.introducedAt,
        familiar: row.familiarityFlag,
      };
    }),
    total: filtered.length,
  };
}
