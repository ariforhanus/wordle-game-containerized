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
