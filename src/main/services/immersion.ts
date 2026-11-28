/** Manual external study logs; every correction keeps its audit record. */

import { randomUUID } from 'node:crypto';
import type { ActivityType } from '../../shared/goals';
import { AppError } from '../../shared/errors';
import { transaction, type Db } from '../database/connection';
import { todayInZone } from '../../shared/date';
import {
  addImmersionLog,
  correctImmersionLog,
  listImmersionLogs,
  getImmersionLog,
  type ImmersionLog,
} from '../database/repositories/immersion';
import { getActiveProfile } from '../database/repositories/profiles';
import { findEvent, insertEvent } from '../database/repositories/events';

export type ImmersionAddInput = {
  readonly durationSeconds: number;
  readonly activityType: ActivityType;
  readonly title: string;
  readonly notes: string;
  readonly deliberate: boolean;
};

export type ImmersionCorrectInput = {
  readonly durationSeconds?: number;
  readonly title?: string;
  readonly notes?: string;
  readonly deliberate?: boolean;
  readonly reason: string;
};

function requireProfile(db: Db) {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return profile;
}

export function addExternalLog(
  db: Db,
  input: ImmersionAddInput,
  eventId: string,
  nowMs: number,
): ImmersionLog {
  const profile = requireProfile(db);
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 86_400) {
    throw AppError.validation('Duration must be between 1 and 86,400 seconds.', 'durationSeconds');
  }
  if (input.title.length > 120 || input.notes.length > 4000) {
    throw AppError.validation('Title or notes are too long.');
  }

  return transaction(db, () => {
    const previous = findEvent(db, eventId);
    if (previous !== null) {
      const payload = JSON.parse(previous.payloadJson) as { logId: string };
      const existing = getImmersionLog(db, profile.id, payload.logId);
      if (existing === null) throw AppError.notFound('The original log no longer exists.');
      return existing;
    }

    const log = addImmersionLog(db, {
      id: randomUUID(),
      profileId: profile.id,
      dayKey: todayInZone(profile.timezone, nowMs),
      startedAt: new Date(nowMs).toISOString(),
      durationSeconds: input.durationSeconds,
      activityType: input.activityType,
      title: input.title.trim(),
      notes: input.notes.trim(),
      deliberate: input.deliberate,
    });
    insertEvent(db, {
      eventId,
      profileId: profile.id,
      dayKey: log.dayKey,
      type: 'immersion.added',
      payloadJson: JSON.stringify({ logId: log.id }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    return log;
  });
}

export function correctExternalLog(
  db: Db,
  logId: string,
  patch: ImmersionCorrectInput,
  eventId: string,
  nowMs: number,
): ImmersionLog {
  const profile = requireProfile(db);
  if (patch.reason.trim().length < 2) {
    throw AppError.validation('A correction needs a short reason.', 'reason');
  }
  return transaction(db, () => {
    const previous = findEvent(db, eventId);
    if (previous !== null) {
      const payload = JSON.parse(previous.payloadJson) as { logId: string };
      const existing = getImmersionLog(db, profile.id, payload.logId);
      if (existing === null) throw AppError.notFound('The corrected log no longer exists.');
      return existing;
    }

    const updated = correctImmersionLog(
      db, profile.id, logId, { ...patch, reason: patch.reason.trim() }, new Date(nowMs).toISOString(),
    );
    if (updated === null) throw AppError.notFound('That immersion log does not exist.');
    insertEvent(db, {
      eventId,
      profileId: profile.id,
      dayKey: updated.dayKey,
      type: 'immersion.corrected',
      payloadJson: JSON.stringify({ logId: updated.id }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    return updated;
  });
}

export function listExternalLogs(db: Db, offset: number, limit: number): readonly ImmersionLog[] {
  return listImmersionLogs(db, requireProfile(db).id, offset, limit);
}
