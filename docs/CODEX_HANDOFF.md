# Codex continuation checkpoint — 2026-11-10 (Europe/Istanbul)

## Authorization and branch

Repository: ariforhanus/wordle-game-containerized. Continue on fix/security-game-integrity; do not merge main, deploy production or migrate to microservices. User authorized fixes, tests and branch publication, wants TODO work continued in priority order and explicit test/report evidence. Inspect current code first. Preserve existing functionality and other contributors' changes. No sub-agents were requested. Latest user override: root .env is now committed as a LOCAL TEST FIXTURE at explicit owner request. Its credentials are public test values; rotate them before public use. Keep .preview credentials private.

## Completed in this checkpoint

- P1.1: daily canonical puzzle-day ranking; week/month SQL SUM, one player row, deterministic timestamp/user-ID ties, long totals, clear translated UI and cached-client aliases.
- P1.2: independent language current/best streak from played_at; selected-language profile/result/distribution and leaderboard current streak. Losses/gaps/future rows tested; no fixed two-language assumption in SQL.
- P1.3: bounded SQL stats/distributions/streak projections instead of Java full-history loading; consistent read snapshot and once-captured calendar day. Current-name display with historical score snapshots retained. V6 partial covering index; read plans recorded. TEXT/JSONB/normalized guesses decision recorded without changing storage.
- CI E2E gets isolated public bootstrap fixtures and no external dictionary dependency. No real secrets added.

## Latest local evidence

130 backend tests passed against PostgreSQL after V7; 35 frontend unit tests passed (34.58% lines, 36.15% branches); TypeScript/release build and 8 built-worker tests passed. Full desktop/mobile Chromium and WebKit E2E: 45 passed, 6 skipped; final targeted three-engine recheck after final backend edits: 15 passed, a subset. Eleven backup fault tests, six preview tests and four env tests passed. Real checksum backup/isolated restore with V6 passed. See VALIDATION.md for scope.

The six E2E skips are production Nginx headers/offline cases; assets used Vite Preview because workspace disk is nearly full. Firefox/physical devices/assistive technologies were not verified. No production safety or capacity claim. Query plans use 20k synthetic TEMP rows, not actual application data; read gains do not establish write cost. V6 blocks writes while building, so reserve a migration window and rehearse. Remote CI for checkpoint 29d68c3 failed with zero steps and no runner assigned; security was skipped. Check the new published commit independently. Do not describe this as a test assertion failure or assume a billing cause without evidence.

## Next work, in order

1. Structural audit is complete: V7 checks answer/guess shape, turn count and terminal timestamp presence; separate V3+ preflight diagnoses bad rows. Score collisions now roll back completion instead of silently ignoring the score. New tests prove atomic migration failure/retry, FK integrity, Turkish/repeated guesses and HTTP 409 rollback. Full backend: 130 pass. Targeted three-engine E2E: 15 pass; V7 backup/restore passed. Cross-table game/result semantics still depend on the sole application writer/transaction; no deferred trigger or historical adoption was added. Read docs/DAILY_GAME_CONSISTENCY.md before extending this boundary.
2. Complete index write-cost comparison in isolated synthetic tables and production-sized rehearsal when authorized data/environment exists. Retain current local measurement limitations.
3. P1.4 finish daily-result next-game countdown using server calendar metadata without auto-Start. Stats/distribution already exist; countdown does not. Add backend/frontend/E2E boundary tests. No old-game Resume selector (user removed it); then daily/practice explanation, network/offline/reconnect, accessibility.
4. New language dictionaries/rotation remain P2; verify redistribution licenses before adding data.

P0.2 still blocks production: actual secret rotation, runner/CI success, enforced main rules, authorized production-copy preflight/rollback, domain/HTTPS, staging images/scans, real SMTP and verified-email gate, external backups/alarms. User has not chosen domain/SMTP. Do not fabricate these values or mark external gates done.

## Workspace and reproduction notes

Local checkout: /workspace/work/wordle-game-containerized. Root .env is ignored, owner-only, generated for local Compose; do not read it into chat or commit it. node deploy/setup-local-env.mjs creates a fresh private file and refuses overwrite. Codespaces preview has a separate .preview environment.

Java 21: /workspace/work/tools/jdk21. Maven: /workspace/work/tools/apache-maven-3.9.11/bin/mvn, cache /workspace/work/m2, settings /workspace/work/maven-settings.xml (do not print). Previous checkpoint raw logs: /workspace/work/streaks/{backend-final,frontend,production,full-e2e,final-e2e,backup-restore,ops-tests,preview-tests,env-tests}.log. Latest V7 logs: /workspace/work/constraints/backend-final.log (130 tests), e2e.log (15 tests), backup-restore.log; fixture process PID files and app/preview logs are in the same directory. Committed durable evidence is in VALIDATION.md and docs/performance; raw workspace logs may not survive a fresh environment.

