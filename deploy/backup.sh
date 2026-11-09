#!/bin/sh
set -eu
umask 077
: "${BACKUP_DIR:?Set BACKUP_DIR on a protected backup volume}"
: "${PGHOST:?Set PGHOST}"
: "${PGUSER:?Set PGUSER}"
: "${PGDATABASE:?Set PGDATABASE}"
# Use PGPASSFILE (0600) or a secret-injected PGPASSWORD. Never put passwords in command arguments.
mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$BACKUP_DIR/wordle-$stamp.dump"
[ ! -e "$backup_path" ] || { echo 'Backup name already exists' >&2; exit 1; }
trap 'rm -f "$backup_path.partial"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$backup_path.partial"
pg_restore --list "$backup_path.partial" >/dev/null
mv "$backup_path.partial" "$backup_path"
(cd "$BACKUP_DIR" && sha256sum "wordle-$stamp.dump" > "wordle-$stamp.dump.sha256")
retention=${BACKUP_RETENTION_DAYS:-14}
case "$retention" in ''|*[!0-9]*) echo 'Invalid retention' >&2; exit 1;; esac
[ "$retention" -ge 1 ] || exit 1
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wordle-*.dump*' -mtime "+$retention" -delete
# Monitoring checks this timestamp; never contain credential values.
date -u +%s > "$BACKUP_DIR/last-success"
echo "Backup completed: $backup_path"
