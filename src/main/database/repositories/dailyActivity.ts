/** Per-day actual activity, aggregated from source tables. No derived counters. */

import type { Db } from '../connection';

export type DayActivity = {
  readonly minutes: number;
  readonly newWords: number;
  readonly reviews: number;
  readonly kanaAttempts: number;
};

type Row = { day_key: string; kind: string; value: number };

export function getDailyActivity(
  db: Db,
  profileId: string,
  from: string,
  to: string,
): Map<string, DayActivity> {
  // Minutes are combined as raw seconds in one row so a timer session and a
  // deliberate external log add up instead of overwriting each other.
  const rows = db
    .prepare(
      `select day_key, 'minutes' as kind, sum(seconds) as value from (
         select seg.day_key as day_key, seg.active_seconds as seconds
         from session_segments seg join study_sessions s on s.id = seg.session_id
         where s.profile_id = ? and seg.day_key >= ? and day_key < ?
         union all
         select day_key, duration_seconds as seconds
         from immersion_logs
         where profile_id = ? and deliberate = 1 and day_key >= ? and day_key < ?
       ) group by day_key
       union all
       select introduced_day_key as day_key, 'newWords' as kind, count(*) as value
       from user_vocabulary
       where profile_id = ? and introduced_day_key >= ? and introduced_day_key < ?
       group by introduced_day_key
       union all
       select day_key, 'reviews' as kind, count(*) as value
       from review_logs
       where profile_id = ? and undo_of is null
         and id not in (select undo_of from review_logs where profile_id = ? and undo_of is not null)
         and day_key >= ? and day_key < ?
       group by day_key
       union all
       select day_key, 'kanaAttempts' as kind, count(*) as value
       from kana_attempts
       where profile_id = ? and day_key >= ? and day_key < ?
       group by day_key`,
    )
    .all(
      profileId, from, to,
      profileId, from, to,
      profileId, from, to,
      profileId, profileId, from, to,
      profileId, from, to,
    ) as Row[];

  const result = new Map<string, DayActivity>();
  for (const row of rows) {
    const current = result.get(row.day_key) ?? {
      minutes: 0,
      newWords: 0,
      reviews: 0,
      kanaAttempts: 0,
    };
    const value = row.kind === 'minutes' ? Math.floor(row.value / 60) : row.value;
    result.set(row.day_key, { ...current, [row.kind]: value });
  }
  return result;
}
