# Validation of the readiness changes

## Latest checkpoint — final branch acceptance, 2026-11-11

| Check actually executed | Result |
| --- | --- |
| Java 21 full real-PostgreSQL `mvn verify` | **265 passed**, zero skips/failures/errors; includes security, transactions/concurrency, migration rollback and real TLS/worker integration |
| Frontend unit/component coverage | **111 passed**, 25 files, no unhandled errors |
| TypeScript / release Vite build / built service-worker tests | Build passed; **8 passed** |
| Complete desktop + mobile Chromium E2E | **78 passed**, 10 fixture-gated skips |
| Complete Firefox general E2E; final accessibility rerun | **39 passed**, 5 fixture-gated skips; **7 passed** on final account/theme/admin changes |
| Complete WebKit E2E | **39 passed**, 5 fixture-gated skips |
| Real TLS/AUTH verification/reset/single-use/revocation E2E | **3 passed**: desktop/mobile Chromium + Firefox; six secure/authenticated messages |
| Real refused-SMTP privacy/retry, EN/TR | **8 passed** across all four browser projects; outbox disabled for these synchronous cases |
| Actual production Nginx headers/offline cache checks | **8 passed** across four projects; Chromium/mobile additionally repeated 4 checks on the freshly built image |
| Real EN/TR queued outage → application restart → recovery | **1 combined Chromium scenario passed**; four messages delivered, same persisted capabilities |
| Actual encrypted pending-mail backup / isolated restore | **1 passed**; source unchanged, restored revocation removed ciphertext |
| Actual deploy backup.sh / restore-check.sh happy path | Both passed against the owned PostgreSQL fixture; custom dump/checksum/isolated restore, source retained |
| Operator checks | All **19 distinct Python operator cases** exercised: default 15 passed/4 fixture skips, then all 4 gated cases explicitly passed (proxy 2, benchmark rollback 1, encrypted restore 1) |
| Preview failure/repeat-start suite; local env/key setup | **6 Python + 9 Node passed** |
| Docker E2E image from release assets and existing ignore | **Build passed** with cached Nginx base; built image ran unprivileged/read-only with all capabilities dropped; **4 Chromium/mobile headers/offline reruns passed** |
| Base / preview / operations Compose; shell syntax; whitespace | All three `config --quiet` checks, **8 shell syntax checks**, `git diff --check` passed |
| npm dependency audit | **0 advisories** |
| Maven OSV / actual built JAR OSV | **0 advisories** in 111 resolved-tree coordinates; **all 106 packaged runtime jars independently checked**, also 0 |
| Gitleaks 8.30.1, redacted | **Recorded exceptions, exit 1**: three owner-approved public local `.env` fixtures and one public legacy-fixture token hash; no unexplained new secret |

JaCoCo: **81.08% lines / 69.47% branches**. Frontend V8: **68.08% lines /
66.52% branches**. Browser execution is excluded from these unit coverage metrics.
The complete general E2E matrix contains **156 passing engine/scenario combinations**;
its 20 skips require different SMTP/restart/production fixtures, not omitted core
assertions. Those modes were separately exercised above. Additional final-accessibility,
TLS and built-image runs repeat some combinations and are not added as new coverage.
The shared EN/TR restart scenario was run on Chromium; identical restart fixtures were
not rerun in the other three projects.

General E2E uses the same explicit isolated auth-limit disablement as CI, and real
backend/PostgreSQL/release assets, bootstrap admin and local SMTP capture. Rate-limit
correctness is separately tested with real PostgreSQL; targeted TLS, synchronous outage
and production Nginx browser phases enable the backend auth limiter. Frontend 429/lost
response tests deliberately inject responses and are identified in their test names;
these do not replace the real server races and transport tests.

The final account/theme/admin audit covers EN/TR × light/dark, full-page WCAG A/AA Axe,
rendered gradient contrast (including active background/foreground alpha), 320px and
landscape reflow with 200% text, native controls, error/busy names, SPA state isolation
and dialog focus. Physical devices, true browser/OS zoom, NVDA/VoiceOver speech and
color-vision/user acceptance remain manual. See docs/ACCESSIBILITY.md.

A real DB lock regression first failed against the previous admin role implementation:
it held the higher-ID target while waiting for the lower-ID audit actor. Ordered
actor/target locks now match outbox retry; both role/delete cases pass in the full suite.
The framework baseline is now Boot 4.0.9 / Spring 7 / Jackson 3 on Java 21, with only
necessary import/starter/exception adaptations. The old-producer V9 encrypted fixture
decrypts successfully. No existing SQL migration, root `.env` or CI/Jenkins configuration
was changed by final acceptance. All nine branch migration checksums still validate;
real preflight/migration failures roll back without destructive auto-repair.

The Maven tree hides some repeated dependency nodes; scanning the produced executable
JAR independently avoids missing Spring core/security modules. The packaged scan covers
every BOOT-INF/lib entry via embedded metadata/resolved coordinates and explicit Spring
artifact mappings. Published affected versions were checked against OSV, without blanket
suppression; this is not proof of exploitability or absence of unknown vulnerabilities.
Gitleaks exceptions are deliberately reported rather than called a clean pass. These
local public credentials are not authorized for staging/production.

Fixture corrections before final passing runs: a cross-file CSS copy was removed;
profile text/grid overflow and actual admin/active-navigation contrast/name failures
were fixed; the JSDOM focus assertion waits for its effect; browser audits wait only for
visible modal opacity rather than Firefox caret animations. The first restart harness
also stopped the SMTP capture and broke polling; the corrected harness restarts only
the application and keeps capture/preview continuous. The E2E Docker ignore was already
correct: an experiment without its override was not a repo defect and the unnecessary
edit was reverted before the successful final image build.

Local traces were off to fit disk; production assertions/animations and CI failure-trace
policy were preserved. Firefox ran outside the command sandbox only for its established
profile access, with normal browser security. WebKit uses official task-local Debian
libraries linked into its downloaded runtime directory (its launcher resets LD_LIBRARY_PATH).
The host checker only sees system ldconfig entries and missed the successfully loadable
GLES library; its metadata-only precheck was skipped locally after dependency/runtime
proof. No browser security flags or repository/CI workaround were added.

**Code-level blockers:** none known in the authorized scope after these fixes and checks.
**Review/merge:** prepared for human review into **develop**, created at main's exact
`b1fb0042f554bcef5841db2c2516c53e7c63e57b`. Main was not advanced. Merge remains subject to
review and required remote checks; no merge or deployment was performed.

**Infrastructure / manual / production-only:** full separate backend/frontend multi-stage
Docker image builds and high/critical OS-image scans were not completed in this workspace
quota; the E2E image build is not a substitute. Successful remote Actions/runner execution,
staging capacity, actual-provider SMTP/PKI/delivery, domain/HTTPS/real ingress, real-data
migration/rollback, offsite encrypted backups/deletion journal/key operations/alarms and
manual accessibility remain open/deferred in TODO.md. Production was explicitly deferred
by the owner, not declared ready. See docs/FINAL_BRANCH_REVIEW.md for ranked findings,
complete-diff scope and prioritized remediation.

Raw artifacts: `/workspace/work/final-review/` — `backend-final.log`, `frontend-release.log`,
`build-release.log`, `chromium-full-final.log`, `firefox-accepted.log`,
`firefox-a11y-final.log`, `webkit-full-final.log`, `tls-*-final.log`,
`smtp-failure-*-final.log`, `production-*-e2e.log`, `outbox-recovery-final.log`,
`encrypted-restore-final.log`, `backup-script-final.log`, `restore-script-final.log`, `ops-*.log`, `preview-python.log`, `proxy-headers.log`,
`benchmark-safety.log`, `docker-e2e-build-final.log`, `built-image-chromium-e2e.log`,
`security-packaged-runtime.log`, `packaged-runtime-osv.json`, `npm-audit-final.json`
and redacted `gitleaks-*.json`. Workspace artifacts may be discarded; this summary is durable.


## Previous checkpoint — real SMTP TLS/AUTH acceptance, 2026-11-10

| Check | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL `mvn verify` | 262 passed; zero skips/failures/errors |
| New real TLS/AUTH transport and worker integration subset | 17 passed: 10 transport + 7 real DB/worker cases |
| Frontend unit/component coverage suite | 101 passed; no unhandled errors |
| TypeScript / release Vite build and built-worker tests | Build passed; 8 passed |
| Actual TLS/AUTH verification/reset/single-use/session revocation E2E | 2 desktop/mobile Chromium + 1 Firefox passed; six messages, all secure/authenticated |
| Original plaintext-local capture compatibility | 1 Chromium E2E passed; two local messages without TLS/AUTH |

