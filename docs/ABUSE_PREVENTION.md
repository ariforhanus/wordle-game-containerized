# Ranked-play abuse controls and proxy trust decision

Evaluated 2026-11-10 for the existing monolith. This records implemented behavior,
recommended competition policy and unresolved deployment work. It is not a claim
that the app can identify one person across accounts or prevent automated solving.

## Competition boundary

The server enforces one daily result per **account, language and puzzle day**,
explicit Start, persisted elapsed time, six dictionary-validated turns, ownership,
idempotent retries and atomic scoring. Previous-day unfinished games cannot be
resumed. Clients cannot submit their own score or move the server calendar.

For a public competitive launch, the recommended published policy is one person
using one competitive account, no automated solving/account farming and a defined
review/appeal process. These person-level rules are a policy proposal, not an
enforced identity guarantee or a new automatic ban. Current account registration
can create distinct accounts/emails; possession of an email does not prove a
unique person. Aliases, disposable addresses, multiple IPs and VPNs remain viable.

Enable the existing `REQUIRE_VERIFIED_EMAIL` gate only after real SMTP delivery
has been configured and tested. Local fixtures deliberately leave it off. Keep
case-insensitive email uniqueness and password/session/token security. Account
deletion must remain available; retained peer/identity buckets must not disappear
with a user simply to reset an abuse budget.

Administrators can read daily answers. Treat admin access as privileged and
avoid using privileged accounts for competitive participation; there is currently
no automatic administrator-score exclusion. Do not present server-authoritative
scoring as proof that a player did not know the answer or use outside assistance.

## Current admission limits

| Scope | Budget | Window |
| --- | ---: | --- |
| All protected authentication/account POSTs, per socket peer | 120 | 60 seconds |
| Registration, per socket peer | 20 | 1 hour |
| Login, per normalized username | 10 | 15 minutes |
| Reset request, per normalized email | 3 | 1 hour |
| Verification resend, per socket peer | 20 | 1 hour |

These are fixed UTC-epoch windows, not sliding windows. A boundary can allow a
fresh full budget immediately after the previous one. Username/email budget keys
are trimmed/lowercased, including nonexistent identities. Login itself remains
case-sensitive; distinct case-only usernames conservatively share a budget.
Successful login does not reset the budget. Invalid/malformed requests can consume
the peer budget; the avatar POST keeps its existing exclusion from this filter.
Edge Nginx API/authentication limits remain an additional, separate layer.

Buckets are shared in PostgreSQL across application instances. A conditional
UPSERT atomically admits up to the existing budget and stops increasing the
stored counter once full. Old already-saturated rows remain blocked until their
window ends. Counter values now represent consumed admission budget, not every
rejected request; use HTTP metrics/logs for rejection volume.

A rejected peer stops processing **before** body reading and new identity-bucket
creation. This closes the previous path where a blocked source could keep
allocating rows for arbitrary rotating account names. Rejected registration and
identity scopes also stop before the protected action. Even failure to write a
429 response cannot continue to the controller. Denials still perform SQL/index/
row-lock work; this is not protection against every database/resource flood.

Each request captures one injected Clock instant for all its scopes. A 429 has
`Cache-Control: no-store`, `error=rate_limited` and integer `Retry-After` seconds
rounded up to the rejecting window's end. Another scope can still reject after
that time. Login/register show a translated EN/TR wait message even if an edge
proxy returns an HTML 429; inputs remain and retry is explicit. No automatic
retry loop, account-existence message or client-clock authority was added.

## Source-address trust remains a release gate

The default application setting is explicitly
`server.forward-headers-strategy=NONE`. Its database peer scopes use the socket
peer, not user-supplied `Forwarded`, `X-Forwarded-For` or `X-Real-IP`. This prevents
unreviewed platform defaults from silently enabling forwarding trust; deployment
overrides must be reviewed separately.

Production Nginx replaces incoming X-Forwarded-For/X-Real-IP with its observed
peer, clears Forwarded/forwarded-host/port/prefix and supplies the current proxy
leg's scheme. Preview keeps its existing expected-host scheme/port mapping while
also replacing peer identity and clearing Forwarded/prefix. Neither configuration
is evidence that the complete real production ingress chain has been validated.
Public account links continue to use configured PUBLIC_URL, not request headers.

