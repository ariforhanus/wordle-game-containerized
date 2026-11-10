# Operations and account-security runbook

## Local Docker Compose quick start

With Node.js 22+ and Docker Compose installed, run from the repository root:

```sh
node deploy/setup-local-env.mjs
docker compose config --quiet
docker compose up --build -d
```

Open `http://localhost:8080`. The bootstrap administrator is `localadmin`; read `ADMIN_PASSWORD` from the generated local `.env`. The script generates independent random PostgreSQL administrator/application passwords, a JWT key, and an administrator password, with localhost URL/CORS settings. It writes `.env` with owner-only permissions on POSIX, does not print credentials, and refuses to overwrite an existing env file. Existing `.env` files should be reviewed/reused rather than regenerated to change passwords accidentally.

The owner explicitly requested a tracked, local-test-only `.env`; the current branch already includes one with `admin` / `123456` and the loopback-only short-password opt-in. Reuse that file for this private test setup; the generator refuses to overwrite it. The generator instructions above apply when no `.env` exists and default to a strong random password. `.env.example` remains a template. Never substitute production credentials in the tracked file; use deployment secret configuration and rotate all shared test credentials before public use. Compose supplies the variables; an IDE/direct Java launch needs its own environment configuration.

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
   V9 adds encrypted mail work and token-cancellation triggers without rewriting existing tokens/games. Rehearse its constraint/index locks on an authorized copy; upgrade every node before opt-in activation and retain V9 schema/keys on rollback. Keep all workers and outbound mail disabled on restore until token invalidation and deletion reconciliation finish (`docs/MAIL_OUTBOX.md`).
   V8 preserves shared daily puzzles against row updates/deletion and adds the rotation index. Reserve a measured migration/write window and upgrade all puzzle writers together; old instances do not honor the language advisory lock. New creation requires READ COMMITTED. See `docs/WORD_ROTATION.md` for the 30-day preference, small-pool fallback, immutable history and exceptional-repair limits.
4. Start the candidate on staging with separate secrets/SMTP settings. Verify login, daily play, reset/verification, revocation, readiness, and audit records. Record row counts and backup checksum.
5. Obtain release approval before applying migrations or switching production traffic.
6. If rollback is needed, stop writes first. Reuse only an explicitly reviewed image compatible with the current schema and authentication-version enforcement; do not roll back to a build that accepts revoked tokens. Prefer a forward fix. Database restore replaces data and requires separate approval plus a documented recovery point. Do not run destructive automatic down migrations.

## Backups

Start the optional operations profile with:

```
docker compose -f docker-compose.yml -f docker-compose.ops.yml --profile operations up -d backup prometheus
```

The backup service runs daily and writes custom-format dumps and SHA-256 sidecars with `umask 077`. Dumps are first written to a partial file, checked with `pg_restore --list`, then atomically renamed. Successful runs update `last-success`; its health check becomes unhealthy after 25 hours without a successful backup. Retention defaults to `BACKUP_RETENTION_DAYS=14`, but `find -mtime +14` makes files eligible at 15 whole days and the next successful daily run removes them. Failure/downtime delays cleanup; this is not a strict 14-day deletion guarantee. Only matching top-level backup files are affected. This is a local Docker volume, not disaster recovery: arrange encrypted off-host copies, access controls, lifecycle rules and failure notifications before production activation. See `docs/DATA_RETENTION.md` for exact behavior and restore privacy requirements.

Use `deploy/restore-check.sh backup.dump` with PostgreSQL client variables and a new `RESTORE_TEST_DATABASE=wordle_restore_<unique-name>`. It refuses ordinary database names and never drops an already existing database. It creates a disposable target, performs an error-checked restore, verifies application tables, then removes only the database it created. Validate checksums before off-host restores. Never point a rehearsal at production.

## Monitoring and logs

The application emits structured JSON to stdout without logging passwords, bearer tokens, or recovery-link tokens. Forward stdout to your selected log collector and configure retention/access there. Prometheus scrapes `/actuator/prometheus` on **internal port 9091**; Nginx does not forward management routes and Docker publishes no management port. Restrict this port at the host/network layer if running Java outside Compose. The monitoring UI is loopback-only at port 9090.

`deploy/monitoring/alerts.yml` defines backend-unavailable, HTTP 5xx-rate, and p95-latency alerts. Connect an Alertmanager receiver before treating them as notifications; a Prometheus rule without a receiver does not contact anyone. Monitor the backup health check separately. Production recovery time/point targets and capacity limits need measurements on your actual infrastructure.

## SMTP and account links

SMTP delivery is disabled by default until a provider is selected. Set `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`, `MAIL_FROM`, and `PUBLIC_URL` using secret configuration. Require TLS/authentication for a public SMTP provider. `PUBLIC_URL` must use HTTPS outside localhost; it is configuration, never taken from a request Host header. No provider-specific service is required.

