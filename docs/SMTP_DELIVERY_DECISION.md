# SMTP submission, privacy and durable delivery decision

Decision, 2026-11-10: implement an opt-in **PostgreSQL outbox inside the existing
Spring Boot monolith**. The implementation, key custody/rotation, retry, lease,
rollback, retention and restore contract is in [MAIL_OUTBOX.md](MAIL_OUTBOX.md).
No new service, SMTP provider, language, production activation or migration to
microservices is included. Default synchronous behavior remains available.

## Why the default synchronous path needs an alternative

`AccountService.issue` normally locks the user, consumes older same-purpose links,
inserts a new hash, calls SMTP and then commits. Synchronous SMTP failure rolls
issuance back. Public reset catches MailException only after rollback and returns
the same neutral accepted body for known/unknown addresses; authenticated
verification returns retryable 503. Mail disabled returns 503 before lookup.
Unexpected database/programming failures still propagate.

Tests prove the residual boundaries: SMTP wait occupies a DB connection and user
lock (a second `FOR UPDATE NOWAIT` reports SQLSTATE 55P03). Real loopback SMTP
accepts DATA but loses its final acknowledgement, so a timeout can roll back an
already mailed capability. A commit-phase abort after successful SMTP likewise
leaves an unusable mailed link. SMTP and PostgreSQL do not share a transaction.
Five-second per-operation timeouts are not an overall end-to-end deadline.
Known/unknown reset timing differs when only known addresses wait for SMTP.
These tests remain as regressions documenting the default mode's limits.

## Implemented alternative and explicit behavior change

V9 plus transactional enqueue commit the hash, encrypted work and old-link
revocation together. SMTP occurs only after commit, outside database transactions
and locks. A committed enqueue now counts as issuance: a later mail outage does
**not** restore the older link. EN/TR forms disclose replacement and possible
delay. Only enqueue failure preserves old state. Both modes preserve original
identity/purpose, single use, expiry and password/session revocation rules.

AES-256-GCM uses independent versioned keys, nonce and authenticated job/token
metadata. Leases with SKIP LOCKED permit concurrent instances and bounded crash
recovery. Transient/uncertain submission retries reuse the capability and stable
Message-ID, never renew expiry; permanent/auth/TLS failures stop. Crypto failure
blocks safely for reviewed recovery; terminal/cancelled/expired payloads are
cleared. Token consumption triggers atomic cancellation and deletion cascades.
SMTP still permits duplicates after acceptance/crash/ack loss; there is no
exactly-once or inbox-delivery guarantee. Queue/DB timing is not constant-time.

PUBLIC_URL still requires absolute HTTPS or literal loopback HTTP with valid host/
port and no user info/query/fragment. Request Host/forwarding headers never choose
link origins. Sanitized purpose/outcome counters and safe admin inspection avoid
provider text, recipient, raw capability or key disclosure. Disabled-by-default
rollout keeps operational activation explicit.

## Acceptance evidence and open activation gates

VALIDATION.md records full backend/frontend regressions, migration rollback,
concurrent claims/stale leases, crash recovery, key failure/rotation, atomic token
cancellation, saturation, retention, real 450/550/timeout/ack ambiguity and SMTP
Message-ID checks. An EN/TR browser test starts with refused SMTP and confirms
persisted requests deliver after application restart against healthy loopback
capture. A real custom-format PostgreSQL restore proves encrypted capabilities
survive unchanged and restored token invalidation clears queued payloads.

The provider/domain are still unselected. Local capture never sends to a real
mailbox. Production-sized migration/queue throughput, ingress/timing policy,
secret custody/rotation, backup deletion journal, receiver alerts, real TLS/auth/
DNS/delivery/bounces and staged activation remain open in TODO.md. Do not equate
local acceptance with production readiness.

## Local browser reproduction

Default synchronous outage tests require an isolated mail-enabled backend pointed
at refused loopback port 2526, E2E_SMTP_FAILURE=true and test selection
`SMTP outage privacy and retry`. Healthy tests use `node tests/fixtures/smtp.mjs`
on loopback 2525/8025, PUBLIC_URL matching frontend, E2E_SMTP_CAPTURE_URL and
`verification and password reset use single-use email links`.

For `mail-outbox.spec.ts`, use one Chromium project, outbox enabled with a private
fixture ring, worker enabled, refused SMTP and empty healthy capture. Set
E2E_MAIL_OUTBOX_RECOVERY=true, E2E_SMTP_CAPTURE_URL and E2E_OUTBOX_READY_FILE to a
new marker path outside the repository. After the test creates that no-PII marker,
restart only the owned backend with the **same DB/keys**, SMTP changed to 2525.
The test waits up to 60s for delivery, then exercises both translated verification/
reset flows and single use/session revocation. Keep authentication limits enabled.
Do not expose a production test-control endpoint, reset user data or run the
synchronous outage expectations against the different enqueue semantics.
