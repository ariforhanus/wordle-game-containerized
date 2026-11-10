# Codex continuation checkpoint — 2026-11-10

## Accepted scope and user decisions

- Repository: ariforhanus/wordle-game-containerized. Work on `fix/security-game-integrity`; do not merge main, deploy production or start microservices.
- User authorized implementation, testing and publication to the working branch. Inspect code first; report tested TODO completions and keep a concrete continuation note.
- Jenkins setup is deferred: the owner will handle it later. Do not add Jenkins or change CI in this checkpoint; successful remote CI remains a release gate.
- Latest scope: **do not add new languages**. EN/TR rotation was requested; DE/FR/ES and new dictionary/license work are deferred, not complete.
- Unfinished daily games expire at application-calendar midnight. No previous-day Resume selector; no automatic Start at rollover. Read/status/reconnect must remain read-only.
- Game time and score remain server-authoritative, including closed pages. Keep idempotent turn handling, database locks, transaction rollback and one score per player/language/day.
- Deterministic tests use shared TestTimes/MutableClock; real runtime time comes from injected Clock. Named synthetic benchmark dates are fixtures, not production hardcoded time.
- Owner explicitly overrode the earlier ignored-env policy: root `.env` is tracked, local-test-only, with admin / 123456 and generated shared database/JWT fixtures. It was NOT changed in this checkpoint. Do not replace it with live credentials; before public use rotate credentials and disable insecure-local-admin. `.preview` remains private.

## Completed in this checkpoint

1. P2.2 deletion/retention disclosure in real EN/TR: active profile/avatar/games/scores/recovery-link erasure and session revocation; restricted security-event retention; backup copies and operator restore obligations. The consent checkbox describes all notices and the current password/separate submit remain required.
2. RetentionTasks now captures one injected Clock instant instead of reading PostgreSQL now() independently. Strict 24-hour security/token-grace and 90×24-hour audit cutoffs preserve exact-boundary rows until a later run. One transaction rolls back all cleanup categories together; scheduling is still hourly best effort, not an exact deletion deadline.
3. Expanded deletion test now creates real completed EN and unfinished TR games, score, avatar and tokens; verifies another user/shared puzzles survive and both audit FK directions are nulled. A rejecting FK proves user/children/audit rollback. Production deletion logic was preserved.
4. New component tests cover actual translations, accessible notice association, consent, duplicate submission and rejected-password retry. New browser cases delete an actual account with won/unfinished games and verify two independent sessions plus password login are invalid afterward.
5. Added real filesystem/find backup-retention tests and docs/DATA_RETENTION.md. Default -mtime +14 means eligibility at 15 whole days, then a successful daily job, roughly 15–16 days plus job time; failures defer cleanup. Never promise exact 14-day backup destruction. Runbook requires an independent deletion journal, reviewed identity matching, JWT rotation AND restored email-token invalidation before reopening traffic. That external journal/export and real policy/provider lifecycles are NOT implemented/activated.
6. TODO now separates the implemented user disclosure/tested behavior from actual backup retention/contact/journal activation and privacy restore rehearsal in P0.2. No new schema migration, language, microservices, production changes or main merge.

Previous completed rotation checkpoint is cdb4dcd: preserve immutable EN/TR daily answers, language advisory locks/READ COMMITTED, unused-first/30-day preferred spacing/small-pool fallback, V8 trigger/index and exact saved-answer acceptance after dictionary removal. Existing expiry/Start/server-time rules remain intact. Read docs/WORD_ROTATION.md rather than rebuilding that work.

## Latest verified evidence

- Backend full Java 21/PostgreSQL verify: **165 passed**, zero skips/failures/errors. Fresh JaCoCo execution file: 75.74% lines / 61.13% branches.
- Frontend component/unit: **85 passed**, no unhandled errors. V8 58.75% lines / 57.53% branches.
- TypeScript/release Vite build: pass; **8** built-worker artifact tests pass.
- Backup failure/retention Python suite: **13 passed**. New cases use real find/mtime boundaries, protect unrelated/nested/outside files, verify private output modes and deferred cleanup on failure. PostgreSQL dump/restore executables are mocked in this particular suite; do not call it a new real restore rehearsal.
- Selected release-build E2E: **8 desktop/mobile Chromium + 4 Firefox passed**, zero skips. Two EN/TR deletion cases plus logout-all/account-error-focus per engine; scoped account Axe in light/dark. Node ESM JSON import attribute was corrected before the successful selection.
- Current E2E used Vite Preview, actual backend/isolated PG. WebKit was NOT rerun; its disposable cache was previously removed. Prior cdb4dcd evidence was 33 selected Chromium/mobile/WebKit and 25 Firefox passes with 3 SMTP/Nginx skips; those are historical, not new runs.
- V8 real checksum backup/isolated restore and synthetic rotation/score index measurements are prior evidence; see VALIDATION.md and docs/performance for limits. This checkpoint did not perform an external-journal privacy restore drill.
- Local checks do not establish remote CI, physical devices/Safari, screen-reader acceptance, production capacity or WCAG certification. Last observed GitHub run #25 (42813191635) on cdb4dcd failed with zero steps/no runner on four jobs; security skipped. Job logs unavailable. Do not assume billing or test failure. Jenkins is deferred to the owner.

