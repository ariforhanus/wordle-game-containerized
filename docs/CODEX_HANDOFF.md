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

1. **The durable mail outbox TODO is implemented and locally verified**, not still a design task. V9 adds encrypted jobs/composite token identity constraints and atomic cancellation trigger. Existing users/token hashes/game/answer history remain. Default MAIL_OUTBOX_ENABLED=false preserves synchronous behavior. No production migration/activation was run.
2. Opt-in issuance commits token, older same-purpose revocation and encrypted job together. Known/unknown reset responses remain neutral; no-op rows retain no unknown address. A later SMTP failure does NOT restore older links. EN/TR forms disclose replacement and delayed delivery. DB/enqueue failure rolls back issuance and older-job cancellation. Capacity is bounded before account lookup.
3. Separate versioned AES-256-GCM keys, fresh nonce and AAD bind job/user/purpose/hash/expiry/Message-ID. No plaintext capability in SQL/outbox inspection/logging. Missing live versions fail enabled startup; wrong material/tamper becomes BLOCKED without automatic destructive retry. Private key tooling never overwrites/prints keys; root .env unchanged. Never put real keys in tracked .env.
4. Same-monolith scheduled worker: short READ COMMITTED SKIP LOCKED leases, no DB connection/transaction/user lock across SMTP, matching-lease finalization, bounded transient/uncertain backoff, permanent/auth/TLS stop, TTL/attempt caps and restart recovery. Retries reuse token/expiry/Message-ID and can duplicate accepted SMTP; no exactly-once/inbox guarantee.
5. Token consumption/new issuance/password reset/change cancels active jobs and wipes ciphertext in the same DB transaction. Delete cascades; recipient/current verification status is rechecked; re-register cannot retarget mail. Logout-all retains link semantics. Hourly cleanup includes outbox/no-op data even while dispatch is paused. An in-flight email cannot be unsent; revoked/deleted tokens fail.
6. Safe ADMIN-only inspection/retry API, finite outcome/purpose metrics and queue/freshness gauges. Reviewed retry validates payload/identity/TTL/attempts, locks original user and audit actor in ID order BEFORE job locks, and records its audit atomically. This avoids a newly identified inversion against account mutation/token-trigger cancellation. No external receiver/alert rule activated.
7. Real loopback SMTP verifies temporary 450/permanent 550 classification, uncertain final ACK, and persisted Message-ID over actual repeated sends. EN/TR browser requests survive SMTP refusal and an application restart with the same DB/keys, then deliver/consume against healthy capture. Real custom-format dump/restore authenticates unchanged encrypted capabilities and restored-token revocation clears ciphertext without changing source. See docs/MAIL_OUTBOX.md and VALIDATION.md.

Previous game/score/streak/rotation, abuse/privacy, SMTP neutral-failure and account-security checkpoints remain implemented. Default synchronous mode still holds SMTP locks and has send-versus-commit ambiguity; do not claim outbox guarantees for it. Queue DB timing differences and real provider/production prerequisites remain.

## Latest verified evidence

- Full Java 21 / real PG verify: **245 passed**, zero skips/failures/errors. Fresh JaCoCo **80.71% lines / 69.21% branches**. Strengthened 25-case outbox integration class rerun separately after its concurrent lock-order assertion was added; passed.
- Frontend **101 passed**, no unhandled errors; V8 **64.92% lines / 61.04% branches**. TypeScript/release Vite build and **8** built-worker cases pass.
- Four selected real-backend E2E scenarios passed without skips: one EN/TR combined refused-SMTP → application restart → four-message recovery case on Chromium; healthy verification/reset/single-use/session revocation on desktop/mobile Chromium and Firefox. Limits remained enabled; release assets via Vite Preview; no real provider/mailbox.
- **1** explicit real encrypted pending-mail custom-format backup/isolated-restore test passed; source unchanged, restored revocation clears payloads and temporary DB dropped. Default ops discovery: 19 cases, 15 passed / 4 fixture gates skipped (this restore case separately ran explicitly). **9** env/key setup Node cases pass.
- Base/preview Compose config, private filename Git ignore and diff whitespace checks pass. Actual internal Prometheus retry/no-op/reset-failure counts, active/fresh/enabled gauges and absence of account labels were verified; see VALIDATION.md. No final application image build/new Docker image, production activation or CI success is claimed.

## Next priority

The next release work is **P0.2 activation/rehearsal**, not reimplementing the outbox:

