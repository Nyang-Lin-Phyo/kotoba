/** Original grammar units, prerequisite gating and persisted exercise progress. */

import { randomUUID } from 'node:crypto';
import { todayInZone } from '../../shared/date';
import { AppError } from '../../shared/errors';
import {
  exerciseIds,
  getGrammarUnit,
  grammarUnits,
  isCorrectAnswer,
  type GrammarUnit,
} from '../../shared/grammarData';
import { isUnitComplete, isUnitUnlocked } from '../../shared/grammarRules';
import { transaction, type Db } from '../database/connection';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  getGrammarProgress,
  insertGrammarAttempt,
  listGrammarAttempts,
  listGrammarProgress,
  upsertGrammarProgress,
  type GrammarStatus,
} from '../database/repositories/grammarProgress';
import { getActiveProfile } from '../database/repositories/profiles';

export type GrammarUnitDTO = {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly prerequisites: readonly string[];
  readonly explanation: string;
  readonly unlocked: boolean;
  readonly status: GrammarStatus | 'locked';
  readonly correctExerciseIds: readonly string[];
};

export type GrammarAttemptDTO = {
  readonly exerciseId: string;
  readonly dayKey: string;
  readonly correct: boolean;
  readonly answer: string;
};

export type GrammarDetailDTO = GrammarUnitDTO & {
  readonly unit: GrammarUnit;
  readonly attempts: readonly GrammarAttemptDTO[];
};

export type GrammarAttemptInput = {
  readonly eventId: string;
  readonly unitId: string;
  readonly exerciseId: string;
  readonly answerIndex: number;
};

export type GrammarAttemptResult = {
  readonly correct: boolean;
  readonly correctIndex: number;
  readonly rationale: string;
  readonly status: GrammarStatus;
  readonly attempts: number;
  readonly correctCount: number;
};

function requireProfile(db: Db) {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return profile;
}

export function listGrammarUnits(db: Db): readonly GrammarUnitDTO[] {
  const profile = requireProfile(db);
  const progress = new Map(listGrammarProgress(db, profile.id).map((row) => [row.unitId, row]));
  const completedIds = [...progress.values()]
    .filter((row) => row.status === 'completed')
    .map((row) => row.unitId);

  return grammarUnits.map((unit) => {
    const unlocked = isUnitUnlocked(unit.prerequisites, completedIds);
    const row = progress.get(unit.id);
    const correctExerciseIds = [
      ...new Set(
        listGrammarAttempts(db, profile.id, unit.id)
          .filter((attempt) => attempt.correct)
          .map((attempt) => attempt.exerciseId),
      ),
    ];
    return {
      id: unit.id,
      title: unit.title,
      order: unit.order,
      prerequisites: unit.prerequisites,
      explanation: unit.explanation,
      unlocked,
      status: !unlocked ? 'locked' : row?.status ?? 'available',
      correctExerciseIds,
    };
  });
}

export function getGrammarDetail(db: Db, unitId: string): GrammarDetailDTO | null {
  const profile = requireProfile(db);
  const unit = getGrammarUnit(unitId);
  if (unit === undefined) return null;
  const listed = listGrammarUnits(db).find((item) => item.id === unitId);
  if (listed === undefined) return null;
  return {
    ...listed,
    unit,
    attempts: listGrammarAttempts(db, profile.id, unitId).map((attempt) => ({
      exerciseId: attempt.exerciseId,
      dayKey: attempt.dayKey,
      correct: attempt.correct,
      answer: attempt.answer,
    })),
  };
}

export function submitGrammarAttempt(db: Db, input: GrammarAttemptInput, nowMs: number): GrammarAttemptResult {
  const profile = requireProfile(db);
  const listed = listGrammarUnits(db).find((unit) => unit.id === input.unitId);
  if (listed === undefined || !listed.unlocked) {
    throw AppError.validation('This grammar unit is not available yet.', 'unitId');
  }
  const unit = getGrammarUnit(input.unitId);
  if (unit === undefined) throw AppError.notFound('That grammar unit does not exist.');
  const exercise = unit.exercises.find((item) => item.id === input.exerciseId);
  if (exercise === undefined) throw AppError.validation('Unknown exercise.', 'exerciseId');
  if (!Number.isInteger(input.answerIndex) || input.answerIndex < 0 || input.answerIndex >= exercise.choices.length) {
    throw AppError.validation('Choose one of the listed answers.', 'answerIndex');
  }

  return transaction(db, () => {
    const previous = findEvent(db, input.eventId);
    if (previous !== null) {
      if (previous.type !== 'grammar.attempted') {
        throw AppError.conflict('That event id belongs to a different action.', 'eventId');
      }
      const payload = JSON.parse(previous.payloadJson) as { unitId: string };
      const progress = getGrammarProgress(db, profile.id, payload.unitId);
      if (progress === null) throw AppError.notFound('The original grammar progress no longer exists.');
      return {
        correct: isCorrectAnswer(unit, input.exerciseId, input.answerIndex),
        correctIndex: exercise.answerIndex,
        rationale: exercise.rationale,
        status: progress.status,
        attempts: progress.attempts,
        correctCount: progress.correct,
      };
    }

    const todayKey = todayInZone(profile.timezone, nowMs);
    const correct = isCorrectAnswer(unit, input.exerciseId, input.answerIndex);
    insertGrammarAttempt(db, {
      id: randomUUID(),
      profileId: profile.id,
      unitId: unit.id,
      exerciseId: exercise.id,
      dayKey: todayKey,
      attemptedAt: new Date(nowMs).toISOString(),
      correct,
      answer: exercise.choices[input.answerIndex] ?? '',
    });

    const attempts = listGrammarAttempts(db, profile.id, unit.id);
    const correctIds = [...new Set(attempts.filter((a) => a.correct).map((a) => a.exerciseId))];
    const previousProgress = getGrammarProgress(db, profile.id, unit.id);
    const status: GrammarStatus = isUnitComplete(exerciseIds(unit), correctIds) ? 'completed' : 'in-progress';
    upsertGrammarProgress(db, {
      profileId: profile.id,
      unitId: unit.id,
      status,
      attempts: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
      completedAt:
        status === 'completed'
          ? previousProgress?.completedAt ?? new Date(nowMs).toISOString()
          : null,
      updatedAt: new Date(nowMs).toISOString(),
    });
    insertEvent(db, {
      eventId: input.eventId,
      profileId: profile.id,
      dayKey: todayKey,
      type: 'grammar.attempted',
      payloadJson: JSON.stringify({ unitId: unit.id }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    return {
      correct,
      correctIndex: exercise.answerIndex,
      rationale: exercise.rationale,
      status,
      attempts: attempts.length,
      correctCount: attempts.filter((a) => a.correct).length,
    };
  });
}
