/** Offline text immersion: tokenize, resolve, mine and measure coverage. */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { toHiragana } from 'wanakana';
import type {
  CoverageSummary,
} from '../../shared/coverageRules';
import { summarizeCoverage } from '../../shared/coverageRules';
import { todayInZone } from '../../shared/date';
import type { DictionaryEntry, DictionaryResult } from '../../shared/contracts';
import { AppError } from '../../shared/errors';
import { VERIFIED_MIN_DISTINCT_DAYS, VERIFIED_MIN_INTERVAL_DAYS } from '../../shared/vocabularyRules';
import { getPassage, passageAnswerCorrect } from '../../shared/readingData';
import { parseSubtitle, SubtitleError } from '../../shared/subtitle';
import { transaction, type Db } from '../database/connection';
import { insertComprehensionAttempt } from '../database/repositories/comprehension';
import { findEvent, insertEvent } from '../database/repositories/events';
import {
  getMedia,
  insertMedia,
  insertMediaTokens,
  listMediaTokens,
  type MediaKind,
  type MediaTokenRow,
} from '../database/repositories/media';
import {
  countQueuedOnDay,
  insertMinedItem,
  getMinedItem,
  listMinedItems,
  markMinedStatus,
  type MinedItemRow,
} from '../database/repositories/minedItems';
import { getActiveProfile } from '../database/repositories/profiles';
import { listUserVocabulary } from '../database/repositories/vocabulary';
import type { DictionaryService } from './dictionary';
import type { TokenizerService } from './tokenizer';

export const MINED_DAILY_CAP = 3;
export const TOKENIZER_VERSION = 'kuromoji-0.1.2-ipadic-2.7.0';

export type TokenDTO = {
  readonly position: number;
  readonly surface: string;
  readonly basicForm: string;
  readonly reading: string;
  readonly pos: string;
  readonly wordType: string;
  readonly entryId: string | null;
  readonly candidates: readonly DictionaryResult[];
  readonly knownReading: boolean;
  readonly knownMeaning: boolean;
};

export type AnalysisDTO = {
  readonly mediaId: string;
  readonly title: string;
  readonly sourceText: string;
  readonly kind: 'paste' | 'subtitle' | 'text';
  readonly tokens: readonly TokenDTO[];
  readonly coverage: CoverageSummary;
  readonly dictionaryRelease: string;
  readonly tokenizerVersion: string;
};

export type MinedItemDTO = {
  readonly id: string;
  readonly entryId: string;
  readonly itemKey: string;
  readonly snapshot: DictionaryEntry;
  readonly sentence: string;
  readonly sourceTitle: string;
  readonly sourceType: 'paste' | 'subtitle' | 'passage';
  readonly createdDayKey: string;
  readonly status: string;
};

export type MineInput = {
  readonly eventId: string;
  readonly entryId: string;
  readonly reading: string;
  readonly sentence: string;
  readonly sourceTitle: string;
  readonly sourceType: 'paste' | 'subtitle' | 'passage';
};

export type MineResult = {
  readonly mined: boolean;
  readonly duplicate: boolean;
  readonly capReached: boolean;
  readonly queueCount: number;
  readonly item: MinedItemDTO | null;
};

export type ComprehensionInput = {
  readonly eventId: string;
  readonly skill: 'reading' | 'listening';
  readonly materialId: string;
  readonly exerciseId: string;
  readonly answerIndex: number;
};

type SkillFacts = {
  readonly itemKey: string;
  readonly skill: 'reading' | 'meaning';
  readonly distinctSuccessDays: number;
  readonly latestSuccess: boolean;
  readonly intervalDays: number;
};

/** Dictionary rows use `jmdict:` ids while snapshots expose stripped sourceIds. */
export function canonicalEntryId(id: string): string {
  return id.startsWith('jmdict:') ? id : `jmdict:${id}`;
}

function requireProfile(db: Db) {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');
  return profile;
}

