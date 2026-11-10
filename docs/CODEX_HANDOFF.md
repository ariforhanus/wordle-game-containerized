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

1. P2.2 bot/multi-account assessment is in docs/ABUSE_PREVENTION.md. It distinguishes current account/language/day enforcement from proposed one-person competition rules, email possession from identity, admin answer privilege, alias/VPN/automation/NAT risks and reviewed signals. No CAPTCHA/fingerprint/automatic ban or new broad proxy trust.
2. AuthRateLimitFilter now rejects a full peer quota before body reads/new arbitrary identity buckets. Conditional PG UPSERT admits only up to each existing limit and stops increasing saturated counters. Existing old over-limit rows remain denied. Requests use one Clock instant; 429/no-store and Retry-After point to the rejecting fixed window's end. SQL/row-lock work still occurs on denial.
3. Default server.forward-headers-strategy is explicitly NONE. Production Nginx replaces inbound XFF/X-Real-IP with its observed peer and clears Forwarded/forwarded-host/port/prefix. Preview retains its prior host/scheme mapping. No actual deployment trusted-hop/real-IP configuration was enabled: Compose's Caddy/Nginx shared peer quotas remain a P0 availability/capacity gate.
4. Login/register recognize HTTP 429 even when an edge proxy returns HTML, with real EN/TR guidance, preserved inputs and explicit retry. No automatic retry or game/scoring/session policy changes.
5. Added ten real-PG admission/concurrency/boundary/failure tests, eight component cases and four browser cases per engine. Real Nginx source-config/header tests run in an existing owned review container using only temporary secondary configs/ports and a local echo server; no image build/main-config rewrite.
6. TODO/runbooks separate the locally completed assessment/fixes from real ingress verification in P0.2. Jenkins setup stays deferred to the owner. No schema migration, production change, new language, microservice or main merge.

Previous checkpoints remain implemented: 44f4948 added deletion/retention disclosure, atomic Clock cleanup and cascade/rollback tests; docs/DATA_RETENTION.md records external-journal/backup/restore requirements still not activated. cdb4dcd added immutable EN/TR daily rotation (V8), advisory locks/READ COMMITTED, unused-first/30-day preference/small-pool fallback and exact saved-answer playability. Read those docs instead of rebuilding prior work.

## Latest verified evidence

- Backend full Java 21/PG verify: **175 passed**, zero skips/failures/errors. Fresh JaCoCo: 76.13% lines / 63.46% branches. Two independent filters/12 concurrent requests admit exactly ten. No production limits were lowered/disabled.
- Frontend: **93 passed**, no unhandled errors; V8 64.62% lines / 60.57% branches.
- TypeScript/release Vite build: pass; **8** built-worker tests pass.
- Selected release-build E2E: **12 desktop/mobile Chromium + 6 Firefox passed**, zero skips. Four new EN/TR login/register 429/manual-retry cases per engine plus logout/account-error-focus. First 429 is intercepted for UI; explicit retry hits actual backend. Only interception contexts block workers; real backend limit behavior is in PG tests.
- Opt-in real-Nginx current production/preview source-config tests: **2 passed** with nginx -t and header echo. Local Docker review binary is 1.31.7; temp listen/upstream/include/temp paths differ only for isolation. Not a new final image scan or actual Caddy/CDN ingress verification.
- Default operator suite: 18 discovered, **15 passed / 3 skipped** (two proxy opt-ins, existing write-fault real-DB opt-in). This default run does not prove skipped integration tests passed; the two proxy cases were separately run with opt-in enabled.
- UI E2E used Vite Preview/real isolated backend+PG with only its auth limiter disabled to isolate UI cases; quotas remain enabled in backend tests/default config. Firefox uses the established command-sandbox escalation without disabling its security. WebKit was NOT rerun; cache absent.
- Prior deletion/backup/rotation results are historical: current new work did not run an external-journal privacy restore drill, real SMTP, production image scans or physical/screen-reader tests. No remote-CI success claimed. Previous GitHub run #25 failed before steps/no runner; Jenkins is the owner's deferred task.

## Next work, priority order

1. **P0 external release gates stay open:** actual credential rotation, successful runner/CI and image scans, enabled main ruleset, authorized production-copy preflight/V8 lock/rollback rehearsal, domain/DNS/HTTPS, real SMTP and verification gate, off-host backup/restore and actual alarm receivers. Domain/provider/production environment are not selected. Do not fabricate values or mark these done. Previous remote jobs failed before steps/runner assignment; inspect current run rather than assuming billing or a test failure.
2. **P1 manual acceptance:** actual mobile/physical Safari, real browser zoom, NVDA/VoiceOver speech/browse mode, color-vision/user review and full site/account/themed contrast/focus audit. Scoped automated tests do not complete this work. Firefox local startup is now resolved; SMTP/Nginx Firefox checks and staging/browser integration remain open.
3. **Next single TODO: SMTP outbox evaluation.** Inspect synchronous mail timing, retries, user-row locks and transaction boundaries. Preserve single-use/expiry/session security and delivery-failure behavior; distinguish local transport/fault tests from real provider staging. Prepare a concrete decision before implementing a queue or adding a provider.
4. **Actual ingress verification remains P0:** current Caddy→Nginx→backend shares edge/application peer budgets. Do not enable arbitrary forwarded-header trust or broad internal-network regexes. Follow docs/ABUSE_PREVENTION.md for exact trusted hops, real-IP handling at both layers, forged/direct/NAT/v4/v6 tests and capacity rehearsal. Person-level policy/automatic sanctions are proposals, not implemented guarantees. Deletion journal/actual retention activation likewise remains P0.
5. Staging capacity/release/rollback/monitoring rehearsals when an authorized environment exists. Preserve small-fixture measurement limits. New languages remain explicitly deferred.

