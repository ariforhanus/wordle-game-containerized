# Durable encrypted account mail in the existing application

Implemented 2026-11-10. This is an opt-in PostgreSQL outbox and Spring scheduled
worker in the existing monolith. There is no new service or provider. Default
`MAIL_OUTBOX_ENABLED=false` preserves synchronous delivery. Local acceptance is
recorded in VALIDATION.md; actual provider, key custody, alarms, capacity and
production rollout remain release gates.

## Issuance and delivery contract

| Mode / event | Token and older-link behavior | Response |
| --- | --- | --- |
| Synchronous (default), SMTP fails | Issuance rolls back; older link remains valid | Reset is neutral 200; authenticated verification 503 |
| Outbox, enqueue commits | New hash, encrypted work and older same-purpose revocation commit together | Accepted; does not promise inbox delivery |
| Outbox, later SMTP fails or worker stops | Issued token and revocation stay committed; bounded delivery policy applies | Earlier acceptance stays valid |
| Outbox, enqueue/DB commit fails | Entire issuance rolls back; older token/job survives | Failure; saturation is 503 before lookup |
| Mail disabled | No issuance | 503 for known/unknown reset and verification |

The EN/TR forms explain that a new request replaces the previous link of that
purpose and delivery may be delayed. An accepted new request can invalidate a
working old link even when delivery later fails. Expiry starts at issuance:
reset 30 minutes, verification 24 hours. Retry never mints a capability or extends
expiry. Links remain purpose-bound, single-use and tied to the original user ID.
Password reset/change revokes sessions and outstanding links; logout-all revokes
sessions but preserves recovery links, matching the original policy.

A known reset address creates encrypted work; an unknown address creates a
five-minute no-op with no address, user, token or ciphertext. Both run the same
capacity guard before lookup; the public response contains no queue/account
status. This removes SMTP latency from account requests, **not** every possible
DB/crypto timing difference. Address/peer quotas remain required.

## Configuration and activation

| Variable | Default | Allowed policy |
| --- | --- | --- |
| MAIL_OUTBOX_ENABLED | false | Explicit opt-in, mail must also be enabled |
| MAIL_OUTBOX_WORKER_ENABLED | true | false pauses scheduled dispatch |
| MAIL_OUTBOX_ACTIVE_KEY_ID | empty | Required version present in ring |
| MAIL_OUTBOX_KEYS | empty | `version:standard-base64-32-bytes[,older:...]`, max 8 versions |
| MAIL_OUTBOX_MAX_PENDING | 10000 | 1–100000 active/no-op/blocked jobs |
| MAIL_OUTBOX_MAX_ATTEMPTS | 6 | 1–10, includes expired-lease recovery |
| MAIL_OUTBOX_LEASE_SECONDS | 120 | 30–600; measure against SMTP duration |
| MAIL_OUTBOX_BATCH_SIZE | 10 | 1–100, claimed and processed individually |
| MAIL_OUTBOX_POLL_MILLIS | 5000 | 1000–60000, delay after a worker tick |

Generate independent **local fixture** key material without printing it:

```sh
node deploy/setup-mail-outbox.mjs
```

This creates owner-only `.mail-outbox.env`, refuses overwrite and leaves the mode
disabled. Review/enable only after mail configuration is tested. For a fresh
isolated fixture, `--enable` explicitly opts in; `--key-id v2` chooses a version.
Never replace an existing ring just to rerun setup. Use both files when testing
Compose: `docker compose --env-file .env --env-file .mail-outbox.env config --quiet`.
Use the same env-file arguments for `up`; the private second file supplies only
outbox configuration. It is ignored by Git and Docker build context. The tracked
owner-requested root `.env` remains the shared local-only fixture, unchanged.
Production keys belong in independently controlled secret configuration/backups.
Do not reuse JWT keys, put key values on command lines, enable SMTP protocol debug,
print expanded Compose configuration, or expose management environment endpoints.

## Cryptography, schema and cancellation

