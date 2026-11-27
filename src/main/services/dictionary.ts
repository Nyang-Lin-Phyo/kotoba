/**
 * Read-only dictionary access.
 *
 * The generated dictionary is immutable content, never user data. It is opened
 * read-only and queried with bound parameters; nothing is ever written back.
 */

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { toHiragana } from 'wanakana';
import type {
  DictionaryEntry,
  DictionaryKana,
  DictionaryKanji,
  DictionaryMetadata,
  DictionaryResult,
} from '../../shared/contracts';
import { AppError } from '../../shared/errors';
import type { DictionarySearchInput } from '../../shared/schemas';

export function normalizeSearchQuery(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  return toHiragana(trimmed);
}

export type RankableRow = {
  readonly id: string;
  readonly canonicalForm: string;
  readonly reading: string;
  readonly english: string;
  readonly priority: number;
  readonly curriculumRank: number | null;
  readonly senseCount: number;
  readonly formLength: number;
  readonly exactMatch: boolean;
};

/** Exact match -> curated rank -> priority -> fewer senses -> shorter form -> stable id. */
export function rankResults<T extends RankableRow>(rows: readonly T[]): T[] {
  return [...rows].toSorted((left, right) => {
    if (left.exactMatch !== right.exactMatch) return left.exactMatch ? -1 : 1;
    const leftRank = left.curriculumRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.curriculumRank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.priority !== right.priority) return right.priority - left.priority;
    if (left.senseCount !== right.senseCount) return left.senseCount - right.senseCount;
    if (left.formLength !== right.formLength) return left.formLength - right.formLength;
    return left.id.localeCompare(right.id);
  });
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function ftsMatch(query: string): string {
  return query
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(' AND ');
}

type EntryRow = {
  id: string;
  canonical_form: string;
  priority: number;
  curriculum_rank: number | null;
  reading: string | null;
  english: string | null;
  sense_count: number;
  form_length: number;
};

const ENTRY_COLUMNS = `e.id, e.canonical_form, e.priority, e.curriculum_rank,
  (select r.text from readings r where r.entry_id = e.id order by r.common desc, r.id limit 1) as reading,
  (select s.english from senses s where s.entry_id = e.id order by s.ordinal limit 1) as english,
  (select count(*) from senses s where s.entry_id = e.id) as sense_count,
  length(e.canonical_form) as form_length`;

export class DictionaryService {
  readonly #path: string;
  #db: DatabaseSync | null = null;

  constructor(path: string) {
    this.#path = path;
  }

  get raw(): DatabaseSync {
    return this.#open();
  }

  #open(): DatabaseSync {
    if (this.#db !== null) return this.#db;

    if (!existsSync(this.#path)) {
      throw AppError.dataMissing('The offline dictionary is not installed.');
    }
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.#path, { readOnly: true });
      const row = db.prepare('select count(*) as total from entries').get() as { total: number };
      if (row.total === 0) {
        throw AppError.dataMissing('The offline dictionary is empty.');
      }
      this.#db = db;
      return db;
    } catch (cause) {
      // Windows cannot delete a file with an open handle, so never leak one
      // even when the database turns out to be invalid.
      db?.close();
      if (cause instanceof AppError) throw cause;
      throw AppError.dataMissing('The offline dictionary could not be opened.');
    }
  }

  /** Release the read-only handle. Required before deleting a temp database on Windows. */
  close(): void {
    this.#db?.close();
    this.#db = null;
  }

