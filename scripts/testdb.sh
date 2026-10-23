#!/usr/bin/env bash
# Local Postgres for the Playwright suite (Docker, e.g. OrbStack).
#
# Testing against Supabase from a laptop meant 250-900 ms per round trip
# through a one-connection pooler: specs timed out in places they had nothing
# to do with. This keeps a copy of the `preview` schema (test data only, never
# production) in a local container, so the suite runs against a database a
# millisecond away.
#
#   scripts/testdb.sh up        start the container (creates it the first time)
#   scripts/testdb.sh refresh   replace the local copy with a fresh dump of preview
#   scripts/testdb.sh down      stop the container
#
# Then: npm run test:local   (Playwright with the local database)
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=wod-testdb
PORT=54329
IMAGE=postgres:17

up() {
  if ! docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=wodtest -e POSTGRES_DB=wodtest -p "$PORT:5432" "$IMAGE" >/dev/null
  elif ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
    docker start "$NAME" >/dev/null
  fi
  until docker exec "$NAME" pg_isready -U postgres -d wodtest >/dev/null 2>&1; do sleep 0.5; done
  echo "$NAME ready on localhost:$PORT"
}

refresh() {
  up
  # The direct (session) connection, without Prisma-only query options, which pg_dump rejects.
  local src
  src=$(grep -E '^POSTGRES_URL_NON_POOLING=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')
  [ -n "$src" ] || { echo "POSTGRES_URL_NON_POOLING missing from .env.local" >&2; exit 1; }
  echo "Dumping the preview schema (test data) ..."
  docker exec "$NAME" psql -q -U postgres -d wodtest -c 'DROP SCHEMA IF EXISTS preview CASCADE' >/dev/null
  # Passed by environment so the URL never lands in the process list or the terminal.
  docker run --rm -e SRC="$src?sslmode=require" "$IMAGE" sh -c 'pg_dump "$SRC" --schema=preview --no-owner --no-privileges --no-publications --no-subscriptions' \
    | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d wodtest >/dev/null
  docker exec "$NAME" psql -At -U postgres -d wodtest -c \
    "select 'tables: ' || count(*) from information_schema.tables where table_schema = 'preview'"
}

case "${1:-up}" in
  up) up ;;
  refresh) refresh ;;
  down) docker stop "$NAME" >/dev/null && echo "$NAME stopped" ;;
  *) echo "usage: scripts/testdb.sh up|refresh|down" >&2; exit 2 ;;
esac
