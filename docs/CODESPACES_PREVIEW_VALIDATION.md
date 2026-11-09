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

Additional local backend and browser checks are recorded below when complete.
