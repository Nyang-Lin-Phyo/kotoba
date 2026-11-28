/** User-owned text and subtitles with a cached, profile-scoped tokenization. */

import type { Db } from '../connection';

export type MediaKind = 'paste' | 'subtitle' | 'text';

export type MediaRow = {
  readonly id: string;
  readonly profileId: string;
  readonly title: string;
  readonly kind: MediaKind;
  readonly textContent: string;
  readonly sourceName: string;
  readonly dayKey: string;
  readonly createdAt: string;
};

export type MediaTokenRow = {
  readonly position: number;
  readonly surface: string;
  readonly basicForm: string;
  readonly reading: string;
  readonly pos: string;
  readonly wordType: string;
  readonly entryId: string | null;
  readonly knownReading: boolean;
  readonly knownMeaning: boolean;
};

type Row = {
  id: string;
  profile_id: string;
  title: string;
  kind: string;
  text_content: string;
  source_name: string;
  day_key: string;
  created_at: string;
};

const COLUMNS = `id, profile_id, title, kind, text_content, source_name, day_key, created_at`;

function toRow(row: Row): MediaRow {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    kind: row.kind as MediaKind,
    textContent: row.text_content,
    sourceName: row.source_name,
    dayKey: row.day_key,
    createdAt: row.created_at,
  };
}

export function insertMedia(db: Db, row: MediaRow): void {
  db.prepare(`insert into media_items (${COLUMNS}) values (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.profileId, row.title, row.kind, row.textContent,
    row.sourceName, row.dayKey, row.createdAt,
  );
}

export function getMedia(db: Db, profileId: string, id: string): MediaRow | null {
  const row = db.prepare(`select ${COLUMNS} from media_items where id = ? and profile_id = ?`)
    .get(id, profileId) as Row | undefined;
  return row === undefined ? null : toRow(row);
}

export function listMedia(db: Db, profileId: string, offset: number, limit: number): MediaRow[] {
  const rows = db
    .prepare(`select ${COLUMNS} from media_items where profile_id = ? order by created_at desc limit ? offset ?`)
    .all(profileId, limit, offset) as Row[];
  return rows.map(toRow);
}

export function insertMediaTokens(
  db: Db,
  mediaId: string,
  profileId: string,
  tokens: readonly MediaTokenRow[],
): void {
  const statement = db.prepare(
    `insert into media_tokens (media_id, profile_id, position, surface, basic_form, reading, pos,
       word_type, entry_id, known_reading, known_meaning) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const token of tokens) {
    statement.run(
      mediaId, profileId, token.position, token.surface, token.basicForm, token.reading,
      token.pos, token.wordType, token.entryId, Number(token.knownReading),
      Number(token.knownMeaning),
    );
  }
}

export function listMediaTokens(db: Db, mediaId: string): MediaTokenRow[] {
  const rows = db
    .prepare(`select position, surface, basic_form, reading, pos, word_type, entry_id,
       known_reading, known_meaning from media_tokens where media_id = ? order by position`)
    .all(mediaId) as {
    position: number; surface: string; basic_form: string; reading: string; pos: string;
    word_type: string; entry_id: string | null; known_reading: number; known_meaning: number;
  }[];
  return rows.map((row) => ({
    position: row.position,
    surface: row.surface,
    basicForm: row.basic_form,
    reading: row.reading,
    pos: row.pos,
    wordType: row.word_type,
    entryId: row.entry_id,
    knownReading: row.known_reading === 1,
    knownMeaning: row.known_meaning === 1,
  }));
}