## Next work, priority order

1. **P0 external release gates stay open:** actual credential rotation, successful runner/CI and image scans, enabled main ruleset, authorized production-copy preflight/V8 lock/rollback rehearsal, domain/DNS/HTTPS, real SMTP and verification gate, off-host backup/restore and actual alarm receivers. Domain/provider/production environment are not selected. Do not fabricate values or mark these done. Previous remote jobs failed before steps/runner assignment; inspect current run rather than assuming billing or a test failure.
2. **P1 manual acceptance:** actual mobile/physical Safari, real browser zoom, NVDA/VoiceOver speech/browse mode, color-vision/user review and full site/account/themed contrast/focus audit. Scoped automated tests do not complete this work. Firefox local startup is now resolved; SMTP/Nginx Firefox checks and staging/browser integration remain open.
3. **Next single TODO: bot/multi-account policy evaluation.** Inspect existing account/IP/ranking limits and proxy trust, document what is enforceable now and what needs actual ingress/staging. Preserve verified-email and distributed limits. Do not introduce CAPTCHA, third-party providers or arbitrary device tracking without concrete requirements.
4. **Then SMTP outbox evaluation:** inspect timing, retries and transaction boundaries, keep token/session security and delivery-failure behavior, distinguish local failure tests from real provider staging. Deletion disclosure is complete; actual retention/contact/journal activation and restore rehearsal remain P0 release gates, not an automatic export feature.
5. Staging capacity/release/rollback/monitoring rehearsals when an authorized environment exists. Preserve small-fixture measurement limits. New languages remain explicitly deferred.

Read TODO.md for current checkboxes, docs/WORD_ROTATION.md for policy/locks/rollout, docs/ACCESSIBILITY.md for tested scope and manual gaps, docs/DAILY_GAME_CONSISTENCY.md for cross-table boundaries and docs/DATA_RETENTION.md for deletion/cleanup/backup/restore obligations. V8 is a regular index build: reserve a measured write window, upgrade all puzzle writers before reopening, and do not casually modify old puzzle rows. Runtime schema-owner privileges can bypass DDL guards; stronger migration/runtime role separation remains a production consideration.

## Workspace and reproduction

Local checkout: `/workspace/work/wordle-game-containerized`. Before edits, fetch and inspect git status/log; this branch has previously received another contributor's changes. The checkpoint is identified by `git log -1 -- docs/CODEX_HANDOFF.md`. Use branch head rather than old commit IDs in historical reports.

Toolchain: `/workspace/work/tools/jdk21`; Maven `/workspace/work/tools/apache-maven-3.9.11/bin/mvn`; cache `/workspace/work/m2`; settings `/workspace/work/maven-settings.xml` (do not print). Java trust store is `/etc/ssl/certs/java/cacerts`. Runtime/compiler remain usable. To free space, only owned disposable artifacts were removed: old test JAR, WebKit browser cache after passing tests, JDK source/jmod archives and old phase2 mail venv. jlink would need jmods restored. No user source, Docker volume or test DB data was deleted.

Disposable PG fixture: `wordle-review-postgres`, localhost:55432, wordle_test, postgres / local-test-only. Maven truncates this isolated DB: stop the test backend before Maven, never run it concurrently with browser tests. Fixture app ports were 8091/9091; Vite Preview 3001. Latest PID/log files: `/workspace/work/retention/{app,preview}.pid` and .log (old no-new-languages PID files are stale). Stop only validated owned PIDs/fixture container at checkpoint completion; PID files may then be stale. Root Compose and production were not used.

Raw current logs: `/workspace/work/retention/{backend,frontend,production,backup-tests,e2e-chromium,e2e-firefox}.log`. Prior logs remain `/workspace/work/rotation/{backend-final,backup-restore}.log` and `/workspace/work/no-new-languages/`. Durable evidence is committed; raw logs can disappear in a fresh workspace.

Browsers: system Chromium `/usr/bin/chromium`; cache `/workspace/work/test-expansion/browsers` currently contains Firefox 1572 and ffmpeg. WebKit 2388 must be reinstalled for future WebKit runs. Local dependency libs: `/workspace/work/test-expansion/browser-libs/usr/lib/x86_64-linux-gnu`. Firefox smoke/E2E used this LD_LIBRARY_PATH, PLAYWRIGHT_BROWSERS_PATH and TMPDIR `/workspace/work/no-new-languages/firefox-tmp`; only the command sandbox was escalated, not browser security disabled. Use inherited proxy/CA for reinstalls. Disk is still tight; do not pull/build new Docker images or remove user data to gain space.

Publish via connected GitHub tools if shell push lacks credentials: create tree from exact changed UTF-8 files against fetched parent, verify tree SHA against local git tree, create commit and update branch ref with expected_sha/force=false. Fetch and align the local equivalent commit afterward. Never overwrite remote concurrent work. Local merge/deploy/main permissions have not been granted.
