# Private Wordle preview from iPhone

This preview uses the development branch, not production. PostgreSQL, Spring Boot
and the built React app run together in Docker Compose. Only the frontend's port
8080 is forwarded. The frontend proxies `/api` to Spring Boot on the internal
Docker network. PostgreSQL and management port 9091 have no published ports.

## First use in Safari

1. Sign into GitHub in Safari and open
   [the development branch](https://github.com/ariforhanus/wordle-game-containerized/tree/fix/security-game-integrity).
2. Tap **Code → Codespaces → Create codespace on fix/security-game-integrity**.
   If GitHub's mobile layout hides this menu, use Safari's **Request Desktop Website**,
   or open [New Codespace](https://github.com/codespaces/new), select this repository
   and `fix/security-game-integrity`. Use a machine with at least 2 cores / 8 GB RAM.
3. Wait for the editor. Docker installation and the first image builds can take
   several minutes. Startup continues in the background, so the editor stays usable.
4. Open the editor's **Ports** panel (View → Terminal, then Ports). Find
   **Wordle preview**, port **8080**, with visibility **Private**. Tap its globe /
   **Open in Browser**, or copy **Forwarded Address** into a new Safari tab.
5. Complete GitHub authentication if prompted. The URL is
   `https://<codespace-name>-8080.app.github.dev`. Register a preview account and play.
   GitHub's access cookie protects the private forwarding gate; application login
   uses the existing JWT flow through the same origin.

On later visits, open [your Codespaces](https://github.com/codespaces), resume this
Codespace, wait for startup, and open port 8080. A brief 502 while containers build
or warm up is expected; reload after startup reports **Preview READY**. A reconnect
to an already running editor does not launch another startup job.

## Recovery and new changes

No manual environment setup is needed. Open a terminal in the repository and run:

```bash
./scripts/start-preview.sh
```

This command also rebuilds the current source. To fetch newer commits first:

```bash
git pull --ff-only origin fix/security-game-integrity
./scripts/start-preview.sh
```

If you have edited files in the Codespace, commit or stash those changes before
pulling. Devcontainer configuration changes require **Codespaces: Rebuild Container**
from the command palette. Ordinary application changes need only the command above.
The preview serves the latest container build, without Vite hot reload. Reload Safari
after rebuilding; if assets appear stale, close and reopen the tab or clear this
preview site's Safari website data (which also clears application login).

## Status, logs and smoke tests

```bash
tail -n 100 .preview/startup.log
./scripts/preview-compose.sh ps
./scripts/preview-compose.sh logs --tail=100 backend frontend postgres
./scripts/smoke-preview.sh
./scripts/smoke-preview.sh --full
```

The normal smoke test checks HTML, the frontend health route, a public API route,
PostgreSQL and successful Flyway migrations. `--full` additionally creates a temporary
account, tests registration/login/JWT, finishes and reloads a daily game, verifies
its score/statistics and queries leaderboards, then deletes the account through the
application. Existing authentication and request rate limits remain enabled: wait
before repeatedly running the full test if it returns 429.

If startup fails, inspect logs and rerun the startup command. It waits up to three
minutes for Docker and four minutes for container health after builds. A failed
GitHub CLI visibility command stops startup; check GitHub authentication and retry,
never change visibility to public. A port conflict means another process owns 8080;
stop that process or other local stack, then retry. A missing secrets file with an
existing preview database causes a deliberate failure: restore the original file.
Never replace credentials on an existing database or use production credentials.

Use the `preview-compose.sh` wrapper for all preview operations. It fixes the project,
Compose files and environment files and clears inherited production configuration.
Do not use bare `docker compose` commands or copy a production `.env` into this preview.

## Isolation and persistence

- Preview secrets are generated once with OpenSSL (48 random bytes per secret),
  stored in `.preview/secrets.env` with owner-only permissions, excluded from Git
  and Docker build contexts. `.preview/runtime.env` contains the current preview URL.
- The Compose project is `wordle-preview`; its dedicated volume is
  `wordle-preview_postgres-data` and database is `wordle_preview`. The backend always
  connects to the internal `postgres` service with the existing restricted `wordle`
  database role. Production URLs, credentials, admin bootstrap and SMTP are not used.
- Startup uses a file lock to serialize concurrent invocations. Repeated starts,
  stopping/resuming a Codespace, and container recreation preserve the volume and
  existing secrets. No startup command removes data. Deleting a Codespace is disposable:
  its preview database and local credentials are not a backup.
- GitHub terminates HTTPS. A preview-only Nginx config supplies HTTPS forwarding for
  the standard Codespaces domain; Spring processes forwarded headers. `PUBLIC_URL`
  and CORS contain the exact generated origin, never a wildcard. The React API
  client already uses relative `/api` URLs. Local use outside Codespaces uses
  `http://localhost:8080` instead.
- Production Compose, Dockerfiles, Nginx, Caddy, security controls and migrations are
  unchanged. Email delivery is disabled, matching the existing local defaults;
  registration/login do not require verification. Email delivery and password-reset
  emails are outside this preview's smoke coverage.
- Port auto-discovery is disabled; only 8080 is configured for forwarding. Startup
  explicitly enforces **Private** via GitHub CLI. Do not manually forward 5432, 8091
  or 9091, and do not make 8080 public. GitHub organization policies still apply.

## Stop billing for idle compute

In [github.com/codespaces](https://github.com/codespaces), tap the Codespace's `…`
menu → **Stop codespace**. Closing the Safari tab alone does not immediately stop
compute. Configure an idle timeout in GitHub settings. Stopped Codespaces retain
storage and may still incur storage charges; deleting one removes its preview data.

## Changed files and validation

The devcontainer and background launcher install Docker/Compose and GitHub CLI,
forward 8080, and start on creation/resume. The preview Compose/Nginx overrides,
startup/Compose/smoke scripts, ignore rules and this guide provide the isolated
preview workflow. See `docs/CODESPACES_PREVIEW_VALIDATION.md` for recorded checks
and any remaining environment or device limitations.

Reference: [GitHub's port-forwarding documentation](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).
