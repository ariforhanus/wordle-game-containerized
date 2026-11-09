# Preview validation record

Validation started on 2026-11-09 against `fix/security-game-integrity`.

## Changed files

| File | Purpose |
| --- | --- |
| `.devcontainer/devcontainer.json` | Docker-in-Docker/Compose, GitHub CLI, port 8080 and lifecycle configuration |
| `.devcontainer/start-preview-background.sh` | Non-blocking creation/resume startup and private local log |
| `docker-compose.preview.yml` | Dedicated preview database and forwarded-header configuration |
| `deploy/nginx-preview.conf` | Preview HTTPS handling, sanitized proxy headers, existing Nginx security controls |
| `scripts/start-preview.sh` | Docker readiness, private port enforcement, secrets, serialized startup and readiness report |
| `scripts/preview-compose.sh` | Fixed project/files/environment and production configuration isolation |
| `scripts/smoke-preview.sh`, `scripts/smoke-preview.py` | Read-only readiness checks and optional full application smoke |
| `tests/preview/test_startup.py` | Repeated/concurrent startup and failure-path tests |
| `.github/workflows/ci.yml` | Startup unit tests and real fresh/restart/repeat Compose validation |
| `.gitignore`, `.dockerignore` | Exclude generated preview credentials, logs and state |
| `docs/CODESPACES_PREVIEW.md` | iPhone workflow, recovery, logs, updates, security and stopping billing |
| `docs/CODESPACES_PREVIEW_VALIDATION.md` | Validation evidence and limits |

## Local checks completed

- Frontend Vitest: 23 tests passed.
- Production frontend build and asset tests: 8 tests passed.
- Existing operator-script tests: 11 tests passed.
- Preview startup tests: 6 passed, including first/repeated starts, concurrent
  starts, preserved secrets after failed build, refusal to rotate missing secrets
  against an existing volume, exact Codespaces URL/private visibility, and refusal
  to start after a visibility API failure. Docker/GitHub are simulated in these tests.
- Merged Compose configuration parsed successfully: PostgreSQL/backend have no
  published ports, frontend binds only `127.0.0.1:8080`, database URL points at
  internal `postgres:5432/wordle_preview`, volume is project-scoped, and injected
  production shell values for credentials, origin, mail, admin and profiles are ignored.
- Shell syntax, workflow YAML, Git ignore rules and `git diff --check` passed.

## Platform limitations

- A real Codespace could not be created with the available GitHub credentials:
  `gh codespace create` returned **you cannot create codespaces with that repository**.
  Listing available machines also returned HTTP 403 **Resource not accessible by
  integration**. No Codespace was created and no production deployment was attempted.
- Consequently creation/resume lifecycle, GitHub's real private HTTPS authentication
  gate and physical iPhone Safari behavior remain unverified in a live Codespace.
- The first complete Docker image build on this managed runner hit **no space left
  on device** in its VFS Docker storage. This is distinct from a Codespaces build.
  The CI preview job is configured to perform real clean startup, full application
  smoke, stop/start and repeated startup with data/secret preservation on an Ubuntu
  runner with its normal Docker storage driver.

## Additional integration checks completed

- Backend Maven `verify`: **95 tests passed**, zero failures/errors/skips, against
  PostgreSQL 17.4. Used a temporary JDK/Maven install and the runner's proxy/CA trust;
  no repository build settings were changed.
- Built release React assets and served them with Nginx using the preview-only
  configuration. Ran the packaged Spring Boot application in its Java 21 runtime
  container with the restricted application database role on the same private
  Docker network as PostgreSQL. To fit this runner's storage, compilation happened
  outside the multi-stage Docker build; this does not validate the full image build.
- `./scripts/smoke-preview.sh --full`: passed frontend, PostgreSQL/Flyway,
  registration, login, JWT-authenticated requests, daily game completion/reload,
  server score, persisted statistics and all four leaderboard routes. The temporary
  smoke account was deleted through the application's account-deletion endpoint.
- Six existing Playwright tests passed using mobile Chromium: daily start behavior,
  timer persistence across closed pages, login labels/zoom, Turkish guesses/reload,
  finished results, and protection against browser-clock changes.
- A simulated Codespaces HTTPS Host/Origin request through preview Nginx returned
  HTTP 200 even with conflicting client-supplied forwarding headers. An unapproved
  Origin returned HTTP 403. This tests proxy/CORS compatibility, not GitHub's real
  HTTPS/authentication gate.
- Restarted PostgreSQL and both runtime containers with the same database volume:
  persisted user count matched and the read-only smoke test passed afterward.
  An attempted PostgreSQL container recreation first hit the runner's storage limit;
  after clearing downloaded test caches, existing-container restart succeeded.

## Remaining checks and account blockers

- [The triggered Actions run](https://github.com/ariforhanus/wordle-game-containerized/actions/runs/42641278650)
  did not execute any job steps. GitHub's check annotation says **The job was not
  started because your account is locked due to a billing issue.** The new real
  Compose fresh/restart/repeated-start CI job therefore remains unexecuted. Resolve
  the account's billing issue and rerun Verify to exercise it.
- WebKit was downloaded and a browser test was attempted, but launch failed due to
  missing host libraries (including libharfbuzz-icu, libmanette, libhyphen and
  libGLESv2). Physical iPhone Safari and WebKit behavior remain unverified.
- Fresh and resumed Codespaces need an authorized account to run the final live
  check. Create the Codespace from this branch, confirm private 8080 forwarding,
  register/play in Safari, stop/resume it, and verify the account and daily game
  persist. The exact iPhone steps are in the usage guide. No production changes,
  deployment or merge into main were performed.
