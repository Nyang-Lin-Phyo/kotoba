/** Study sessions and their day-key segments. Statement-only. */

import type { ActivityType } from '../../../shared/goals';
import type { Db } from '../connection';

export type StudySessionRow = {
  readonly id: string;
  readonly profileId: string;
  readonly activityType: ActivityType;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly activeSeconds: number;
  readonly status: 'running' | 'paused' | 'stopped' | 'interrupted';
  readonly source: 'timer' | 'manual';
  readonly lastCheckpointAt: string;
};

export type SessionSegmentRow = {
  readonly id: string;
  readonly sessionId: string;
  readonly dayKey: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly activeSeconds: number;
};

type SessionDbRow = {
  id: string;
  profile_id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  status: string;
  source: string;
  last_checkpoint_at: string;
};

function toSession(row: SessionDbRow): StudySessionRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    activityType: row.activity_type as ActivityType,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    activeSeconds: row.active_seconds,
    status: row.status as StudySessionRow['status'],
    source: row.source as StudySessionRow['source'],
    lastCheckpointAt: row.last_checkpoint_at,
  };
}

const SESSION_COLUMNS = `id, profile_id, activity_type, started_at, ended_at, active_seconds,
  status, source, last_checkpoint_at`;

export function insertSession(
  db: Db,
  row: Omit<StudySessionRow, 'endedAt' | 'activeSeconds'>,
): void {
  db.prepare(
    `insert into study_sessions (
       id, profile_id, activity_type, started_at, status, source, last_checkpoint_at
     ) values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.profileId,
    row.activityType,
    row.startedAt,
    row.status,
    row.source,
    row.lastCheckpointAt,
  );
}

export function updateSession(
  db: Db,
  id: string,
  patch: { readonly activeSeconds?: number; readonly status?: StudySessionRow['status']; readonly endedAt?: string | null; readonly lastCheckpointAt?: string },
): void {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.activeSeconds !== undefined) {
    assignments.push('active_seconds = ?');
    values.push(patch.activeSeconds);
  }
  if (patch.status !== undefined) {
    assignments.push('status = ?');
    values.push(patch.status);
  }
  if (patch.endedAt !== undefined) {
    assignments.push('ended_at = ?');
    values.push(patch.endedAt);
  }
  if (patch.lastCheckpointAt !== undefined) {
    assignments.push('last_checkpoint_at = ?');
    values.push(patch.lastCheckpointAt);
  }
  if (assignments.length === 0) return;

  db.prepare(`update study_sessions set ${assignments.join(', ')} where id = ?`).run(...values, id);
}

export function getSession(db: Db, id: string): StudySessionRow | null {
  const row = db.prepare(`select ${SESSION_COLUMNS} from study_sessions where id = ?`).get(id) as
    | SessionDbRow
    | undefined;
  return row === undefined ? null : toSession(row);
}

export function getRunningSession(db: Db, profileId: string): StudySessionRow | null {
  const row = db
    .prepare(`select ${SESSION_COLUMNS} from study_sessions
              where profile_id = ? and status in ('running', 'paused')
              order by started_at desc limit 1`)
    .get(profileId) as SessionDbRow | undefined;
  return row === undefined ? null : toSession(row);
}

/** All sessions still owned by a timer process, across profiles. Used only at startup. */
export function listAllUnfinishedSessions(db: Db): StudySessionRow[] {
  const rows = db
    .prepare(`select ${SESSION_COLUMNS} from study_sessions where status in ('running', 'paused')`)
    .all() as SessionDbRow[];
  return rows.map(toSession);
}

export function listInterruptedSessions(db: Db, profileId: string): StudySessionRow[] {
  const rows = db
    .prepare(`select ${SESSION_COLUMNS} from study_sessions
              where profile_id = ? and status = 'interrupted' order by started_at desc limit 20`)
    .all(profileId) as SessionDbRow[];
  return rows.map(toSession);
}

export function markInterrupted(db: Db, id: string): void {
  db.prepare("update study_sessions set status = 'interrupted' where id = ?").run(id);
}

export function insertSegment(db: Db, row: SessionSegmentRow): void {
  db.prepare(
    `insert into session_segments (id, session_id, day_key, started_at, ended_at, active_seconds)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.sessionId, row.dayKey, row.startedAt, row.endedAt, row.activeSeconds);
}

export function hasSegmentOnDay(db: Db, profileId: string, dayKey: string): boolean {
  const row = db
    .prepare(
      `select 1 from session_segments seg
       join study_sessions s on s.id = seg.session_id
       where s.profile_id = ? and seg.day_key = ? limit 1`,
    )
    .get(profileId, dayKey);
  return row !== undefined;
}

export function sumActiveSecondsByActivity(
  db: Db,
  profileId: string,
  dayKey: string,
): Partial<Record<ActivityType, number>> {
  const rows = db
    .prepare(
      `select s.activity_type as activity, sum(seg.active_seconds) as seconds
       from session_segments seg
       join study_sessions s on s.id = seg.session_id
       where s.profile_id = ? and seg.day_key = ?
       group by s.activity_type`,
    )
    .all(profileId, dayKey) as { activity: string; seconds: number }[];

  const result: Partial<Record<ActivityType, number>> = {};
  for (const row of rows) {
    result[row.activity as ActivityType] = Math.floor(row.seconds / 60);
  }
  return result;
}

export function sumActiveSecondsForDay(db: Db, profileId: string, dayKey: string): number {
  const row = db
    .prepare(
      `select coalesce(sum(seg.active_seconds), 0) as total
       from session_segments seg
       join study_sessions s on s.id = seg.session_id
       where s.profile_id = ? and seg.day_key = ?`,
    )
    .get(profileId, dayKey) as { total: number };
  return row.total;
}
