# Security hardening and deployment

This branch keeps the Spring Boot/PostgreSQL/React application together. It does not introduce microservices.

## Rotate exposed credentials first

The previous Compose file committed database, pgAdmin, bootstrap-admin, and JWT credentials. Treat all deployed copies as exposed. Removing them from Git does not rotate them. Rotate the deployed database accounts and administrator password, replace the signing key (invalidating every old token), and remove any separately running pgAdmin instance. Review administrative access logs. Do not restore the old secrets from history.

This branch contains a tracked `.env` at the owner's explicit request, exclusively for private localhost tests. Before public deployment, replace shared fixtures through external secret configuration; never add production credentials to that tracked file. For example, generate a new signing key with `openssl rand -hex 32`. Bootstrap is optional; set all three ADMIN variables together. Existing accounts must already be ADMIN with the same email and password; bootstrap will never promote a registered user. Remove bootstrap variables after provisioning.

## Fresh local installation

1. Supply `POSTGRES_PASSWORD`, `SPRING_DATASOURCE_PASSWORD`, and `JWT_SECRET` in `.env`.
2. Set `CORS_ORIGINS=http://localhost:8080`.
3. Run `docker compose up --build -d`.
4. Open `http://localhost:8080`. This port binds to loopback only.

PostgreSQL creates a separate `wordle` login without superuser, role-creation, or database-creation privileges. The application owns its database so Flyway can apply schema migrations. For stricter production separation, run migrations with a dedicated schema owner and grant the runtime account only the needed data permissions.

The committed local fixture already provides the requested `admin` / `123456`
test login. In a checkout without `.env`, `node deploy/setup-local-env.mjs --insecure-local-admin`
creates an owner-only file with that login, random database/JWT
secrets, and `ALLOW_INSECURE_LOCAL_ADMIN=true`. Existing env files are never
overwritten. The normal generator still uses a strong random admin password.
The short-password option is disabled by default and bootstrap rejects it unless
PUBLIC_URL and every CORS origin are loopback HTTP URLs. It does not reset an
existing account, promote a regular user, or change existing database passwords.
Before staging/production, disable the option and explicitly rotate the provisioned
account password; changing `.env` alone does not reset a stored password.

## Production

Before public traffic, complete the source-address/limiter rehearsal in
`docs/ABUSE_PREVENTION.md`. Current Caddy→Nginx→backend peers share coarse IP
budgets; without a deployment-specific trusted-hop/real-IP configuration, many
players can throttle one another. Forwarding defaults to NONE and Nginx scrubs
untrusted metadata. Keep backend ports private and verify every hop rather than
enabling arbitrary forwarded-IP trust or disabling abuse controls.

Set `WORDLE_DOMAIN` to a public DNS name pointing at the host and `CORS_ORIGINS=https://that-name`. Run `docker compose --profile production up --build -d`. Caddy terminates TLS and redirects HTTP to HTTPS. Only the ingress publishes public ports; the frontend's development port remains loopback-only. Persist Caddy and PostgreSQL volumes. Firewall all other host ports. Nginx rate limits API traffic and authentication requests; account-aware distributed throttling is a further improvement for larger deployments. With an ingress proxy, tune client-IP trust and rate limits for your network before load testing.

Backend/frontend containers run as non-root with read-only root filesystems, temporary storage, memory limits, dropped capabilities, and health checks. `/actuator/health/readiness` on internal management port 9091 reveals no component details. No admin GUI is deployed. Do not activate the `dev` profile in production.

## Existing database upgrade — back up and rehearse first

The new default is Flyway migrations plus Hibernate validation. Automatic schema updates are disabled. An existing nonempty schema with no Flyway history deliberately fails startup until explicitly adopted.

1. Stop writes and take a database backup. Restore it into an isolated database and rehearse the upgrade there.
2. Run `deploy/preflight.sql`. Resolve duplicate `(user_id, played_at, language)` rows and orphaned scores according to your retention policy. Also resolve invalid roles, negative durations, out-of-range scores, or attempts. The migration deliberately fails rather than silently deleting or rewriting records.
3. Confirm the existing schema is compatible with V1 (including avatar `bytea`). Use an explicit **baseline version 0** for this legacy schema. For a one-time application run, set `SPRING_FLYWAY_BASELINE_ON_MIGRATE=true` and `SPRING_FLYWAY_BASELINE_VERSION=0`; remove both settings afterward. Do not baseline at version 1 or 2 without independently verifying the skipped migrations.
4. Supply the existing database connection explicitly. The new Compose named volume and application role are intended for fresh installations; the old bind-mounted volume is not automatically imported. Provision the application role and permissions deliberately on an existing database.
5. For an existing V3+ database, also run `deploy/preflight-daily-games.sql` before V7. Review malformed puzzle/guess values and status/count/completion inconsistencies explicitly. V7 scans existing rows and takes table locks: reserve and rehearse a write window. See `docs/DAILY_GAME_CONSISTENCY.md` for guarantees and remaining cross-table boundaries. Apply migrations and verify row counts, constraints, login, authorization, and game completion before reopening traffic. Deploy at a daily rollover if you need all players to begin under the same puzzle-selection rules.

V2 adds optimistic locking, daily uniqueness, value checks, and user foreign keys. Deleting a user deletes their scores and games. Historical usernames remain snapshots. Previously submitted scores are retained but **not retroactively verified**; decide separately whether to reset competitive rankings. Old and new clients cannot safely coexist for ranked play: `/api/v1/scores` and the old daily-answer API no longer support ranked play. Require clients to reload the new release.