Fresh JaCoCo remains 80.71% lines / 69.21% branches; frontend 64.92% lines /
61.04% branches. These metrics exclude browser execution. All four selected E2E
runs used the real isolated backend, enabled authentication limits and release
assets; no skips, mocked transport or real mailboxes/provider. No dependency,
root .env, CI/Jenkins, production or migration changes were made.

The application explicitly pins mail.smtp.ssl.checkserveridentity=true. Inspection
of the actual Angus 2.0.5 dependency confirmed its default is already true;
this guards policy across upgrades and is not a claim that the prior version
accepted wrong hostnames. Tests load actual application.properties/Boot mail
configuration, without a trust-all factory or global trust-store modification.

Fresh JDK-keytool EC identities use relative validity in temporary directories.
With both self-signed identities explicitly trusted, the wrong SAN is rejected;
a matching SAN with an untrusted identity is also rejected. Neither sends AUTH
or DATA. Matching identity succeeds for both synchronous and queued methods.
Fixtures intentionally offer AUTH before STARTTLS: missing STARTTLS, 454 refusal
and a stalled handshake cannot downgrade or send credentials/message plaintext.
AUTH rejection happens only after a valid handshake and sends no DATA.

Seven worker cases use actual SMTP plus PostgreSQL, without mocking AccountMail:
certificate/auth failures produce first-attempt FAILED with sanitized tls/
authentication codes and ciphertext cleanup; committed issuance stays committed.
Generic negotiation errors use uncertain retry, handshake timeout uses connection
retry, preserving the same encrypted token/expiry with backoff. Successful TLS
submission uses the persisted Message-ID; the captured capability consumes once.
The initial fixture assumed empty SASL PLAIN authzid; it was corrected to RFC 4616
empty-or-matching identity before the successful subset/full runs.

The Node capture fixture now supports optional TLS/AUTH while preserving default
plaintext behavior. Actual browser flow assertions require secure/authenticated
capture metadata when E2E_SMTP_TLS=true, for verification and reset emails. The
backend JVM used a private fixture truststore; Maven/system trust was unchanged.
A second app/capture phase explicitly tested original local AUTH/STARTTLS=false.
Fixtures and PG were stopped after testing; generated certificates/keys stayed
outside Git and expire, with no real credential or certificate added to source.

Real-provider public PKI/expired/intermediate/revocation behavior, domain/DNS/
delivery/bounces, alarms, key operations, capacity and staging activation remain
open. Outbox remains disabled by default. See docs/SMTP_SECURITY_VALIDATION.md
for exact policy, fixture reproduction and remaining boundaries.

Raw logs: `/workspace/work/smtp-tls/{selected,backend,frontend,production,e2e-tls-chromium,e2e-tls-firefox,e2e-plain}.log`.
Firefox used the existing command-sandbox escalation with normal browser security.
No new Docker image/container was built; the owned PostgreSQL fixture was reused.


## Previous checkpoint — encrypted transactional mail outbox, 2026-11-10

| Check | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL `mvn verify` | 245 passed; zero skips/failures/errors |
| Frontend unit/component suite | 101 passed; no unhandled errors |
| TypeScript / release Vite build and built-worker tests | Build passed; 8 tests passed |
| EN/TR outbox outage → application restart → SMTP recovery E2E | 1 combined Chromium scenario passed; four queued messages delivered |
| Healthy queued verification/reset/single-use/session revocation E2E | 2 desktop/mobile Chromium + 1 Firefox passed |
| Actual encrypted pending-mail custom-format backup/isolated restore | 1 opt-in test passed; source unchanged; restored revocation cleared ciphertext |
| Local env and private outbox key setup | 9 Node tests passed |
| Default operator suite | 19 cases: 15 passed, 4 fixture-gated skips; the outbox restore case also ran explicitly above |
| Actual internal Prometheus | active=1, retry=1, no-op=1, reset failure=1; enabled/fresh worker and no account labels verified |
| Base and preview Compose configuration | Both `config --quiet` checks passed; private default key files ignored |

Fresh JaCoCo: 80.71% lines / 69.21% branches. Frontend V8: 64.92% lines / 61.04% branches.
Unit coverage excludes browser execution. Four selected E2E scenarios passed
without skips against release assets, real authentication/rate limits and a real
loopback SMTP capture; no provider or real mailbox was contacted. Existing
synchronous account/game/retention/security regressions remain enabled.

V9 adds encrypted jobs and composite token identity constraints without changing
historical records. A fixture upgrades V8, forces failure after ALTER TABLE, checks
complete rollback/version 8, removes the injected collision and upgrades cleanly;
old token rows and puzzle history remain identical. The first draft omitted a
required created_at on its synthetic user; the fixture was corrected before the
successful full rerun. No production data or old migration was edited.

Backend cases cover fresh nonces/authenticated metadata/tamper detection, separate
key/JWT rejection, startup version coverage, rotation and old-worker key skipping,
wrong-key BLOCKED recovery, safe admin authorization/inspection/audit/retry,
capacity/unknown-address no-op privacy and atomic enqueue failure rollback. A
sub-microsecond Clock fixture proves issuance expiry is normalized before GCM AAD
and PostgreSQL storage. Two workers skip held jobs; expired leases recover the
same capability/Message-ID, stale workers cannot overwrite newer state and a
last-attempt crash becomes terminal. Worker SMTP holds no transaction, DB
connection or user lock. Revocation, expiry, new issuance, password change/reset,
verification, delete/re-register and logout semantics are tested. Hourly cleanup
includes outbox/no-op rows and rollback of every cleanup category on failure.

Review found a potential inverse lock order in manual retry versus account/token
mutation. Retry now locks original user and audit actor in ID order before the
job; the regression holds the account lock and proves a waiting retry leaves the
job available for token cancellation, then checks user locks before audit FK
insertion. This prevents introducing that deadlock path without holding any user
lock across worker SMTP.

The strengthened lock-order integration class was rerun separately after the full suite; 25 cases passed.

Actual local SMTP transport covers 450 retryable / 550 permanent recipient errors,
stalled greeting/refused connection, accepted DATA/lost final ACK and two queued
sends preserving the actual Message-ID and capability. Backoff/attempt/TTL and
sanitized provider-code persistence are tested in the worker. The browser restart
test queues EN/TR verification/reset requests against refused SMTP, checks neutral
acceptance and accessible replacement guidance, and writes a no-PII harness marker.
Only the owned backend is restarted with the same DB/keys and healthy SMTP; all
four persisted messages arrive and remain single-use with session revocation.

The opt-in Docker/Node restore test reads only the owned wordle_test fixture,
checks decrypted tokens never occur in a real SQL dump, restores a custom-format
archive into its random isolated DB, authenticates unchanged ciphertext/AAD and
consumes restored tokens. The trigger clears all live known-job ciphertext;
source rows are unchanged and the isolated restore DB is dropped. No worker or
outbound SMTP points at the restored copy. This is not the actual production
privacy journal/retention/restore or capacity rehearsal.

Mode is disabled by default. Enqueue success replaces old links even if later
SMTP fails, unlike synchronous rollback. AES key custody/rotation, real provider,
actual ingress, notification receivers, production-sized migration/throughput and
staging rollout remain open in TODO.md and docs/MAIL_OUTBOX.md. SMTP can duplicate
accepted emails after crash/ack loss and does not guarantee inbox delivery.
Jenkins/CI configuration, root .env, main and production were not changed.

Raw logs: `/workspace/work/outbox/{backend-final,frontend,production,env-tests,ops,restore,metrics,e2e-recovery,e2e-healthy-chromium,e2e-healthy-firefox}.log`.
Firefox used the established command-sandbox escalation with its normal browser
security. No new Docker image/container was built; the owned PG fixture was reused.


## Previous checkpoint — SMTP failure privacy and outbox decision, 2026-11-10

| Check | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL `mvn verify` | 206 passed; zero skips/failures/errors |
| Frontend unit/component suite | 99 passed; no unhandled errors |
| TypeScript / release Vite build and built-worker tests | Build passed; 8 tests passed |
| Real refused-loopback-SMTP EN/TR outage E2E | 4 desktop/mobile Chromium + 2 Firefox passed |
| Healthy loopback SMTP verification/reset/single-use/session-revocation E2E | 2 desktop/mobile Chromium + 1 Firefox passed |
| Internal failure-counter and capture checks | 6 reset / 6 verification failures observed in outage phase; 3 verification / 3 reset messages and zero failures in healthy phase |

