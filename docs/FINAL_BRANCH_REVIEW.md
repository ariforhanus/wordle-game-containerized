# Final branch review — 2026-11-11

Scope: the complete `origin/main` → `fix/security-game-integrity` change, plus the
final acceptance fixes. The published starting checkpoint was `602b759` (291
changed paths against main). This is a code and local validation review, with
infrastructure/manual gates listed separately. No migration to microservices,
new languages, word definitions, themes or mobile applications is included in
this acceptance work. No automatic merge or deployment is authorized.

## Ranked findings resolved during final acceptance

| Priority | Finding and exact implementation reference | Resolution / evidence |
| --- | --- | --- |
| High | Runtime dependency advisories in Jackson, Tomcat, Log4j API, pgJDBC and Spring MVC; managed baseline at `backend/pom.xml:8` | Adopted supported Boot 4.0.9 BOM after isolated compatibility proof. Initial 89-coordinate OSV query flagged six package groups; final 111-coordinate resolved-tree scan and all 106 actually packaged runtime jars have no advisories. No blanket CVE suppression. Full real-PostgreSQL verify and actual browser/mail transport checks validate the resulting application. |
| Medium | Opposite user-row lock acquisition in role mutation (`backend/src/main/java/com/ariforhanus/wordle/controller/AdminController.java:147`) and manual outbox retry | Actor/target are locked in ascending ID order through `UserRepository.java:13`, before mutation/audit, matching the outbox path. A real PostgreSQL blocker/NOWAIT test fails against the previous role implementation and passes with this fix. Delete shares the same order; audit and rollback remain transactional. |
| Medium | Keyboard-inaccessible achievements and unnamed/unmanaged profile dialogs (`packages/web/src/components/UserPage.tsx:250`, `:284`, `:446`) | Native buttons, named dialogs, existing shared focus/inert hook, labels, explicit errors, Escape/Tab and focus restoration. Long-name/text reflow and stat-card contrast are verified in browser engines. |
| Medium | Mobile admin links lost their names when text spans were hidden; its scrolling content was unreachable by keyboard (`packages/web/src/components/admin/AdminLayout.tsx:56`, `:95`) | Explicit names, one application main landmark and a named/focusable scrolling section. Real mobile full-page Axe and delete-cancel focus checks cover the failure. |
| Medium | Active/header/sidebar gradient text could fall below 4.5:1 (`packages/web/src/components/Header.css:40`, `packages/web/src/components/admin/Admin.css:54`) | Measured ratios included 4.13 for active Themes and 3.41 for Back to App. Opaque text/darker selection backgrounds restore contrast. The permanent E2E audit samples actual gradient stops/interpolation, foreground alpha and active backgrounds, supplementing Axe's incomplete gradient handling. |
| Medium | Shared recovery component state could survive SPA transitions (`packages/web/src/router.tsx:31`) | Mode-specific keys discard previous completion, password and capability state. Real SPA forgot → reset → verify regression verifies the fragment is removed and no prior flow state is reused. |
| Low | Profile load failures silently looked like absent statistics; upload failures could claim full success (`UserPage.tsx:109`, `AuthPages.tsx:180`) | Explicit read retry preserves the session/form; only real 401 clears authentication. Failed photos receive an announcement; registration remains busy through upload and preserves the successfully created account with a warning. Component regression tests cover both paths. |
| Low | Display username helper returned immutable numeric JWT subject (`packages/api/src/client.ts:52`) | Decode the UTF-8/base64url username claim for display only; authorization remains server-owned. Missing claims/denied storage and theme persistence failures have regressions. |

The E2E Dockerfile-specific ignore already correctly allowed release assets. A
root-context experiment without that existing override was not evidence of a CI
defect; the unnecessary ignore edit was reverted. The actual repository image
build and built-image Nginx checks pass with the original ignore file.

During validation, an accidental cross-file CSS copy was found and removed before
acceptance. A focus assertion now waits for React's effect, rather than observing
the transient state. Firefox's browser-owned caret animation made an overly broad
animation wait hang; audits now wait only for visible application modal opacity.
No assertions, browser security settings or application animations were disabled.

## Complete diff review coverage

- Authentication/security: JWT signature/expiry, immutable user IDs, database role
  and auth-version checks, password byte limits, account token hashing/single use,
  reset/session revocation, CORS, public/admin routes, email identity constraints,
  avatar size/MIME handling and cache boundaries. Avatars are bounded DB bytes in
  image context; MIME headers are allowlisted, not a full image-content sanitizer.
- Game integrity: Start-only creation, persisted server clock/day/answer, expired
  prior-day games, owner isolation, concurrent Start/guesses, replay after lost
  replies, atomic completion/score, duration/scoring and leaderboard answer redaction.
  The suspected public-leaderboard answer leak was checked and was already prevented;
  existing database/API regressions assert null words.
- Database: migrations V1–V9, legacy preflight/adoption, unique/FK/check/trigger
  constraints, PostgreSQL transaction rollback, score/name consistency, period SUM
  queries/tie-breakers, independent language streaks, query/index benchmark evidence,
  immutable rotation, and retention/restore boundaries. No existing migration was
  edited during final acceptance.
