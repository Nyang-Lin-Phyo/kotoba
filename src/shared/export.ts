/** Pure, deterministic progress serializers used by the main-process export. */

import type { DayFactsDTO } from './contracts';

export type ExportPayload = {
  readonly exportedAt: string;
  readonly profile: {
    readonly id: string;
    readonly displayName: string;
    readonly startDate: string;
    readonly timezone: string;
  };
  readonly goals: readonly {
    readonly effectiveDate: string;
    readonly dailyMinutes: number;
    readonly dailyNewWords: number;
  }[];
  readonly days: readonly DayFactsDTO[];
  readonly vocabulary: readonly { readonly itemKey: string; readonly notes?: string }[];
  readonly immersion: readonly {
    readonly dayKey: string;
    readonly title: string;
    readonly durationSeconds: number;
    readonly deliberate: boolean;
    readonly notes?: string;
  }[];
};

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeProgress(
  payload: ExportPayload,
  format: 'json' | 'csv',
  includeNotes: boolean,
): string {
  if (format === 'json') {
    const clean = {
      ...payload,
      vocabulary: payload.vocabulary.map((item) => ({
        itemKey: item.itemKey,
        ...(includeNotes && item.notes !== undefined ? { notes: item.notes } : {}),
      })),
      immersion: payload.immersion.map((item) => ({
        dayKey: item.dayKey,
        title: item.title,
        durationSeconds: item.durationSeconds,
        deliberate: item.deliberate,
        ...(includeNotes && item.notes !== undefined ? { notes: item.notes } : {}),
      })),
    };
    return JSON.stringify(clean, null, 2);
  }

  const lines = [
    'day_key,eligible,target_minutes,target_words,minutes,new_words,reviews',
    ...payload.days.map((day) =>
      [
        day.dayKey, day.eligible, day.targetMinutes, day.targetWords,
        day.minutes, day.newWords, day.reviews,
      ].map(csvCell).join(','),
    ),
    '',
    'immersion_day,title,duration_seconds,deliberate',
    ...payload.immersion.map((item) =>
      [item.dayKey, item.title, item.durationSeconds, item.deliberate].map(csvCell).join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}