Fresh JaCoCo: 76.78% lines / 65.57% branches. Frontend V8: 64.92% lines / 61.04%
branches. These unit metrics exclude browser execution. All nine selected E2E
tests ran with the real isolated backend, authentication limits **enabled**, and
release assets through Vite Preview; zero skips. The outage phase configured
mail enabled with refused localhost port 2526, then the same built backend was
restarted against the existing loopback SMTP capture on 2525/8025 for the healthy
phase. No real mailbox or provider was contacted.

Public reset now catches SMTP MailException after transactional service rollback,
returns the same accepted body for known/unknown addresses and preserves the old
link. Authenticated verification gets retryable 503; disabled mail stays 503 for
known/unknown addresses. Tests verify rollback, counters and absence of sensitive
provider text in logs. Browser outage cases exercise actual connection refusal,
not intercepted HTTP failures, in both real translations. Internal Prometheus
checks confirm counters are emitted with only the two purposes and successful
submission does not increment them. This is not an activated alert receiver.

Twenty-four configuration cases cover valid HTTPS/loopback roots, startup rejection
of malformed/opaque/relative/user-info/query/fragment/bad-port roots, sender
availability and disabled mode. Real transport tests retain stalled greeting and
refused connection checks, add a temporary 450 rejection with no DATA/retry, and
accept DATA while withholding the final acknowledgement to prove uncertain
delivery. A PostgreSQL test proves SMTP wait holds a user lock (exact SQLSTATE
55P03) and the token is not yet visible to another transaction. A commit-phase
abort injection proves accepted SMTP cannot be undone and its new link can be
absent while the older link survives. These document residual limits; they are
not a claim those external-transaction problems have been fixed.

The initial backend test draft assumed a particular Spring lock-exception subtype
and overlooked timeout exceptions stored in MailSendException's failed-message
map. Final assertions inspect the actual PostgreSQL SQLSTATE and complete nested
transport errors; the full 206-test rerun passed. No game/security coverage was
removed or relaxation added. Six new frontend cases cover real EN/TR neutral
acceptance and explicit retry after unavailability without losing input/session.

Raw logs: `/workspace/work/mail-review/{backend-final,frontend,production,e2e-failure-chromium,e2e-failure-firefox,e2e-healthy-chromium,e2e-healthy-firefox,metrics-failure,healthy-capture}.log`.
Firefox used the established command-sandbox escalation without disabling browser
security. WebKit, production Nginx/Caddy, real provider TLS/auth/deliverability,
physical devices and remote CI were not rerun. No queue, automatic retry, new
SMTP provider, migration, microservice, language, production change or main merge.
The next implementation and required issuance-semantics/key/lease/fault tests are
in `docs/SMTP_DELIVERY_DECISION.md`; known/unknown timing differences, held
connections and send/commit ambiguity remain open until that work is completed.

## Previous checkpoint — abuse budgets and proxy-header boundaries, 2026-11-10

| Check | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL `mvn verify` | 175 passed; zero skips/failures/errors |
| Frontend unit/component suite | 93 passed; no unhandled errors |
| TypeScript / release Vite build and built-worker tests | Build passed; 8 tests passed |
| Selected desktop/mobile Chromium E2E | 12 passed; zero skips |
| Same selected Firefox E2E | 6 passed; zero skips |
| Opt-in real Nginx production/preview header tests | 2 passed, both source configurations also passed `nginx -t` |
| Default operator suite | 18 discovered: 15 passed, 3 explicitly skipped opt-in checks |

Fresh JaCoCo: 76.13% lines / 63.46% branches. Frontend V8: 64.62% lines / 60.57%
branches. Browser execution is not included in these unit metrics.

The ten new PostgreSQL-backed limiter tests retain existing budgets, verify
two independent filter instances admit only ten of twelve concurrent attempts,
and prove a blocked peer neither reads bodies nor creates rotating-identity
buckets. Stored counters remain bounded; legacy saturated rows still deny.
Exact/fractional window ends, registration/reset/verification limits, spoofed
forwarding headers, oversized/malformed requests, local fixture disable behavior
and rejection-writer failure are covered. Existing email verification, account
deletion, session revocation, game integrity and rotation tests remain passing.
Denials still use database/index/row-lock work; no unlimited-load claim is made.

The frontend adds status-based throttle handling for both JSON and HTML 429s,
including actual EN/TR login/register copy, preserved input and no token storage.
Four new browser cases per engine intercept the first auth response with 429 and
let explicit retry reach the real backend; the selected logout/account-focus
regressions also passed. Only interception contexts block workers. Runtime
quotas/concurrency are tested separately against PostgreSQL; E2E backend rate
limits are disabled only in the isolated UI fixture. Release assets were served
through Vite Preview, not the production Nginx/Caddy path. Firefox preserves its
default browser security and uses the previously verified command-sandbox
escalation. WebKit was not rerun because its disposable cache is absent.

The opt-in proxy test uses the existing read-only Nginx 1.31.7 review container,
temporary secondary configs and a local header-echo server. It reads current
production/preview fragments and changes listen/upstream/include/temp paths for
isolation; the main container configuration is untouched. Forged XFF/X-Real-IP,
Forwarded/host/port/prefix headers are checked after real proxying, retaining the
preview scheme mapping. Initial fixture issues (stale saved host address,
read-only temp defaults and ambient outbound proxy on loopback wget) were
resolved; the completed two-test run passed. Ordinary outbound proxy settings
were preserved; only the fixture's loopback client bypasses proxy use. The default
operator run skips these two checks and the existing real-DB write-fault opt-in.
This is not a new image build/scan or a full real-ingress/client-IP rehearsal.

The current Caddy→Nginx→backend topology still shares coarse peer-IP budgets.
`docs/ABUSE_PREVENTION.md` records the actual controls, proposed person-level
competition rules, admin-answer privilege, residual automation/alias/NAT risks
and required trusted-hop/real-IP staging matrix. Actual ingress activation is
explicitly P0; no broad trusted proxy range, automatic ban, CAPTCHA, fingerprint,
schema migration, new language or microservice was added. Jenkins/CI setup stays
deferred to the owner; these are local results, not remote CI or production proof.

Logs: `/workspace/work/abuse/{backend,frontend,production,e2e-chromium,e2e-firefox,proxy-tests,ops-default}.log`.
No live service/data/credentials were changed and no main merge was performed.

## Previous checkpoint — deletion disclosure and retention correctness, 2026-11-10

This is the latest local evidence; prior checkpoint counts below are historical.
Jenkins setup was deferred to the owner. No GitHub/Jenkins workflow was modified
or successful remote CI claimed in this checkpoint.

| Check | Result |
| --- | --- |
| Full Java 21 / PostgreSQL `mvn verify` | 165 passed, zero skips/failures/errors |
| Frontend component/unit suite with V8 | 85 passed, no unhandled errors |
| TypeScript / release Vite build and built-worker tests | Build passed; 8 tests passed |
| Backup failure/retention script suite | 13 passed |
| Selected desktop and mobile Chromium E2E | 8 passed, zero skips |
| Same selected Firefox E2E | 4 passed, zero skips |

JaCoCo, from a fresh execution-data file: 75.74% lines / 61.13% branches.
Frontend V8: 58.75% lines / 57.53% branches. E2E does not contribute to unit
coverage. These are local release assets through Vite Preview and the real
isolated backend/PostgreSQL, not production Nginx or physical devices.

The expanded deletion regression first creates an avatar, a completed English
game/score, an unfinished Turkish game and tokens. It checks wrong-password
preservation, erasure, both NULL audit-reference directions, another user's
unchanged game/token/session and shared puzzle preservation. A restrictive
test-only FK injects a real deletion failure and proves the user, avatar,
children and audit roll back together. No production deletion logic/permissions
were relaxed. New retention tests exercise before/exact/after cutoffs with the
injected Clock, one-transaction rollback on the last category and successful retry.

Frontend tests use the actual EN/TR translations and check notices associated
with consent, no deletion on opening/checking, no-consent rejection, duplicate
submit suppression and wrong-password retry. The two new browser cases per
engine prepare a real won game/score and unfinished game, check the notice and
light/dark scoped Axe, reject a wrong password, then delete through the UI.
Both original and separately logged-in sessions are rejected afterward, as is
login with the deleted account. Existing logout-all and account-error-focus
regressions also passed. The initial E2E collection required Node's explicit JSON
import attribute; after fixing that test import, the complete selection passed.