/** Verified-per-skill facts, derived from stored cards and review logs. */
function verifiedSkills(db: Db, profileId: string): Map<string, SkillFacts> {
  const cards = db
    .prepare(`select item_key, skill, scheduler_state_json from review_cards
              where profile_id = ? and item_type = 'vocabulary'`)
    .all(profileId) as { item_key: string; skill: string; scheduler_state_json: string }[];
  const logs = db
    .prepare(`select c.item_key, c.skill, l.day_key, l.correct, l.hint_used, l.rating
              from review_logs l join review_cards c on c.id = l.card_id
              where l.profile_id = ? and l.undo_of is null order by l.day_key, l.rowid`)
    .all(profileId) as {
    item_key: string; skill: string; day_key: string; correct: number; hint_used: number; rating: number;
  }[];

  const result = new Map<string, SkillFacts>();
  for (const card of cards) {
    const skill = card.skill as SkillFacts['skill'];
    const skillLogs = logs.filter(
      (log) => log.item_key === card.item_key && log.skill === skill,
    );
    const latest = skillLogs.at(-1);
    const state = JSON.parse(card.scheduler_state_json) as { scheduledDays?: number };
    result.set(`${card.item_key}|${skill}`, {
      itemKey: card.item_key,
      skill,
      distinctSuccessDays: new Set(
        skillLogs.filter((log) => log.correct === 1 && log.hint_used === 0).map((log) => log.day_key),
      ).size,
      latestSuccess: latest?.correct === 1 && latest.hint_used === 0,
      intervalDays: Math.floor(Number(state.scheduledDays ?? 0)),
    });
  }
  return result;
}

function knownFlagsForEntry(
  skills: Map<string, SkillFacts>,
  entryId: string,
  itemKeysByEntry: Map<string, string>,
): { reading: boolean; meaning: boolean } {
  const itemKey = itemKeysByEntry.get(entryId);
  if (itemKey === undefined) return { reading: false, meaning: false };
  const verified = (skill: SkillFacts['skill']): boolean => {
    const facts = skills.get(`${itemKey}|${skill}`);
    return (
      facts !== undefined &&
      facts.distinctSuccessDays >= VERIFIED_MIN_DISTINCT_DAYS &&
      facts.latestSuccess &&
      facts.intervalDays >= VERIFIED_MIN_INTERVAL_DAYS
    );
  };
  return { reading: verified('reading'), meaning: verified('meaning') };
}

export async function analyzeText(
  db: Db,
  dictionary: DictionaryService,
  tokenizer: TokenizerService,
  input: {
    readonly text: string;
    readonly title: string;
    readonly sourceName: string;
    readonly kind: MediaKind;
    readonly persist?: boolean;
  },
  nowMs: number,
): Promise<AnalysisDTO> {
  const profile = requireProfile(db);
  if (input.text.trim().length === 0) throw AppError.validation('There is no text to analyse.', 'text');
  if (input.title.length > 120 || input.sourceName.length > 120) {
    throw AppError.validation('Title or source name is too long.');
  }

  const raw = await tokenizer.tokenize(input.text);
  const forms = new Set<string>();
  for (const token of raw) {
    forms.add(token.basicForm);
    forms.add(token.surface);
    if (token.reading.length > 0) forms.add(toHiragana(token.reading));
  }
  const resolved = dictionary.resolveForms([...forms]);
  const skills = verifiedSkills(db, profile.id);
  const itemKeysByEntry = new Map<string, string>();
  for (const row of listUserVocabulary(db, profile.id)) {
    if (!itemKeysByEntry.has(row.sourceEntryId)) itemKeysByEntry.set(row.sourceEntryId, row.itemKey);
    itemKeysByEntry.set(canonicalEntryId(row.sourceEntryId), row.itemKey);
  }

  const tokens: TokenDTO[] = [];
  const stored: MediaTokenRow[] = [];
  for (const token of raw) {
    const candidates =
      resolved.get(token.basicForm) ??
      resolved.get(token.surface) ??
      (token.reading.length > 0 ? resolved.get(toHiragana(token.reading)) : undefined) ??
      [];
    const entryId = candidates[0]?.id ?? null;
    const flags = entryId === null
      ? { reading: false, meaning: false }
      : knownFlagsForEntry(skills, entryId, itemKeysByEntry);
    tokens.push({
      ...token,
      entryId,
      candidates: candidates.slice(0, 3),
      knownReading: flags.reading,
      knownMeaning: flags.meaning,
    });
    stored.push({
      position: token.position,
      surface: token.surface,
      basicForm: token.basicForm,
      reading: token.reading,
      pos: token.pos,
      wordType: token.wordType,
      entryId,
      knownReading: flags.reading,
      knownMeaning: flags.meaning,
    });
  }

  const cover = summarizeCoverage(stored);
  const mediaId = input.persist === false ? '' : randomUUID();
  if (mediaId !== '') transaction(db, () => {
    insertMedia(db, {
      id: mediaId,
      profileId: profile.id,
      title: input.title.trim() || 'Untitled text',
      kind: input.kind,
      textContent: input.text,
      sourceName: input.sourceName.trim(),
      dayKey: todayInZone(profile.timezone, nowMs),
      createdAt: new Date(nowMs).toISOString(),
    });
    insertMediaTokens(db, mediaId, profile.id, stored);
  });

  return {
    mediaId,
    title: input.title.trim() || 'Untitled text',
    sourceText: input.text,
    kind: input.kind,
    tokens,
    coverage: cover,
    dictionaryRelease: dictionary.metadata().release,
    tokenizerVersion: TOKENIZER_VERSION,
  };
}