Read TODO.md for current checkboxes, docs/WORD_ROTATION.md for policy/locks/rollout, docs/ACCESSIBILITY.md for tested scope and manual gaps, docs/DAILY_GAME_CONSISTENCY.md for cross-table boundaries and docs/DATA_RETENTION.md for deletion/cleanup/backup/restore obligations. Read docs/ABUSE_PREVENTION.md before changing limits/proxy trust. V8 is a regular index build: reserve a measured write window, upgrade all puzzle writers before reopening, and do not casually modify old puzzle rows. Runtime schema-owner privileges can bypass DDL guards; stronger migration/runtime role separation remains a production consideration.

## Workspace and reproduction

Local checkout: `/workspace/work/wordle-game-containerized`. Before edits, fetch and inspect git status/log; this branch has previously received another contributor's changes. The checkpoint is identified by `git log -1 -- docs/CODEX_HANDOFF.md`. Use branch head rather than old commit IDs in historical reports.

Toolchain: `/workspace/work/tools/jdk21`; Maven `/workspace/work/tools/apache-maven-3.9.11/bin/mvn`; cache `/workspace/work/m2`; settings `/workspace/work/maven-settings.xml` (do not print). Java trust store is `/etc/ssl/certs/java/cacerts`. Runtime/compiler remain usable. To free space, only owned disposable artifacts were removed: old test JAR, WebKit browser cache after passing tests, JDK source/jmod archives and old phase2 mail venv. jlink would need jmods restored. No user source, Docker volume or test DB data was deleted.

Disposable PG fixture: `wordle-review-postgres`, localhost:55432, wordle_test, postgres / local-test-only. Maven truncates this isolated DB: stop the test backend before Maven, never run it concurrently with browser tests. Fixture app ports were 8091/9091; Vite Preview 3001. Latest PID/log files: `/workspace/work/abuse/{app,preview}.pid` and .log (old retention/no-new-languages PID files are stale). Stop only validated owned PIDs/fixture container at checkpoint completion; PID files may then be stale. Root Compose and production were not used.

Raw current logs: `/workspace/work/abuse/{backend,frontend,production,e2e-chromium,e2e-firefox,proxy-tests,ops-default}.log`. Prior logs remain `/workspace/work/retention/`, `/workspace/work/rotation/` and `/workspace/work/no-new-languages/`. Durable evidence is committed; raw logs may disappear in a fresh workspace.

Proxy test reproduction: use the already running owned wordle-review-web fixture and WORDLE_PROXY_TEST_CONTAINER plus WORDLE_PROXY_TEST_HOST=<verified current local IPv4>. Old container ExtraHosts stores a stale executor address after environment restore; never reuse it blindly. Test binds only that current local address and connects from temporary Nginx configs. It writes exclusively under /tmp/wordle-proxy-<uuid>, uses secondary ports 18081/18082 and bounded loopback wget -Y off/-T 5. Initial fixture failures were corrected; final 2 tests pass. Default operator run skips them. Stop owned web/PG/app/preview fixtures at completion. No new Docker image/container was created; read-only main config was untouched.

Browsers: system Chromium `/usr/bin/chromium`; cache `/workspace/work/test-expansion/browsers` currently contains Firefox 1572 and ffmpeg. WebKit 2388 must be reinstalled for future WebKit runs. Local dependency libs: `/workspace/work/test-expansion/browser-libs/usr/lib/x86_64-linux-gnu`. Firefox smoke/E2E used this LD_LIBRARY_PATH, PLAYWRIGHT_BROWSERS_PATH and TMPDIR `/workspace/work/no-new-languages/firefox-tmp`; only the command sandbox was escalated, not browser security disabled. Use inherited proxy/CA for reinstalls. Disk is still tight; do not pull/build new Docker images or remove user data to gain space.

Publish via connected GitHub tools if shell push lacks credentials: create tree from exact changed UTF-8 files against fetched parent, verify tree SHA against local git tree, create commit and update branch ref with expected_sha/force=false. Fetch and align the local equivalent commit afterward. Never overwrite remote concurrent work. Local merge/deploy/main permissions have not been granted.