The script suite uses actual filesystem age/find semantics to prove that the
default `-mtime +14` retains a 14.5-day-old backup, removes a 15.5-day-old one,
preserves unrelated/nested/outside files and emits private archive/checksum
permissions. A failed backup defers retention cleanup. Consequently neither UI
nor runbook promises immediate backup erasure or an exact 14-day deadline.

Logs: `/workspace/work/retention/{backend,frontend,production,backup-tests,e2e-chromium,e2e-firefox}.log`.
Firefox uses the previously verified command-sandbox escalation, preserving its
default browser security settings. WebKit was not rerun because its disposable
cache had been removed after the prior passing checkpoint. New operational
requirements and unimplemented external deletion-journal export are explicit in
`docs/DATA_RETENTION.md`. No production journal, live backup/provider policy or
privacy restore rehearsal was activated; those remain release gates. No schema
migration, new language, microservice, production deployment or main merge.

## Previous checkpoint — existing-language rotation and account/themed flows, 2026-11-10

This section supersedes older counts and the local Firefox blocker below. Older
sections retain historical evidence, not the current acceptance status.

| Latest check | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL `mvn verify` | 162 passed; zero skipped, failures or errors |
| Frontend unit/component suite | 82 passed; no unhandled errors |
| TypeScript / release Vite build and built-worker artifact tests | Build passed; 8 tests passed |
| Selected desktop Chromium, mobile Chromium and WebKit E2E | 33 passed; zero skips |
| Firefox E2E suite on the release assets / real backend | 25 passed; 3 explicitly skipped |
| V8 custom-format backup / checksum / isolated restore | Passed; disposable restore database removed |
| Rotation query EXPLAIN (ANALYZE, BUFFERS) and result equivalence | 20,000 synthetic TEMP rows; 12 measured executions; before/after result hashes equal |

JaCoCo is 75.92% lines / 61.34% branches. Frontend V8 is 57.69% lines / 56.50%
branches. Unit coverage does not include browser execution. Component tests ran
on the current component logic; the subsequent shared share-button CSS correction
was verified by rebuilding and real-browser normal/hover scans in both themes.

Backend coverage includes unseen-answer priority, the 30-calendar-day preference,
undersized pools, language isolation, Turkish normalization, saved future/past
neighbors, concurrent independent writers/dates, rollback and incompatible parent
isolation. V7-to-V8 preserves repeated historical rows; ordinary edits/deletion
are rejected. Existing game-integrity fixtures now insert known answers before
Start, instead of mutating saved puzzles. The immutability guard was not weakened
for tests. Saved correct answers remain valid after dictionary removal; invalid
alternative guesses still fail. No new language or dictionary content was added.

The 33 selected browser checks retain explicit Start/concurrent-session recovery,
expiry, reconnect/drafts, language names, feedback/focus/mobile layouts and add
stable saved answers across two actual players, themed load retry/same-answer
restart, modal Tab wrapping, and account validation focus. Axe first caught a real
share-button contrast failure; after correcting shared styles, the entire
selection passed, including light/dark normal/hover dialog scans. Earlier failed
runs and repeated subset checks are not counted as additional passing coverage.

Firefox 159.0 / Playwright revision 1572 now opens contexts/pages and passes 25
tests. Within the agent command sandbox it failed before navigation with
`Could not find profile folder`; the exact smoke and E2E commands succeeded
outside that command sandbox, preserving the browser's own default security
settings. No sandbox-disabling flags/preferences were added to code or CI. The
first full run reached 24 passes before an ENOSPC failure; after clearing only
owned disposable tool components, the complete rerun passed. Its three skips are
one SMTP-capture flow and the two production Nginx/security-header/offline cases:
this run used Vite Preview, not the production Nginx image. Remote CI was not
established by these local results.

Raw local logs: `/workspace/work/rotation/backend-final.log`,
`/workspace/work/rotation/backup-restore.log`, and
`/workspace/work/no-new-languages/{frontend-final,production-final,e2e-final,firefox-e2e-final}.log`.
Reproducible index evidence and limitations: `docs/performance/rotation/`.
Migration/locking/old-writer/DDL-owner limits: `docs/WORD_ROTATION.md`.
Real NVDA/VoiceOver, actual mobile/Safari devices, full browser zoom, production
copy migration locks, live SMTP, staging images/scans and release gates remain
open. No production migration, credential rotation, deployment or main merge
occurred.

## Original readiness baseline — 2026-11-09

Local validation on 2026-11-09:

| Check | Result |
| --- | --- |
| Java 21 / PostgreSQL integration and unit tests | 62 passed |
| Frontend unit tests | 8 passed |
| Production Nginx desktop and mobile Chromium end-to-end tests | 14 passed |
| Production Nginx WebKit end-to-end tests | 7 passed |
| Firefox end-to-end tests | Blocked locally: browser context crashes before application interaction |
| Built service-worker artifact tests | 8 passed |
| Backup/restore failure-injection tests | 11 passed |
| TypeScript and production Vite build | Passed |
| Full npm dependency audit, including development tools | Zero known advisories |
| Real SMTP capture / browser recovery and verification flows | Passed |
| Old-token revocation, replacement-password login, and account deletion | Passed |
| Static service-worker offline practice / API exclusion | Passed |
| Real PostgreSQL custom-format backup and isolated restore | Passed |
| Nginx configuration in the non-root runtime image | Passed |
| Base and operations Compose configuration / shell syntax | Passed |
| Prometheus configuration and all three alert rules via promtool | Passed |
| Internal readiness and Prometheus metrics endpoint | Passed |
| Bounded local load smoke: 30 leaderboard requests | Zero failures, p95 830 ms |

These results do not establish production capacity or deployment success. The SMTP capture server and test database were isolated fixtures. No production secrets were rotated, production data migrated, or public service deployed. No email was sent to a real mailbox.

The latest previously observed remote GitHub run failed before either job executed a step, and job logs were unavailable. New CI definitions include final-image scans, but final release-image scan results and required branch-protection activation must be checked in GitHub before merging. `TODO.md` retains those deployment/admin tasks as unchecked items.

## Additional failure and boundary coverage

The PostgreSQL suite now exercises score-insert transaction rollback, competing different guesses for one turn, exact JWT/verification expiry, wrong signing keys and missing claims, database-authoritative roles, rejected CORS origins, Istanbul day/week/month boundaries, score ties, streak expiry, and Turkish casing. Mail tests exercise a real stalled local SMTP connection, connection refusal, and transactional token preservation after delivery failure. Backup tests inject dump/disk errors, corruption, missing files, bad checksums, invalid retention, and restore/database-collision failures. A real checksum-verified backup was also restored into a newly created disposable PostgreSQL database and removed successfully.

Browser tests use the built frontend and production Nginx configuration, including security headers, offline practice, Turkish guesses/reload, and exclusion of API responses from caches. Only the network-response interception test blocks service workers because Playwright cannot reliably intercept worker traffic across engines; separate artifact and browser tests exercise the real worker. CI installs Chromium, Firefox, and WebKit. Local Firefox contexts crashed before page creation, so Firefox is not recorded as passed. WebKit is engine coverage, not physical Safari/device validation.

JaCoCo application coverage is 65.20% of lines and 49.32% of branches. Frontend unit coverage is 17.27% of lines and 16.28% of branches across application, API, and engine source; browser tests are not included in these unit metrics. These are measured baselines, not complete coverage or release thresholds. CI uploads the HTML/LCOV coverage reports. Additional UI error-path and accessibility/device coverage remains necessary.

## P0.1 — Explicit Start regression, 2026-11-09

The first daily fairness TODO is now verified without changing the existing server-authoritative start/scoring behavior. `SecurityAndGameIntegrationTest.statusAndReadRequestsNeverStartADailyGame` checks both languages and repeated status/not-found reads against PostgreSQL: no puzzle, game, or score exists until an explicit authenticated POST; `started_at` matches that server instant and stays unchanged on subsequent reads. The `DailyPage` component regression checks initial visit, live language switch, remount, and explicit click. The new E2E test checks navigation, reload, persisted language changes, real status reads, and exactly one start POST after the click.

The frontend run initially exposed uncancelled `Board` reveal callbacks after unmount (`window is not defined` during test-environment teardown). The component now cancels its pending timeouts; direct tests verify ordinary staggered reveal completion and absence of scheduled callbacks after unmount. The final frontend run had no unhandled errors.

