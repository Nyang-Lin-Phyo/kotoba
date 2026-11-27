/**
 * Migration 002 — kana study, event log and session timer.
 *
 * IMMUTABLE: never edit after shipping. All user-owned rows carry profile_id
 * and cascade from `profiles`. `scheduler_version` on progress lets M5 swap in
 * FSRS without discarding attempt history.
 */

export const migration002 = {
  version: 2,
  name: 'kana study and timer',
  sql: `
create table kana_progress (
  profile_id text not null references profiles (id) on delete cascade,
  kana_id text not null,
  correct_unhinted integer not null default 0 check (correct_unhinted >= 0),
  correct_days integer not null default 0 check (correct_days >= 0),
  first_correct_day text,
  last_correct_day text,
  last_attempt_day text,
  last_attempt_correct integer check (last_attempt_correct in (0, 1)),
  lapses integer not null default 0 check (lapses >= 0),
  due_day text,
  verified integer not null default 0 check (verified in (0, 1)),
  interval_tier integer not null default 0 check (interval_tier >= 0),
  scheduler_version text not null default 'interval-v1',
  updated_at text not null,
  primary key (profile_id, kana_id)
);

create index kana_progress_due on kana_progress (profile_id, due_day);

create table kana_attempts (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  kana_id text not null,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  mode text not null check (mode in ('typed', 'choice')),
  raw text not null,
  correct integer not null check (correct in (0, 1)),
  hint_used integer not null check (hint_used in (0, 1)),
  response_ms integer not null check (response_ms >= 0 and response_ms <= 600000),
  attempted_at text not null,
  event_id text not null unique
);

create index kana_attempts_day on kana_attempts (profile_id, day_key);

create table study_events (
  event_id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  type text not null,
  payload_json text not null default '{}',
  occurred_at text not null
);

create index study_events_day on study_events (profile_id, day_key);

create table study_sessions (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  activity_type text not null
    check (activity_type in ('kana', 'vocabulary', 'reviews', 'grammar', 'reading', 'listening', 'speaking')),
  started_at text not null,
  ended_at text,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  status text not null
    check (status in ('running', 'paused', 'stopped', 'interrupted')),
  source text not null check (source in ('timer', 'manual')),
  last_checkpoint_at text not null
);

create index study_sessions_profile on study_sessions (profile_id, status);

create table session_segments (
  id text primary key,
  session_id text not null references study_sessions (id) on delete cascade,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  started_at text not null,
  ended_at text not null,
  active_seconds integer not null check (active_seconds >= 0)
);

create index session_segments_day on session_segments (day_key, session_id);
`,
};
