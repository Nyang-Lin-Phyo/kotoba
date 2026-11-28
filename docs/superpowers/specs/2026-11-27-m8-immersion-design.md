# M8 — Reading, listening, speaking and immersion

Date: 2026-11-27
Status: proposed, awaiting approval.

## Intent

Let the learner work with real Japanese text they choose: paste it, tokenize it offline, look up
words, mine items into a deduplicated queue, study original graded passages with comprehension
questions, and see honest per-skill coverage. Listening and speaking degrade gracefully when no
Japanese OS voice or microphone is available. Passive exposure is never counted as deliberate time.

## Decisions

- **Tokenization:** `kuromoji@0.1.2` (Apache-2.0) with `@types/kuromoji` as a dev dependency. Its
  IPADIC `.dat.gz` files are copied from `node_modules/kuromoji/dict` into
  `resources/tokenizer/dict` by a committed script and bundled via Forge `extraResource`. The
  generated copies are gitignored; the licence notice is bundled. Tokenization is approximate and
  labelled as such; unknown tokens are counted and shown, never guessed.
- **Migration v6:** `mined_items` (profile, entry id, item key, snapshot, sentence, source
  metadata, status), `media_items` (user-owned pasted/imported text with title/type), `media_tokens`
  (cached tokenization with surface, lemma, reading, POS, resolved entry id and per-skill status),
  `reading_passages` is committed original JSON rather than a table; `comprehension_attempts`
  records reading/listening answers with an event id.
- **Mining:** token tap → dictionary lookup → choose reading/sense → save. Dedupe against already
  introduced words and existing queue items by `(source_entry_id, chosen reading/sense)`; a UUID
  event id makes repeated submissions idempotent. A configurable daily cap (default 3 of the 15
  new-word slots) never blocks due reviews. Mining is distinct from introduction: it only adds to
  the queue until the learner studies it in Vocabulary.
- **Subtitle import:** native file dialog only; `.srt`, `.ass`, `.txt` with size and line caps;
  safe parser (no path exposure, no scripts executed), preview before saving to userData. No
  fetching of protected subtitles and no DRM bypass.
- **Reading:** at least four original graded passages with Japanese text, reading, English, and
  comprehension questions with answer keys. Token tap opens dictionary lookup. Translation toggle.
- **Listening:** renderer `speechSynthesis` with Japanese voice detection; if no `ja` voice is
  installed the exercise is disabled with an honest message. Transcript toggle, speed control only
  when supported, comprehension question. No audio files are bundled and no offline TTS is promised.
- **Speaking:** shadowing/read-aloud using optional `getUserMedia` + `MediaRecorder` with explicit
  user action, local playback and delete. No upload, no pronunciation score, no mandatory mic.
- **Coverage:** denominator = tokens whose POS is content-bearing (nouns, verbs, adjectives,
  adverbs) or explicitly included particles; function-only tokens are reported separately. Each
  token is classified per skill (reading/meaning) as known-by-skill, learning, unseen or unmapped.
  Coverage is not a comprehension percentage and is shown with its denominator, dictionary version
  and tokenizer version.
- **Routes:** `/reading`, `/listening`, `/speaking`, `/immersion` become real; planned badges removed
  for those. Dashboard gains a mining-queue count and immersion next action.

## Non-goals

OCR, browser extension, automatic caption acquisition, remote content in a privileged window,
speech recognition, cloud sync, copied subtitles or copyrighted passages, JLPT score claims.

## Constraints

- Strict TS, Zod IPC, sender checks, `Result`, parameterized SQL, bounded text sizes.
- Offline core must work with no voice and no network. No API keys.
- No new dependencies other than the two kuromoji packages named above; user installs them manually.
- graphify targeted navigation; `graphify update .` after source changes; no git commits.
