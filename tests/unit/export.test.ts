import { describe, expect, it } from 'vitest';
import { serializeProgress, type ExportPayload } from '../../src/shared/export';

const payload: ExportPayload = {
  exportedAt: '2026-05-17T12:00:00.000Z',
  profile: { id: 'p1', displayName: 'Learner', startDate: '2026-05-17', timezone: 'UTC' },
  goals: [{ effectiveDate: '2026-05-17', dailyMinutes: 120, dailyNewWords: 15 }],
  days: [{
    dayKey: '2026-05-17', eligible: true, targetMinutes: 120, targetWords: 15,
    minutes: 60, newWords: 5, reviews: 2, kanaAttempts: 3,
  }],
  vocabulary: [{ itemKey: 'jmdict:1', notes: 'private note' }],
  immersion: [{ dayKey: '2026-05-17', title: 'Anime, episode 1', notes: 'private', deliberate: true, durationSeconds: 900 }],
};

describe('serializeProgress', () => {
  it('exports valid JSON and omits notes by default', () => {
    const text = serializeProgress(payload, 'json', false);
    const parsed = JSON.parse(text) as typeof payload;
    expect(parsed.profile.displayName).toBe('Learner');
    expect(JSON.stringify(parsed)).not.toContain('private note');
  });

  it('includes notes when explicitly opted in', () => {
    expect(serializeProgress(payload, 'json', true)).toContain('private note');
  });

  it('escapes CSV fields and uses a stable header', () => {
    const csv = serializeProgress(payload, 'csv', false);
    expect(csv.split('\n')[0]).toBe('day_key,eligible,target_minutes,target_words,minutes,new_words,reviews');
    expect(csv).toContain('"Anime, episode 1"');
    expect(csv).not.toContain('private');
  });
});
