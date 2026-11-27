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
export type StudyStartInput = z.infer<typeof studyStartSchema>;
export type AcknowledgeInterruptedInput = z.infer<typeof acknowledgeInterruptedSchema>;
