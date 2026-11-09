# Production readiness checklist

Checked items are implemented and locally verified on `fix/security-game-integrity`; they do not imply production deployment.

## P0 — Release prerequisites
- [ ] Rotate the exposed live database, administrator, and JWT credentials.
- [ ] Choose the domain and configure production HTTPS/DNS.
- [x] Prepare database preflight and versioned migrations; rehearse failure without deleting legacy data.
- [x] Add CI backend/frontend/browser checks and high/critical image/dependency scans.
- [x] Prepare `.github/rulesets/main.json` to require CI and pull-request review.
- [ ] Import/enable the ruleset in GitHub repository settings (administration access required).
- [ ] Resolve the GitHub runner failure: the prior remote run failed before any steps started; do not call it green.
- [ ] Rehearse upgrade against an authorized copy of the actual production database.
- [x] Validate registration, daily completion/retry/resume, and session revocation locally.

## P1 — Operations
- [x] Add atomic PostgreSQL backups with private file permissions, retention, checksums, and a daily backup service.
- [x] Restore a real backup into a disposable database without touching the source.
- [x] Add structured JSON logs, internal Prometheus metrics, and availability/error/latency alert rules.
- [x] Add transactional administrator and account-security audit records with 90-day retention.
- [x] Prepare release/rollback and credential-rotation runbooks.
- [ ] Activate backups and metrics in the production environment.
- [ ] Configure encrypted off-host backup storage and an alert receiver/log aggregation destination.
- [ ] Measure production recovery objectives and test the release images on staging.

## P2 — Account security
- [x] Implement single-use, expiring, hashed verification/reset tokens and provider-neutral SMTP delivery.
- [x] Add password change, password reset, email verification, and account-security UI in English/Turkish.
- [x] Revoke all existing sessions on password changes/resets or explicit logout-all.
- [x] Add persistent account/IP authentication limits shared across backend instances.
- [x] Add password-confirmed self-service deletion; delete games/scores/tokens and unlink audit actor IDs.
- [x] Add an optional verified-email requirement for ranked participation.
- [x] Test verification/reset delivery through a local SMTP capture server and browser.
- [ ] Choose/configure an SMTP provider and public URL; then enable verified-email ranked participation.

## P3 — Quality and maintenance
- [x] Add desktop/mobile browser tests for lost responses, reload, multiple tabs, and session revocation.
- [x] Add automated accessibility checks; fix login link contrast, grid semantics, and browser zoom.
- [x] Add a bounded local/staging load smoke test with explicit thresholds.
- [x] Remove the obsolete legacy frontend.
- [x] Remove the vulnerable PWA build dependency chain; retain static-only offline support.
- [ ] Evaluate abuse signals beyond verified email and rate limits; define a multi-account competition policy.
- [ ] Complete broader accessibility/manual device testing and production-sized capacity testing.

Microservice migration remains out of scope. No production secrets, data, deployment, or GitHub protection settings are changed by these scripts unless an operator explicitly runs/imports them.
