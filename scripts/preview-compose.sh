#!/usr/bin/env bash
# A single entry point prevents accidental use of production .env or shell secrets.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f .preview/secrets.env && -f .preview/runtime.env ]] || {
  echo 'Preview is not initialized. Run ./scripts/start-preview.sh first.' >&2; exit 1;
}
# Compose shell variables override --env-file: remove all interpolation inputs.
unset POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD JWT_SECRET CORS_ORIGINS PUBLIC_URL
unset MAIL_ENABLED MAIL_FROM SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_AUTH SMTP_STARTTLS
unset REQUIRE_VERIFIED_EMAIL ADMIN_USERNAME ADMIN_PASSWORD ADMIN_EMAIL WORDLE_DOMAIN
unset COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
exec docker compose --project-name wordle-preview \
  --env-file .preview/secrets.env --env-file .preview/runtime.env \
  -f docker-compose.yml -f docker-compose.preview.yml "$@"
