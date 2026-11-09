#!/bin/sh
set -eu
# psql variables quote values safely; do not concatenate passwords into SQL.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$WORDLE_DB_PASSWORD" --set=db_name="$POSTGRES_DB" <<'SQL'
CREATE ROLE wordle LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE :"db_name" OWNER TO wordle;
GRANT ALL ON SCHEMA public TO wordle;
SQL