| Check rerun for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 63 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 11 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Production Nginx Chromium + mobile Chromium, explicit Start and lost-response/reload/multiple-tab regressions | 4 passed |
| `git diff --check` | Passed |

Latest frontend unit coverage is 17.53% lines and 16.28% branches. This remains a low, measured baseline; browser tests do not contribute to it. Only the two named E2E scenarios were rerun in desktop/mobile Chromium in this step; earlier WebKit results and the Firefox/remote-runner blockers remain recorded above. Continuous elapsed time after closing the page, dedicated Start/Resume screens, and midnight policy are separate open TODO items, not completed by this step. No production data or secrets were used.

## P0.1 — Closed-page and Resume timing regression, 2026-11-09

The second daily fairness TODO is now verified with the existing production implementation unchanged. The parameterized PostgreSQL test `disconnectedTimeCountsAndResumeFromAnotherSessionKeepsTheOriginalStart` runs for English and Turkish. It advances the injected server clock by 120 seconds with no intervening game requests, issues a fresh session token, and resumes three times through HTTP. Every response uses the original game ID and full elapsed time; the persisted `started_at` is unchanged. Completion at 180 seconds persists that entire duration and the corresponding server-calculated score. Reopening the completed game later freezes duration and preserves exactly one score.

The first test draft inherited the suite's 23:59 Istanbul fixture and crossed into a different puzzle day, correctly receiving a new day's game. The timing fixture was moved to daytime to isolate this acceptance item. Midnight completion/start policy remains a separate open TODO; no production behavior was changed to make this test pass.

Frontend regressions cover timer cleanup on unmount, resuming from the returned server baseline, subsequent ticking, and frozen completed-game time. The real browser regression closes the page, leaves the original context offline for a 2.2-second interval without game requests, and opens a fresh context using the saved account credentials. Resume returns the original ID with the closed-page interval included; a repeated start/resume request keeps that ID and elapsed time cannot go backwards. The displayed timer also uses the returned elapsed baseline. This emulates a different browser session, not a physical second device.

| Check rerun for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 65 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 13 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Production Nginx Chromium + mobile Chromium, closed-page Resume and explicit-Start regressions | 4 passed |
| `git diff --check` | Passed |

Frontend unit coverage is 17.53% lines and 16.43% branches; the existing low-coverage follow-up remains open. The deployed test frontend/backend artifacts were reused because this change affects tests/documentation only. These are local results; successful remote CI, Firefox, physical device validation, separate Start/Resume screens, and the remaining midnight/concurrency acceptance items are not claimed complete. Production secrets/data were not used and no migration or production deployment was performed.

## P0.1 — Separate Start / Resume / saved-result screens, 2026-11-09

Implemented an authenticated, non-cacheable, read-only `GET /api/v1/daily/games?lang=...` status lookup and its API client. It returns `not_started`, `playing`, `finished`, or `already_played` plus the existing game when applicable. PostgreSQL-backed tests verify no puzzle/game/score creation on lookup, stable `started_at`, current-user/language/day isolation, hidden unfinished answers, legacy-score handling, authentication, language validation, and the existing verified-email gate.

The page waits for lookup before offering Start, Resume, or View result. Start explicitly POSTs a new/idempotent game; Resume/result fetch the known ID with GET. English/Turkish text explains the continuous timer and score impact before Start and explains that Resume does not reset elapsed time. Status failures fail closed with a read retry; delayed responses from a previously selected language are ignored. Native Enter activation of pre-game buttons is preserved by attaching game keyboard shortcuts only during active play.

| Check for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 68 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 17 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Production Nginx desktop/mobile Chromium E2E | 22 distinct scenarios passed across suite + result-flow runs |
| WebKit Start, closed-page Resume, status-failure retry, and saved result | 4 selected scenarios passed after the interception fixture correction |
| Final Turkish Resume warning / casing / reload on the rebuilt image | 2 Chromium scenarios rerun successfully; included in the 22 above |
| `git diff --check` | Passed |

Chromium's full initial 20-scenario run retained real SMTP-capture verification/reset, lost responses, multiple tabs, session revocation, Turkish casing, Nginx headers, and offline behavior. Two result-view scenarios completed real games and verified reopening results sends no start POST. The targeted status-error retry was rerun successfully in all three engines after the fixture adjustment. Repeated runs are not counted as additional distinct scenarios.

WebKit initially passed three selected cases but could not intercept the injected status failure through an active service worker. Like the existing lost-response fixture, only the status-failure injection test now blocks workers; it then passed in Chromium/mobile/WebKit. Real Start/Resume/result scenarios and separate worker/offline tests keep workers enabled. This changes test interception, not production worker behavior. WebKit uses the previously extracted local browser libraries; skipped host-library prevalidation does not skip browser execution. Firefox and physical Safari/device validation remain unresolved.

The first browser environment startup exhausted the workspace disk while Docker copied the runtime layer and Tomcat created its management temp directory. Old task-owned test JARs and a regenerable npm cache were removed; backend/Nginx were restarted and the successful checks above used the rebuilt environment. That unsuccessful startup is not recorded as a passing test.

Frontend unit coverage is now 20.96% of lines and 21.11% of branches; broad UI coverage remains an open task. No migration was needed, and the server's elapsed-time/score calculation is unchanged. Deploy backend endpoint support before matching frontend assets; an older backend causes the new frontend to fail closed. Expanded concurrency and midnight policy acceptance items, successful remote CI, and production preparation remain separate TODOs.

## P0.1 — Concurrent sessions, retries, and committed-response loss, 2026-11-09

Expanded acceptance coverage without changing production code or migrations. Existing PostgreSQL uniqueness, transaction boundaries, and `FOR UPDATE` serialization passed the following new scenarios:

- English/Turkish: four distinct JWTs observe a stale `not_started` state and issue simultaneous Start requests. All get one game ID; mixed concurrent Start, GET Resume, and status reads retain that ID, full elapsed time, and the original `started_at`. Only one puzzle/game and no score exist before completion.
- English/Turkish, winning and losing final turns: an independent JDBC transaction holds the game row lock. Two HTTP-layer guess requests are confirmed waiting on real PostgreSQL locks via `pg_stat_activity`. A simultaneous Start/Resume and an unlocked read are exercised around that blocked state. Before release, the read sees only the previous committed guesses and no score. After release, both duplicate final requests return the same completed result. Later replay preserves duration/score; a conflicting replay receives 409. Exactly one score and game remain.
- English/Turkish: competing different valid HTTP guesses from different JWT sessions produce exactly one 200 and one 409. Accepted retries are idempotent and rejected retries cannot overwrite the stored guess.
- Frontend: a pending Start or guess does not issue a second request; an unconfirmed Start can be retried without displaying an invented game/result.
- Real browsers: two independently logged-in contexts start from stale Start screens, one loses its already-committed Start response, and retry/reload converges on the same game. Another scenario issues every guess from two contexts concurrently, drops the committed terminal response, then recovers through Retry. The returned completed result is stable and the account's persisted statistics show one game.

| Check rerun for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 76 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 20 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Production Nginx desktop/mobile Chromium, two new concurrent-session scenarios each | 4 passed |
| WebKit, the same two concurrent-session scenarios | 2 passed |
| `git diff --check` | Passed |

The lock tests use explicit gates, bounded waits, and database wait-state observation rather than assuming two quickly submitted requests overlap. They use the existing disposable PostgreSQL fixture only. The browser contexts use fresh login and separate storage/network contexts; they are not physical devices or separate backend deployments. Error-injection browser contexts block service workers for reliable interception, consistent with the existing network-recovery fixtures; production worker behavior is unchanged. The unchanged release backend/Nginx artifacts were reused after the local build checks.

Frontend unit coverage is 21.80% of lines and 22.44% of branches. This is targeted correctness testing, not a capacity benchmark or exhaustive concurrency proof. Other browser scenarios, Firefox, and real devices were not rerun in this step. Midnight policy remains the next acceptance item, and successful remote CI remains a separate release prerequisite.

## P0.1 — Midnight, canonical puzzle dates, and stale Start screens, 2026-11-09

Policy preserves late completion of existing games, keeps the continuously elapsed server timer, and assigns results to the original puzzle's `played_at`. A new day requires a separate explicit Start. Found and fixed a real inconsistency: the service persisted the original day but period leaderboards filtered completion `won_at`. Daily/weekly/monthly selection now uses half-open `LocalDate` ranges on `played_at`; aggregate SUM scoring remains unimplemented and is not claimed complete.

