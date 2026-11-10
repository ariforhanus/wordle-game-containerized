# Account deletion, retention and restore requirements

This describes the current implementation and the operating requirements for a
self-hosted deployment. It does not establish a live service's legal policy,
contact address, off-host backup expiry or provider retention. Those deployment
decisions remain release gates; no production data was accessed for this work.

## What the user is told

Account settings explain, in English and Turkish, before the confirmation:

- Deletion removes the profile/avatar, games, scores and recovery links from the
  active service. Existing sessions stop working.
- Security events can remain without links to the deleted account until the
  scheduled 90-day cleanup; temporary abuse-prevention records can also remain.
- Older backup copies are not immediately erased. The operator determines their
  retention and must reapply deletions before reopening a restored service.

The confirmation checkbox describes these notices to assistive technology.
Opening the section, entering a password or checking consent does not delete an
account. The current password and a separate submit remain required. A wrong
password leaves the account intact and allows explicit retry.

## Active database behavior

| Data | Current behavior |
| --- | --- |
| Account/profile, password hash and avatar | Retained while the account exists; the user row is deleted in the password-checked transaction |
| Daily games, historical scores and verification/reset tokens | Foreign keys cascade on user deletion, including unfinished and completed games in every language |
| Shared daily puzzle/answer | Preserved independently of the user; no profile fields or user ID are stored in that row |
| Security audit | Actor/target foreign keys become NULL on deletion. Action/time can remain; rows older than 90 × 24 hours are eligible for cleanup |
| Authentication rate-limit buckets | Not deleted with the account, preventing deletion/re-registration from resetting limits. Window starts older than 24 hours are eligible for cleanup |
| Account tokens for surviving users | Expired tokens become eligible for physical cleanup 24 hours after expiry; single-use/expiry checks already reject invalid links before physical cleanup |

`RetentionTasks` captures one injected server-clock instant and uses strict
`< cutoff` predicates. A row exactly at a cutoff remains until a later run.
The scheduled task starts after one hour and runs with one-hour delay after the
previous execution. Cleanup is one transaction: failure rolls back all three
categories and a later run can retry. Eligibility is not an exact destruction
deadline; downtime, clock skew, locks or job failures delay physical removal.

Removed audit foreign keys are not a claim of complete anonymization: event
time/action can still be correlated with other records. Rate-limit keys are
SHA-256 digests of identifiers/IP inputs, not irreversible anonymity. Treat
remaining security data as restricted data. The audit table has no email,
profile fields, password/token values or raw IP column.

## Backup expiry is separate

The optional operations profile uses `BACKUP_RETENTION_DAYS` (default 14).
`backup.sh` performs cleanup only after a successful dump, archive check and
checksum. Its actual `find -mtime +N` rule uses whole-day age: with N=14, files
become eligible at 15 days. The loop waits 24 hours after each run, so healthy
normal scheduling removes them on a subsequent run, roughly at 15–16 days plus
job time. Failure/downtime can extend this without a bound.

This is neither a 14-day deletion guarantee nor an off-host retention policy.
Cleanup affects only matching top-level `wordle-*.dump*` files in BACKUP_DIR;
nested files, other filenames and external copies have separate lifecycles.
Filesystem mtime changes also affect eligibility. The operator must inventory
all copies, choose/publish a real expiry target, monitor cleanup and configure
each storage/provider lifecycle. Never put unrelated data in the reserved backup
filename namespace. Local permission tests and checksum checks do not replace
encrypted storage, access review or off-host recovery drills.

## Reapply deletions after restore, before public traffic

An old dump can resurrect a deleted user, scores, old session versions and
previously consumed recovery tokens. `restore-check.sh` validates archive
restorability in a disposable database; it does **not** reconcile later deletion
requests or certify privacy readiness.

1. Stop public traffic, writes and outbound mail. Verify checksum and restore to
   an isolated target. Rehearse the current schema/preflight before any cutover.
2. Obtain a protected deletion-request journal independent of the database being
   restored. The current application does **not** automatically export such a
   journal. Establish and test that operational process or implement a durable
   external export before production. Keep enough history to cover every backup
   copy that could still contain the account. Restrict/encrypt this journal: it
   is itself pseudonymous personal data.
3. Reconcile requests newer than the recovery point with the correct environment
   and backup lineage. Record the original user ID, original creation timestamp,
   deletion time and a request reference; do not store passwords, bearer/reset
   tokens or copies of profiles. A numeric ID, username or email alone is
   insufficient after restore/sequence reuse. Uncertain identities require
   review rather than automatic deletion. If there is no trustworthy journal,
   do not claim that deleted data cannot return and do not reopen until resolved.
4. For reviewed matches, take user-row locks and apply an explicitly approved
   forward repair transaction deleting those restored users and preserving an
   audit event with NULL identity references. Existing FK cascades remove linked
   rows; shared puzzle history stays intact. Verify exact affected identities,
   child counts and unaffected users before committing. This is an operator
   recovery action, not a password-bypass API or an automatic startup task.
5. Rotate the signing key and invalidate every unconsumed restored verification/
   reset token before enabling mail or traffic. An old snapshot can make a link
   appear unused again even if its wall-clock expiry has not passed. Do not
   assume JWT rotation also revokes email links.
6. Run/review retention cleanup with a correct server clock. Verify deleted
   profiles, avatars, games, scores and tokens are absent; audit references are
   NULL; unrelated users and shared answers are preserved. Verify old sessions,
   passwords and recovery links cannot regain access. Test the negative case of
   a different/new account that must survive reconciliation.
7. Document the recovery point, journal coverage, approvals, row checks, credential
   changes and outstanding requests. Reopen only after the privacy reconciliation
   and normal release checks pass. Resume encrypted backup and alert delivery.

These requirements are prepared, not activated against a real deployment. No
production journal, final retention policy, contact, SMTP/log provider lifecycle
or privacy restore drill is claimed complete.

## Verification

Real PostgreSQL integration tests now create an avatar, a completed English game
and score, an unfinished Turkish game and account tokens before deletion.
They verify password rejection, child erasure, both audit-reference directions,
another user's unaffected rows/session and unchanged shared puzzles. A rejecting
foreign key proves that a failed deletion restores the user, children and audit
atomically. Retention tests check just-before/exact/after cutoffs using the shared
test clock and inject a last-category failure to verify rollback and retry.

Frontend tests cover both real translations, notice association, consent,
duplicate-submit prevention and retry after rejection. Browser tests exercise
the actual deletion with two sessions, including a wrong-password attempt and
post-deletion login rejection. Script tests use real filesystem age/`find` to
verify whole-day expiry, filename/directory boundaries, private output modes and
deferred cleanup after backup failure. Counts and runtime limits are recorded in
`VALIDATION.md`; this does not test an actual production restore journal.