For local testing, point SMTP to a local capture service, use `PUBLIC_URL=http://localhost:3000`, and disable SMTP authentication/STARTTLS only on that local server. The app never logs reset links as a mail fallback. If mail is disabled, email requests return a clear 503. Configure connection/read/write timeouts and delivery monitoring at the provider.

Verification links expire after 24 hours; password-reset links after 30 minutes. Tokens contain 256 random bits, are stored as SHA-256 digests in account_tokens (opt-in delivery work separately encrypts the raw capability), are single-use, and are bound to a purpose. A successfully committed newer issuance consumes older links. Fragments keep link secrets out of HTTP access logs and referrers, and the UI removes fragments from history after reading them. Opening a GET does not consume a token; a user must submit the form. Public reset returns the same accepted response for known/unknown addresses even on an SMTP MailException, after service rollback preserves the old link. Disabled mail remains 503 for both; authenticated verification transport failure is retryable 503. Receipt of a request is not a delivery confirmation.

Submission failures increment internal `wordle_mail_delivery_failures_total` with
only reset/verification purpose labels and fixed warning events without provider
details or recipients. Add a counter-increase alert/receiver: HTTP 5xx alarms
alone no longer expose these neutral public failures. PUBLIC_URL validation now
rejects missing hosts, opaque/relative URLs, user info, query/fragment and bad ports;
HTTP is accepted only for literal loopback test roots. Sender existence at startup
does not prove actual delivery/TLS/authentication.

Default synchronous mail retains request-held locks and SMTP/commit ambiguity.
Opt-in durable delivery is now implemented in the same application/database:
`MAIL_OUTBOX_ENABLED=true` commits encrypted jobs atomically and sends outside
transactions, with leases, bounded retries and expiry/cancellation. This changes
issuance semantics: once enqueue commits, older same-purpose links are invalid,
even if later delivery fails. Default remains off. Follow
`docs/MAIL_OUTBOX.md` for private key setup, rotation, reviewed admin retry,
metrics, worker pause/rollback and restore safety; compare modes in
`docs/SMTP_DELIVERY_DECISION.md`. Actual provider/alarms/key custody and staged
activation remain uncompleted release gates.

Password change/reset and logout-all increment an account authentication version; old JWTs are rejected immediately. A normal local logout only removes the current browser token. Password changes sign the user out, requiring login with the new password. Set `REQUIRE_VERIFIED_EMAIL=true` only after delivery has been configured and tested; it is a useful barrier against casual multi-account ranking abuse, not proof of unique human identity.

Authentication limits are persisted in PostgreSQL: ten login attempts per account per 15-minute window, three reset requests per address per hour, twenty registrations per peer IP per hour, plus an overall peer-IP bound. Forwarded client headers are deliberately not trusted by the application. An ingress can group many users under one peer IP; tune edge/client-IP trust and limits for the actual network before a capacity rollout. Rate buckets and expired token rows are purged hourly after their retention window. The account limit also applies to nonexistent accounts.

Limits are fixed epoch windows and count consumed admission budget, not every
denied request. Full buckets stop incrementing; a blocked peer is rejected before
body parsing/new identity buckets. Application 429s use no-store and Retry-After
to the rejecting window's end. An independent later scope can still reject.
Login/register display EN/TR throttle guidance for JSON or HTML 429 responses.

Default forwarding strategy is explicitly NONE; production Nginx replaces peer
headers and clears untrusted forwarding metadata. In current Caddy→Nginx→backend
Compose, edge clients share Caddy's address and application clients share Nginx's
address. Validate/tune trusted hops, real-IP handling and both limiter layers on
the actual ingress before public traffic. No broad trusted-CIDR list was added.
See `docs/ABUSE_PREVENTION.md` for tested controls, policy proposals, remaining
multi-account/automation risks and the required staging matrix.

## Deletion and audit retention

Self-service deletion requires the current password and explicit UI confirmation. EN/TR notices explain active deletion, retained security events and backup limits before consent. Users, avatars, games, scores, and recovery tokens are deleted atomically; audit actor/target references become null and shared puzzles remain. Audit rows older than 90 × 24 hours, rate windows older than 24 hours, tokens expired for over 24 hours, terminal outbox metadata older than 24 hours and expired no-op work older than 24 hours become eligible for hourly best-effort cleanup using the injected Clock. All cleanup categories share one transaction; outages/failures can delay removal. NULL audit references and hashed rate keys are not a complete-anonymity promise.

