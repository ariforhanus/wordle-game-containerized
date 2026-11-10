# Operations and account-security runbook

## Local Docker Compose quick start

With Node.js 22+ and Docker Compose installed, run from the repository root:

```sh
node deploy/setup-local-env.mjs
docker compose config --quiet
docker compose up --build -d
```

Open `http://localhost:8080`. The bootstrap administrator is `localadmin`; read `ADMIN_PASSWORD` from the generated local `.env`. The script generates independent random PostgreSQL administrator/application passwords, a JWT key, and an administrator password, with localhost URL/CORS settings. It writes `.env` with owner-only permissions on POSIX, does not print credentials, and refuses to overwrite an existing env file. Existing `.env` files should be reviewed/reused rather than regenerated to change passwords accidentally.

`.env` is ignored by Git and is not delivered through GitHub. Running the setup command on your own computer creates its own credentials; the workspace's generated file is not a shared test password. `.env.example` remains an unfilled template for explicit configuration. No edits to `application.properties` or Compose are needed for this local setup; Compose supplies the variables. An IDE/direct Java launch needs its own environment configuration.

Mail is disabled until a real provider or reachable local capture server is configured; empty SMTP fields are intentional, and verification/reset email requests return 503 while disabled. Registration, login, games, and admin testing remain available because verified-email ranked participation is off. Existing PostgreSQL volumes retain their initialized database passwords: changing `.env` does not rotate them. Reuse the matching credentials for an existing volume; this setup command never deletes volumes or data. Production DNS/TLS, mail delivery, secret rotation, and release checks remain separate tasks.

For the isolated Codespaces/iPhone preview, use `./scripts/start-preview.sh` instead; it manages `.preview/secrets.env` and `.preview/runtime.env` separately. The root local `.env` and its admin credentials do not configure that preview. See `docs/CODESPACES_PREVIEW.md` for its private forwarded URL and account-registration flow.

## What is ready, and what is not activated

The code and scripts are prepared for the existing monolith. Production domain, SMTP provider, backup destination, log collector, alert receiver, and authorized production credentials have not been supplied. Nothing here deploys the application, rotates live secrets, or modifies production data automatically.

## Release gates

CI runs backend/PostgreSQL tests, frontend tests/build/audit, desktop/mobile Playwright checks, a real isolated backup restore, and Trivy scans of both final application images. Actions are pinned to commit SHAs and the workflow token is read-only. A weekly schedule also checks for newly disclosed advisories. A failed scanner or unavailable vulnerability database must not be treated as success.

Import `.github/rulesets/main.json` under GitHub Settings → Rules → Rulesets, review it, and enable it for `main`. It requires `backend`, `frontend`, `e2e`, and `security` plus one pull-request approval; adjust reviewer requirements if the project has no other reviewer. The connected GitHub tools do not provide repository-administration mutations, so the ruleset is a prepared artifact, not an applied protection. The previous remote run failed before any job steps started and had no downloadable logs; inspect the GitHub run's annotations/account runner settings before relying on CI.

## Safe upgrade and rollback

1. Build and scan release images; record immutable image digests, commit, schema version, and the exact environment configuration.
2. Stop writes, take a backup, copy it to protected off-host storage, and restore it into an isolated staging database.
3. Follow `DEPLOYMENT.md` for legacy baseline version 0 and preflight. Resolve inconsistent historical data explicitly. V4 adds account token/version/audit/rate-limit tables. V5 prevents case-only duplicate email identities; resolve any legacy conflicts before upgrading. Never automatically delete duplicates to make a migration pass.
4. Start the candidate on staging with separate secrets/SMTP settings. Verify login, daily play, reset/verification, revocation, readiness, and audit records. Record row counts and backup checksum.
5. Obtain release approval before applying migrations or switching production traffic.
6. If rollback is needed, stop writes first. Reuse only an explicitly reviewed image compatible with the current schema and authentication-version enforcement; do not roll back to a build that accepts revoked tokens. Prefer a forward fix. Database restore replaces data and requires separate approval plus a documented recovery point. Do not run destructive automatic down migrations.

## Backups

Start the optional operations profile with:

```
docker compose -f docker-compose.yml -f docker-compose.ops.yml --profile operations up -d backup prometheus
```

