#!/bin/sh
set -eu
until pg_isready -h db -U supabase_admin -d postgres >/dev/null; do sleep 2; done
export PGHOST=db PGUSER=supabase_admin PGDATABASE=postgres
until [ "$(psql -Atqc "SELECT to_regclass('auth.sessions') IS NOT NULL")" = t ]; do sleep 2; done
# One session holds the lock across the migration ledger check and application.
script=$(mktemp)
trap 'rm -f "$script"' EXIT
printf 'SELECT pg_advisory_lock(781046211);\n' > "$script"
for migration in /payload/database/migrations/*.sql; do
  name=$(basename "$migration")
  version=${name%%_*}
  printf "SELECT EXISTS(SELECT 1 FROM nuvio_migrations.schema_migrations WHERE version = '%s') AS applied \\\\gset\n" "$version" >> "$script"
  printf '\\if :applied\n\\else\n\\i %s\n\\endif\n' "$migration" >> "$script"
done
psql -v ON_ERROR_STOP=1 -f "$script"
