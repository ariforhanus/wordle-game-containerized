# Codex continuation checkpoint — 2026-11-11

## Scope and branch

- Repo `ariforhanus/wordle-game-containerized`, local `/workspace/work/wordle-game-containerized`.
- Work remains on `fix/security-game-integrity`. The next PR targets **develop**, not main. Develop did not exist; it was created at main's exact `b1fb0042f554bcef5841db2c2516c53e7c63e57b`. No merge or deployment.
- User requested completion of local accessibility/technical tasks and a comprehensive final review. Production, Jenkins, new languages/definitions/themes/mobile apps and microservices are excluded/deferred. Do not resume speculative features.
- Owner explicitly requested tracked root `.env` with public local-only admin/database/JWT fixture values. It is unchanged in final acceptance. No runtime test JWT/AES/cert material belongs in Git. Known Gitleaks exceptions are reported in VALIDATION.md.

## Current acceptance

Code work is technically complete in the authorized scope, with no known code-level blocker. Read **VALIDATION.md**, **docs/FINAL_BRANCH_REVIEW.md**, **docs/ACCESSIBILITY.md** and **TODO.md** before any next change. They distinguish local pass results from infrastructure/manual acceptance. Human review and successful required remote CI remain merge gates into develop; production is not approved.

Final changes: account/profile/theme/admin names/labels/native controls, busy/error/retry states, modal/route focus, storage-safe display helpers, reflow and measured gradient contrast. Mode-specific recovery keys prevent state/capability/password carryover. A real PostgreSQL regression proved the admin role/audit lock inversion with outbox retry; admin role/delete now lock actor and target in ascending ID order.

Security baseline: Java 21 retained, Boot 4.0.9 / Spring 7 / Jackson 3 with necessary starter/import/exception adjustments, not a service migration. All V1–V9 SQL files unchanged from checkpoint 602b759. A fixture captured from the actual pre-upgrade Jackson 2 producer decrypts after upgrade. The dependency upgrade was validated in isolation before a reviewed patch was applied and the actual repository passed verification.

The E2E Docker ignore was already correct. An unnecessary edit was reverted; do not recreate the false root-ignore finding. Actual E2E image build and unprivileged/read-only built-image browser checks passed with the existing ignore. Separate backend/frontend multi-stage image builds and OS-image scans still require more resources/remote CI.

## Verified results

- Backend `mvn verify`: **265 passed**, zero skips/failures/errors; actual PostgreSQL/security/races/migration/TLS/worker coverage. JaCoCo 81.08% lines/69.47% branches.
- Frontend: **111 passed**, 25 files; V8 68.08% lines/66.52% branches. TypeScript/release build and **8 built-worker tests passed**.
- General E2E: Chromium/mobile **78 passed/10 fixture skips**, Firefox **39/5**, WebKit **39/5**. Final Firefox accessibility rerun **7 passed**. These represent156 passing general engine/scenario combinations, not summed repeated runs.
- Separate modes: TLS/AUTH **3** (six secure/authenticated messages); synchronous SMTP outage **8** across EN/TR/all 4 projects; production Nginx/offline **8** across 4 projects plus4 built-image Chromium/mobile reruns; EN/TR outbox restart **1 combined** + real encrypted pending-job isolated restore **1**.
- All 19 distinct operator cases exercised (default 15 + 4 explicit opt-in); preview 6 Python + local env/key 9 Node; Compose base/preview/ops and 8 shell syntax checks passed.
- npm 0 advisories; OSV 111 resolved-tree coordinates: 0 + all 106 packaged runtime jars: 0. The Maven tree omits repeated nodes, so do not rely only on it. Gitleaks exits 1 for 4 documented public fixtures/hash, not a clean secret-scan pass.

## Publication and remote CI

