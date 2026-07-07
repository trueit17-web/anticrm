#!/usr/bin/env bash
# Restores a backup produced by backup-db.sh. DESTRUCTIVE: drops and recreates
# all data in the target database.
#
# Usage: scripts/restore-db.sh backups/crm_2026-07-07_03-00-00.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env not found next to docker-compose.prod.yml" >&2
  exit 1
fi

set -a
source .env
set +a

read -r -p "This will REPLACE all data in '$POSTGRES_DB'. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE stop backend

$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d postgres -c "
  DROP DATABASE IF EXISTS \"$POSTGRES_DB\";
  CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";
"
gunzip -c "$FILE" | $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

$COMPOSE start backend

echo "Restore complete."