V9 is additive: existing users, token hashes, games and answers are preserved.
AES-256-GCM uses a fresh 96-bit nonce and 128-bit tag. AAD binds key version, job
UUID, original user ID, purpose, token hash, exact microsecond expiry and stable
Message-ID. The bounded encrypted JSON contains recipient and raw capability;
the token table continues to store hashes only. Active known jobs require a
payload/nonce/key; terminal states require their removal. Composite foreign keys
bind job/user/purpose/expiry to the original token. Do not log/decode payloads in
job inspection, traces or support exports.

A PostgreSQL trigger cancels active jobs and wipes their ciphertext atomically
when the corresponding token becomes consumed, including direct revocation SQL.
New issuance, successful use and password changes therefore cancel stale work.
User/token deletion cascades jobs; re-registering an address cannot retarget one.
Before send the worker rechecks token, expiry, user/recipient and verification
status. A concurrent cancellation cannot unsend a message already in flight; its
revoked/deleted capability fails. Out-of-band SQL account changes require their
own token-revocation policy; do not treat this snapshot check as network atomicity.

## Dispatch, retry and failure recovery

Short READ COMMITTED transactions claim one due row with `FOR UPDATE SKIP LOCKED`
and a fresh UUID lease, then load a snapshot. SMTP runs with no transaction,
connection or user-row lock held. Finalization requires that exact current lease;
a stale worker cannot overwrite a newer outcome. An expired lease is reclaimable
up to the attempt limit. Process failure after SMTP acceptance can duplicate the
**same** capability and persisted Message-ID. SMTP is at-least-once/uncertain;
Message-ID is not a provider deduplication guarantee.

Numeric temporary 4xx, connection I/O and uncertain outcomes retry at roughly
30, 60, 120… seconds with up to 25% jitter, capped at 600 seconds. Permanent 5xx,
authentication, TLS and malformed-message failures stop immediately. TLS repair
requires operator action; certificate verification is not bypassed. Only bounded
failure codes are retained, never exception/provider text. Reaching the attempt
limit or expiry stops work and clears payloads. Leases are not heartbeats: an
SMTP operation exceeding the lease can overlap recovery and cause duplicates.
Per-operation 5s connect/read/write timeouts are not an overall send deadline;
measure provider latency before tuning lease/batch/scheduler capacity.

Wrong key material or payload authentication failure becomes BLOCKED, preserves
ciphertext until expiry/revocation and is not retried automatically. Missing live
key versions fail enabled startup. Old workers skip jobs using unsupported new
versions during a carefully ordered rotation. Unexpected infrastructure failures
leave durable leases for recovery and emit a fixed warning plus bounded counter.
Capacity uses a transaction advisory lock and counts all active jobs, including
expired rows awaiting cleanup: pausing workers intentionally permits backpressure
rather than unbounded growth. No-op jobs are deleted when processed. Successful,
failed, expired and cancelled jobs clear ciphertext immediately; metadata is
eligible for deletion after 24 hours. Hourly token/no-op cleanup also works while
dispatch is paused. Cleanup is best effort during downtime/locks/failure.

## Key rotation and reviewed retry

1. Back up the current ring securely. Add a fresh version/key to **every** node's
   decrypt ring, leaving the active writer version unchanged; restart/verify all
   workers. Never reuse a version with different material.
2. Only then change the active version on producers. Retain earlier versions
   while any unexpired live payload uses them. Old workers without a new version
   skip it, so monitor backlog during rollout; this is not a substitute for step 1.
3. Remove an old version only after live-payload inspection, outstanding backup
   recovery requirements and secret-retention policy permit. Expired work can be
   cancelled/cleared without decrypting it. The startup check verifies version
   coverage, not correctness of material; test controlled delivery after changes.
