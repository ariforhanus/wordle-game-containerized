# Codex continuation checkpoint — 2026-11-10

## Accepted scope and user decisions

- Repository: ariforhanus/wordle-game-containerized. Work on `fix/security-game-integrity`; do not merge main, deploy production or start microservices.
- User authorized implementation, testing and publication to the working branch. Inspect code first; report tested TODO completions and keep a concrete continuation note.
- Latest scope: **do not add new languages**. EN/TR rotation was requested; DE/FR/ES and new dictionary/license work are deferred, not complete.
- Unfinished daily games expire at application-calendar midnight. No previous-day Resume selector; no automatic Start at rollover. Read/status/reconnect must remain read-only.
- Game time and score remain server-authoritative, including closed pages. Keep idempotent turn handling, database locks, transaction rollback and one score per player/language/day.
- Deterministic tests use shared TestTimes/MutableClock; real runtime time comes from injected Clock. Named synthetic benchmark dates are fixtures, not production hardcoded time.
- Owner explicitly overrode the earlier ignored-env policy: root `.env` is tracked, local-test-only, with admin / 123456 and generated shared database/JWT fixtures. It was NOT changed in this checkpoint. Do not replace it with live credentials; before public use rotate credentials and disable insecure-local-admin. `.preview` remains private.

## Completed in this checkpoint

1. EN/TR daily rotation: return existing date/language row before touching the provider; preserve legacy IDs and exact answers. Normalize/deduplicate current valid pool. Prefer never-used answers, then a 30-calendar-day distance from every saved occurrence, then the farthest available answer if a small pool cannot meet the preference. Randomized ties; consider saved past and future dates. No new language/content.
2. New-puzzle writers serialize by language using transaction-scoped PG advisory locks and a post-lock re-read. New creation requires READ COMMITTED, including parent-transaction validation. Existing rows avoid write locking. Same-day uniqueness remains the database safeguard.
3. V8 adds language/answer/date index and an immutable-puzzle trigger. Ordinary identity/answer UPDATE and DELETE fail; no-op UPDATE is allowed. Existing repeats/history stay untouched. DDL owners/TRUNCATE and external or older writers remain explicit limitations.
4. Saved correct answers remain guessable after current dictionary removal; other guesses still need dictionary membership. Start/expiry/auth/scoring rules retained. Test fixtures now seed known answers before Start instead of mutating persisted puzzles.
5. Themed mode: safe load validation/deduplication, explicit failure retry, labeled loading, English keyboard with Turkish UI, same-next-answer reset and managed result-dialog focus/background/Tab. Theme badge and shared share-result button contrast corrected. Account/reset mismatch errors focus/describe their input, links and focus outlines improved.
6. Firefox local runtime recovered without weakening browser security or changing CI flags. Default agent sandbox cannot find its profile; the same smoke and browser tests work outside the command sandbox.
7. V8 checksum backup/isolated restore passed. Rotation query before/after EXPLAIN/BUFFERS evidence and storage costs recorded under docs/performance/rotation. Runbooks now consistently describe the explicitly tracked local env and V8 rollout constraints.

## Latest verified evidence

- Backend full Java 21/PostgreSQL verify: **162 passed**, zero skips/failures/errors. JaCoCo 75.92% lines / 61.34% branches.
- Frontend component/unit: **82 passed**, no unhandled errors. V8 57.69% lines / 56.50% branches.
- TypeScript/release Vite build: pass; **8** built-worker artifact tests pass. Final CSS correction was rebuilt and checked in actual browser scans.
- Selected release-build desktop Chromium/mobile Chromium/WebKit E2E: **33 passed**, zero skips. Covers concurrency/expiry/reconnect, native languages, game accessibility, stable shared daily answers, themed failure/restart/dialog and account validation.
- Firefox full configured suite: **25 passed, 3 skipped**. Skips are SMTP capture and production Nginx headers/offline, because this fixture uses Vite Preview and mail is disabled. First attempt ran out of transient profile disk space after 24 passes; clean rerun passed. Do not count failed/repeated runs as additional coverage.
- V8 real custom-format checksum backup and isolated restore passed; temporary restore target removed.
- Synthetic TEMP-only rotation experiment: 20k rows, 12 measured executions. Result hashes equal before/after. 20-answer subset 1.569→0.090 ms median; full 1k pool 3.597→3.197 ms (little improvement). Extra index 647,168 bytes. Warm/synthetic/local buffers; no production/write-throughput/lock guarantee.
- These are local checks, not successful remote CI, production readiness, physical-device validation or WCAG certification. See VALIDATION.md for exact boundaries and historical evidence.