Disposable PostgreSQL container wordle-review-postgres uses localhost:55432, database wordle_test, fixture role postgres / local-test-only. Integration tests truncate this test database; stop the test backend before Maven and do not run browser tests concurrently with it. Test release app used ports 8091/9091 and Vite Preview 3001. These are isolated test fixtures, not the root Compose database. Stop only owned test processes/containers after use. Disk is nearly full; avoid heavyweight image downloads and do not delete user data/volumes.

Benchmark: python scripts/benchmark-score-queries.py --container wordle-review-postgres --output docs/performance. It creates session-private TEMP tables only and extracts real native queries/V6 DDL; fixed dates are deterministic fixtures. Do not use ad-hoc current dates in test scenarios. Tests use shared TestTimes/MutableClock; production uses the injected Clock.

For continuation, git fetch origin and inspect status/log before editing. Another contributor previously updated this same branch; preserve remote work. This document lives in the checkpoint commit: use git log -1 -- docs/CODEX_HANDOFF.md to identify it. Read TODO.md for exact checkboxes; partial UX and write-load items remain open.

## Latest user interruption: explicit local admin login

User requested admin / 123456 for private testing and a generated secret. Root ignored .env was updated (0600): JWT regenerated, database passwords preserved, optional SMTP disabled. Compose forwards ALLOW_INSECURE_LOCAL_ADMIN (default false). Bootstrap's opt-in accepts six-character passwords only with loopback HTTP public URL and nonempty all-loopback CORS; normal minimum remains 12. Account conflict/promotion/reset protections remain intact. Generator supports --insecure-local-admin for a fresh env, still refuses overwrite and uses random database/JWT keys. No private env secrets are committed. User must use the private workspace env file or run the generator in another checkout.

Latest full backend: 141 passed; env-generator: 5 passed. Compose config checks passed. Actual release-JAR admin login and authenticated admin endpoint passed using an isolated test database. Logs in /workspace/work/local-admin/. This smoke test did not modify the user's Compose database or reset any preexisting real account. Short test credentials must stay private/local; matching URL/CORS does not enforce network isolation. Future public use requires explicitly rotating the stored admin password and disabling the opt-in.

Continue the remaining index write-cost measurement/countdown TODOs after this interruption. Existing production gates remain open; do not merge main or deploy.

## Latest override: commit the local env

The owner explicitly requested committing root .env and removing it later. It is now tracked despite the ignore rule, with a local-test-only header. Fresh branch checkouts already contain this file: do not run the non-overwriting generator unless the file has first been deliberately moved. The earlier private/ignored-root-env statements describe prior checkpoints and are superseded by this request. Deleting .env in a future commit will not remove it from history. Rotate database/admin credentials and JWT before public use; no production credentials should be substituted into this tracked file. .preview remains private. Base and production-profile Compose configuration were revalidated without printing secrets. No application code changed in this checkpoint.

## Latest interruption: Windows PostgreSQL first-init failure

Screenshot: official entrypoint cannot execute 10-wordle.sh (required file not found). Reproduced exactly with CRLF. Added .gitattributes forcing LF for shell/SQL/Dockerfiles and touched init script to trigger a normalized checkout on pull. New ops test simulates core.autocrlf=true in a temporary Git repo; 12 total Python ops tests pass. Official PostgreSQL 17.4 interrupted-init recovery test passed without data deletion; application role/password TCP login and non-superuser attribute verified. See DEPLOYMENT.md for four recovery commands. They apply only to the interrupted first init with absent wordle role; do not tell users to delete volumes or rerun CREATE ROLE on an existing provisioned database.

Workspace disk is critically low after a failed new Docker container init-layer allocation; future tests should reuse the owned container and RAM-backed isolated clusters or clean only owned disposable tool caches. Existing test PG data was preserved; temporary cluster/script removed. Backend/frontend code did not change, so their prior suites were not rerun for this Git checkout fix.

## Latest user decision: expire unfinished games at midnight

Old unfinished daily games MUST NOT be resumed. This supersedes the old overnight-completion policy and the P1.4 old-game Resume selector. No selector will be built. Server authority uses app.timezone; old owned unfinished GET and guesses/replays return 410 game_expired. Guess time is checked after row-lock acquisition; Start that waits past its captured day rolls back. Already finished results and exact completed retries remain readable. No historical rows are deleted and expiry does not generate a score or synthetic loss. Frontend 410 handling clears the board and refreshes today's status without auto-Start. EN/TR rules and TODO reflect this decision. Follow OPERATIONS.md for exact boundary semantics; earlier handoff notes about old-game selectors are superseded.

