# SMTP submission, privacy and durable delivery decision

Decision, 2026-11-10: prepare a **PostgreSQL outbox in the existing monolith** as
the next implementation step. This checkpoint hardens the synchronous path and
tests its limits; it does not add a queue, automatic retry, SMTP provider or new
service. Real provider/staging checks remain release gates.

## Current transaction and observable results

`AccountService.issue` locks the user row, consumes older same-purpose tokens,
inserts the new token hash and calls SMTP before transaction commit. A reset link
expires after 30 minutes, verification after 24 hours; both are 256-bit,
purpose-bound, single-use capabilities. The raw token exists in memory/email,
not in the active token table. Account deletion cascades tokens; password reset/
change revokes sessions and outstanding links.

| Event | Current durable result | HTTP behavior |
| --- | --- | --- |
| SMTP succeeds and DB commits | New token and older-link revocation commit together | Accepted |
| SMTP submission fails | Transaction rolls back; older working link remains | Public reset: neutral accepted response; authenticated verification: 503 |
| Mail disabled | No token issuance | Both known/unknown public reset and verification report 503 |
| SMTP accepts DATA but final acknowledgement is lost | Client can see a timeout even though the server has the email; DB rolls back | Same submission-failure handling; the newly mailed link can be unusable |
| SMTP returns success, then commit phase aborts | SMTP cannot be undone; DB retains the old token instead of the new one | Unexpected commit failure still propagates |

The public reset controller catches **MailException only after the service
transaction has rolled back**, then returns the same accepted body as for an
unknown address. This closes the SMTP-outage status-code disclosure while
preserving the old link. Disabled configuration still fails consistently before
address lookup. Unexpected database/programming failures are not silently treated
as successful delivery.

This does not make reset constant-time: an unknown address avoids SMTP, while a
known address can wait for it. Nor does it hide every possible database failure.
The EN/TR message confirms receipt of the request, not account existence, inbox
delivery or a queued retry. A user can explicitly request again under the
existing quotas; there is no automatic retry in this mode.

## Latency, locks and ambiguous outcomes

SMTP connection/read/write timeouts are each 5,000 ms in application.properties.
They are per operation, not an absolute end-to-end deadline. Multiple commands,
TLS/authentication and slow progress can exceed one timeout budget. Nginx's
15-second read timeout does not cancel Java execution or undo a database commit.
A lost HTTP response can lead to a second request and a different new token.

The user row and a database connection remain occupied while SMTP waits. Tests
prove a separate `FOR UPDATE NOWAIT` gets PostgreSQL SQLSTATE 55P03, while the
new token is still invisible to another transaction. Delete/password/reset work
on the same user can therefore wait behind mail. More concurrent accounts can
also consume the connection pool. The task must not be "fixed" with Thread.sleep,
unbounded executors, a fire-and-forget @Async call or blindly retrying inside the
same transaction.

A real loopback SMTP test accepts DATA and withholds its final 250 response:
the caller times out after acceptance. Another returns temporary 450 at RCPT:
no DATA is sent and there is no automatic retry. These distinguish definitely
rejected submission from uncertain acceptance; they are not real-provider or
inbox-delivery tests. A commit-phase failure injection separately demonstrates
that accepted SMTP cannot participate in PostgreSQL rollback.

## Configuration and operational visibility

When mail is enabled, PUBLIC_URL must be absolute HTTPS, or HTTP for the literal
localhost/127.0.0.1/[::1] test roots, with a host and valid nonzero port. Opaque,
relative, user-info, query and fragment forms fail startup without echoing their
possibly sensitive values. A trailing slash/base path remains supported. Request
Host/forwarding headers never choose the mail-link origin. Sender availability
is checked at startup; this does not prove credentials, TLS or deliverability.

SMTP submission failures handled by AccountController increment internal
`wordle_mail_delivery_failures_total{purpose="reset"|"verification"}` counters.
Only the two bounded purposes are labels. Fixed warning events contain no email,
raw token, recipient, credential or provider exception text. Counters describe
submission errors, not bounces or proof of inbox delivery. Metrics are on the
existing internal management endpoint; they are not part of the public reset
response. A caught public reset SMTP failure is now HTTP 200, so generic 5xx
alarms alone cannot detect it: configure a dedicated counter-increase alert and
real receiver before enabling public mail. No notification receiver or new alert
rule was activated in this checkpoint.

## Next implementation: one transactional outbox, same application/database

The concrete next step is a versioned migration, transactional enqueue and a
scheduled worker in Spring Boot, with local SMTP/fault/concurrency tests. Keep an
explicit disabled-by-default rollout mode until the complete implementation is
validated; do not ship a table without a working, observable delivery lifecycle.

1. **Atomic enqueue.** Create token state and the outbox work item in the same
   transaction as the accepted request. Known/unknown public reset requests keep
   a neutral API response and a bounded, similar database path without SMTP.
   Unknown targets can produce short-lived no-op work without retaining a raw
   unknown email. Keep account/peer quotas; never publish queue status by email.
