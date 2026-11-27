# M5b/M5c design — daily vocabulary and FSRS reviews

Date: 2026-11-27
Status: **proposed** (awaiting approval)

## Intent and why

M5a shipped a searchable offline dictionary. M5b turns it into a daily lesson: a stable set of 15
new unique words per study day, recorded once, with a personal library and separate skill states.
M5c adds the Anki-like review engine using `ts-fsrs`, so due reviews are prioritized, ratings are
recorded atomically, and knowledge metrics are computed from real history. The user will run Windows
CI and try the app after both phases. They are implemented as one plan with two separately tested
phases (M5b data/lesson first, M5c reviews/metrics second), not as a single untestable change.

## Goals

- Stable daily assignment of new words from the bundled dictionary, excluding already introduced
  items; no duplicates from alternate spellings or repeated requests.
- First introduction is a transaction: snapshot, personal item, two skill cards, event. Counted once.
- Self-reported familiarity with a short diagnostic; familiar items leave the new-word queue and
  are not counted as introduced.
- FSRS in main with full scheduler state, four ratings, undo, conflict detection, due-first queue,
  session limits and injectable clock for deterministic tests.
- Honest metrics: introduced, familiar, learning, struggling, due, accuracy, and "verified
  recognition" with a precise versioned definition.
- Personal vocabulary list and review UI wired into sidebar, Dashboard and Profile.

## Non-goals

- No optimizer/parameter training, no automatic rescheduling on retention change, no JLPT claims.
- No kanji or grammar cards, sentence mining, tokenizer, immersion, audio or TTS promises.
- No copying of examples/audio from external decks. All meanings/readings come from the M5a
  dictionary snapshot.
- No Windows installer run in this session.

## Constraints

- `ts-fsrs@6.0.1` requires Node ≥24; host and Electron 45 both have Node 24.22.3. User installs it.
- v6 API verified from official README: `const scheduler = await DefaultScheduler(config)`,
  `scheduler.newCard({ now })`, `scheduler.review({ card, grade, now })` returns `{ card, revlog }`,
  `scheduler.preview({ card, now })`, `Rating.Again/Hard/Good/Easy`.
- Strict TS, Zod IPC, sender check, `Result`, parameterized SQL, transactions, bounded pagination.
- Every successful mutation commits before the UI reports success; renderer never owns counters.
- Schema v2 already exists; add immutable migration v3. Existing profiles must upgrade with a backup.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Two independent cards per word (meaning + reading) | Double the cards, but a word heard in anime yet unreadable is not marked known | **Chosen by user** |
| One combined card | Simpler, but violates the spec's skill separation | Rejected |
| Reading card unlocked after first meaning success | Gentler, but more state and less predictable queue | Rejected |

Review scheduling uses FSRS directly rather than the M4 kana interval ladder: M4's
`scheduler_version = 'interval-v1'` rows stay untouched; word cards start with `scheduler_version =
'ts-fsrs-6.0.1/FSRS-7'`. Kana and words may be migrated to one scheduler later.

## Data model (migration 003)

- `user_vocabulary(id, profile_id, item_key, source_entry_id, snapshot_json, introduced_at,
  introduced_day_key, familiarity_flag, notes, created_at, updated_at)` — unique
  `(profile_id, item_key)`. `item_key` is the stable dictionary entry id (`jmdict:1467640`).
  `snapshot_json` preserves display spelling, reading and target sense meaning so dictionary updates
  cannot erase learning state.
- `daily_new_items(id, plan_id, item_key, position, state, created_at)` — unique `(plan_id, item_key)`;
  generated idempotently on first request for a day.
- `review_cards(id, profile_id, item_type, item_key, skill, scheduler_version, due_at,
  scheduler_state_json, last_review_at, reps, lapses, created_at, updated_at)` — unique
  `(profile_id, item_type, item_key, skill)`. Full FSRS card state is stored, not just due date.
- `review_logs(id, event_id UNIQUE, card_id, profile_id, reviewed_at, day_key, rating, correct,
  hint_used, response_ms, prior_state_json, new_state_json, scheduler_version, undo_of)` —
  append-only; an undo is a recorded reversal, not a deletion.
- `familiarity_diagnostics(id, profile_id, item_key, correct, responded_at, day_key)` — one-question
  check attached to a familiarity flag.
- `sense_tags(sense_key, tag)` — added by extending the M5a Python builder to persist JMdict `misc`
  tags (slang, vulgar, obscene, archaic and similar). The dictionary is rebuilt and revalidated;
  `DictionaryEntry` gains a per-sense `tags` array plus form/reading/sense restriction arrays so the
  lesson can pick a valid reading for the displayed spelling.
- Reuse M4 `study_events` for word introduction/review events with unique `event_id`.

## M5b — daily lesson and vocabulary

**Selection.** On first request for a study day, choose up to `goal.dailyNewWords` eligible entries
from the dictionary ordered by: original beginner rank, JMdict priority, fewer senses, shorter form,
stable source id. Exclude anything already introduced or marked familiar in this profile. Persist
the chosen ids and positions in `daily_new_items`; later requests return the same set. A word merely
displayed is not introduced.

**Teaching choice per entry.** Use the first common kanji form, falling back to the first common
reading when there is no kanji form. Choose a common reading whose `appliesToKanji` restriction
includes that form (or is unrestricted). Choose the first sense whose restrictions allow both the
chosen form and reading and which has no register tag in the beginner exclusion set
(`slang`, `vulgar`, `obscene`, `derog`, `x`, `arch`). If no such sense exists, skip the entry rather
than teach a tagged meaning. The original starter list's reading is used only as a search hint,
never as an invented reading.