Latest expiry evidence: 142 backend, 37 frontend and 8 built-worker tests passed; release build passed; selected desktop/mobile Chromium + WebKit E2E: 18 passed. V8: 35.07% lines / 36.53% branches. Logs: /workspace/work/expiry/{backend-final,frontend-final,production-final,e2e-final}.log. 410 E2E is a response-contract simulation; real server-clock/lock expiry is tested with PostgreSQL integration fixtures. No old-day Resume work remains; next open implementation items are still index write-cost measurement and the daily-result countdown.

## Latest TODO completion: index write/storage evaluation

P1.3 index evaluation is complete locally. New scripts/benchmark-score-writes.py uses WAL-logged tables in a unique transaction-private schema, not TEMP/unlogged tables, with 10k seed + 1k inserts. Twenty samples alternate paired order for 80%-win and loss-only workloads. V6 SQL is extracted directly from the migration; PK/unique/FK and baseline indexes are equivalent. Every sample verifies rows/WAL/rollback cleanup. Fourteen ops tests passed with WORDLE_BENCHMARK_TEST_CONTAINER=wordle-review-postgres, including SQL-failure cleanup and unsafe database-name refusal. No app code changed, so backend/frontend/E2E were not rerun. Raw plans/medians/limits: docs/performance/writes/README.md and summary.json. Local logs: /workspace/work/write-bench/.

Measured mixed batch: 11.912→14.190 ms median (+19.1%); WAL 534188→628164 (+17.6%); extra V6 storage 408→464 KiB. Loss-only WAL/storage growth unchanged. Build time is small-fixture DDL, not production lock duration. Commit/replication/concurrency/API throughput are unmeasured; production-sized rehearsal and capacity stay P0 release gates. Keep V6; no index drops or migrations were made.

NEXT: P1.4 daily-result countdown using server day/time zone; stats/distribution are already present. Respect current expiry policy: no old-game Resume, no automatic Start at rollover. Implement with backend/frontend/E2E boundary tests. Then daily/practice explanation, network recovery and accessibility. Main merge/deploy/microservices remain unauthorized.

Workspace disk remains low (~85 MiB free after removing only the generated backend JAR to run the benchmark). Repackage the JAR before any next application/browser smoke tests; do not assume it exists. The owned PostgreSQL fixture is stopped at checkpoint completion; application records were not read or modified by the benchmark, and no benchmark schemas remain.

## Latest TODO completion: daily result countdown

StatusView now adds serverNow/nextGameAt; next boundary derives from next local date (not 24h), from the same server instant used for today's date. DailyCountdown renders only at terminal results, uses performance.now and server interval with RTT/2 approximation, retries calendar failures independently from saved stats, and re-queries on focus/visibility. At zero or a later server day it offers Check today's game; that click refreshes read-only main status and a separate Start is still required. No old-day Resume or automatic Start. Missing metadata fails closed only for countdown, preserving the result. Timer aria-live is off. Source is in packages/web/src/components/DailyCountdown.tsx; API optional metadata is for older deployments only.

Latest backend 145 passed; frontend 43 passed (37.37% lines / 39.15% branches); release build and 8 worker tests passed. Logs under /workspace/work/countdown/. Backend tests include DST 23/25h, exact midnight and no game creation. Browser cases include real result metadata/device-clock change plus mocked-calendar rollover/no-auto-Start; final selected E2E: 21 passed, zero skips across desktop/mobile Chromium and WebKit. All prior expiry rules stay enforced.

NEXT: daily/practice game differences (ranking, daily right, ongoing timer, offline rules), then network/reconnect recovery and accessibility. Production/CI gates, Firefox and physical-device validation remain open. No previous-day Resume work. Backend JAR was rebuilt for this checkpoint; owned test processes/PG fixture should be stopped at completion. Preserve branch; no main merge/deploy/microservices.

## Latest TODO + user request: language names and daily/practice guidance

User asked to remove duplicated GB/EN in the language picker and left design choice to us. Header now uses LanguageSelect, a shared native select displaying current English/Türkçe without flags/codes, localized label and persistent choice. Mobile selection closes menu; closed menu is inert. Menu icon uses inline SVG to remain visible without the external icon font. Future language configs supply their native names automatically. No flag data was removed from engine because other uses can retain it.