Before restoring public traffic, reconcile later deletions using a protected journal stored independently of the restored database, verify identities/children/unaffected users, rotate JWT signing keys and invalidate restored email tokens. Stop every outbox worker first; V9 token revocation cancels active jobs and wipes ciphertext before mail/traffic resumes. JWT rotation alone does not revoke recovery links. The application does not yet export an external deletion journal automatically; establish/test the process and publish actual backup/provider retention before production. The detailed runbook and remaining operational gates are in `docs/DATA_RETENTION.md`. A successful `restore-check.sh` verifies restorability, not this privacy reconciliation.

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

Puzzle membership uses `app.timezone` (currently `Europe/Istanbul`). Start captures one server instant at service entry; both the puzzle date and `started_at` come from that instant. A database wait cannot reassign that captured day. If Start waits beyond its day, the unfinished game is rejected with 410 and the transaction rolls back; a new request requires an explicit Start for the new day.

Unfinished games expire at the next application-calendar day boundary. GET by an owned expired game ID and every guess/replay against that unfinished game return HTTP 410 game_expired. A guess checks server time after acquiring the PostgreSQL game row lock; waiting across midnight cannot extend eligibility. The accepted instant is also used as the completion timestamp. A guess accepted before the boundary can complete its original-day transaction; a request whose lock is acquired at or after midnight cannot play that game. Start checks again after database waits and rolls back if already expired. Finished results remain readable and exact completed replays return the stored result. Expiration is derived from puzzle date/status; rows are retained, no score or synthetic loss is created, and previous completed history is not rewritten. There is no old-game Resume selector. Today's game always requires explicit Start.

Status responses now include server `date` and `timeZone`. The updated frontend displays the date and sends it as `POST /api/v1/daily/games?lang=en&date=YYYY-MM-DD`. If that date differs from the server's captured Start day, the server returns HTTP 409 `{"error":"day_changed"}` before creating a puzzle/game. The page reloads status, explains the change, and requires a fresh explicit action; it never automatically starts the next day's game. Resume/result continue using GET by the existing ID. Invalid date syntax returns 400. For compatibility, older clients may omit `date`; those requests still select the current server day and do not have the stale-screen guard.

Deploy the backend before the new frontend. The frontend refuses to start if an older status response omits calendar metadata. Its local elapsed display uses a monotonic clock; device wall-clock changes cannot change the server's puzzle assignment or score. English/Turkish screens explain the daily deadline. On 410 the frontend discards the expired board, refreshes status, and requires another explicit Start; it never automatically creates a new game.

Today's status lookup lists only today's game. Older unfinished IDs are expired even if known; old-game Resume is explicitly excluded by the user. No historical score dates were rewritten or schema migration added. The query-performance task must measure the changed `played_at` filter and evaluate suitable indexes; production-sized EXPLAIN/capacity validation remains open.

## Application time and deterministic test fixtures

Java application time comes from the injected `Clock` bean; production `ClockConfig` supplies `Clock.systemUTC()`. Apply the configured application zone when deriving puzzle/dashboard calendar dates. Controllers/services should receive the clock through constructors instead of creating hidden clocks or calling parameterless `now()`. Registration/bootstrap explicitly assign `createdAt`; daily-game persistence explicitly assigns completion/puzzle dates. `User`/`Score` entities no longer silently manufacture timestamps using the machine clock or default zone. The unused legacy Score constructor that did so was removed; existing rows and schema were not changed.

Tests intentionally freeze time. Fixed dates are appropriate fixtures for midnight, expiry, weekday, leap-day, and DST boundaries; deriving them from the machine's current date would make the suite less deterministic. Shared Java fixtures are in `src/test/.../support/TestTimes`, anchored to a known Monday in a leap year. Calendar boundaries are derived with zone rules and `TemporalAdjusters`. Purpose-specific literals such as a known DST transition or a DTO example may remain local to the test that explains them.

The test-only `MutableClock` encapsulates its atomic reference and exposes `set(Instant)` / `advance(Duration)`. `withZone` returns a live view of the same time source; it must not return a frozen snapshot. Shared `TestClockConfiguration` is explicitly imported by integration tests, avoiding one test class depending on another class's nested fixtures. Integration tests reset the clock before each case. The shared database/time fixtures assume the current sequential integration-test execution; parallel execution would require resource locking or isolated databases/clocks. Production-JAR contents were checked to exclude these test fixtures/configuration classes.

## Period totals and language statistics rollout

Deploy backend before matching frontend. Weekly/monthly responses represent a player aggregate: userId, username, totalScore (64-bit), wins, lastWinAt and currentStreak; id/score compatibility aliases remain. Daily responses remain game scores. Membership is played_at, with Monday-based weeks and calendar months in app.timezone. Only won rows count; ties sort total descending, latest included win ascending, user ID ascending. Previously recorded late finishes retain their original puzzle period; new unfinished games cannot be played past their day boundary. Current usernames are displayed; historical score snapshots are retained.

