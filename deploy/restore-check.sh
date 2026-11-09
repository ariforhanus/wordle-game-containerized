#!/bin/sh
set -eu
: "${1:?Usage: restore-check.sh backup.dump}"
: "${RESTORE_TEST_DATABASE:?Use a dedicated disposable database name}"
case "$RESTORE_TEST_DATABASE" in wordle_restore_*) ;; *) echo 'Refusing non-test database name' >&2; exit 1;; esac
[ "${PGDATABASE:-}" != "$RESTORE_TEST_DATABASE" ] || { echo 'Source and test database must differ' >&2; exit 1; }
# Validate the archive and its sidecar before creating any database.
[ -r "$1" ] && [ -r "$1.sha256" ] || { echo 'Missing backup or checksum' >&2; exit 1; }
expected=$(cut -d ' ' -f 1 "$1.sha256")
case "$expected" in ''|*[!0-9a-f]*) echo 'Invalid checksum format' >&2; exit 1;; esac
[ "${#expected}" -eq 64 ] || { echo 'Invalid checksum length' >&2; exit 1; }
actual=$(sha256sum "$1" | cut -d ' ' -f 1)
[ "$actual" = "$expected" ] || { echo 'Checksum mismatch' >&2; exit 1; }
pg_restore --list "$1" >/dev/null
# Never drops an existing database. A name collision fails safely.
createdb "$RESTORE_TEST_DATABASE"
trap 'dropdb --if-exists "$RESTORE_TEST_DATABASE"' EXIT HUP INT TERM
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TEST_DATABASE" "$1"
psql --set=ON_ERROR_STOP=1 --dbname="$RESTORE_TEST_DATABASE" -c 'SELECT count(*) FROM users; SELECT count(*) FROM scores;'
echo 'Isolated restore completed successfully'
