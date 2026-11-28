/** Sentence-mining queue. Repetition of the same item in the same sentence is a no-op. */

import type { Db } from '../connection';

export type MinedStatus = 'queued' | 'introduced' | 'dismissed';

export type MinedItemRow = {
  readonly id: string;
  readonly profileId: string;
  readonly sourceEntryId: string;
  readonly itemKey: string;
  readonly snapshotJson: string;
  readonly sentence: string;
  readonly sourceTitle: string;
  readonly sourceType: 'paste' | 'subtitle' | 'passage';
  readonly position: number;
  readonly status: MinedStatus;
  readonly eventId: string;
  readonly createdDayKey: string;
  readonly createdAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  source_entry_id: string;
  item_key: string;
  snapshot_json: string;
  sentence: string;
  source_title: string;
  source_type: string;
  position: number;
  status: string;
  event_id: string;
  created_day_key: string;
  created_at: string;
};

const COLUMNS = `id, profile_id, source_entry_id, item_key, snapshot_json, sentence,
  source_title, source_type, position, status, event_id, created_day_key, created_at`;

function toRow(row: Row): MinedItemRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    sourceEntryId: row.source_entry_id,
    itemKey: row.item_key,
    snapshotJson: row.snapshot_json,
    sentence: row.sentence,
    sourceTitle: row.source_title,
    sourceType: row.source_type as MinedItemRow['sourceType'],
    position: row.position,
    status: row.status as MinedStatus,
    eventId: row.event_id,
    createdDayKey: row.created_day_key,
    createdAt: row.created_at,
  };
}

export function insertMinedItem(db: Db, row: MinedItemRow): MinedItemRow {
  db.prepare(
    `insert into mined_items (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (profile_id, source_entry_id, sentence, item_key) do nothing`,
  ).run(
    row.id, row.profileId, row.sourceEntryId, row.itemKey, row.snapshotJson, row.sentence,
    row.sourceTitle, row.sourceType, row.position, row.status, row.eventId,
    row.createdDayKey, row.createdAt,
  );
  const existing = db
    .prepare(`select ${COLUMNS} from mined_items
              where profile_id = ? and source_entry_id = ? and sentence = ? and item_key = ?`)
    .get(row.profileId, row.sourceEntryId, row.sentence, row.itemKey) as Row;
  return toRow(existing);
}

export function listMinedItems(
  db: Db,
  profileId: string,
  status: MinedStatus,
  offset: number,
  limit: number,
): MinedItemRow[] {
  const rows = db
    .prepare(`select ${COLUMNS} from mined_items
              where profile_id = ? and status = ? order by created_at, id limit ? offset ?`)
    .all(profileId, status, limit, offset) as Row[];
  return rows.map(toRow);
}

export function countQueuedOnDay(db: Db, profileId: string, dayKey: string): number {
  const row = db
    .prepare('select count(*) c from mined_items where profile_id = ? and status = ? and created_day_key = ?')
    .get(profileId, 'queued', dayKey) as { c: number };
  return row.c;
}

export function markMinedStatus(
  db: Db,
  profileId: string,
  id: string,
  status: MinedStatus,
): MinedItemRow | null {
  db.prepare('update mined_items set status = ? where id = ? and profile_id = ?')
    .run(status, id, profileId);
  const row = db.prepare(`select ${COLUMNS} from mined_items where id = ? and profile_id = ?`)
    .get(id, profileId) as Row | undefined;
  return row === undefined ? null : toRow(row);
}


export function getMinedItem(db: Db, profileId: string, id: string): MinedItemRow | null {
  const row = db.prepare(`select ${COLUMNS} from mined_items where id = ? and profile_id = ?`)
    .get(id, profileId) as Row | undefined;
  return row === undefined ? null : toRow(row);
}

/** Called when a mined word is introduced, so it leaves the queue exactly once. */
export function markMinedIntroducedForEntry(db: Db, profileId: string, entryId: string): number {
  const result = db
    .prepare("update mined_items set status = 'introduced' where profile_id = ? and source_entry_id = ? and status = 'queued'")
    .run(profileId, entryId);
  return Number(result.changes);
}
