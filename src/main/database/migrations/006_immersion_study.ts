/** Migration 006 — mined items, user media, cached tokens and comprehension attempts. */

export const migration006 = {
  version: 6,
  name: 'immersion study',
  sql: `
create table mined_items (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  source_entry_id text not null,
  item_key text not null,
  snapshot_json text not null,
  sentence text not null,
  source_title text not null default '',
  source_type text not null check (source_type in ('paste', 'subtitle', 'passage')),
  position integer not null default 0 check (position >= 0),
  status text not null check (status in ('queued', 'introduced', 'dismissed')),
  event_id text not null,
  created_day_key text not null,
  created_at text not null,
  unique (profile_id, source_entry_id, sentence, item_key)
);
create index mined_items_queue on mined_items (profile_id, status, created_day_key);

create table media_items (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('paste', 'subtitle', 'text')),
  text_content text not null,
  source_name text not null default '',
  day_key text not null,
  created_at text not null
);
create index media_items_profile on media_items (profile_id, created_at);

create table media_tokens (
  media_id text not null references media_items (id) on delete cascade,
  profile_id text not null references profiles (id) on delete cascade,
  position integer not null check (position >= 0),
  surface text not null,
  basic_form text not null,
  reading text not null,
  pos text not null,
  word_type text not null,
  entry_id text,
  known_reading integer not null check (known_reading in (0, 1)),
  known_meaning integer not null check (known_meaning in (0, 1)),
  primary key (media_id, position)
);

create table comprehension_attempts (
  id text primary key,
  profile_id text not null references profiles (id) on delete cascade,
  skill text not null check (skill in ('reading', 'listening')),
  material_id text not null,
  exercise_id text not null,
  day_key text not null,
  attempted_at text not null,
  correct integer not null check (correct in (0, 1)),
  answer text not null
);
create index comprehension_material on comprehension_attempts (profile_id, skill, material_id);
`,
};