2. **Choose/document token semantics.** In outbox mode, a committed enqueue is
   a successful issuance request: old-link revocation and the new hash commit
   with the work item. A later SMTP outage no longer rolls back issuance; only
   enqueue failure does. This is an explicit change from the synchronous
   rollback-on-SMTP-failure behavior, so retain the old mode until migration/UI/
   tests cover it. Preserve one current link per purpose, single use, password
   session revocation and expiry; do not casually allow multiple active tokens
   just to disguise the external-transaction gap.
3. **Protect the delivery capability.** SMTP needs the raw link later, so a hash
   alone is insufficient. Persist an authenticated encrypted payload, with a
   separate required key/version and nonce; bind work ID/user/purpose/expiry as
   authenticated metadata. Do not reuse JWT signing keys or put plaintext tokens
   in SQL, logs, metrics, exception payloads or job inspection. Generate local
   fixtures through setup tooling; production keys stay in secret configuration.
   Define rotation/decryption and backup/restore behavior before activation.
4. **Short claims, then network outside transactions.** Claim due work using
   bounded leases and `FOR UPDATE SKIP LOCKED`; commit the claim before SMTP.
   Do not hold a user/database row lock or connection during delivery. Finalize
   only the matching lease/generation so stale workers cannot overwrite newer
   state. Recover expired leases after process failure without losing work.
5. **At-least-once delivery.** Retry only selected transient/connection/uncertain
   failures with bounded exponential backoff/jitter and an attempt/age limit.
   Classify permanent recipient/auth/configuration failures separately. Retries
   reuse the same capability/payload and stable message ID; they do not extend
   token expiry. SMTP cannot provide exactly-once delivery: crash/ack loss can
   produce duplicate emails. Do not equate a Message-ID with provider deduplication.
6. **Cancel/recheck lifecycle.** Tie jobs to the original user identity and token
   generation, with FK cleanup on deletion. Before dispatch, recheck that the
   token/account/recipient/version is still eligible and unexpired. New issuance,
   consumed links, password changes and account deletion cancel stale jobs.
   An already in-flight accepted email cannot be unsent, but its deleted/revoked
   capability must fail. Do not retarget an old request to a newly registered
   account that reused an email/username.
7. **Bound and observe.** Keep the 30-minute/24-hour expiry budget from issuance,
   discard expired work, bound payload/batch/attempt sizes and clear completed
   encrypted payloads promptly. Add queue age/attempt/outcome metrics with finite
   labels, terminal-failure alerting and a reviewed manual retry path. Provider
   error bodies can contain addresses/tokens; retain only sanitized codes.

Outbox mode addresses durable handoff and removes SMTP from request-held locks.
It still needs a reviewed token lifecycle and cannot atomically combine SMTP
acceptance with a database commit. Do not claim stronger guarantees.

## Acceptance matrix for the follow-up

- Migration/preflight/rollback on an authorized copy; no plaintext capability in
  the database, dumps, logs, traces or metrics. Missing/wrong/rotated keys fail
  safely; old pending work remains decryptable under the documented key policy.
- Two workers cannot hold the same current lease; restart before/after send and
  before/after finalization recovers work. Uncertain outcomes may duplicate the
  same email but cannot mint a new token/expiry or resurrect a consumed one.
- Temporary 4xx, permanent 5xx, TLS/auth failure, refused connection, stalled
  greeting/DATA/final ACK, queue saturation and expiration follow bounded policy.
- Delete/re-register, new issuance, verification, password reset/change and
  logout/session rules interact correctly with pending/in-flight work. Old mode
  and new enqueue semantics have explicit regression tests.
- Real EN/TR frontend and browser flows use actual local SMTP capture, including
  outage/recovery. Provider staging then measures delivery, DNS/SPF/DKIM/DMARC,
  TLS/auth, bounce handling, rate limits, queue/backlog and notification receivers.

The provider/domain are still unselected. Local fixtures never send to a real
mailbox. Real provider acceptance, public timing resistance, queue implementation,
key operations, staging capacity and restore/privacy reconciliation remain open.

## Local browser reproduction

Use the isolated test database and release assets, with real authentication
limits enabled. For outage cases, enable mail but point SMTP at an unused
loopback port (this run: 127.0.0.1:2526); set `E2E_SMTP_FAILURE=true` and select
`SMTP outage privacy and retry`. The tests are explicitly skipped unless this
fixture flag is set. They are not intended for a live deployment.

For healthy delivery, start `node tests/fixtures/smtp.mjs`, restart the isolated
backend with SMTP on 127.0.0.1:2525 and set
`E2E_SMTP_CAPTURE_URL=http://localhost:8025`. Select
`verification and password reset use single-use email links`. PUBLIC_URL must
match the frontend origin, e.g. http://localhost:3001 for this local fixture.
Disable SMTP auth/STARTTLS only for that loopback capture. Stop only the owned
app/capture/preview processes afterward; never reset a user's database for these
tests. Browser paths/runtime details are in CODEX_HANDOFF.md.
