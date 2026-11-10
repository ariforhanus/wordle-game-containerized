# Daily answer rotation and historical stability

Implemented for the existing English and Turkish answer lists only. No language,
dictionary source, translation set or redistribution license was added.

## Selection policy

`DailyPuzzleService.getOrCreate` first reads the saved puzzle by calendar date and
language. An existing row is returned verbatim, including legacy IDs, without
calling the dictionary provider. Reordering, removing or temporarily failing the
provider cannot replace a saved answer. `DailyGameService` accepts the exact saved
answer even if the current guess dictionary no longer contains it; other guesses
still require dictionary membership. Unfinished answers remain private.

For a new date, the service normalizes and deduplicates the current language's
valid five-letter answers. It measures each answer's nearest saved occurrence in
calendar days, considering both past and future rows (including out-of-order
creation). Selection uses `SecureRandom` among these candidates, in order:

1. Answers never used in that language's persisted history.
2. When all have been used, answers whose nearest occurrence is at least **30
   calendar days** away.
3. If the pool cannot satisfy that spacing, answers with the greatest distance
   from their nearest occurrence. Equal candidates are randomized.

Thirty days is a preference, not a promise for undersized pools. A one-answer
pool remains playable; it necessarily repeats. Past repeats are retained. After
the first pool traversal, this is randomized spacing rather than a fixed recurring
answer sequence. Dates come from the existing server application calendar, not
the player's clock. Start/Resume, six-turn limits, scoring and midnight expiry
rules are unchanged.

## Transactions and database guarantees

New-puzzle writers take a transaction-scoped PostgreSQL advisory lock for the
language and re-read before choosing. Independent instances and different dates
therefore see each other's committed reservations. The lock is released on
commit/rollback. Existing rows avoid the write lock. New creation requires
`READ COMMITTED`; an incompatible outer snapshot fails closed. The existing
date/language unique constraint remains the final same-day safeguard.

V8 adds `(language, answer, played_at)` for the nearest-occurrence query and a
trigger rejecting answer/ID/date/language changes and row deletion. No-op updates
are allowed. It neither rewrites history nor deletes repeated answers. User
deletion still removes their games/scores, retaining the shared puzzle.

These guards cover ordinary row writes. Schema owners/superusers can change DDL,
disable triggers or TRUNCATE; least-privilege runtime permissions and controlled
migration access remain necessary. External writers must honor the same advisory
lock and selection policy; the database trigger alone does not enforce spacing.

## Upgrade and recovery

Rehearse V8 against an authorized production copy after preflight and a verified
backup. This is a regular index build and trigger installation inside a Flyway
migration: measure locks and reserve a write window. Do not edit applied
migrations or update saved answers during a rollout. Upgrade all puzzle writers
before reopening writes; older instances do not honor the new rotation lock.
Existing same-day games keep their exact answer through the upgrade.

If a historical answer needs exceptional repair, stop writes and design an
explicit reviewed forward migration covering linked games and scores. Do not
disable the trigger as routine application maintenance. Rollback to an older
writer also loses spacing guarantees and needs an explicit compatibility review.

## Verification and limits

Real PostgreSQL tests cover concurrent same/different-date writers, rollback,
language isolation, pool exhaustion, future neighbors, changed/empty providers,
immutable identity/deletion, V7-to-V8 history preservation and incompatible outer
isolation. Candidate-policy tests check the 30-day boundary without asserting a
particular random draw. Saved-answer playability after dictionary removal is
tested through the game service, retaining rejection of invalid alternatives.

A V8 custom-format dump passed checksum verification and isolated restore using
the repository scripts. Synthetic before/after EXPLAIN/BUFFERS measurements and
index storage costs are recorded in `docs/performance/rotation/`; the selective
query benefits, while full-pool aggregation has little measured improvement.
Browser coverage checks stable admin reads and separate
players sharing the saved answer; it does not expose future-day creation or a
clock-control endpoint. Exact suite results and external production gates are in
`VALIDATION.md` and `TODO.md`. Local fixtures do not establish production migration
lock duration, multi-region capacity or actual disaster recovery readiness.