GameModeInfo is a collapsed native details section on both practice/daily entry and active daily screens, with EN/TR daily ranked right/timer/midnight/connection versus unlimited unranked/cached-offline rules. No gameplay/backend changes. Frontend 48 tests passed (41.29% lines / 43.22% branches); release build + 8 worker tests passed. E2E logs/screenshots are under /workspace/work/language-ux/ and ignored web test-results. Selected three-engine E2E: 15 passed, zero skips. Screenshot-only follow-up rechecks the same language journey, not additional distinct coverage. Backend 145 passed previously, not rerun here.

NEXT: network interruption/draft guess/reconnect coverage and fixes, then remaining accessibility/mobile requirements. No previous-day Resume; no automatic daily Start; production/CI gates remain open. Stay on fix/security-game-integrity; no main merge, deployment or microservices.

## Latest TODO completion: daily draft and network recovery

DailyPage now persists only a bounded per-language input/pending draft in sessionStorage, via utils/dailyDraft.ts. Matching authorized game ID/date/language and turn are required on restore; terminal/expired/malformed/unrelated drafts clear. Exact accepted pending words clear instead of being sent for the next turn. Conflicting session history preserves input as an unsubmitted draft and shows review guidance. No offline POST queue, no automatic Start/guess, no score/answer/JWT/API-response caching. Storage is best effort; server game state remains authoritative.

Unknown POST outcomes freeze edits to the exact word/turn; manual retry repeats only it. Offline typing stays editable (known-offline submission sends nothing); reconnect/check saved game reads the server and retains draft text. A GET that has not confirmed an outstanding POST does not release its pending payload, because the original write might still commit. Status/Start/load/guess have an opt-in 15s deadline; unrelated HTTP calls keep prior defaults. Fetch abort does not mean server rollback. Mounted/language/game guards prevent late callbacks mutating another view's storage. 410 refreshes today's status without auto-Start.

Latest frontend 69 pass; TypeScript/release build + 8 worker pass; coverage 44.64% lines / 48.12% branches. Backend unchanged (prior 145 pass, not rerun). Final selected E2E: 24 passed, zero skips across desktop/mobile Chromium and WebKit, on the final bundle with daily deadlines. Log: /workspace/work/reconnect/e2e-final.log. Logs in /workspace/work/reconnect/. Production worker/Nginx network integration, physical devices, Firefox and manual assistive-technology remain open. Storage blocked/quota/session closure can lose drafts, but never the server's accepted turns. Runtime test services should be stopped at checkpoint completion.

NEXT: remaining P1.4 accessibility (reduced motion, non-color feedback, screen-reader/keyboard/contrast) and mobile landscape/zoom/focus validation. Actual physical-device checks and production/CI gates remain open. Keep old unfinished games expired and require explicit new-day Start. Do not merge main, deploy or start microservice migration.

## Latest TODO checkpoint: game accessibility implementation

Implemented useReducedMotion + CSS preference handling; skipped reveal timers/confetti under reduce, including live preference changes. Board/key permanent ✓/•/× feedback with EN/TR legend, explicit names/descriptions and latest-row live summary; blind mode hides all status signals until game end. Explicit aria names and decorative icon hiding are necessary because real browsers include CSS/font pseudo-content in names (JSDOM does not). Keep native key names stable.

useDialogFocus manages help/practice hint/result focus, background inertness, Tab and restoration; Escape closes help/hints, existing result actions remain. Storage errors cannot block help close. Global game key handlers skip form/header/dialog/IME/shortcuts and native control Enter; starting a word from a game control focuses the board. useLayoutEffect keeps keyboard handler aligned with committed board. Header Escape returns focus; menu now covers tablet widths and scrolls in landscape. Tiles flex to avoid narrow overflow; modal cards scroll. Colors/focus outlines improved, >=4.5:1 board/key ratios measured in both themes.

Latest frontend 77 pass (51.14% lines / 52.71% branches); release build + 8 worker pass. Backend unchanged, prior 145 not rerun. Three-engine selected E2E 24 pass; scoped Axe and 320×568/736×320/text 200% included. Final outline-CSS subset recheck log: /workspace/work/a11y/e2e-focus-final.log (9 passed, zero skips; subset recheck, not extra distinct scenarios). Logs in /workspace/work/a11y/. docs/ACCESSIBILITY.md explains scope and remaining manual work. No old-game Resume/auto-Start/scoring/schema changes.

NEXT: full account/themed-flow and manual accessibility/zoom audit; successful Firefox runtime; actual devices/NVDA/VoiceOver/color-vision user checks remain open. Do not claim full WCAG certification or emulation as physical testing. P0 CI/staging/domain/SMTP/rotation/backup/monitoring gates stay open. The test JDK source archive and generated failed traces were removed to free space; compiler/JVM binaries and PostgreSQL data preserved. Stop owned test processes/PG at completion. No main merge/deploy/microservices.