export function getAnalysis(
  db: Db,
  dictionary: DictionaryService,
  mediaId: string,
): AnalysisDTO | null {
  const profile = requireProfile(db);
  const media = getMedia(db, profile.id, mediaId);
  if (media === null) return null;
  const stored = listMediaTokens(db, mediaId);
  const forms = new Set<string>();
  for (const token of stored) {
    forms.add(token.basicForm);
    forms.add(token.surface);
    if (token.reading.length > 0) forms.add(toHiragana(token.reading));
  }
  const resolved = dictionary.resolveForms([...forms]);
  return {
    mediaId,
    title: media.title,
    sourceText: media.textContent,
    kind: media.kind,
    tokens: stored.map((token) => ({
      position: token.position,
      surface: token.surface,
      basicForm: token.basicForm,
      reading: token.reading,
      pos: token.pos,
      wordType: token.wordType,
      entryId: token.entryId,
      candidates:
        resolved.get(token.basicForm) ??
        resolved.get(token.surface) ??
        (token.reading.length > 0 ? resolved.get(toHiragana(token.reading)) : undefined) ??
        [],
      knownReading: token.knownReading,
      knownMeaning: token.knownMeaning,
    })),
    coverage: summarizeCoverage(stored),
    dictionaryRelease: dictionary.metadata().release,
    tokenizerVersion: TOKENIZER_VERSION,
  };
}

function toMinedItem(row: MinedItemRow): MinedItemDTO {
  return {
    id: row.id,
    entryId: row.sourceEntryId,
    itemKey: row.itemKey,
    snapshot: JSON.parse(row.snapshotJson) as DictionaryEntry,
    sentence: row.sentence,
    sourceTitle: row.sourceTitle,
    sourceType: row.sourceType,
    createdDayKey: row.createdDayKey,
    status: row.status,
  };
}

