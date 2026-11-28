/** Builds and writes a user-owned progress export. No network, no cloud. */

import { writeFileSync } from 'node:fs';
import type { ExportPayload } from '../../shared/export';
import { serializeProgress } from '../../shared/export';
import { AppError } from '../../shared/errors';
import type { Db } from '../database/connection';
import { listGoalVersions } from '../database/repositories/goalVersions';
import { getActiveProfile } from '../database/repositories/profiles';
import { listUserVocabulary } from '../database/repositories/vocabulary';
import { getFullHistoryDays } from './stats';
import { listExternalLogs } from './immersion';

export function buildExportPayload(db: Db, nowMs: number): ExportPayload {
  const profile = getActiveProfile(db);
  if (profile === null) throw AppError.notFound('No profile exists yet.');

  return {
    exportedAt: new Date(nowMs).toISOString(),
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      startDate: profile.startDate,
      timezone: profile.timezone,
    },
    goals: listGoalVersions(db, profile.id).map((goal) => ({
      effectiveDate: goal.effectiveDate,
      dailyMinutes: goal.dailyMinutes,
      dailyNewWords: goal.dailyNewWords,
    })),
    days: getFullHistoryDays(db, nowMs),
    vocabulary: listUserVocabulary(db, profile.id).map((row) => ({
      itemKey: row.itemKey,
      notes: row.notes,
    })),
    immersion: listExternalLogs(db, 0, 10_000).map((log) => ({
      dayKey: log.dayKey,
      title: log.title,
      durationSeconds: log.durationSeconds,
      deliberate: log.deliberate,
      notes: log.notes,
    })),
  };
}

export function writeProgressExport(
  payload: ExportPayload,
  format: 'json' | 'csv',
  includeNotes: boolean,
  filePath: string,
): void {
  const extension = format === 'json' ? '.json' : '.csv';
  if (!filePath.toLowerCase().endsWith(extension)) {
    throw AppError.validation(`The export file must end in ${extension}.`);
  }
  const text = serializeProgress(payload, format, includeNotes);
  if (Buffer.byteLength(text, 'utf8') > 50 * 1024 * 1024) {
    throw AppError.validation('The export is too large. Export a smaller date range first.');
  }
  try {
    writeFileSync(filePath, text, { encoding: 'utf8', flag: 'w' });
  } catch (cause) {
    throw AppError.dbIo(`Could not write the export: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