| Topology | Nginx edge bucket sees | Application peer bucket sees |
| --- | --- | --- |
| Client → Nginx → backend | Client's socket address | Nginx |
| Client → Caddy → Nginx → backend | Caddy | Nginx |
| Codespaces proxy → preview Nginx → backend | Platform proxy | Nginx |
| Local Vite Preview → test backend | No Nginx limit | Local proxy |

Consequently the current Compose production topology can put many players in
shared edge/application peer buckets. This is an availability and capacity
release blocker, not a reason to trust arbitrary incoming IP headers or add a
permanent IP ban. Shared NATs/schools/mobile networks must not be treated as proof
of multiple-account abuse. There is no universal safe proxy CIDR to invent here.

Before public traffic, on the actual ingress:

1. Inventory every hop and its exact trusted addresses. Restrict backend and
   management reachability; preserve the existing non-public Compose ports.
2. Configure Nginx real-IP handling only for verified ingress hops so its own
   edge limits see the correct client. Reject/replace untrusted supplied metadata
   at the outer boundary; account for CDN/proxy address lifecycle if applicable.
3. Configure application/native proxy handling only for the verified frontend
   hop, with bounded, validated chain parsing. Keep direct/untrusted requests from
   selecting their own peer identity. Enabling forwarding globally is insufficient.
4. Test distinct clients, a legitimate shared NAT, IPv4/IPv6, multiple proxies,
   forged/duplicate/malformed headers, direct-backend reachability and unknown
   peers. Check both edge and database buckets, 429/no-store/retry metadata and
   valid login/reset/game traffic under expected load. Clock synchronization
   across instances also matters for shared fixed windows and daily fairness.
5. Record the observed addresses, configuration, measurements and safe fallback.
   Tune budgets only with measured traffic and a documented tradeoff. Rehearse
   proxy changes in staging; do not simply switch off authentication limits.

No production trusted-hop allowlist, real-IP activation or new broad network
trust was introduced in this checkpoint. That validation remains P0 in TODO.md.

## Additional signals and response policy

Start with aggregate 429/401 rates, registration/reset/verification volume and
mail failures using bounded endpoint/status labels. Never use usernames/emails
as unbounded metric labels. Consider suspicious cross-account result patterns
and unusually fast solves for review, while recognizing legitimate repeat play
and shared networks. Hashes, IPs and timing correlations remain sensitive data;
follow DATA_RETENTION.md and define operator log retention/access first.

Do not silently fingerprint devices, purchase identity data, add a CAPTCHA
provider, block every account on one IP or auto-ban solely from a fast score.
Stronger measures (progressive challenges, invitation/registration controls,
account review and appeals) require concrete abuse evidence, accessibility review
and an owner-approved public policy. Username-targeted lockout and distributed
credential stuffing remain tradeoffs of the current fixed-window approach.

## Reproduction and limits

The PostgreSQL suite checks atomic admission across two independent filter
instances/12 concurrent requests, rotating identities after peer rejection,
forwarding-header spoofing, registration/reset/verification limits, exact and
fractional-second boundaries, malformed/oversized bodies, old saturated rows,
fixture disable behavior and rejection-writer failure. Existing verified-email,
game-integrity, deletion and session-revocation tests remain enabled.

The opt-in real-Nginx test reads the current production/preview source fragments,
changes only listen/upstream/include/temp paths for isolation, runs `nginx -t`
and sends forged headers to a local echo fixture through the real proxy binary.
It uses an already running **owned** `wordle-review-*` container, temporary
secondary ports 18081/18082 and no new image/container. It does not overwrite the
container's main config. Set TEST_EXECUTOR_IPV4 to a current local address reachable
from that container (not a stale saved ExtraHosts mapping):

```sh
WORDLE_PROXY_TEST_CONTAINER=wordle-review-web WORDLE_PROXY_TEST_HOST="$TEST_EXECUTOR_IPV4" python3 -m unittest discover -s tests/ops -p test_proxy_headers.py -v
```

The fixture refuses non-review container names/nonlocal binds. Its loopback wget
requests bypass ambient outbound proxies and have a short timeout; ordinary
external traffic/proxy trust is unchanged. Default operator-suite runs explicitly
skip these two opt-in tests. This covers configuration syntax/header forwarding,
not an entire Caddy/CDN chain, image scan or production deployment.

Component tests cover actual EN/TR login/register copy with JSON and HTML 429s,
preserved input and absence of token storage. Browser interception injects 429
only for the UI contract, then lets a manual retry reach the real backend; only
these interception cases block service workers. Real quotas/concurrency are
verified independently against PostgreSQL. Latest counts are in VALIDATION.md.
