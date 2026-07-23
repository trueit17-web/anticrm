#!/usr/bin/env bash
# Restores a backup produced by backup-db.sh (custom-format pg_dump, see
# backup-db.sh). Restores into a *new* temporary database first and smoke-
# checks it — the live database is only ever touched, right at the end,
# once that's proven to work. A failed/interrupted restore therefore leaves
# the working database exactly as it was, instead of a dropped-but-not-
# recreated shell with the backend left stopped and no automatic recovery.
#
# Usage: scripts/restore-db.sh backups/crm_2026-07-23_03-00-00.dump
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env not found next to docker-compose.prod.yml" >&2
  exit 1
fi

set -a
source .env
set +a

if [ -f "$FILE.sha256" ]; then
  (cd -- "$(dirname -- "$FILE")" && sha256sum -c -- "$(basename -- "$FILE").sha256")
else
  echo "Warning: no $FILE.sha256 found next to the archive — integrity unverified." >&2
fi

read -r -p "This will REPLACE all data in '$POSTGRES_DB'. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"
RESTORE_DB="${POSTGRES_DB}_restore_$(date +%s)"

cleanup_restore_db() {
  $COMPOSE exec -T db dropdb --if-exists -U "$POSTGRES_USER" "$RESTORE_DB" 2>/dev/null || true
}
trap cleanup_restore_db EXIT

# --- Phase 1: restore into a disposable database. The live one is not
# touched by anything in this phase. ---
$COMPOSE exec -T db createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$RESTORE_DB"
$COMPOSE exec -T db pg_restore \
  -U "$POSTGRES_USER" -d "$RESTORE_DB" \
  --exit-on-error --single-transaction --no-owner --no-privileges \
  < "$FILE"

# --- Phase 2: smoke-check before trusting it. ---
USER_COUNT=$($COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" -d "$RESTORE_DB" -Atc 'SELECT count(*) FROM "User"')
if [ "${USER_COUNT:-0}" -lt 1 ]; then
  echo "Smoke check failed: restored database has no User rows. Aborting before touching the live database." >&2
  exit 1
fi
echo "Smoke check passed: $USER_COUNT user row(s) in the restored database."

# --- Phase 3: only now does the live database get touched, and only after
# phases 1-2 have already proven the archive is good. Stop the backend for
# the shortest possible window — right before the swap, not before the
# (potentially slow) restore+verify above. The trap below guarantees the
# backend is restarted even if the DROP/RENAME itself fails partway
# through, and says exactly what state the databases are in either way —
# no silent "left stopped with no explanation" outcome.
$COMPOSE stop backend

SWAP_OK=0
finish() {
  local exit_code=$?
  if [ "$SWAP_OK" = "1" ]; then
    trap - EXIT
  else
    echo "" >&2
    echo "The swap to '$POSTGRES_DB' did not complete cleanly (exit $exit_code)." >&2
    echo "Restored data may currently be under '$RESTORE_DB' instead of '$POSTGRES_DB' — check with:" >&2
    echo "  $COMPOSE exec db psql -U \"$POSTGRES_USER\" -l" >&2
  fi
  $COMPOSE start backend
}
trap finish EXIT

$COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
$COMPOSE exec -T db psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "ALTER DATABASE \"$RESTORE_DB\" RENAME TO \"$POSTGRES_DB\";"
SWAP_OK=1

echo "Restore complete: $POSTGRES_DB now contains the contents of $FILE."