Stats accepts lang (default en), returns overall counters plus selected-language current/best streak and per-language summaries/distributions. SQL summaries use repeatable-read transactions. A loss affects only that language. An unplayed today leaves yesterday's winning streak active until the next application-calendar day. Future-dated rows are ignored in stats. UI requests ignore stale language responses and report ranking eligibility errors rather than bypassing them.

Flyway V6 adds the partial language/played_at/user_id covering index. This is a regular transactional CREATE INDEX, not CONCURRENTLY: reserve a write window and rehearse lock/build duration on an authorized production-sized copy before release. Local synthetic plans and limitations are in docs/performance. Write overhead and production capacity are not measured. Existing indexes remain. Do not edit applied migrations; follow the existing backup/preflight/release runbooks. The earlier midnight section's aggregate-SUM TODO is superseded by this implementation.

## V7 daily-game structural validation

Existing V3+ databases must run deploy/preflight-daily-games.sql before upgrading. V7 validates normalized five-letter puzzle/guess format, at most six ordered guesses, status/turn-count consistency and null/non-null completion state. It aborts on malformed history without repairing or deleting rows. ALTER TABLE validation scans and locks tables; reserve and rehearse a write window. Original legacy preflight remains separate because V1 databases have no daily tables. See docs/DAILY_GAME_CONSISTENCY.md for exact guarantees and rollback limits.

Completion now uses an ordinary score INSERT. Existing-score collisions return 409 and roll back the game mutation; valid repeated final requests still read the committed result while holding the game row lock. No cross-table semantic trigger was introduced: restricted writer access and the service transaction remain necessary.

## Daily result countdown

Status GET now also returns serverNow and nextGameAt as UTC instants. The server captures one instant for calendar membership; nextGameAt is the next local date's start in app.timezone, not a fixed 24-hour offset. Known 23/25-hour New York DST days and Istanbul midnight boundaries are covered by integration tests. The read never starts a game or creates a puzzle.

The terminal-result screen fetches this metadata independently from saved result/stats. It estimates remaining time from server instants, half of observed request duration and performance.now, not device Date.now. This is an approximate display; it never determines scoring or Start eligibility. It resynchronizes on visible/focus and explicit error retry, ignores stale responses and clears intervals on teardown. There is no per-second server polling. A missing/invalid calendar shows a retry message while retaining the saved result; deploy backend before frontend. API metadata is optional in TypeScript only for compatibility with older deployments.

At zero (or if the server day is already later than the result), the UI offers Check today's game. Only that click refreshes the main status screen; a new game still requires its own explicit Start, with existing server date/expiry guards. No automatic Start, previous-day Resume, score changes or schema migration was added. Timer announcements are aria-live=off so screen readers are not notified every second; manual assistive-technology validation remains open.

## Daily network recovery and draft lifecycle

Daily play stores at most one draft per language in sessionStorage: game ID, date, language, expected turn, up to five normalized input letters and whether that exact submission is unconfirmed. It does not persist answers, JWTs, scores, elapsed time or whole API responses in this store. Storage is best effort; disabled/quota-restricted storage falls back to current-page memory, and closing the browser session can discard drafts. This is not a cross-device draft sync feature.

Drafts are restored only after an authenticated server Start/Resume/load provides the matching game ID/date/language. Malformed, oversized, future-turn and unrelated records are discarded; terminal games and 410 expiry clear them. A pending turn already present with the exact same word is cleared instead of copied into the next row. If another session accepted a different word, input is preserved as an unsubmitted draft, with a board-review notice; no word is automatically sent for the next turn. Server feedback/turn count remains authoritative.

Before a POST, the exact pending draft is stored synchronously. While the result is unknown, editing cannot change its word; explicit retry uses that same word/turn. Read-only reconnection cannot conclusively reject a still-running POST, so an unchanged server board leaves the pending payload intact for explicit retry. Definite invalid-word responses unlock editing. The existing server row lock/idempotency/transaction guarantees still determine completion and scoring.

Offline events retain typing and keep the elapsed timer running; known-offline submissions do not send requests. Online events read the existing game (or refresh initial status) without automatically starting a game or posting a guess. Check saved game offers the same explicit read after failures. In-flight guards prevent overlapping recovery/submissions, and stale language/game/unmounted replies cannot alter another view's stored draft. Expired reads return to today's status with a separate Start required. If a read is still in flight during a connection event, the explicit check/retry remains available when it finishes; there is no background write queue.

Only daily status/Start/load/guess requests opt into a 15-second deadline. HTTP helpers accept an optional deadline but unrelated API calls retain prior behavior. Aborting a fetch is not evidence of server rollback: the exact pending payload remains for reconciliation. Deadline timers are cleared on completion/failure. Timeout/reconnect never automatically retries a POST. Release-worker caching rules remain unchanged; no API response enters the service-worker cache.
