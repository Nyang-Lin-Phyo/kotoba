/**
 * Migration 001 — the initial profile schema.
 *
 * IMMUTABLE: this file must never be edited after it has shipped. Schema changes
 * go into a new numbered migration so existing user databases can be upgraded.
 *
 * Design notes:
 * - Every user-owned row carries `profile_id`, so adding profile switching later
 *   needs no schema change.
 * - Calendar dates are `YYYY-MM-DD` text, never timestamps, and are checked with
 *   GLOB so a malformed date cannot be written.
 * - `profiles_single_active` is a partial unique index: the schema supports many
 *   profiles while the UI shows exactly one.
 */

export const migration001 = {
  version: 1,
  name: 'initial profile schema',
  sql: `
create table profiles (
  id text primary key,
  display_name text not null default '',
  start_date text not null
    check (start_date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  horizon_months integer not null check (horizon_months between 1 and 120),
  timezone text not null,
  initial_level text not null,
  target_jlpt text,
  interests_json text not null default '[]',
  preferences_json text not null default '{}',
  is_active integer not null default 0 check (is_active in (0, 1)),
  created_at text not null,
  updated_at text not null
);

create unique index profiles_single_active on profiles (is_active) where is_active = 1;

create table goal_versions (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  effective_date text not null
    check (effective_date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  daily_minutes integer not null check (daily_minutes between 0 and 1440),
  daily_new_words integer not null check (daily_new_words between 0 and 200),
  created_at text not null
);

create unique index goal_versions_unique_day on goal_versions (profile_id, effective_date);

create table daily_plans (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  goal_version_id text references goal_versions (id) on delete set null,
  curriculum_day integer not null check (curriculum_day >= 1),
  curriculum_week integer not null check (curriculum_week >= 1),
  curriculum_month integer not null check (curriculum_month >= 1),
  phase text not null check (phase in ('foundation', 'core', 'expansion')),
  target_minutes integer not null check (target_minutes >= 0),
  target_words integer not null check (target_words >= 0),
  plan_version integer not null default 1,
  created_at text not null
);

create unique index daily_plans_unique_day on daily_plans (profile_id, day_key);

create table daily_assignments (
  id text primary key,
  plan_id text not null references daily_plans (id) on delete cascade,
  activity_type text not null
    check (activity_type in ('kana', 'vocabulary', 'reviews', 'grammar', 'reading', 'listening', 'speaking')),
  minutes integer not null check (minutes >= 0),
  words integer check (words is null or words >= 0),
  sequence integer not null check (sequence >= 0),
  unique (plan_id, activity_type)
);

create table app_settings (
  key text primary key,
  value text not null,
  updated_at text not null
);
`,
};