export function mineToken(db: Db, dictionary: DictionaryService, input: MineInput, nowMs: number): MineResult {
  const profile = requireProfile(db);
  if (input.sentence.length === 0 || input.sentence.length > 500) {
    throw AppError.validation('A mined sentence must be between 1 and 500 characters.', 'sentence');
  }
  if (input.sourceTitle.length > 120 || input.reading.length > 80) {
    throw AppError.validation('Source title or reading is too long.');
  }

  return transaction(db, () => {
    const previous = findEvent(db, input.eventId);
    if (previous !== null) {
      if (previous.type !== 'immersion.mined') {
        throw AppError.conflict('That event id belongs to a different action.', 'eventId');
      }
      const payload = JSON.parse(previous.payloadJson) as { id: string };
      const existing = getMinedItem(db, profile.id, payload.id);
      if (existing === null) throw AppError.notFound('The mined item no longer exists.');
      return {
        mined: false, duplicate: true, capReached: false,
        queueCount: countQueuedOnDay(db, profile.id, todayInZone(profile.timezone, nowMs)),
        item: toMinedItem(existing),
      };
    }

    const entry = dictionary.getEntry(input.entryId);
    if (entry === null) throw AppError.notFound('That dictionary entry does not exist.');
    const dayKey = todayInZone(profile.timezone, nowMs);
    const canonical = canonicalEntryId(entry.id);
    if (
      listUserVocabulary(db, profile.id).some(
        (word) => canonicalEntryId(word.sourceEntryId) === canonical,
      )
    ) {
      return { mined: false, duplicate: true, capReached: false, queueCount: 0, item: null };
    }
    const queued = countQueuedOnDay(db, profile.id, dayKey);
    if (queued >= MINED_DAILY_CAP) {
      return { mined: false, duplicate: false, capReached: true, queueCount: queued, item: null };
    }

    const itemKey = `${canonical}|${input.reading.trim()}`;
    const row = insertMinedItem(db, {
      id: randomUUID(),
      profileId: profile.id,
      sourceEntryId: canonical,
      itemKey,
      snapshotJson: JSON.stringify(entry),
      sentence: input.sentence.trim(),
      sourceTitle: input.sourceTitle.trim(),
      sourceType: input.sourceType,
      position: queued,
      status: 'queued',
      eventId: input.eventId,
      createdDayKey: dayKey,
      createdAt: new Date(nowMs).toISOString(),
    });
    insertEvent(db, {
      eventId: input.eventId,
      profileId: profile.id,
      dayKey,
      type: 'immersion.mined',
      payloadJson: JSON.stringify({ id: row.id }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    return {
      mined: true, duplicate: false, capReached: false,
      queueCount: queued + 1, item: toMinedItem(row),
    };
  });
}

export function listMiningQueue(db: Db, offset: number, limit: number): readonly MinedItemDTO[] {
  const profile = requireProfile(db);
  return listMinedItems(db, profile.id, 'queued', offset, limit).map(toMinedItem);
}

export function countMiningQueue(db: Db): number {
  const profile = requireProfile(db);
  const row = db
    .prepare("select count(*) c from mined_items where profile_id = ? and status = 'queued'")
    .get(profile.id) as { c: number };
  return row.c;
}

export function dismissMined(db: Db, id: string): boolean {
  const profile = requireProfile(db);
  return markMinedStatus(db, profile.id, id, 'dismissed') !== null;
}

export function submitComprehension(
  db: Db,
  input: ComprehensionInput,
  nowMs: number,
): { readonly correct: boolean; readonly rationale: string } {
  const profile = requireProfile(db);
  if (!Number.isInteger(input.answerIndex) || input.answerIndex < 0 || input.answerIndex > 20) {
    throw AppError.validation('Choose one of the listed answers.', 'answerIndex');
  }
  const passage = getPassage(input.materialId);
  const exercise = passage?.exercises.find((item) => item.id === input.exerciseId);
  if (passage === undefined || exercise === undefined) {
    throw AppError.validation('This comprehension exercise is not available.', 'exerciseId');
  }
  if (input.answerIndex >= exercise.choices.length) {
    throw AppError.validation('Choose one of the listed answers.', 'answerIndex');
  }

  return transaction(db, () => {
    const previous = findEvent(db, input.eventId);
    if (previous !== null) {
      const payload = JSON.parse(previous.payloadJson) as { correct: boolean };
      return { correct: payload.correct === true, rationale: exercise.rationale };
    }
    const correct = passageAnswerCorrect(passage, input.exerciseId, input.answerIndex);
    const dayKey = todayInZone(profile.timezone, nowMs);
    insertComprehensionAttempt(db, {
      id: randomUUID(),
      profileId: profile.id,
      skill: input.skill,
      materialId: input.materialId,
      exerciseId: input.exerciseId,
      dayKey,
      attemptedAt: new Date(nowMs).toISOString(),
      correct,
      answer: exercise.choices[input.answerIndex] ?? '',
    });
    insertEvent(db, {
      eventId: input.eventId,
      profileId: profile.id,
      dayKey,
      type: 'comprehension.answered',
      payloadJson: JSON.stringify({
        materialId: input.materialId, exerciseId: input.exerciseId, correct,
      }),
      occurredAt: new Date(nowMs).toISOString(),
    });
    return { correct, rationale: exercise.rationale };
  });
}


/** Imports a user-chosen local file. The path always comes from a native dialog. */
export async function importSubtitleFile(
  db: Db,
  dictionary: DictionaryService,
  tokenizer: TokenizerService,
  filePath: string,
  nowMs: number,
): Promise<AnalysisDTO> {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.srt', '.ass', '.txt'].includes(extension)) {
    throw AppError.validation('Only .srt, .ass and .txt files are supported.', 'filePath');
  }
  let text: string;
  try {
    const bytes = readFileSync(filePath);
    if (bytes.length > 200_000) throw AppError.validation('The file is too large.');
    text = bytes.toString('utf8');
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw AppError.dbIo('The selected file could not be read.');
  }

  let cues;
  try {
    cues = parseSubtitle(text, path.basename(filePath));
  } catch (cause) {
    if (cause instanceof SubtitleError) throw AppError.validation(cause.message, 'filePath');
    throw cause;
  }
  if (cues.length === 0) throw AppError.validation('No usable dialogue was found in that file.');

  return analyzeText(
    db,
    dictionary,
    tokenizer,
    {
      text: cues.map((cue) => cue.text).join('\n'),
      title: path.basename(filePath, extension),
      sourceName: path.basename(filePath),
      kind: extension === '.txt' ? 'text' : 'subtitle',
      persist: false,
    },
    nowMs,
  );
}