  #rowsForIds(ids: readonly string[]): EntryRow[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return this.#open()
      .prepare(`select ${ENTRY_COLUMNS} from entries e where e.id in (${placeholders})`)
      .all(...ids) as EntryRow[];
  }

  search(input: DictionarySearchInput): readonly DictionaryResult[] {
    const db = this.#open();
    const normalized = normalizeSearchQuery(input.query);
    const ids = new Set<string>();
    const exactIds = new Set<string>();

    for (const text of new Set([normalized, input.query.trim()])) {
      if (text.length === 0) continue;
      for (const table of ['forms', 'readings'] as const) {
        const exact = db
          .prepare(`select entry_id from ${table} where text = ? limit 200`)
          .all(text) as { entry_id: string }[];
        for (const row of exact) exactIds.add(row.entry_id);
      }
      const pattern = `${escapeLike(text)}%`;
      for (const table of ['forms', 'readings'] as const) {
        const rows = db
          .prepare(`select entry_id from ${table} where text like ? escape '\\' limit 200`)
          .all(pattern) as { entry_id: string }[];
        for (const row of rows) ids.add(row.entry_id);
      }
    }

    const match = ftsMatch(input.query);
    if (match.length > 0) {
      const rows = db
        .prepare('select entry_id from fts_entries where fts_entries match ? limit 200')
        .all(match) as { entry_id: string }[];
      for (const row of rows) ids.add(row.entry_id);
    }

    const ranked = rankResults(
      this.#rowsForIds([...ids]).map((row) => ({
        id: row.id,
        canonicalForm: row.canonical_form,
        reading: row.reading ?? '',
        english: row.english ?? '',
        priority: row.priority,
        curriculumRank: row.curriculum_rank,
        senseCount: row.sense_count,
        formLength: row.form_length,
        exactMatch: exactIds.has(row.id),
      })),
    );

    return ranked.slice(input.offset, input.offset + input.limit).map((row) => ({
      id: row.id,
      canonicalForm: row.canonicalForm,
      reading: row.reading,
      english: row.english,
      priority: row.priority,
      curriculumRank: row.curriculumRank,
    }));
  }

  /** Stable candidate order for daily lessons: original rank, then source priority. */
  listCandidateIds(limit: number): string[] {
    const rows = this.#open()
      .prepare(
        `select id from entries
         order by (curriculum_rank is null) asc, curriculum_rank asc, priority desc, id asc
         limit ?`,
      )
      .all(limit) as { id: string }[];
    return rows.map((row) => row.id);
  }

  getEntry(id: string): DictionaryEntry | null {
    const db = this.#open();
    const row = db
      .prepare(`select ${ENTRY_COLUMNS} from entries e where e.id = ?`)
      .get(id) as EntryRow | undefined;
    if (row === undefined) return null;

    const forms = db
      .prepare('select text, common from forms where entry_id = ? order by id')
      .all(id) as { text: string; common: number }[];
    const readingRows = db
      .prepare('select id, text, common from readings where entry_id = ? order by id')
      .all(id) as { id: string; text: string; common: number }[];
    const senseRows = db
      .prepare('select id, part_of_speech, english from senses where entry_id = ? order by ordinal')
      .all(id) as { id: string; part_of_speech: string; english: string }[];

    const appliesForReading = db.prepare(
      `select f.text from form_restrictions fr join forms f on f.id = fr.form_id
       where fr.reading_id = ? order by f.text`,
    );
    const appliesForSense = db.prepare(
      `select sr.form_id, sr.reading_id, f.text as form_text, r.text as reading_text
       from sense_restrictions sr
       left join forms f on f.id = sr.form_id
       left join readings r on r.id = sr.reading_id
       where sr.sense_id = ?`,
    );
    const tagsForSense = db.prepare('select tag from sense_tags where sense_key = ? order by tag');

    const readings = readingRows.map((reading) => ({
      text: reading.text,
      common: reading.common === 1,
      appliesTo: (appliesForReading.all(reading.id) as { text: string }[]).map((restriction) => restriction.text),
    }));
    const senses = senseRows.map((sense) => {
      const restrictions = appliesForSense.all(sense.id) as {
        form_text: string | null;
        reading_text: string | null;
      }[];
      return {
        partOfSpeech: sense.part_of_speech,
        english: sense.english,
        tags: (tagsForSense.all(sense.id) as { tag: string }[]).map((tagRow) => tagRow.tag),
        appliesToForms: restrictions
          .map((restriction) => restriction.form_text)
          .filter((text): text is string => text !== null),
        appliesToReadings: restrictions
          .map((restriction) => restriction.reading_text)
          .filter((text): text is string => text !== null),
      };
    });
    const kanji = db
      .prepare('select literal from entry_kanji where entry_id = ? order by literal')
      .all(id) as { literal: string }[];

    return {
      id: row.id,
      sourceId: row.id.replace(/^jmdict:/, ''),
      canonicalForm: row.canonical_form,
      forms: forms.map((form) => ({ text: form.text, common: form.common === 1 })),
      readings,
      senses,
      kanji: kanji.map((entry) => entry.literal),
      priority: row.priority,
      curriculumRank: row.curriculum_rank,
    };
  }

  getKanji(literal: string): DictionaryKanji | null {
    const db = this.#open();
    const row = db
      .prepare('select literal, grade, strokes, frequency, meanings from kanji where literal = ?')
      .get(literal) as
      | { literal: string; grade: number | null; strokes: number | null; frequency: number | null; meanings: string }
      | undefined;
    if (row === undefined) return null;

    const readings = db
      .prepare('select type, reading from kanji_readings where literal = ? order by id')
      .all(literal) as { type: string; reading: string }[];
    return { ...row, readings };
  }

  getKana(character: string): DictionaryKana | null {
    const row = this.#open()
      .prepare('select character, reading, script, tier from kana where character = ?')
      .get(character) as DictionaryKana | undefined;
    return row ?? null;
  }

  metadata(): DictionaryMetadata {
    const rows = this.#open().prepare('select key, value from metadata').all() as {
      key: string;
      value: string;
    }[];
    const meta = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      release: meta.release ?? 'unknown',
      licence: meta.licence ?? 'CC-BY-SA-4.0',
      attribution: meta.attribution ?? '',
      entryCount: Number(meta.entry_count ?? 0),
      kanjiCount: Number(meta.kanji_count ?? 0),
      fixture: meta.fixture === 'true',
      path: this.#path,
    };
  }
}
