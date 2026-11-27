/** Append-only study event log. Statement-only; services own the transaction. */

import type { Db } from '../connection';

export type StudyEventRow = {
  readonly eventId: string;
  readonly profileId: string;
  readonly dayKey: string;
  readonly type: string;
  readonly payloadJson: string;
  readonly occurredAt: string;
};

type Row = {
  event_id: string;
  profile_id: string;
  day_key: string;
  type: string;
  payload_json: string;
  occurred_at: string;
};

function toEvent(row: Row): StudyEventRow {
  return {
    eventId: row.event_id,
    profileId: row.profile_id,
    dayKey: row.day_key,
    type: row.type,
    payloadJson: row.payload_json,
    occurredAt: row.occurred_at,
  };
}

export function insertEvent(db: Db, event: StudyEventRow): void {
  db.prepare(
    `insert into study_events (event_id, profile_id, day_key, type, payload_json, occurred_at)
     values (?, ?, ?, ?, ?, ?)`,
  ).run(
    event.eventId,
    event.profileId,
    event.dayKey,
    event.type,
    event.payloadJson,
    event.occurredAt,
  );
}

export function findEvent(db: Db, eventId: string): StudyEventRow | null {
  const row = db.prepare('select * from study_events where event_id = ?').get(eventId) as
    | Row
    | undefined;
  return row === undefined ? null : toEvent(row);
}
