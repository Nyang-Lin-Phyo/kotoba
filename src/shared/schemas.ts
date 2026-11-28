/**
 * Runtime validation for everything the renderer can send to the main process.
 *
 * These schemas live apart from `contracts.ts` so the preload and renderer
 * bundles can import the channel names and DTO types without pulling Zod in.
 * The main process is the only place that parses untrusted payloads.
 */

import { z } from 'zod';
import { isDateKey, isValidTimeZone } from './date';
import { ACTIVITY_TYPES } from './goals';
import {
  AUDIO_PREFERENCES,
  INITIAL_LEVELS,
  INTERESTS,
  JLPT_TARGETS,
  THEME_CHOICES,
} from './enums';

const dateKeySchema = z
  .string()
  .refine(isDateKey, 'Expected a real calendar date in YYYY-MM-DD form');

const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, 'Unknown IANA timezone');

const minutesSchema = z.number().int().min(10).max(600);
const newWordsSchema = z.number().int().min(0).max(100);

export const profilePreferencesSchema = z.object({
  romaji: z.boolean(),
  furigana: z.boolean(),
  audio: z.enum(AUDIO_PREFERENCES),
  desiredRetention: z.number().min(0.8).max(0.95).optional(),
});

export const profileInputSchema = z.object({
  displayName: z.string().trim().max(80),
  startDate: dateKeySchema,
  horizonMonths: z.number().int().min(1).max(120),
  timezone: timeZoneSchema,
  initialLevel: z.enum(INITIAL_LEVELS),
  targetJlpt: z.enum(JLPT_TARGETS).nullable(),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length),
  dailyMinutes: minutesSchema,
  dailyNewWords: newWordsSchema,
  preferences: profilePreferencesSchema,
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  timezone: timeZoneSchema.optional(),
  targetJlpt: z.enum(JLPT_TARGETS).nullable().optional(),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).optional(),
  preferences: profilePreferencesSchema.optional(),
});

export const goalInputSchema = z.object({
  effectiveDate: dateKeySchema,
  dailyMinutes: minutesSchema,
  dailyNewWords: newWordsSchema,
});

export const appSettingsInputSchema = z.object({
  theme: z.enum(THEME_CHOICES),
});

/**
 * A backup is referenced by file name only, never by path: the renderer cannot
 * ask the main process to read or overwrite an arbitrary file.
 */
export const backupRestoreSchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/, 'Backup names may only contain letters, digits, dot, dash and underscore'),
});

/**
 * `eventId` comes from the renderer so retrying a submission is idempotent.
 * It must be a UUID, which also keeps it safe to store as a primary key.
 */
export const kanaAttemptInputSchema = z.object({
  kanaId: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[hk]-[a-z]+$/, 'Unknown kana id format'),
  mode: z.enum(['typed', 'choice']),
  raw: z.string().max(80),
  hintUsed: z.boolean(),
  responseMs: z.number().int().min(0).max(600000),
  eventId: z.string().uuid(),
});

export const kanaLessonInputSchema = z.object({
  script: z.enum(['hiragana', 'katakana']),
  groupId: z.string().min(1).max(32),
});

export const studyStartSchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
});

export const acknowledgeInterruptedSchema = z.object({
  sessionId: z.string().uuid(),
});

