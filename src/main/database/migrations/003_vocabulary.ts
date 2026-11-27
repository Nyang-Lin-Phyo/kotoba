/**
 * Migration 003 — personal vocabulary, stable daily words and FSRS review state.
 *
 * IMMUTABLE: never edit after shipping. Every user-owned row carries profile_id.
 */

export const migration003 = {
  version: 3,
  name: 'vocabulary and FSRS reviews',
  sql: `
create table user_vocabulary (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  item_key text not null,
  source_entry_id text not null,
  snapshot_json text not null,
  introduced_at text,
  introduced_day_key text,
  familiarity_flag integer not null default 0 check (familiarity_flag in (0, 1)),
  notes text not null default '',
  created_at text not null,
  updated_at text not null
);
create unique index user_vocabulary_unique on user_vocabulary (profile_id, item_key);
create index user_vocabulary_day on user_vocabulary (profile_id, introduced_day_key);

create table daily_new_items (
  id text primary key,
  plan_id text not null references daily_plans (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  item_key text not null,
  position integer not null check (position >= 0),
  state text not null default 'assigned'
    check (state in ('assigned', 'introduced', 'deferred', 'familiar')),
  created_at text not null
);
create unique index daily_new_items_unique on daily_new_items (plan_id, item_key);

create table review_cards (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  item_type text not null check (item_type in ('vocabulary', 'kana')),
  item_key text not null,
  skill text not null check (skill in ('meaning', 'reading')),
  scheduler_version text not null,
  due_at text not null,
  scheduler_state_json text not null,
  last_review_at text,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  created_at text not null,
  updated_at text not null
);
create unique index review_cards_unique on review_cards (profile_id, item_type, item_key, skill);
create index review_cards_due on review_cards (profile_id, due_at);

create table review_logs (
  id text primary key,
  event_id text not null unique,
  card_id text not null references review_cards (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  reviewed_at text not null,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  rating integer not null check (rating between 1 and 4),
  correct integer not null check (correct in (0, 1)),
  hint_used integer not null check (hint_used in (0, 1)),
  response_ms integer not null check (response_ms >= 0 and response_ms <= 600000),
  prior_state_json text not null,
  new_state_json text not null,
  scheduler_version text not null,
  undo_of text
);
create index review_logs_card on review_logs (card_id, reviewed_at);
create index review_logs_day on review_logs (profile_id, day_key);

create table familiarity_diagnostics (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  item_key text not null,
  correct integer not null check (correct in (0, 1)),
  responded_at text not null,
  day_key text not null
    check (day_key glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
create index familiarity_diagnostics_item on familiarity_diagnostics (profile_id, item_key);
`,
};