- Mail: GCM nonce/AAD/key separation and versioning, encrypted persistent payloads,
  bounded worker leases/retries, stale claims, cancellation triggers, lock order,
  safe admin DTOs/audit, failure privacy, TLS hostname/trust/auth and metrics.
- Frontend/engine/API: moved shared engine/word assets, daily/practice boundaries,
  locale normalization, feedback and accessibility, network drafts/reconciliation,
  component cleanup, profile/account/theme/admin routes, storage and service worker
  API-cache exclusion. Existing word-list moves are distinguished from new content.
- Delivery/operator changes: Dockerfiles/contexts, base/preview/operations Compose,
  Windows LF/executable behavior, unprivileged Nginx headers/forwarding/rate limits,
  preview lifecycle, backup failure/restore safety, retention/monitoring, pinned
  Actions references/permissions and PR ruleset definitions. Remote activation is
  not inferred from configuration files or local tests.
- Tests/documentation: backend/unit/real-DB races and migration fixtures, frontend
  components/worker, four configured E2E engines, operator failure/restore/proxy
  fixtures, source/legacy path removals and matching runbooks. Historical validation
  checkpoints remain labeled as historical; only the newest table is current.

No additional speculative feature, broad architecture rewrite or unrelated cleanup
was added. Remaining N+1 work in the bounded 50-row admin list is a future scale
optimization, not a demonstrated correctness or security blocker.

## Compatibility and regression boundaries

The resolved Maven tree omits some repeated dependency nodes, so its scan was
supplemented by enumerating every BOOT-INF/lib jar in the built application.
Embedded Maven metadata/resolved names plus explicit Spring artifact mappings
cover all 106 packaged jars, including the omitted Spring core/security modules;
the actual packaged scan also reports zero advisories.

The OSV results match published affected version ranges; they do not demonstrate
that every advisory was remotely exploitable here. In particular, this REST-only
application does not use the flagged SSE/XSLT features. The upgrade removes the
known vulnerable dependency baseline rather than claiming an exploit was observed.

Java 21 is retained. Boot 4 / Spring 7 / Jackson 3 require a real compatibility
change: updated starter/import locations and Jackson exception/mapper handling.
JJWT continues to use BOM-managed Jackson 2 internally; the application does not
add a legacy Jackson compatibility module. SQL V1–V9 checksums and schema remain
unchanged from the preceding branch checkpoint. Existing V9 startup validation,
legacy migration failure/rollback and V8→V9 acceptance all pass.

`OutboxCipherTest.java:179` decrypts a persisted fixture produced by the actual
pre-upgrade Jackson 2 implementation, using public synthetic test material. It
checks compatibility rather than assuming new encryption/decryption is sufficient.
Actual isolated encrypted pending-job backup/restore is separately exercised.
Operators must retain real outbox keys; this test does not rotate or replace them.

The complete branch intentionally replaces client-authoritative scores/old daily
answer access with the documented server-authoritative API. Deployment ordering,
legacy preflight reconciliation, backups and rollback remain explicit operator
steps in OPERATIONS.md. No destructive auto-repair/down-migration was introduced.

## Remaining gates and prioritized remediation

No known unresolved code-level blocker remains after the acceptance fixes, subject
to the exact final results in VALIDATION.md. This is not production approval.

1. **Before merging into develop:** human review of the whole branch, especially
   the dependency baseline/legacy adoption; PR #1 is draft and the code-checkpoint
   Actions runs fail before any job step (exact run evidence in VALIDATION.md).
   Obtain the required successful remote
   checks once runner infrastructure is available. Local source/JAR/assets tests
   cannot replace fresh full release-image builds and high/critical image scans.
2. **Manual accessibility:** NVDA/VoiceOver speech and browse mode, physical mobile
   keyboards/Safari, actual browser/OS zoom and color-vision/user testing. Automated
   Axe/reflow/contrast results are not a WCAG certification.
3. **Deferred staging/production:** domain/DNS/HTTPS and real ingress identity/NAT/
   IPv6 quotas; real-provider SMTP/PKI/delivery; all-node outbox key/worker operations;
   real-data migration and rollback; encrypted offsite backups/deletion journal,
   restore objectives, monitoring/alarm delivery and capacity. These are tracked as
   unchecked/deferred work in TODO.md rather than hidden code TODOs.
4. **Credential exception:** Gitleaks exits 1 for three deliberately published local
   `.env` fixture credentials and one public fixture token hash. Both current-tree and history scans retain these documented fixture findings;
   neither is a clean pass. These are recorded exceptions, not
   a clean secret-scan pass; no new unexplained secret was found, no broad allowlist
   or history rewrite was added, and root `.env` was unchanged in this acceptance.
   Public local values must never be used as staging/production credentials; real
   credentials/old deployed equivalents require owner-controlled rotation.

The workspace quota prevents fresh complete Maven/Node/JRE Docker build-stage
pulls and image vulnerability databases. The E2E Docker image was actually built from current release assets with the
existing Dockerfile-specific ignore and cached Nginx base, then exercised as an
unprivileged/read-only container. This does not claim the separate multi-stage
backend/frontend application images were built or scanned. Remote Actions, staging and production are separate acceptance gates.

PR base is **develop**, starting from main if absent. No merge or deployment is
performed. Exact test counts, skipped fixture gates and publication state are in
VALIDATION.md and the PR description.
