# Daily game consistency audit — V7

## Database guarantees

Existing V2/V3 constraints retain one score per user/language/puzzle day, one puzzle per day/language and one game per user/puzzle. User deletion cascades scores/games. A game's user and puzzle must exist; deleting a referenced puzzle is rejected. Existing score checks bound attempts, duration and per-game score.

V7 adds validated CHECK constraints, without rewriting existing migrations or rows:

- Puzzle answers are five normalized supported letters.
- Serialized guesses are empty or one through six five-letter normalized tokens separated by exactly one comma. The explicit C collation avoids locale-dependent A–Z range expansion. Accepted order and repeated guesses are preserved.
- Playing games contain zero through five guesses; wins contain one through six; losses contain exactly six.
- Only playing games have a null finished_at; terminal games must have a completion timestamp.

These are row-local structural rules. They intentionally do not query another table from a CHECK, duplicate score calculation in SQL, or freeze a dictionary in the database. The current supported alphabet is English/Turkish; adding accented alphabets requires a forward migration along with language support. A backwards wall-clock correction is handled by the existing nonnegative elapsed clamp; V7 does not introduce a finished_at >= started_at rule that would change that behavior.

## Transaction and concurrency guarantees

DailyGameService takes a PostgreSQL row lock before accepting a turn. Expected-turn and exact replay checks run while locked. Game update and score insert share one transaction. A prior score collision now fails the score INSERT instead of being swallowed by ON CONFLICT DO NOTHING: the game update rolls back and HTTP returns 409. The persisted historical score is unchanged. Valid duplicate final requests return the already committed game via the replay path; they never attempt another score INSERT.

The database does not yet provide a deferred cross-table constraint saying every terminal game has exactly its matching score, nor does it prove that won means the final guess equals the answer. Those semantic guarantees come from the sole application writer and transaction, not the row checks. Historical scores may legitimately lack a daily_game, so adding a mandatory relationship would need a legacy adoption plan. Direct SQL writers can violate those semantic relationships even with V7; keep runtime/admin SQL access restricted. Any later trigger/link design needs ordering, deletion, legacy, race and rollback tests before implementation. Do not claim the row checks close this remaining boundary.

## Upgrade/preflight and rollback

On an existing database already at V3 or newer, run deploy/preflight-daily-games.sql with read-only credentials before deploying V7. Every returned game/puzzle ID needs explicit review; the script neither deletes nor repairs data. It checks precisely the new structural predicates, not full game semantics. The original deploy/preflight.sql remains the V1/V2 legacy-adoption diagnostic and is not replaced with queries against tables absent in V1.

Back up, restore and rehearse against an authorized production-sized copy. V7's regular ALTER TABLE validation scans existing tables and takes locks; reserve a write window and measure it. A clean preflight snapshot does not prevent subsequent writes from changing data. Invalid history aborts the transactional migration; earlier constraints in the same migration and its Flyway history row roll back too. Repair specific records deliberately, then retry. Do not delete history or disable constraints to make startup pass. No production migration was run.

Application rollback should normally retain V7, since the prior daily writer uses the same valid representation; test the exact prior release before relying on this. Do not automatically drop validated constraints or edit an applied migration. Follow the backup/restore runbook if schema restoration is required.

## Verification

Real PostgreSQL tests reject malformed/lowercase/delimiter/over-limit guesses and invalid answer shapes, reject incoherent status/count/timestamp combinations, preserve repeated Turkish guesses, and exercise existing foreign keys. An isolated V6 schema with corrupt history produces preflight diagnostics and a V7 failure without partial schema/data changes; explicitly repairing the disposable fixture then applies V7 successfully. An HTTP regression proves score collision returns 409 with the game and original score unchanged. Existing forced-lock concurrent final-turn, lost-reply replay, independent-session and score-failure rollback tests run unchanged in the full backend suite.