**Introduction.** The lesson shows the teaching card first, then requires a recall step (type the
meaning or reading) before calling `learning.introduceWord({ itemId, eventId })`. Introduction is
recorded whether that first recall was correct or not — a failed first attempt is still an
introduction, not a failure to introduce. The main process refuses an item already introduced,
inserts `user_vocabulary` with a snapshot of the chosen spelling/reading/sense, creates two FSRS
cards (`meaning`, `reading`) with `scheduler.newCard`, and writes a `study_events` row in one
transaction. Duplicate `eventId` returns the stored result. The daily new-word actual increments
exactly once.

**Familiarity.** `learning.setFamiliar({ itemId, familiar, diagnosticCorrect })` stores the flag and
the one-question diagnostic ("Do you already know this meaning? Yes/No"). A correct diagnostic keeps
the flag and creates no cards; an incorrect one clears the flag and returns the item to the normal
lesson queue. Opting into an early review calls `learning.scheduleFamiliar({ itemId })`, which
creates only the `meaning` card. Turning the flag off later makes the item eligible again but never
deletes existing cards or review history. Self-report is always displayed separately from verified
knowledge.

**Library.** `learning.getLibrary({ query, stage, source, sort, offset, limit })` returns personal
items only (not all dictionary entries), searchable by Japanese spelling, reading, romaji and
English using the M5a dictionary normalization. Detail shows snapshot, per-skill stage, first/last
review, interval, lapses, notes and history.

**Workload rule.** Due reviews are presented before new items. If the due count exceeds twice the
daily review allocation, the UI suggests reducing new words but never changes the goal silently.
Up to 3 mined-item slots may be reserved later (M8); M5b uses none.

## M5c — FSRS reviews and metrics

**Service.** `src/main/services/reviews.ts` holds an async-initialized scheduler
(`DefaultScheduler({ desiredRetention: 0.90, enableFuzz: false, enableShortTerm: true })`) and exposes
`getQueue`, `getCard`, `submitRating`, `undoLast`. The renderer supplies an `eventId` and rating.

**Transaction.** `submitRating` reads the card, recomputes `scheduler.review({ card, grade, now })`,
and in one `BEGIN IMMEDIATE` writes the updated state, a review log and a study event. If the stored
card state changed since the renderer loaded it, return `CONFLICT` with a refreshed card.
`undoLast` reads the last non-undone log, restores its `prior_state_json`, writes a reversal log and
restores the card atomically. The scheduler never mutates the stored object in place.

**Queue.** `due_at <= now`, ordered by most overdue, then lapses, then stable id; bounded and
paginated. A session shows at most 20 reviews by default; Again cards may reappear per FSRS. Cards
that are not due stay not due. Changing desired retention never reschedules existing cards.

**Metrics (version `knowledge-v1`).** Computed from stored records:
- `introduced` — unique items with a completed first introduction.
- `familiar` — self-report only.
- `learning` — introduced but not verified.
- `struggling` — latest rating was Again, or at least two lapses in seven days.
- `verified recognition` — **both** skills (meaning and reading) have at least two successful
  **unhinted** recalls on two distinct study days, the latest attempt for each is successful, and
  both cards' scheduled intervals are ≥7 days. This is labelled recognition, not permanent mastery.
- `struggling` is likewise per word: either skill's latest rating is Again, or either skill has at
  least two lapses in seven days.
- `accuracy` — successful unhinted ratings divided by unhinted ratings in the displayed window;
  the tooltip states the definition. No probability estimate is presented as measured accuracy.

## IPC and UI

Channels: `learning.getLesson`, `learning.introduceWord`, `learning.setFamiliar`,
`learning.scheduleFamiliar`, `learning.getLibrary`, `learning.getSummary`, `reviews.getQueue`,
`reviews.getCard`, `reviews.submitRating`, `reviews.undoLast`, and a bounded per-profile
`profiles.updatePreferences` for desired retention (0.80–0.95) stored in `preferences_json`.

Routes: **Vocabulary** and **Reviews** become ready sidebar entries. Vocabulary page: search/filter,
list, detail with two skill cards and notes. Reviews page: prompt → reveal → Again/Hard/Good/Easy,
keyboard shortcuts, progress, undo, no autoplay audio. Dashboard shows real new-word count, FSRS
word-card due count and next action; the M4 kana due count stays a separate number so the two queues
are never conflated. Profile shows labelled metrics with tooltips. Failure/empty states are real.

## Tests

- Unit: selection stability and duplicate exclusion, snapshot identity, familiarity exclusion,
  knowledge metric edge cases, queue ordering, rating normalization, desired-retention bounds.
  FSRS scheduling tests use an injected clock and assert deterministic output for a pinned card.
- Integration: migration v3 upgrade preserving v2 data; atomic introduction and duplicate event;
  two-card creation; familiarity diagnostic; profile isolation; rating transaction and conflict;
  undo restores prior state; restart persistence; no silent rescheduling.
- UI/live: daily lesson stable across reload, introduction counted once, review flow persists after
  restart, dashboard/profile reconcile with the database.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| FSRS runtime/API mismatch | Pin 6.0.1, verify installed types before use, inject clock in tests |
| Double-counted words | `item_key` unique per profile; introduction is one transaction; alternate readings do not create items |
| Renderer stale card overwrites state | Compare stored `scheduler_state_json`; return CONFLICT with refreshed card |
| Overwhelming due load | Due-first queue, 20-card session cap, honest suggestion to reduce new words |
| Metrics mistaken for mastery | Versioned definitions, tooltips, "verified recognition" wording |
