/** Migration 005 — personal kanji and grammar progress. */

export const migration005 = {
  version: 5,
  name: 'kanji and grammar progress',
  sql: `
create table user_kanji (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  literal text not null,
  first_day_key text not null,
  status text not null check (status in ('encountered', 'learning', 'verified')),
  due_day text,
  interval_days integer not null default 0 check (interval_days >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_attempt_day text,
  updated_at text not null,
  unique (profile_id, literal)
);
create index user_kanji_due on user_kanji (profile_id, due_day);

create table kanji_attempts (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  literal text not null,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  attempted_at text not null,
  correct integer not null check (correct in (0, 1)),
  hint_used integer not null check (hint_used in (0, 1)),
  response_ms integer not null check (response_ms >= 0 and response_ms <= 600000),
  word_context text not null default ''
);
create index kanji_attempts_literal on kanji_attempts (profile_id, literal, day_key);

create table grammar_progress (
  profile_id text not null references profiles (id) on delete cascade,
  unit_id text not null,
  status text not null check (status in ('available', 'in-progress', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  completed_at text,
  updated_at text not null,
  primary key (profile_id, unit_id)
);

create table grammar_attempts (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  unit_id text not null,
  exercise_id text not null,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  attempted_at text not null,
  correct integer not null check (correct in (0, 1)),
  answer text not null default ''
);
create index grammar_attempts_unit on grammar_attempts (profile_id, unit_id, day_key);
`,
};
