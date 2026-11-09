# Validation of the readiness changes

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
