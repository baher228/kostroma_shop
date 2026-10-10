#!/usr/bin/env bash
set -euo pipefail

# POSTGRES_PASSWORD in the recreated container is the desired deployment value.
# Changing the container environment alone does not update an existing DB role.
# Use its local socket and psql quoting; never print credential values.
container="${1:-analitika-postgres-ru}"
docker exec -i "$container" sh -c '
  set -eu
  test -n "$POSTGRES_PASSWORD"
  exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v "role=$POSTGRES_USER" -v "password=$POSTGRES_PASSWORD"
' <<'SQL'
ALTER ROLE :"role" PASSWORD :'password';
SQL