/** Channels that take no payload still get a schema, so a stray payload is rejected. */
export const noInputSchema = z.undefined();

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type AppSettingsInput = z.infer<typeof appSettingsInputSchema>;
export type BackupRestoreInput = z.infer<typeof backupRestoreSchema>;
export type KanaAttemptInput = z.infer<typeof kanaAttemptInputSchema>;
export type KanaLessonInput = z.infer<typeof kanaLessonInputSchema>;
export const dictionarySearchSchema = z.object({
  query: z.string().min(1).max(80),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export const dictionaryIdSchema = z.object({
  id: z.string().min(1).max(64),
});

export const immersionAddSchema = z.object({
  eventId: z.string().uuid(),
  durationSeconds: z.number().int().min(1).max(86400),
  activityType: z.enum(ACTIVITY_TYPES),
  title: z.string().max(120),
  notes: z.string().max(4000),
  deliberate: z.boolean(),
});

export const immersionCorrectSchema = z.object({
  eventId: z.string().uuid(),
  id: z.string().min(1).max(64),
  reason: z.string().trim().min(2).max(200),
  durationSeconds: z.number().int().min(1).max(86400).optional(),
  title: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  deliberate: z.boolean().optional(),
});

export const paginationSchema = z.object({
  offset: z.number().int().min(0).max(100000),
  limit: z.number().int().min(1).max(200),
});

export const exportInputSchema = z.object({
  format: z.enum(['json', 'csv']),
  includeNotes: z.boolean(),
});

export const calendarDaySchema = z.object({
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

export const itemOnlySchema = z.object({
  itemId: z.string().min(1).max(64),
});

export const notesSchema = z.object({
  itemId: z.string().min(1).max(64),
  notes: z.string().max(4000),
});

export const ratingSchema = z.object({
  cardId: z.string().min(1).max(64),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  expectedStateJson: z.string().min(1).max(20000),
  responseMs: z.number().int().min(0).max(600000),
  hintUsed: z.boolean(),
  eventId: z.string().uuid(),
});

export const reviewCardIdSchema = z.object({
  cardId: z.string().min(1).max(64),
});

export const undoReviewSchema = z.object({
  cardId: z.string().min(1).max(64),
  eventId: z.string().uuid(),
});

export const learningIdSchema = z.object({
  itemId: z.string().min(1).max(64),
  eventId: z.string().uuid(),
});

export const familiarSchema = z.object({
  itemId: z.string().min(1).max(64),
  familiar: z.boolean(),
  diagnosticCorrect: z.boolean(),
});

export const libraryQuerySchema = z.object({
  text: z.string().max(80).optional(),
  offset: z.number().int().min(0).max(100_000),
  limit: z.number().int().min(1).max(100),
});

export const kanjiAttemptSchema = z.object({
  eventId: z.string().uuid(),
  literal: z.string().regex(/^[\u3400-\u9FFF]$/),
  correct: z.boolean(),
  hintUsed: z.boolean(),
  responseMs: z.number().int().min(0).max(600000),
  wordContext: z.string().max(80),
});

export const grammarAttemptSchema = z.object({
  eventId: z.string().uuid(),
  unitId: z.string().min(1).max(64),
  exerciseId: z.string().min(1).max(64),
  answerIndex: z.number().int().min(0).max(20),
});

export const immersionAnalyzeSchema = z.object({
  text: z.string().min(1).max(20000),
  title: z.string().max(120),
  sourceName: z.string().max(120),
  kind: z.enum(['paste', 'subtitle', 'text']),
  persist: z.boolean().optional(),
});

export const mediaIdSchema = z.object({ id: z.string().min(1).max(64) });

export const immersionMineSchema = z.object({
  eventId: z.string().uuid(),
  entryId: z.string().min(1).max(64),
  reading: z.string().max(80),
  sentence: z.string().min(1).max(500),
  sourceTitle: z.string().max(120),
  sourceType: z.enum(['paste', 'subtitle', 'passage']),
});

export const comprehensionSchema = z.object({
  eventId: z.string().uuid(),
  skill: z.enum(['reading', 'listening']),
  materialId: z.string().min(1).max(64),
  exerciseId: z.string().min(1).max(64),
  answerIndex: z.number().int().min(0).max(20),
});

export type ImmersionAnalyzeInput = z.infer<typeof immersionAnalyzeSchema>;
export type MediaIdInput = z.infer<typeof mediaIdSchema>;
export type ImmersionMineInput = z.infer<typeof immersionMineSchema>;
export type ComprehensionInput = z.infer<typeof comprehensionSchema>;
export type KanjiAttemptInput = z.infer<typeof kanjiAttemptSchema>;
export type GrammarAttemptInput = z.infer<typeof grammarAttemptSchema>;
export type StudyStartInput = z.infer<typeof studyStartSchema>;
export type AcknowledgeInterruptedInput = z.infer<typeof acknowledgeInterruptedSchema>;
export type DictionarySearchInput = z.infer<typeof dictionarySearchSchema>;
export type DictionaryIdInput = z.infer<typeof dictionaryIdSchema>;
export type IntroductionInput = z.infer<typeof learningIdSchema>;
export type FamiliarInput = z.infer<typeof familiarSchema>;
export type LibraryQueryInput = z.infer<typeof libraryQuerySchema>;
export type RatingInput = z.infer<typeof ratingSchema>;
export type NotesInput = z.infer<typeof notesSchema>;
export type UndoReviewInput = z.infer<typeof undoReviewSchema>;
export type ReviewCardIdInput = z.infer<typeof reviewCardIdSchema>;