Start captures a single server instant for date and `started_at`. An optional ISO `date` parameter guards updated clients against stale pre-midnight screens: mismatch returns structured 409 `day_changed` before puzzle creation. Status includes server `date`/`timeZone`; the frontend displays them, refuses incomplete metadata, refreshes on a day conflict, and requires another explicit action. Existing clients omitting the parameter retain server-day selection. Resume and result retrieval stay bound to the existing ID. Local timer interpolation now uses `performance.now()` instead of the device wall clock.

| Check rerun for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 85 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 23 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Desktop/mobile Chromium targeted regression scenarios | 12 passed |
| Selected WebKit midnight/concurrent-session scenarios | 4 passed |
| Final two midnight E2E scenarios after metadata validation change | 6 passed across Chromium/mobile/WebKit; repeats of scenarios above |
| `git diff --check` | Passed |

Eight PostgreSQL boundary cases cover English/Turkish, wins/losses, 23:59:59.999 to 00:00 Istanbul, Sunday/Monday, month-end, and year-end. They check stale/future/invalid Start dates, no writes on rejection or lookup, a separate new-day game, old-game final/replayed results, persistent start/completion/puzzle dates, canonical leaderboard membership, and two independent daily scores. A ninth case holds an uncommitted puzzle insert, observes the Start waiting on PostgreSQL, moves the injected clock across midnight, then proves the accepted old-day Start retains its original instant/date.

Frontend tests check refresh without automatic Start, explicit use of the new date, failure when an older backend omits metadata, and an active game's fixed ID/date across browser-clock changes. In E2E, only the first status date is replayed as yesterday to simulate a stale screen; the ensuing POST, real 409, refresh, and successful fresh Start hit the actual backend/PostgreSQL. The other new E2E changes the browser clock and verifies guesses still target the same server game and never send client timing/date as score inputs. Real server-clock midnight movement is exercised by the injected Clock in backend integration tests, not by a production clock-control endpoint.

This step served the new release frontend with Vite Preview and the newly built backend because workspace disk capacity prevented another comfortable Docker image/container copy. These E2E results do not revalidate Nginx headers/container configuration. Error-injection contexts block workers for interception; the other browser-clock case leaves normal worker behavior enabled. Earlier Nginx results remain historical. Firefox and physical devices were not tested.

Latest frontend unit coverage: 22.20% lines, 24.22% branches. No schema migration or historical data rewrite was required. Deploy backend support before matching frontend assets. Old unfinished games remain accessible by owned ID, but discovering them after a closed page is a separate pending history/Resume-selector task. Measure representative `played_at` query plans/indexes before production scale; current week/month aggregate semantics are still the existing single-game ranking. Remote CI and production release prerequisites remain open.

## Requested interruption — time-source and fixture quality, 2026-11-09

The reported `clock.now.set(Instant.parse(...))` statements were test code, not a frozen production clock. Fixed instants remain deliberate test data. The audit did find application paths bypassing the shared clock: `WordService` daily-date selection, admin dashboard dates, and implicit entity creation/completion defaults. Daily word/admin dates now derive from the injected clock; registration and bootstrap explicitly assign account creation instants. Entity-level implicit timestamps, an unused legacy Score constructor, and the ScoreService convenience constructor that silently chose a real clock were removed. No persisted historical data or schema was changed.

Test support is now independent of integration test classes: `TestTimes`, `MutableClock`, and `TestClockConfiguration` live under `src/test/.../support`. Fixtures use a known Monday in a leap year, with calendar-relative weekday/month/year/leap-day cases. The mutable instant is private; tests use explicit set/Duration advance operations. Zone views share a live atomic source instead of a fixed snapshot. Contract tests cover zone view updates, concurrent advances, invalid adjustments, and a known New York spring-forward boundary. A fixed DTO timestamp is still legitimate local sample data; date literals are not banned indiscriminately.

The formerly wall-clock-dependent streak unit test now supplies a fixed clock. Integration regressions check registration/bootstrap creation time, the injected admin reporting day, and agreement between daily word and daily game calendar selection. Frontend fixture dates are derived from one reference day, and the day-change mock now returns a game on the requested new day.

| Check rerun for this change | Result |
| --- | --- |
| Java 21 / PostgreSQL full `mvn verify` | 95 passed, zero skipped/failures/errors |
| Full frontend unit suite with V8 coverage | 23 passed, no unhandled errors |
| TypeScript / production build and built-worker tests | Build passed; 8 tests passed |
| Release build/Vite Preview desktop/mobile Chromium targeted regressions | 12 passed |
| Production JAR packaging inspection | Test clock/configuration/fixture classes absent |
| Source audit and `git diff --check` | Passed; Java real-clock factory is production ClockConfig |

The E2E selection includes registration, explicit Start, closed-page Resume, multiple-login concurrent recovery, real server stale-date rejection, and client-clock changes. Nginx, WebKit, Firefox, and physical devices were not rerun for this interruption. Frontend coverage remains 22.20% lines / 24.22% branches. The current integration fixtures use shared database state and sequential execution; enabling parallel test classes requires isolation or resource locks. No leaderboard feature TODO was completed by this cleanup, and remote CI/production prerequisites remain open.

## Requested interruption — local environment setup, 2026-11-09

Created a private, Git-ignored workspace `.env` with independently generated database administrator/application passwords, JWT signing material, and local administrator credentials. Existing Compose/application property placeholders remain intact; they resolve from `.env`. SMTP stays disabled because no provider/capture route is configured, so its empty optional credentials are intentional.

Added `node deploy/setup-local-env.mjs` so another checkout can generate its own local `.env` rather than sharing secrets through GitHub. It uses Node's cryptographic RNG, owner-only file mode on POSIX, exclusive creation, localhost/CORS defaults, and no credential output. It refuses to overwrite an existing file, preserving existing database credentials. The administrator is `localadmin`; its generated password is read from `.env`. CI's frontend job now includes the standalone Node tests.

Validation: 4 Node tests passed (key parity with `.env.example`, credential strength/independence, no secret output, file permissions, non-overwrite, per-install uniqueness, and failure reporting); the base Compose, operations overlay/profile, and production profile all passed `config --quiet` with the generated env. `git check-ignore .env`, mode 0600, and `git diff --check` passed. The secret-bearing `.env` is not committed or included in the publish payload.

This is configuration validation, not a successful full Docker build/start or deployment. The workspace still lacks disk capacity for a full release-image build; earlier application test results remain separate. Existing PostgreSQL volumes keep their old passwords, and no volume/data was removed or password rotated. Mail reset/verification remains unavailable until SMTP is configured. Remote CI and production prerequisites remain open.

The branch acquired separate Codespaces preview commits while this setup change was in progress. They were retained by rebasing this change onto the new head; Node generator tests and all three Compose config checks were rerun after integration. The isolated preview manages its own `.preview` env files, so the root local `.env` does not replace that preview's secrets/runtime configuration.

## Period totals, language streaks and bounded statistics — 2026-11-10

Daily rankings use canonical played_at. Weekly/monthly rankings now SUM winning scores by user and language before LIMIT, with last winning completion then user ID as deterministic ties. Totals use long values; compatibility score/id properties remain for cached clients. Current usernames come from users while persisted score snapshots remain intact. Profile counters retain overall semantics; current/best streak and the explicit language summaries/distributions are selected by language. SQL aggregates/window queries replace loading all historical Score entities. REPEATABLE READ keeps multi-query summaries coherent; each operation captures its calendar day once.

| Verification | Result |
| --- | --- |
| Java 21 / real PostgreSQL full verify | 107 passed; no skipped/failures/errors |
| Frontend unit suite / V8 coverage | 35 passed; 34.58% lines / 36.15% branches |
| TypeScript / release build / built service worker | Build passed; 8 worker tests passed |
| Full Chromium desktop/mobile and WebKit E2E | 45 passed, 6 skipped |
| Final targeted three-engine E2E after final backend changes | 15 passed (subset recheck, not additional distinct cases) |
| Backup/restore fault tests / preview tests / env generator | 11 / 6 / 4 passed |
| Real checksum backup / isolated restore including V6 | Passed; temporary restore database removed |
| Native query EXPLAIN ANALYZE BUFFERS | Baseline/candidate plans for 20,000 synthetic scores recorded in docs/performance |