The backup service runs daily and writes custom-format dumps and SHA-256 sidecars with `umask 077`. Dumps are first written to a partial file, checked with `pg_restore --list`, then atomically renamed. Successful runs update `last-success`; its health check becomes unhealthy after 25 hours without a successful backup. Retention defaults to approximately 14 days and applies only to repository-named dump files. This is a local Docker volume, not disaster recovery: arrange encrypted off-host copies, access controls, and failure notifications before production activation.

Use `deploy/restore-check.sh backup.dump` with PostgreSQL client variables and a new `RESTORE_TEST_DATABASE=wordle_restore_<unique-name>`. It refuses ordinary database names and never drops an already existing database. It creates a disposable target, performs an error-checked restore, verifies application tables, then removes only the database it created. Validate checksums before off-host restores. Never point a rehearsal at production.

## Monitoring and logs

The application emits structured JSON to stdout without logging passwords, bearer tokens, or recovery-link tokens. Forward stdout to your selected log collector and configure retention/access there. Prometheus scrapes `/actuator/prometheus` on **internal port 9091**; Nginx does not forward management routes and Docker publishes no management port. Restrict this port at the host/network layer if running Java outside Compose. The monitoring UI is loopback-only at port 9090.

`deploy/monitoring/alerts.yml` defines backend-unavailable, HTTP 5xx-rate, and p95-latency alerts. Connect an Alertmanager receiver before treating them as notifications; a Prometheus rule without a receiver does not contact anyone. Monitor the backup health check separately. Production recovery time/point targets and capacity limits need measurements on your actual infrastructure.

## SMTP and account links

SMTP delivery is disabled by default until a provider is selected. Set `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`, `MAIL_FROM`, and `PUBLIC_URL` using secret configuration. Require TLS/authentication for a public SMTP provider. `PUBLIC_URL` must use HTTPS outside localhost; it is configuration, never taken from a request Host header. No provider-specific service is required.

For local testing, point SMTP to a local capture service, use `PUBLIC_URL=http://localhost:3000`, and disable SMTP authentication/STARTTLS only on that local server. The app never logs reset links as a mail fallback. If mail is disabled, email requests return a clear 503. Configure connection/read/write timeouts and delivery monitoring at the provider.

Verification links expire after 24 hours; password-reset links after 30 minutes. Tokens contain 256 random bits, are stored only as SHA-256 digests, are single-use, and are bound to a purpose. A newer request consumes older links. Fragments keep link secrets out of HTTP access logs and referrers, and the UI removes fragments from history after reading them. Opening a GET does not consume a token; a user must submit the form. Reset requests give the same HTTP response for known and unknown addresses. Delivery currently happens during the request; if timing-side-channel resistance or delivery retries are required, use a durable mail outbox before large-scale public operation.

Password change/reset and logout-all increment an account authentication version; old JWTs are rejected immediately. A normal local logout only removes the current browser token. Password changes sign the user out, requiring login with the new password. Set `REQUIRE_VERIFIED_EMAIL=true` only after delivery has been configured and tested; it is a useful barrier against casual multi-account ranking abuse, not proof of unique human identity.

Authentication limits are persisted in PostgreSQL: ten login attempts per account per 15-minute window, three reset requests per address per hour, twenty registrations per peer IP per hour, plus an overall peer-IP bound. Forwarded client headers are deliberately not trusted by the application. An ingress can group many users under one peer IP; tune edge/client-IP trust and limits for the actual network before a capacity rollout. Rate buckets and expired token rows are purged hourly after their retention window. The account limit also applies to nonexistent accounts.

## Deletion and audit retention

Self-service deletion requires the current password and explicit UI confirmation. Users, avatars, games, scores, and recovery tokens are deleted; audit actor/target references become null. Audit actions remain for 90 days without profile fields, passwords, token values, or raw IP addresses. Backups may retain deleted data until backup expiry; define and communicate your backup retention policy. Restoring an older backup also restores older session state, so rotate the JWT key and review deletion requests before reopening traffic after recovery.

## Tests and performance

