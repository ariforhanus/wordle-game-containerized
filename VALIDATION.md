# Validation of the readiness changes

Local validation on 2026-11-09:

| Check | Result |
| --- | --- |
| Java 21 / PostgreSQL integration and unit tests | 47 passed |
| Frontend unit tests | 8 passed |
| Desktop and mobile Chromium end-to-end tests | 8 passed |
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
