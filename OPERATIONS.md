# Operations and account-security runbook

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

Run `mvn verify` against a dedicated PostgreSQL test database, `npm test`, `npm run build`, and `npm run e2e -w @wordle/web` with a running backend. The browser suite uses desktop Chromium and a mobile viewport; it does not replace Safari/Firefox/manual assistive-technology testing. An SMTP capture server was used to validate real verification/reset delivery, token revocation, replacement-password login, and deletion.

`node tests/load/smoke.mjs` runs 30 public leaderboard requests at bounded concurrency against localhost, requiring zero failures and p95 below one second. An external staging target requires `ALLOW_STAGING_LOAD_TEST=true`; never use it on production without approval. The local Vite-backed baseline passed with zero failures and p95 830 ms while browser tests were running. This is a smoke result, not a production capacity promise.
