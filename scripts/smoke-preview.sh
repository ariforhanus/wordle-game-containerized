#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Probe locally; never put application JWTs into the GitHub forwarding gate.
curl --fail --silent --show-error --max-time 15 http://localhost:8080/healthz >/dev/null
curl --fail --silent --show-error --max-time 15 http://localhost:8080/ | grep -q '<div id="root"'
./scripts/preview-compose.sh exec -T postgres psql -U postgres -d wordle_preview -v ON_ERROR_STOP=1 -Atc \
  "SELECT count(*) FROM flyway_schema_history WHERE success" | grep -Eq '^[1-9][0-9]*$'
python3 scripts/smoke-preview.py "$@"