4. For BLOCKED work, restore the correct ring first. Authenticated administrators
   can inspect `GET /api/v1/admin/mail-outbox?page=0`, then explicitly call
   `POST /api/v1/admin/mail-outbox/{id}/retry`. Inspection exposes only safe job
   state/times/attempts/codes; no recipient/hash/key/ciphertext. Retry revalidates
   payload/token/account/TTL, retains attempt count and records MAIL_OUTBOX_RETRY
   in the same transaction. Short manual-retry transactions lock original user/audit actor in ID order before job rows, matching account-mutation lock order. It performs no SMTP itself. Expired, consumed,
   exhausted or terminal wiped jobs cannot be revived; request a new link instead.

## Migration, restore and rollback

Rehearse V8→V9 on an authorized copy, measure locks/index work and back up first.
Local tests preserve tokens/puzzle history and force failure after the first ALTER
TABLE to prove complete migration rollback. Production-sized timing is unmeasured.
Upgrade all nodes before enabling producers; avoid a live mixed issuance policy.
To stop dispatch, pause workers on **every** instance and wait for in-flight sends.
Turning off enqueue reverts future issuance to synchronous mode; it does not drain
existing work. Inventory/revoke/cancel that work deliberately before rollback.
Retain V9 schema, triggers and keys; no automatic down migration is supplied.

Encrypted outbox data in a backup is still sensitive, recoverable capability
material if its keys are available. Keep keys separately under the chosen custody
and retention policy. An isolated restore must start with public traffic and
outbound mail stopped (`MAIL_ENABLED=false`, `MAIL_OUTBOX_ENABLED=false`,
`MAIL_OUTBOX_WORKER_ENABLED=false`). Reconcile deletion requests from the external
journal, rotate JWT keys, then consume **all** restored unconsumed account tokens
before starting any worker. The V9 trigger cancels active work and clears its
ciphertext even without old decryption keys. Verify this before reopening traffic;
JWT rotation alone is insufficient. An in-flight/restored accepted email cannot
be recalled. Follow docs/DATA_RETENTION.md for identity reconciliation.

The opt-in `tests/ops/test_mail_outbox_restore.py` uses Docker/Node, an owned
`wordle_test` fixture with live queued jobs and a private generated test key file.
Set WORDLE_OUTBOX_RESTORE_CONTAINER and WORDLE_OUTBOX_TEST_KEY_FILE, then run
`python3 -m unittest discover -s tests/ops -p test_mail_outbox_restore.py -v`.
It verifies a real custom-format dump contains no plaintext capabilities,
restored AAD/ciphertext decrypts unchanged, and restored token invalidation wipes
queued payloads without changing the source. It drops only its random isolated
restore database. This is not the production privacy-journal/capacity rehearsal.

## Operational visibility and remaining gates

Internal Prometheus metrics have finite labels and no account/job identifiers:
`wordle_mail_outbox_outcomes_total{outcome=...}` for sent/retry/failed/blocked/
cancelled/expired/noop/infrastructure/capacity; gauges
`wordle_mail_outbox_active`, `wordle_mail_outbox_blocked`,
`wordle_mail_outbox_oldest_seconds`, `wordle_mail_outbox_refreshed_epoch_seconds`,
`wordle_mail_outbox_enabled`, `wordle_mail_outbox_worker_enabled`.
`wordle_mail_delivery_failures_total{purpose="reset"|"verification"}` also counts
worker submission failures. Gauges are per-instance DB snapshots at startup and
after successful dispatch, not scrape-time SQL; paused/failed workers can be stale.
Check freshness before trusting queue-age/count values; do not sum repeated queue
snapshots across replicas. Counters are process-local, not a durable ledger.

Before enabling public mail configure and test real receiver alerts for failure/
blocked/capacity/infrastructure increases, stale enabled workers and growing age
well below reset expiry. Check scheduling/pool/provider throughput and saturation
on staging, actual TLS/auth/DNS/SPF/DKIM/DMARC/bounces and secret rotation/restore.
No alarm receiver or provider has been activated by this change. Mail acceptance
is not proof of inbox delivery, unique humans, or complete timing resistance.