## Next work, priority order

1. **P0 external release gates stay open:** actual credential rotation, successful runner/CI and image scans, enabled main ruleset, authorized production-copy preflight/V8 lock/rollback rehearsal, domain/DNS/HTTPS, real SMTP and verification gate, off-host backup/restore and actual alarm receivers. Domain/provider/production environment are not selected. Do not fabricate values or mark these done. Previous remote jobs failed before steps/runner assignment; inspect current run rather than assuming billing or a test failure.
2. **P1 manual acceptance:** actual mobile/physical Safari, real browser zoom, NVDA/VoiceOver speech/browse mode, color-vision/user review and full site/account/themed contrast/focus audit. Scoped automated tests do not complete this work. Firefox local startup is now resolved; SMTP/Nginx Firefox checks and staging/browser integration remain open.
3. **P2 account/operations policy:** document user-visible deletion/retention, backup expiry and reapplying deletions after restore; evaluate ranked bot/multi-account policy/client-IP trust and durable SMTP outbox/timing/retry/transaction boundaries. Existing account deletion, token revocation, audit and distributed limits must be preserved. Do not introduce CAPTCHA, a third-party provider or data retention promises without concrete requirements.
4. Staging capacity/release/rollback/monitoring rehearsals when an authorized environment exists. Preserve small-fixture measurement limits. New languages remain explicitly deferred.

Read TODO.md for current checkboxes, docs/WORD_ROTATION.md for policy/locks/rollout, docs/ACCESSIBILITY.md for tested scope and manual gaps, docs/DAILY_GAME_CONSISTENCY.md for cross-table boundaries. V8 is a regular index build: reserve a measured write window, upgrade all puzzle writers before reopening, and do not casually modify old puzzle rows. Runtime schema-owner privileges can bypass DDL guards; stronger migration/runtime role separation remains a production consideration.

## Workspace and reproduction

Local checkout: `/workspace/work/wordle-game-containerized`. Before edits, fetch and inspect git status/log; this branch has previously received another contributor's changes. The checkpoint is identified by `git log -1 -- docs/CODEX_HANDOFF.md`. Use branch head rather than old commit IDs in historical reports.

Toolchain: `/workspace/work/tools/jdk21`; Maven `/workspace/work/tools/apache-maven-3.9.11/bin/mvn`; cache `/workspace/work/m2`; settings `/workspace/work/maven-settings.xml` (do not print). Java trust store is `/etc/ssl/certs/java/cacerts`. Runtime/compiler remain usable. To free space, only owned disposable artifacts were removed: old test JAR, WebKit browser cache after passing tests, JDK source/jmod archives and old phase2 mail venv. jlink would need jmods restored. No user source, Docker volume or test DB data was deleted.

Disposable PG fixture: `wordle-review-postgres`, localhost:55432, wordle_test, postgres / local-test-only. Maven truncates this isolated DB: stop the test backend before Maven, never run it concurrently with browser tests. Fixture app ports were 8091/9091; Vite Preview 3001. PID/log files: `/workspace/work/no-new-languages/{app,preview}.pid` and .log. Stop only validated owned PIDs/fixture container at checkpoint completion; PID files may then be stale. Root Compose and production were not used.

Raw logs: `/workspace/work/rotation/{backend-final,backup-restore}.log`; `/workspace/work/no-new-languages/{frontend-final,production-final,e2e-final,firefox-install,firefox-smoke,firefox-workspace-smoke,firefox-outer-smoke,firefox-e2e,firefox-e2e-final}.log`. Durable evidence is committed; raw logs can disappear in a fresh workspace.

Browsers: system Chromium `/usr/bin/chromium`; cache `/workspace/work/test-expansion/browsers` currently contains Firefox 1572 and ffmpeg. WebKit 2388 must be reinstalled for future WebKit runs. Local dependency libs: `/workspace/work/test-expansion/browser-libs/usr/lib/x86_64-linux-gnu`. Firefox smoke/E2E used this LD_LIBRARY_PATH, PLAYWRIGHT_BROWSERS_PATH and TMPDIR `/workspace/work/no-new-languages/firefox-tmp`; only the command sandbox was escalated, not browser security disabled. Use inherited proxy/CA for reinstalls. Disk is still tight; do not pull/build new Docker images or remove user data to gain space.

Publish via connected GitHub tools if shell push lacks credentials: create tree from exact changed UTF-8 files against fetched parent, verify tree SHA against local git tree, create commit and update branch ref with expected_sha/force=false. Fetch and align the local equivalent commit afterward. Never overwrite remote concurrent work. Local merge/deploy/main permissions have not been granted.