Run `mvn verify` against a dedicated PostgreSQL test database, `npm test`, `npm run build`, and `npm run e2e -w @wordle/web` with a running backend. The browser suite defines desktop Chromium, mobile Chromium emulation, Firefox, and WebKit projects; it does not replace physical Safari/device or manual assistive-technology testing. CI serves the release build using production Nginx. Set `E2E_BASE_URL` and `E2E_PRODUCTION=true` when testing that server; without them, the suite starts Vite and skips production-only checks. Run `npm run test:coverage -w @wordle/web`, `npm run test:production -w @wordle/web`, and `python -m unittest discover -s tests/ops -v` for coverage reports, built-worker tests, and script failure injection. See `VALIDATION.md` for measured coverage and local browser limits. An SMTP capture server was used to validate real verification/reset delivery, token revocation, replacement-password login, and deletion.

`node tests/load/smoke.mjs` runs 30 public leaderboard requests at bounded concurrency against localhost, requiring zero failures and p95 below one second. An external staging target requires `ALLOW_STAGING_LOAD_TEST=true`; never use it on production without approval. The local Vite-backed baseline passed with zero failures and p95 830 ms while browser tests were running. This is a smoke result, not a production capacity promise.

## Daily Start, Resume, and saved results

The daily page checks `GET /api/v1/daily/games?lang=en` (or `tr`) before offering an action. This authenticated, non-cacheable lookup is read-only: it does not create puzzles, games, or scores, and never changes `started_at`. It uses the application time zone and the current user's language/date. It applies the same optional verified-email requirement as starting or reading a game.

The response has `state` and nullable `game` fields:

| State | Meaning | Page action |
| --- | --- | --- |
| `not_started` | No game or historical score exists for today | Start; explicit `POST /api/v1/daily/games?lang=...` |
| `playing` | An existing game is in progress | Resume; `GET /api/v1/daily/games/{id}` |
| `finished` | A saved game is won/lost | View result; `GET /api/v1/daily/games/{id}` |
| `already_played` | A historical score exists without a resumable game | Already-played notice; no new start |

`game` contains the existing game view only for `playing`/`finished`; an unfinished answer remains hidden. The legacy `/api/v1/daily/status` completed-score endpoint remains supported. Resume/result requests refresh the saved game by ID and never create a new puzzle-day game. A concurrent Start remains protected by the existing user/puzzle uniqueness and server transaction.

English and Turkish Start screens explain that elapsed time affects the score and continues after closing the page, disconnecting, or switching devices. Resume explains that elapsed time is not reset; completed results keep their recorded time and score. If the initial lookup fails, the page offers a read retry rather than guessing whether to start. Late lookup responses from a previous language are ignored. Browser keyboard shortcuts are only installed during active play so native Enter activation of the pre-game buttons works.

Deploy backend support for this new GET endpoint before the matching frontend assets. A frontend deployed ahead of its backend fails closed on lookup failure. Stale day/status snapshots can occur across midnight or another session; Start remains idempotent and Resume reads the displayed existing ID. The full midnight policy and expanded concurrency acceptance items remain separate TODOs. No schema migration is required for this change.

## Midnight and puzzle-day policy

Puzzle membership uses `app.timezone` (currently `Europe/Istanbul`). Start captures one server instant at service entry; both the puzzle date and `started_at` come from that instant. A database wait crossing midnight cannot move that accepted request to another day or reset its elapsed time. A new request after midnight belongs to the new day.

An existing game may still be completed after midnight with its owned game ID. There is no new completion deadline: this preserves the prior behavior. Elapsed time includes the entire interval since Start, including overnight/disconnected time; completed retries retain the same result. `scores.played_at` remains the original puzzle date and `won_at` records actual completion time. Daily/weekly/monthly period membership now consistently filters `played_at` with half-open date ranges, so finishing yesterday's game today does not put it into today's daily leaderboard. A late score can affect its original week's/month's results; aggregate SUM ranking is still a separate open TODO.

Status responses now include server `date` and `timeZone`. The updated frontend displays the date and sends it as `POST /api/v1/daily/games?lang=en&date=YYYY-MM-DD`. If that date differs from the server's captured Start day, the server returns HTTP 409 `{"error":"day_changed"}` before creating a puzzle/game. The page reloads status, explains the change, and requires a fresh explicit action; it never automatically starts the next day's game. Resume/result continue using GET by the existing ID. Invalid date syntax returns 400. For compatibility, older clients may omit `date`; those requests still select the current server day and do not have the stale-screen guard.