1. Owner selects the real domain/SMTP provider and supplies staging through secret configuration. Validate TLS/auth/DNS/SPF/DKIM/DMARC, real delivery/bounces, provider rate/uncertain failures, key custody/rotation, all-node pause/restore and measured queue/connection/scheduler capacity. Configure actual alert receiver for delivery/outcomes/blocked/capacity/stale-worker/age. Default stays off until this is complete.
2. Rehearse production-sized V9 migration locks and release rollback on an authorized copy. Set up independent deletion journal and actual backup/provider retention, then prove restore reconciliation with ALL workers/mail stopped and all restored recovery tokens invalidated before traffic. JWT rotation alone is insufficient.
3. Actual Caddy→Nginx→backend trusted hops/real-IP/rate budgets remain P0. Follow docs/ABUSE_PREVENTION.md for forged/direct/NAT/v4/v6 checks; do not enable arbitrary forwarded-header trust or broad CIDRs.
4. CI/Jenkins remains owner-deferred; successful remote CI, branch ruleset activation, live secret rotation, staging/image scans/backup/alarm delivery/release approval remain open. No main merge/deploy authorization.
5. Remaining P1 accessibility includes full-page/account/theme focus/contrast plus physical devices and actual NVDA/VoiceOver/Safari/user validation. Local tests do not complete manual gates. New languages remain explicitly deferred.

Read TODO.md, docs/MAIL_OUTBOX.md, docs/DATA_RETENTION.md, docs/ABUSE_PREVENTION.md and docs/ACCESSIBILITY.md before choosing the next one-item checkpoint. Continue available local work without pretending unavailable production/provider/manual checks are complete.

## Workspace and reproduction

Checkout: `/workspace/work/wordle-game-containerized`, branch fix/security-game-integrity. Fetch and inspect status/log before edits to preserve concurrent work. Find the published checkpoint using `git log -1 -- docs/CODEX_HANDOFF.md` rather than a stale historical SHA.

Java21 `/workspace/work/tools/jdk21`; Maven `/workspace/work/tools/apache-maven-3.9.11/bin/mvn`; cache `/workspace/work/m2`; settings `/workspace/work/maven-settings.xml` (never print). Set JAVA_HOME and MAVEN_OPTS=-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts. Runtime/compiler remain usable; source/jmod archives were removed earlier for disk space. Formatter `/workspace/work/tools/java-format.jar --aosp --replace`.

Owned PG fixture wordle-review-postgres, loopback55432, wordle_test, postgres/local-test-only. Maven truncates this isolated DB: stop the test app before Maven, never run backend browser tests concurrently with it. Owned app/preview/SMTP and PG are stopped at checkpoint completion. PID files can be stale; validate /proc cmdline before signaling. No root Compose stack or production was used.

Current private fixture harness/logs are `/workspace/work/outbox/`: fixture.py starts owned capture2525/8025 + release Preview3001 + app8091/management9091 with separate local-only JWT/AES runtime files. `start` points SMTP at refused2526, `healthy` restarts only the app with capture2525, `stop` validates/stops owned processes. No secrets are printed; root .env is not read. runtime.json and mail-keys.env are private test fixtures, never stage/publish them. Use fresh empty capture and a NEW marker path for each mail-outbox.spec.ts recovery run; after no-PII marker exists, restart only the same-key/DB app healthy within 60s. Full reproduction flags are in docs/SMTP_DELIVERY_DECISION.md. The opt-in Python restore test reads its test key file via environment, creates/drops only a random restore DB and does not change source.

Current logs: `/workspace/work/outbox/{backend-final,backend-lock-order,frontend,production,env-tests,ops,restore,metrics,e2e-recovery,e2e-healthy-chromium,e2e-healthy-firefox}.log`; previous mail-review/abuse/retention/rotation logs are historical. Durable results are in VALIDATION.md; raw workspace artifacts may disappear. Disk remains tight (~160MiB); reuse owned Docker fixtures, do not pull/build images or remove user data/volumes.

Browsers: system Chromium `/usr/bin/chromium`; PLAYWRIGHT_BROWSERS_PATH=/workspace/work/test-expansion/browsers contains Firefox1572/ffmpeg (WebKit was removed after earlier passing runs). Firefox needs LD_LIBRARY_PATH=/workspace/work/test-expansion/browser-libs/usr/lib/x86_64-linux-gnu and TMPDIR=/workspace/work/no-new-languages/firefox-tmp. Its established command sandbox escalation preserves normal browser security. Restore WebKit via inherited proxy/CA only when needed; do not weaken browser security.

Proxy tests can reuse stopped owned wordle-review-web with WORDLE_PROXY_TEST_CONTAINER and a verified CURRENT WORDLE_PROXY_TEST_HOST local IPv4; old container ExtraHosts can be stale after environment restore. Tests use /tmp/wordle-proxy-UUID secondary ports18081/18082 and bounded loopback wget. Default operator suite gates these cases; do not claim an actual ingress validation.

Publish through connected GitHub create_tree/create_commit/update_ref if shell push lacks credentials: build exact UTF-8 tree against fetched parent, verify local tree SHA, update fix/security-game-integrity using expected_sha/force=false. On lease failure inspect new remote work; do not overwrite it. Fetch and align the local equivalent commit after publication. Never merge main/deploy automatically.