Tests cover totals beyond one-game bounds, month/week/language isolation, single-row players, LIMIT after aggregation, canonical date and deterministic ties; current-name changes; independent losses/gaps/future dates; selected-language profile/result and stale request handling. A 2,000-score fixture exercises bounded summaries and thousand-day streaks. E2E uses an explicitly isolated bootstrap admin/known-answer fixture, real saved wins and a different-language loss; CI defines these public test-only credentials and disables external dictionary calls for that job.

The E2E release assets were served by Vite Preview because local disk capacity prevented a full image build. Six production-Nginx-header/offline cases were intentionally skipped (two per engine); Nginx was not revalidated for this batch. Firefox, physical devices and assistive technologies remain unverified. V6 is a regular transactional index build and requires a production write window/rehearsal. The synthetic read benchmark is not API p95/capacity or write-overhead validation; streak query timing did not improve. No production data, migration, deployment, main merge or microservice migration occurred. Remote CI remains a separate release gate.

## V7 structural consistency and completion conflict rollback — 2026-11-10

V7 adds row-local CHECK constraints for normalized five-letter puzzle answers and serialized guesses (at most six), playing/won/lost turn counts, and terminal finished_at presence. It leaves historical rows untouched and validates them before allowing the migration to commit. deploy/preflight-daily-games.sql is a separate read-only diagnostic for V3+ databases; the original legacy-adoption preflight remains compatible with pre-daily schemas. No applied migration was edited.

DailyGameService no longer silently ignores a score uniqueness collision on completion. A conflicting score now fails the INSERT, rolls back the game update and returns HTTP 409. Existing exact-replay and PostgreSQL game-row lock behavior remains intact. Cross-table result semantics are still enforced by the application transaction, not a new deferred trigger; see docs/DAILY_GAME_CONSISTENCY.md for this boundary and migration locking requirements.

| Verification rerun for this change | Result |
| --- | --- |
| Full Java 21 / real PostgreSQL mvn verify | 130 passed; zero failures/errors/skips |
| New structural/preflight/migration cases | 22 passed, included in 130 |
| New HTTP score-collision rollback regression | Passed, included in 130 |
| Selected desktop/mobile Chromium and WebKit E2E | 15 passed; no skips |
| Real checksum backup and isolated restore of V7 database | Passed; disposable restore database removed |
| git diff --check | Passed |

The isolated migration test deliberately inserts malformed data into a V6 schema, verifies V7 rollback preserves both history and schema, explicitly repairs only that disposable fixture, and successfully retries V7. The error log emitted by that expected failed migration is part of the test, not a failed suite. Existing concurrent sessions, forced lock waits, duplicate finals, language/date boundaries and injected score-write rollback tests passed unchanged.

The E2E selection checks network lost replies, concurrent sessions/final retry, terminal result views, period totals and language streaks. It used the existing release assets through Vite Preview and the new release JAR. No frontend source changed, so frontend unit/build/worker results remain the prior checkpoint's results rather than newly rerun claims. Production Nginx/offline, Firefox, physical devices and assistive technologies were not rerun. A production-sized V7 scan/lock rehearsal and index write-cost load test remain open. No production migration, data repair, deployment or main merge was performed.

## Requested private local admin configuration — 2026-11-10

The ignored owner-only root .env now selects admin / the user-requested six-digit local password, a freshly generated random JWT key, loopback CORS/public URL and the explicit ALLOW_INSECURE_LOCAL_ADMIN opt-in. Existing database passwords were preserved to avoid breaking initialized volumes; absent values would be generated independently. No private env values were committed. Optional SMTP remains disabled.

Normal bootstrap retains its 12-character minimum. The opt-in permits at least six characters only when the public URL and every configured CORS origin are loopback HTTP URLs; remote/malformed URLs, wildcard/empty/remote CORS and account promotion/reset remain rejected. This is an explicit local-testing exception, not a network access-control guarantee: keep Compose's frontend loopback port binding and do not expose/tunnel this login. Changing env values does not reset existing account passwords.

Validation: full Java/PostgreSQL verify passed 141 tests. Five env-generator Node tests passed, including explicit local mode, strong independent database/JWT secrets, owner-only output, no overwrite and no secret output. Base and production-profile Compose config --quiet passed; .env remains ignored and 0600. A real release-JAR smoke test against the disposable test database used the private env settings, successfully logged in as admin with the requested password and accessed the authenticated admin stats endpoint (HTTP 200); no JWT was printed. No production/local Compose database was changed by this test, and no full Docker image build/start was claimed.

Fresh checkouts can reproduce the explicit local setup with node deploy/setup-local-env.mjs --insecure-local-admin. The default generator still creates a strong random administrator password. Disable the opt-in and explicitly rotate the stored account password before public use; bootstrap does not automatically reset an existing account. Remote CI and production release gates remain separate.

## Windows checkout / PostgreSQL init recovery — 2026-11-10

Added LF Git attributes for shell scripts, SQL and Dockerfiles; touched the init script so existing Windows checkouts receive the normalized file on pull. Twelve ops Python tests passed, including a temporary Git repository with core.autocrlf=true, deliberately CRLF source scripts, index normalization and a real checkout: all tracked shell scripts retain LF and pass syntax checks using their respective sh/bash interpreter.

The official PostgreSQL 17.4 entrypoint reproduced the screenshot error with a CRLF executable init script. A restart of that interrupted cluster left the application role absent, as expected. Executing the fixed script recovered the initialized database without deleting its data; TCP application-password login verified role wordle with rolsuper=false. The experiment used a separate temporary cluster in /dev/shm inside the owned test container; the existing test database was not overwritten. Temporary cluster/script were removed and container stopped. No actual Windows Docker Desktop or full image-build test was performed. A new container attempt hit workspace disk exhaustion; the successful isolated-cluster test reused the existing container instead.

## Owner policy: unfinished games expire at day boundary — 2026-11-10

Replaced the previous overnight-completion policy. Owned unfinished games from another application-calendar day return HTTP 410 game_expired on GET and guess (including earlier-turn replay). Guess eligibility is checked after the PostgreSQL row lock; the captured accepted instant also becomes the completion instant. A Start that waits beyond its captured day rolls back instead of leaving a playable expired game. Finished historical results/exact completed retries remain readable. Old rows remain intact; no score, synthetic loss or schema migration is introduced.

The UI clears an expired board, refreshes read-only status and requires another explicit Start. Expired Resume and concurrent-conflict refreshes follow the same handling; stale language errors are ignored. EN/TR instructions describe the deadline. The old-game Resume selector is explicitly removed from TODO at the user's request.

Full Java/PostgreSQL verify: 142 passed, zero failures/errors/skips. Frontend: 37 passed, V8 35.07% lines / 36.53% branches. TypeScript/release build and eight built-worker tests passed. Backend tests cover exact midnight, language/month/week/year boundaries, blocked Start rollback, a locked guess crossing midnight, unchanged old guesses/no score and completed-result replay. New frontend tests cover expired active play/Resume without auto-Start. Earlier overnight-completion tests were rewritten for the intentionally changed requirement, not removed.

E2E uses release assets through Vite Preview; the explicit 410 recovery case simulates the server response while deterministic backend integration tests exercise real server time. No production clock-control endpoint was added. Real-server stale-date rejection, client-clock independence, same-day closed-page Resume, duplicate final recovery and completed result views are retained. Production Nginx/offline, Firefox and physical devices were not rerun for this policy change. Production and CI release gates remain open.

Final selected E2E recheck: 18 passed, zero skips across desktop Chromium, mobile Chromium and WebKit. The first run caught two obsolete text expectations per engine; those were updated to the new policy and the complete selection then passed. These 18 cases are a selected regression run, not a full browser-suite rerun.

## V6 WAL-logged write/storage measurement — 2026-11-10

Completed the remaining local P1.3 index evaluation with scripts/benchmark-score-writes.py. Twenty ordinary logged-table experiments (two workloads × two index variants × five paired repetitions) verify row counts, positive WAL and schema cleanup. Real database fault injection verifies rollback after a deliberately failed post-index setup; database-name guard fails before Docker access. All 14 ops Python tests passed with the real-DB opt-in enabled. Default CI skips that one opt-in test rather than silently assuming a database.

Durable raw plans, metadata, storage counters, individual samples and medians are in docs/performance/writes. For 1,000 mixed inserts, median 11.912 → 14.190 ms; WAL 534,188 → 628,164 bytes; total index growth 128 → 184 KiB. The added index is 408 KiB before, 464 KiB after mixed inserts and unchanged by loss-only inserts. Extra index build median 7.508 ms on mixed fixtures. fsync/full_page_writes/synchronous_commit are on. Each sample rolls back; it measures statement work/WAL rather than commit, replication, API or concurrent throughput. Full-page/cache behavior and production lock duration cannot be extrapolated from these fresh small fixtures.

