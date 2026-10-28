#!/usr/bin/env bash
# Runs the SQL regression tests against a THROWAWAY local Postgres (never a
# Supabase project). Needs psql and a server you can create databases on:
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres supabase/tests/sql/run.sh
# It creates a fresh database, applies a Supabase stand-in, every migration
# before the notification-settings one, a fixture of pre-existing accounts,
# the notification-settings migration and any later ones, then the tests.
set -euo pipefail
shopt -s nullglob
here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../../migrations"
db="ima_sqltest_$$"
psql_db() { psql -v ON_ERROR_STOP=1 -q -X -d "$db" "$@"; }

psql -v ON_ERROR_STOP=1 -q -X -d postgres -c "create database $db"
trap 'psql -q -X -d postgres -c "drop database if exists $db" >/dev/null' EXIT

psql_db -f "$here/00_supabase_stub.sql"
for f in "$migrations"/*.sql; do
  if [[ "$(basename "$f")" == 20261028120000_notification_settings.sql ]]; then
    psql_db -f "$here/10_before_notification_settings.sql"
  fi
  psql_db -f "$f" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; psql_db -f "$f"; exit 1; }
done
psql_db -f "$here/20_notification_settings.test.sql" 2>&1 | grep -v '^$' | sed 's/^psql:[^ ]* NOTICE:  //'
