# Codex continuation checkpoint — 2026-11-10 (Europe/Istanbul)

## Authorization and branch

Repository: ariforhanus/wordle-game-containerized. Continue on fix/security-game-integrity; do not merge main, deploy production or migrate to microservices. User authorized fixes, tests and branch publication, wants TODO work continued in priority order and explicit test/report evidence. Inspect current code first. Preserve existing functionality and other contributors' changes. No sub-agents were requested. Never publish the private root .env or .preview configuration.

## Completed in this checkpoint

- P1.1: daily canonical puzzle-day ranking; week/month SQL SUM, one player row, deterministic timestamp/user-ID ties, long totals, clear translated UI and cached-client aliases.
- P1.2: independent language current/best streak from played_at; selected-language profile/result/distribution and leaderboard current streak. Losses/gaps/future rows tested; no fixed two-language assumption in SQL.
- P1.3: bounded SQL stats/distributions/streak projections instead of Java full-history loading; consistent read snapshot and once-captured calendar day. Current-name display with historical score snapshots retained. V6 partial covering index; read plans recorded. TEXT/JSONB/normalized guesses decision recorded without changing storage.
- CI E2E gets isolated public bootstrap fixtures and no external dictionary dependency. No real secrets added.

## Latest local evidence

107 backend tests passed against PostgreSQL; 35 frontend unit tests passed (34.58% lines, 36.15% branches); TypeScript/release build and 8 built-worker tests passed. Full desktop/mobile Chromium and WebKit E2E: 45 passed, 6 skipped; final targeted three-engine recheck after final backend edits: 15 passed, a subset. Eleven backup fault tests, six preview tests and four env tests passed. Real checksum backup/isolated restore with V6 passed. See VALIDATION.md for scope.

The six E2E skips are production Nginx headers/offline cases; assets used Vite Preview because workspace disk is nearly full. Firefox/physical devices/assistive technologies were not verified. No production safety or capacity claim. Query plans use 20k synthetic TEMP rows, not actual application data; read gains do not establish write cost. V6 blocks writes while building, so reserve a migration window and rehearse. Remote CI historically failed before runner steps and must be checked separately for the published commit.

## Next work, in order

1. P1.3 structural constraint audit: inspect current Flyway schema/services before changes. Evaluate guesses limit/order, daily state/score relationship and foreign keys. Add forward-only migration/preflight if justified; preserve legacy data and test failures/rollback/concurrent requests. Do not silently rewrite old migrations/data.
2. Complete index write-cost comparison in isolated synthetic tables and production-sized rehearsal when authorized data/environment exists. Retain current local measurement limitations.
3. P1.4 finish daily-result next-game countdown using server calendar metadata without auto-Start. Stats/distribution already exist; countdown does not. Add backend/frontend/E2E boundary tests. Then old-game Resume selector, daily/practice explanation, network/offline/reconnect, accessibility.
4. New language dictionaries/rotation remain P2; verify redistribution licenses before adding data.

P0.2 still blocks production: actual secret rotation, runner/CI success, enforced main rules, authorized production-copy preflight/rollback, domain/HTTPS, staging images/scans, real SMTP and verified-email gate, external backups/alarms. User has not chosen domain/SMTP. Do not fabricate these values or mark external gates done.

## Workspace and reproduction notes

Local checkout: /workspace/work/wordle-game-containerized. Root .env is ignored, owner-only, generated for local Compose; do not read it into chat or commit it. node deploy/setup-local-env.mjs creates a fresh private file and refuses overwrite. Codespaces preview has a separate .preview environment.

Java 21: /workspace/work/tools/jdk21. Maven: /workspace/work/tools/apache-maven-3.9.11/bin/mvn, cache /workspace/work/m2, settings /workspace/work/maven-settings.xml (do not print). Latest raw logs: /workspace/work/streaks/{backend-final,frontend,production,full-e2e,final-e2e,backup-restore,ops-tests,preview-tests,env-tests}.log. Committed durable evidence is in VALIDATION.md and docs/performance; raw workspace logs may not survive a fresh environment.

Disposable PostgreSQL container wordle-review-postgres uses localhost:55432, database wordle_test, fixture role postgres / local-test-only. Integration tests truncate this test database; stop the test backend before Maven and do not run browser tests concurrently with it. Test release app used ports 8091/9091 and Vite Preview 3001. These are isolated test fixtures, not the root Compose database. Stop only owned test processes/containers after use. Disk is nearly full; avoid heavyweight image downloads and do not delete user data/volumes.

Benchmark: python scripts/benchmark-score-queries.py --container wordle-review-postgres --output docs/performance. It creates session-private TEMP tables only and extracts real native queries/V6 DDL; fixed dates are deterministic fixtures. Do not use ad-hoc current dates in test scenarios. Tests use shared TestTimes/MutableClock; production uses the injected Clock.

For continuation, git fetch origin and inspect status/log before editing. Another contributor previously updated this same branch; preserve remote work. This document lives in the checkpoint commit: use git log -1 -- docs/CODEX_HANDOFF.md to identify it. Read TODO.md for exact checkboxes; partial UX and write-load items remain open.