V8 keeps persisted puzzle identities/answers immutable, preserves existing repeats,
and adds the answer-rotation index. Rehearse its ordinary index-build/table locks
on an authorized production copy and reserve a write window. Upgrade every puzzle
writer before reopening traffic; mixed old writers bypass the new selection lock.
Keep READ COMMITTED for creation, retain existing answers through dictionary
changes, and follow `docs/WORD_ROTATION.md` for exceptional repair/rollback limits.

## Game protocol

- `POST /api/v1/daily/games?lang=en` starts or resumes the authenticated user's server-persisted daily game.
- `GET /api/v1/daily/games/{id}` restores it; another user's game returns 404.
- `POST /api/v1/daily/games/{id}/guesses` takes `{ "guess": "APPLE", "attempt": 1 }`.
- A database row lock serializes turns. Retrying the same guess/turn is idempotent; a conflicting turn returns 409.
- The server validates dictionary membership and duplicate-letter feedback, permits six attempts, and commits the final score with the game in one transaction. The answer is returned only when the game ends.
- Duration is server wall-clock time from start to finish, including hidden tabs and time away. Puzzle date is assigned by the server in Europe/Istanbul and remains fixed across midnight.

Authenticated API responses use `no-store`; the service worker no longer caches APIs and the app deletes the old `api-cache`. Existing bearer tokens are accepted for at most 15 minutes; role and account existence are checked from the database on every request. Normal logout removes the local token. The account-security page also provides immediate logout-all and password-driven session revocation.

## Validation

Use Java 21 and Node 22.12+.

```
npm ci
npm test
npm run build
cd backend
TEST_DATABASE_URL=jdbc:postgresql://localhost:5432/wordle_test \
TEST_DATABASE_USERNAME=postgres TEST_DATABASE_PASSWORD=your-test-password mvn verify
```

Use a dedicated test database: integration tests truncate their test tables. CI provisions its own PostgreSQL service. Tests cover authorization, ownership, forged scores, turn retries and races, midnight rollover, losses, uniqueness, cascading deletion, optimistic locking, frontend retry behavior, and duplicate-letter feedback.

## Operations still requiring deployment-specific work

Configure centralized logs, alerts for authentication failures/5xx/latency, backup schedules, and retention. Test a `pg_dump`/`pg_restore` recovery in isolation and measure recovery time. Pin reviewed base-image digests in your release process and scan application dependencies and final images before publication. The branch does not rotate live credentials, rewrite Git history, run production migrations, deploy services, or establish a backup service.

## Further production-readiness work

See `OPERATIONS.md` for account-security configuration, backup/restore, monitoring, CI gates, and rollback. See `TODO.md` for the distinction between implemented work and deployment-specific activation. The legacy frontend has been removed. Offline support now uses an explicit static-asset allowlist; it does not use the former vulnerable PWA dependency chain or cache API responses. The latest complete npm audit reports zero known advisories.

## Owner-requested committed local fixture

This development branch includes root `.env` at the owner's explicit request for
immediate local testing (`admin` / `123456`). Treat every value in it as public
test data, including its database passwords and JWT key. Fresh checkouts can use
it directly with local Compose; the generator refuses to overwrite it. Do not
use these credentials for staging/production or replace them with live secrets
in this tracked file. Removing it later does not erase Git history; rotate all
provisioned credentials and the JWT key before public use. Existing persisted
accounts/database roles are not reset by editing the file.

## Windows: PostgreSQL init script cannot execute

A Windows checkout with CRLF shell-script lines can produce
`10-wordle.sh: cannot execute: required file not found` even though the file
exists. `.gitattributes` now forces LF for shell scripts and container SQL/build
files. The init script was changed so pulling this fix also rewrites that file.

For the specific failed first initialization shown by this error, PostgreSQL has
already created its data directory/database but has not created the application
role. Restarting alone skips init scripts. After pulling this branch, recover it
without deleting the data volume:

```sh
git pull
docker compose up -d postgres
docker compose exec postgres sh /docker-entrypoint-initdb.d/10-wordle.sh
docker compose up --build -d
```

The manual init step is for this interrupted first setup, where `wordle` does not
yet exist. Do not rerun it on an already provisioned database or reset a volume
containing application data. If the role already exists, investigate the current
startup error and stored role credentials instead of deleting data. This fix does
not reset existing database passwords. Fresh checkouts initialize normally.

## Daily-game deadline (owner policy update)

Deploy backend before the matching UI. Unfinished daily games expire at midnight
in app.timezone (Europe/Istanbul by default); an owned old unfinished ID returns
410 game_expired for GET and guesses. Server time is checked after acquiring the
game lock. A blocked Start that outlasts its day rolls back. The UI refreshes
status and requires an explicit new Start. Same-day Resume remains supported;
no previous-day Resume selector will be added. Completed history remains readable,
and expiration creates neither a score nor an automatic loss. No schema migration
or historical rewrite is needed; older unfinished rows become inaccessible under
this intentional rule change. Exact transaction timing is in OPERATIONS.md.

## Opt-in durable account mail (V9)

The default mail path is synchronous. `MAIL_OUTBOX_ENABLED=true` enables encrypted
transactional enqueue and the scheduled worker in this monolith, with independent
AES-256 keys and bounded retries. A committed request replaces the previous link
even if subsequent delivery fails. This mode is off by default; do not enable it
without key custody/rotation, actual provider/queue/capacity tests and receiver
alerts. `docs/MAIL_OUTBOX.md` covers all variables, migration/rollback, admin retry,
metrics and backup/restore. Restore with outbound mail and all workers disabled;
reconcile deletions and invalidate restored account tokens before any dispatch.
V9 is additive but creates constraints/indexes: measure its lock window on an
authorized production-sized copy. No production activation was performed here.
