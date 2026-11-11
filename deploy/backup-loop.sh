#!/bin/sh
set -eu
while :; do
  /ops/backup.sh || echo 'BACKUP_FAILED: inspect backup container logs' >&2
  sleep 86400
done