[Draft PR #1](https://github.com/ariforhanus/wordle-game-containerized/pull/1) targets develop. Tested application code is commit `12d3b28190052e20b08b4bdfa5cbf36826ecfcb4`; the published tree exactly matched the staged/tested source. A follow-up records CI observations only; no application source changed. GitHub reports the PR mergeable without content conflicts but unstable/draft, not approved to merge.

At code checkpoint 12d3b28, push run 42976079101 and PR run 42976248845 failed with **no steps** in backend/frontend/E2E/preview; security skipped. Dedicated step tools confirmed empty arrays; no backend log exists (404 BlobNotFound). This is a remote execution gate, not evidence of failed application tests. The connector does not expose the exact account/provider reason. Do not invent billing explanations, change CI/Jenkins or merge to work around it. The owner must investigate runner/account availability and obtain required green runs.

## Remaining work

No new code feature is queued. Finish human branch review and required successful remote checks; then merge to develop only when the owner/review process allows. No automatic merge/main update/deploy. Infrastructure: fresh full release image builds/scans, runner readiness, real-data staging migration/rollback, capacity, SMTP/provider/PKI/domain/HTTPS/ingress, offsite backups/restore/deletion journal/key operations/alarms. Manual: physical phones/Safari/OS keyboards, real browser zoom, NVDA/VoiceOver and color-vision/user review. Deferred languages remain unchecked and are not code blockers in this scope.

## Reproduction and private artifacts

Raw logs/manifests are in `/workspace/work/final-review/`; durable results are in VALIDATION.md. Sources/published docs contain no private harness keys. Runtime harness: `runtime-fixture.py` actions start/plain/tls/smtp-failure/outage/pause/resume/stop. Its private `runtime.json`, `mail-keys.env`, cert/key/truststore must stay outside Git. Modes preserve DB and keyring. Test certs expire: regenerate only the fixture identity+truststore together, not the outbox keyring.

Owned PostgreSQL fixture: `wordle-review-postgres`, loopback 55432, database wordle_test, fixed test-only postgres/local-test-only. Maven truncates this DB: stop the app before Maven; never run browser acceptance concurrently with backend integration tests. Owned app 8091, management 9091, Vite preview 3001, capture 2525/8025, and built Nginx 18080 (`wordle-review-built-web`) are test processes only. They are stopped at completion, with data retained. No production/root Compose stack was used.

Final image `wordle-e2e:final-review` is built from cached Nginx base + current release assets. Base context ignore is unchanged. The old owned bind-mount Nginx container/image and Firefox download were removed for quota after their checks passed. The task-owned Maven download cache was emptied after final verify; the current JAR, source, dependency manifests and reports remain. Future Maven needs dependency downloads again using existing private Maven settings and CA trust; do not delete user data/volumes.

JDK 21 `/workspace/work/tools/jdk21`; Maven `/workspace/work/tools/apache-maven-3.9.11/bin/mvn -B -s /workspace/work/maven-settings.xml -Dmaven.repo.local=/workspace/work/m2 -f backend/pom.xml`; MAVEN_OPTS trustStore `/etc/ssl/certs/java/cacerts`. Formatter java-format.jar uses --aosp.

Chromium `/usr/bin/chromium`. WebKit 2388 / ffmpeg 1013 remain at `/workspace/work/test-expansion/browsers`; task-local official Debian libraries live in browser-libs and are symlinked into WebKit runtime/sys/lib because its launcher resets LD_LIBRARY_PATH. Its ldconfig-only metadata check misses GLES even though ctypes loads it and real WebKit renders/runs: local PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 skips only that precheck, with normal engine security. No repo/CI workaround. Firefox 1572 must be re-downloaded if needed; prior acceptance used established command-sandbox escalation with normal security and task-local library/profile paths.

Publish using connected GitHub create_tree/create_commit/update_ref when shell credentials are absent. Verify exact tree SHA; update fix branch with expected_sha/force=false and inspect any concurrent update. Do not overwrite another worker. Final PR base stays develop. The branch's latest Git commit and open PR identify the publication checkpoint; no handoff commit should contain runtime secrets.
