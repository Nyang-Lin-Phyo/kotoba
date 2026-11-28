/** Manual external study logs and their append-only correction audit. */

import { randomUUID } from 'node:crypto';
import type { ActivityType } from '../../../shared/goals';
import type { Db } from '../connection';

export type ImmersionLog = {
  readonly id: string;
  readonly profileId: string;
  readonly dayKey: string;
  readonly startedAt: string;
  readonly durationSeconds: number;
  readonly activityType: ActivityType;
  readonly title: string;
  readonly notes: string;
  readonly deliberate: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  day_key: string;
  started_at: string;
  duration_seconds: number;
  activity_type: string;
  title: string;
  notes: string;
  deliberate: number;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, profile_id, day_key, started_at, duration_seconds, activity_type,
  title, notes, deliberate, created_at, updated_at`;

function toLog(row: Row): ImmersionLog {
  return {
    id: row.id,
    profileId: row.profile_id,
    dayKey: row.day_key,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
    activityType: row.activity_type as ActivityType,
    title: row.title,
    notes: row.notes,
    deliberate: row.deliberate === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function addImmersionLog(
  db: Db,
  input: Omit<ImmersionLog, 'createdAt' | 'updatedAt'>,
): ImmersionLog {
  const now = new Date().toISOString();
  db.prepare(
    `insert into immersion_logs (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id, input.profileId, input.dayKey, input.startedAt, input.durationSeconds,
    input.activityType, input.title, input.notes, Number(input.deliberate), now, now,
  );
  return { ...input, createdAt: now, updatedAt: now };
}

export function listImmersionLogs(
  db: Db,
  profileId: string,
  offset: number,
  limit: number,
): ImmersionLog[] {
  const rows = db
    .prepare(`select ${COLUMNS} from immersion_logs where profile_id = ?
              order by started_at desc, id desc limit ? offset ?`)
    .all(profileId, limit, offset) as Row[];
  return rows.map(toLog);
}

export function correctImmersionLog(
  db: Db,
  profileId: string,
  id: string,
  patch: {
    readonly durationSeconds?: number;
    readonly title?: string;
    readonly notes?: string;
    readonly deliberate?: boolean;
    readonly reason: string;
  },
  changedAt: string,
): ImmersionLog | null {
  {
    const row = db
      .prepare(`select ${COLUMNS} from immersion_logs where id = ? and profile_id = ?`)
      .get(id, profileId) as Row | undefined;
    if (row === undefined) return null;

    const before = toLog(row);
    const after: ImmersionLog = {
      ...before,
      ...(patch.durationSeconds === undefined ? {} : { durationSeconds: patch.durationSeconds }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.deliberate === undefined ? {} : { deliberate: patch.deliberate }),
      updatedAt: changedAt,
    };

    db.prepare(
      `update immersion_logs set duration_seconds = ?, title = ?, notes = ?, deliberate = ?, updated_at = ?
       where id = ? and profile_id = ?`,
    ).run(
      after.durationSeconds, after.title, after.notes, Number(after.deliberate),
      changedAt, id, profileId,
    );
    db.prepare(
      `insert into immersion_corrections (id, log_id, profile_id, changed_at, reason, before_json, after_json)
       values (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, profileId, changedAt, patch.reason, JSON.stringify(before), JSON.stringify(after));

    return after;
  }
}

export function sumDeliberateImmersionSeconds(
  db: Db,
  profileId: string,
  dayKey: string,
): number {
  const row = db
    .prepare(
      'select coalesce(sum(duration_seconds), 0) as total from immersion_logs where profile_id = ? and day_key = ? and deliberate = 1',
    )
    .get(profileId, dayKey) as { total: number };
  return row.total;
}

export function getImmersionLog(db: Db, profileId: string, id: string): ImmersionLog | null {
  const row = db
    .prepare(`select ${COLUMNS} from immersion_logs where id = ? and profile_id = ?`)
    .get(id, profileId) as Row | undefined;
  return row === undefined ? null : toLog(row);
}

export function immersionSecondsByActivity(
  db: Db,
  profileId: string,
  dayKey: string,
): Partial<Record<import('../../../shared/goals').ActivityType, number>> {
  const rows = db
    .prepare(
      `select activity_type, sum(duration_seconds) as seconds from immersion_logs
       where profile_id = ? and day_key = ? and deliberate = 1
       group by activity_type`,
    )
    .all(profileId, dayKey) as { activity_type: string; seconds: number }[];
  const result: Partial<Record<import('../../../shared/goals').ActivityType, number>> = {};
  for (const row of rows) {
    const key = row.activity_type as import('../../../shared/goals').ActivityType;
    result[key] = Math.floor(row.seconds / 60);
  }
  return result;
}