Deploy the backend before the new frontend. The frontend refuses to start if an older status response omits calendar metadata. Its local elapsed display uses a monotonic clock; device wall-clock changes cannot change the server's puzzle assignment or score. English/Turkish screens explain the original-date completion rule.

Limits: today's status lookup does not list unfinished older games. A known ID remains usable, but a history/resume selector for old games after a page has closed is still a UX follow-up. No historical score dates were rewritten or schema migration added. The query-performance task must measure the changed `played_at` filter and evaluate suitable indexes; production-sized EXPLAIN/capacity validation remains open.

## Application time and deterministic test fixtures

Java application time comes from the injected `Clock` bean; production `ClockConfig` supplies `Clock.systemUTC()`. Apply the configured application zone when deriving puzzle/dashboard calendar dates. Controllers/services should receive the clock through constructors instead of creating hidden clocks or calling parameterless `now()`. Registration/bootstrap explicitly assign `createdAt`; daily-game persistence explicitly assigns completion/puzzle dates. `User`/`Score` entities no longer silently manufacture timestamps using the machine clock or default zone. The unused legacy Score constructor that did so was removed; existing rows and schema were not changed.

Tests intentionally freeze time. Fixed dates are appropriate fixtures for midnight, expiry, weekday, leap-day, and DST boundaries; deriving them from the machine's current date would make the suite less deterministic. Shared Java fixtures are in `src/test/.../support/TestTimes`, anchored to a known Monday in a leap year. Calendar boundaries are derived with zone rules and `TemporalAdjusters`. Purpose-specific literals such as a known DST transition or a DTO example may remain local to the test that explains them.

The test-only `MutableClock` encapsulates its atomic reference and exposes `set(Instant)` / `advance(Duration)`. `withZone` returns a live view of the same time source; it must not return a frozen snapshot. Shared `TestClockConfiguration` is explicitly imported by integration tests, avoiding one test class depending on another class's nested fixtures. Integration tests reset the clock before each case. The shared database/time fixtures assume the current sequential integration-test execution; parallel execution would require resource locking or isolated databases/clocks. Production-JAR contents were checked to exclude these test fixtures/configuration classes.

## Period totals and language statistics rollout

Deploy backend before matching frontend. Weekly/monthly responses represent a player aggregate: userId, username, totalScore (64-bit), wins, lastWinAt and currentStreak; id/score compatibility aliases remain. Daily responses remain game scores. Membership is played_at, with Monday-based weeks and calendar months in app.timezone. Only won rows count; ties sort total descending, latest included win ascending, user ID ascending. Late finishes update the original puzzle period. Current usernames are displayed; historical score snapshots are retained.

Stats accepts lang (default en), returns overall counters plus selected-language current/best streak and per-language summaries/distributions. SQL summaries use repeatable-read transactions. A loss affects only that language. An unplayed today leaves yesterday's winning streak active until the next application-calendar day. Future-dated rows are ignored in stats. UI requests ignore stale language responses and report ranking eligibility errors rather than bypassing them.

Flyway V6 adds the partial language/played_at/user_id covering index. This is a regular transactional CREATE INDEX, not CONCURRENTLY: reserve a write window and rehearse lock/build duration on an authorized production-sized copy before release. Local synthetic plans and limitations are in docs/performance. Write overhead and production capacity are not measured. Existing indexes remain. Do not edit applied migrations; follow the existing backup/preflight/release runbooks. The earlier midnight section's aggregate-SUM TODO is superseded by this implementation.

## V7 daily-game structural validation

Existing V3+ databases must run deploy/preflight-daily-games.sql before upgrading. V7 validates normalized five-letter puzzle/guess format, at most six ordered guesses, status/turn-count consistency and null/non-null completion state. It aborts on malformed history without repairing or deleting rows. ALTER TABLE validation scans and locks tables; reserve and rehearse a write window. Original legacy preflight remains separate because V1 databases have no daily tables. See docs/DAILY_GAME_CONSISTENCY.md for exact guarantees and rollback limits.

Completion now uses an ordinary score INSERT. Existing-score collisions return 409 and roll back the game mutation; valid repeated final requests still read the committed result while holding the game row lock. No cross-table semantic trigger was introduced: restricted writer access and the service transaction remain necessary.
