/** Migration 004 — manual immersion logs with an append-only correction audit. */

export const migration004 = {
  version: 4,
  name: 'immersion logs and corrections',
  sql: `
create table immersion_logs (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  started_at text not null,
  duration_seconds integer not null check (duration_seconds > 0 and duration_seconds <= 86400),
  activity_type text not null
    check (activity_type in ('kana','vocabulary','reviews','grammar','reading','listening','speaking')),
  title text not null default '',
  notes text not null default '',
  deliberate integer not null check (deliberate in (0, 1)),
  created_at text not null,
  updated_at text not null
);
create index immersion_logs_day on immersion_logs (profile_id, day_key);

create table immersion_corrections (
  id text primary key,
  log_id text not null references immersion_logs (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  changed_at text not null,
  reason text not null,
  before_json text not null,
  after_json text not null
);
create index immersion_corrections_log on immersion_corrections (log_id);
`,
};
