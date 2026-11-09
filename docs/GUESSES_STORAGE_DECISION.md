# Daily guess storage decision

Status: retain the current TEXT representation for this release; revisit if per-turn querying or immutable guess auditing becomes a requirement. This decision does not start a schema or service migration.

The current game stores at most six normalized five-letter guesses, separated by commas: at most 35 characters. Delimiters cannot enter through the supported dictionaries/letter validation. Reads reconstruct ordered guesses and evaluate feedback against the persisted puzzle answer. Start uniqueness, a PostgreSQL game-row lock, expected turn, exact-payload replay checks, and game/score transaction boundaries—not the storage format—provide concurrency correctness. Leaderboard performance is governed by `scores` queries rather than guess serialization.

| Option | Database correctness | Read/write and query behavior | Migration cost |
| --- | --- | --- | --- |
| Existing TEXT | Current application validates alphabet, word, turn and replay; format/count/status checks are not all enforced in the DB | One small row update/read; no per-guess index; parse/join convention must remain explicit | None; existing forced-lock and concurrent/replay tests cover current behavior |
| JSONB ordered array | Array type/length can be checked in SQL; per-element shape and immutable accepted turns need additional checks or triggers | Still one game-row update/lock; clearer structure, easy element access, little benefit for a six-item list without new query needs | Validate every legacy value, convert in a versioned migration, preserve API and rollback compatibility |
| Separate `daily_game_guesses` table | `(game_id, turn)` primary key, game FK/cascade, turn range and guess length are natural constraints; no-gaps and parent completion consistency require transaction logic or deferred constraint triggers | Append a row instead of rewriting a list; ordered read/join; useful for audit/analytics; extra rows/indexes and still a parent-row lock for ordered turns and one score | Highest: preflight, ordered backfill, row-count/equality checks, application transition and rollback window |

Do not replace an exact replay check with blind `ON CONFLICT DO NOTHING`: a different word for the same turn must remain 409, not silently succeed. Normalizing the table does not by itself serialize completion or make the game/score transaction correct.

If a normalized model is selected later:

1. Preflight supported characters, five-letter normalized words, delimiters, maximum turns, status/count/finished-time coherence, duplicate turns and ownership. Abort with diagnostics; do not delete or rewrite malformed history silently.
2. Introduce a child table with composite primary key, FK and shape/range constraints. Backfill with `string_to_array` plus `WITH ORDINALITY`, preserving turn order and original puzzle/game identifiers.
3. Rehearse on an authorized production-sized copy. Freeze writes for the initial backfill/cutover, or explicitly design a transactional compatibility phase. Keep old/new representations synchronized in the same transaction while rollback to an older app remains supported; retaining a stale TEXT column alone is insufficient rollback protection.
4. Compare original/restored feedback, dates, counts, terminal scores and idempotent replay. Repeat multi-session conflicting/duplicate turns and forced PostgreSQL-lock tests. Remove the old column only after the rollback window is closed.

Remaining work: database-level structural/state checks for the current representation and a production-data migration rehearsal remain open in TODO. This document compares the options; it does not claim those constraints or a normalized migration are implemented.
