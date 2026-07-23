#!/usr/bin/env bash
# Dumps the production database and prunes backups older than RETENTION_DAYS.
# Intended to run from cron on the server, e.g.:
#   0 3 * * * /path/to/project/scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env not found next to docker-compose.prod.yml" >&2
  exit 1
fi

set -a
source .env
set +a

COMPOSE="docker compose -f docker-compose.prod.yml"

BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
# Custom format (not plain SQL) so restore-db.sh can use pg_restore's
# --exit-on-error/--single-transaction and verify the archive's internal
# table of contents (pg_restore --list) before trusting it.
FINAL_FILE="$BACKUP_DIR/crm_${TIMESTAMP}.dump"

umask 077
install -d -m 700 -- "$BACKUP_DIR"

# Write under a temp name and only rename into place on success — a dump
# that dies partway through (disk full, container restart, etc.) never
# looks like a complete, restorable backup this way.
TMP_FILE="$(mktemp "$BACKUP_DIR/.crm_${TIMESTAMP}.XXXXXX.dump")"
CHECKSUM_TMP="$(mktemp "$BACKUP_DIR/.crm_${TIMESTAMP}.sha256.XXXXXX")"
trap 'rm -f -- "$TMP_FILE" "$CHECKSUM_TMP"' EXIT

$COMPOSE exec -T db pg_dump \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --no-owner --no-acl > "$TMP_FILE"

# A dump that pg_restore can't even list its contents for is not a backup
# worth keeping — catches a truncated/corrupt file before it's trusted.
$COMPOSE exec -T db pg_restore --list < "$TMP_FILE" > /dev/null

sha256sum "$TMP_FILE" | awk '{print $1}' | \
  xargs -I{} printf '%s  %s\n' {} "$(basename "$FINAL_FILE")" > "$CHECKSUM_TMP"

mv -- "$TMP_FILE" "$FINAL_FILE"
mv -- "$CHECKSUM_TMP" "$FINAL_FILE.sha256"
trap - EXIT

echo "Backup written to $FINAL_FILE"

find "$BACKUP_DIR" -maxdepth 1 -name "crm_*.dump" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name "crm_*.dump.sha256" -mtime "+$RETENTION_DAYS" -delete

echo "Pruned backups older than $RETENTION_DAYS days."