Retain V6 for period reads with the measured cost documented; no index removal, migration, runtime/backend/frontend changes or production workload occurred. Full backend/frontend/browser suites were not rerun for this benchmark-only checkpoint. Production-sized migration, staging capacity and CI runner gates remain open. The next implementation TODO is the daily-result countdown; previous-day unfinished games remain expired and must not gain a Resume selector.

## Daily-result server calendar countdown — 2026-11-10

Status metadata adds serverNow and nextGameAt from one captured server instant and the next calendar day's start in the configured zone. The result screen displays a monotonic countdown independently from stored results/statistics. At zero it offers a read-only status refresh, never an automatic Start. Network failure/older missing metadata can be retried; focus/visibility resynchronizes; stale requests/timers are cancelled. Prior-day unfinished games remain expired.

Full Java/PostgreSQL verify: 145 passed, zero failures/errors/skips. Frontend: 43 passed, V8 37.37% lines / 39.15% branches. TypeScript/release build and 8 built-worker tests passed. Backend coverage includes no-game-creation reads, completed status metadata, Istanbul exact-midnight boundaries and known New York 23/25-hour DST days. Six new component tests cover device-clock changes, no-auto-Start, an already-advanced server day, network retry, >24-hour display, invalid metadata, focus resync, stale language replies and timer cleanup.

Browser verification uses the release build through Vite Preview. The real-result countdown test uses real backend metadata and changes only the browser wall clock. The rollover case simulates calendar metadata/advanced day to test UI without exposing a production clock-control endpoint; real zone/boundary behavior is covered by PostgreSQL integration tests. Production Nginx/offline, Firefox, physical devices and manual assistive-technology checks were not rerun. Countdown latency correction is an estimate, not a new scoring authority or clock-synchronization guarantee. No schema migration/production deployment/main merge occurred.

Selected release-build E2E: 21 passed across desktop Chromium, mobile Chromium and WebKit, zero skips. Includes two new countdown cases per engine plus completed results, stale-date rejection, browser-clock independence, language streaks and unfinished-game expiry. This is a selected regression run, not a full browser-suite rerun.

## Native-name language selection and mode comparison — 2026-11-10

Replaced desktop flag/code toggles and mobile flag rows with one shared native select: English/Türkçe, current language selected, localized accessible label and localStorage persistence. It naturally extends to future configured languages and supports standard keyboard/mobile picker interaction. The mobile menu closes on selection and is inert while closed. Its menu/close glyph is now inline SVG, so access no longer depends on an external icon font.

Added a collapsed native details comparison to practice and daily screens (including active daily play), translated EN/TR. It explains per-language daily right/ranking, continuing timer, midnight deadline and online submissions versus unlimited unranked practice and cached-offline prerequisites. This is explanatory UI; no scoring, API, daily rights or expiry rules changed.

Frontend full suite: 48 passed; V8 41.29% lines / 43.22% branches. Production TypeScript/Vite build and 8 built-worker tests passed. New tests check native names/no flags or repeated codes, current language, selection persistence, mobile close/inert state and actual EN/TR rule strings. Backend code was unchanged, so its 145-test prior result is not a new rerun. Browser tests use the release build through Vite Preview; desktop/mobile screenshots were inspected for the native-name control and expanded rule text. Actual Windows native-picker rendering, physical devices, Firefox, production Nginx/offline and manual assistive-technology checks were not rerun.

Selected desktop Chromium/mobile Chromium/WebKit E2E: 15 passed, zero skips. The new language journey covers native options, persisted EN/TR switching, mobile auto-close, practice/daily comparison expansion and no automatic daily Start; existing language streak, expiry and countdown regressions passed. Screenshot capture was then stabilized by disabling only screenshot animations; this does not change application motion behavior.

## Daily drafts, ambiguous replies and reconnect reads — 2026-11-10

Added bounded best-effort sessionStorage input drafts, restored only against an authenticated matching game/date/language and authoritative turn history. Unconfirmed submissions retain the exact word/turn until confirmed or explicitly retried; typing/backspace cannot alter an ambiguous payload. Exact accepted turns and completed/expired records clear drafts. Other-session advancement preserves input as a draft for explicit review. No offline write queue or automatic Start/guess was introduced.

Online events/manual Check saved game perform GET reconciliation; offline drafts remain editable and elapsed time continues. Late responses after language changes, another game or unmount are ignored before storage/state changes. Only daily requests have a 15-second timeout; a fetch abort preserves uncertainty rather than pretending the server rolled back. Other API deadlines remain unchanged.

Full frontend: 69 passed, V8 44.64% lines / 48.12% branches. TypeScript/release build and eight built-worker tests passed. New coverage includes partial-draft remount, account/game/day/language isolation, Turkish input, corrupt/oversized/blocked storage, accepted/different turns, offline/online no-write behavior, locked pending retries, expiry and stale unmounted replies. Six HTTP deadline tests cover all four daily operations, cleanup on success/error, no auto-retry and no timeout for unrelated requests. Backend implementation was unchanged; its prior 145-test result is not claimed as rerun.

Browser selection uses the release build through Vite Preview, blocking workers for network fault injection. It includes real browser offline/online transitions, a real committed response aborted after receipt, reload recovery without resubmission, existing lost-response retries, cross-session duplicate final handling, expiry and countdown. Offline cached-shell reload, production Nginx/service-worker network interaction, Firefox, physical devices and assistive technology were not rerun. Browser-session closure/storage restrictions can discard drafts; server history remains durable. No schema migration, production deployment or main merge occurred.

Final selected E2E recheck: 24 passed, zero skips across desktop Chromium, mobile Chromium and WebKit. The first 24-case run preceded the new daily deadline; the full selection passed again on the final bundle. These are repeated checks of 24 selected cases, not 48 distinct tests.

## Game feedback, reduced motion, focus and responsive accessibility — 2026-11-10

Added permanent feedback markers/legend, localized row/cell labels, key descriptions and a latest-guess live region. Blind-mode statuses remain hidden from symbols/ARIA until terminal state. Reduced motion disables CSS animation/transition, skips board reveal timers and confetti generation, and supports live preference changes. Improved board/key contrast and header gradients/focus outlines. Help/practice hint/result dialogs now manage focus/inert background/Tab, help/hints close on Escape and focus returns; native form/header/dialog input no longer changes the game. Keyboard listeners install with the board commit. Mobile/tablet menus and dialogs scroll inside short viewports; flexible tiles prevent narrow-board overflow.

Full frontend: 77 passed; V8 51.14% lines / 52.71% branches. TypeScript/release build and eight built-worker tests passed. New tests cover blind-mode non-leakage, symbols/descriptions, live reduced-motion changes/no timers, dialog Tab/Escape/focus/storage failure, native control/IME/shortcut handling and menu Escape. Backend code was unchanged; its previous 145-test verification was not rerun.

Selected release-build E2E: 24 passed, zero skips across desktop Chromium/mobile Chromium/WebKit. Covers new accessibility/320×568/736×320/200%-text cases plus language selection, reconnection/ambiguous replies, expiry and countdown. Scoped Axe checks on header/board/keyboard reported zero violations in the exercised state. Actual computed board/key contrast passed >=4.5:1 in light/dark themes. A first browser run exposed CSS-marker/icon-font contributions to accessible names (not visible to JSDOM); explicit names/decorative aria-hidden fixed the application, while exact-name assertions were retained. That run also hit disk capacity during failure tracing; only generated traces and the downloaded test JDK source archive were removed, keeping binaries/data intact.

Final header/key focus-outline CSS and responsive test cleanup receive a focused browser recheck. Automated semantic/style checks are not proof of real screen-reader speech or full WCAG conformance. Text enlargement is not actual browser zoom; no physical devices/assistive technology were tested. Full site/account/themed focus/contrast review, Firefox, production Nginx/offline and remote CI gates remain open. No backend/scoring/daily expiry/schema/deployment/main merge changed. Detailed implementation limits: docs/ACCESSIBILITY.md.

Final focused three-engine recheck after outline CSS/test cleanup: 9 passed, zero skips. These repeat the accessibility/language subset of the earlier 24 selected cases; they are not 9 additional distinct scenarios.
