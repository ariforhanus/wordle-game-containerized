#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
mkdir -p .preview
chmod 700 .preview
for tool in docker openssl flock curl python3; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. Rebuild the devcontainer." >&2; exit 1; }
done
exec 9>.preview/startup.lock
if ! flock -n 9; then
  echo 'Another preview startup is running; waiting for it to finish...'
  flock 9
fi
trap 'echo "Preview failed at line $LINENO. See .preview/startup.log and run ./scripts/preview-compose.sh logs --tail=100. Retry ./scripts/start-preview.sh; data and secrets are preserved." >&2' ERR
# The feature's Docker daemon may still be starting when postStart is invoked.
ready=false
for ((attempt=0; attempt<90; attempt++)); do
  if docker info >/dev/null 2>&1; then ready=true; break; fi
  sleep 2
done
$ready || { echo 'Docker did not become ready within 180 seconds. Rebuild/restart the Codespace.' >&2; exit 1; }
docker compose version >/dev/null
if [[ ! -f .preview/secrets.env ]]; then
  # Refuse replacement credentials if a persisted database already exists.
  if [[ -n "$(docker volume ls -q --filter name=wordle-preview_postgres-data)" ]]; then
    echo 'Preview secrets are missing but its database volume exists. Restore .preview/secrets.env; refusing to overwrite database credentials.' >&2
    exit 1
  fi
  temp=$(mktemp .preview/secrets.XXXXXX)
  for key in POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD JWT_SECRET; do
    printf '%s=%s\n' "$key" "$(openssl rand -hex 48)" >>"$temp"
  done
  mv "$temp" .preview/secrets.env
fi
# Reject partial/corrupt secrets rather than silently changing a database password.
for key in POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD JWT_SECRET; do
  grep -Eq "^${key}=[0-9a-f]{96}$" .preview/secrets.env || {
    echo "Invalid/missing $key in .preview/secrets.env. Restore the original file." >&2; exit 1;
  }
done
origin=http://localhost:8080
if [[ "${CODESPACES:-false}" == true ]]; then
  : "${CODESPACE_NAME:?Codespace name is missing}"
  : "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?Forwarding domain is missing}"
  command -v gh >/dev/null || { echo 'GitHub CLI is missing; rebuild the devcontainer.' >&2; exit 1; }
  # Explicitly enforce private visibility on every start, including existing forwards.
  gh codespace ports visibility 8080:private -c "$CODESPACE_NAME"
  origin="https://${CODESPACE_NAME}-8080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi
temp=$(mktemp .preview/runtime.XXXXXX)
cat >"$temp" <<ENV
PUBLIC_URL=$origin
CORS_ORIGINS=$origin
MAIL_ENABLED=false
REQUIRE_VERIFIED_EMAIL=false
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_EMAIL=
ENV
mv "$temp" .preview/runtime.env
chmod 600 .preview/*.env
printf 'Building and starting isolated preview for %s ...\n' "$origin"
./scripts/preview-compose.sh up -d --build --wait --wait-timeout 240 postgres backend frontend
./scripts/smoke-preview.sh
printf '\nPreview READY: %s\n' "$origin"
printf 'On iPhone: sign into GitHub in Safari, open the Codespace Ports tab, and tap Open in Browser for 8080 (Private).\n'
