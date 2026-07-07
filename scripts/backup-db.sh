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

BACKUP_DIR="${BACKUP_DIR:-$(pwd)/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
OUT_FILE="$BACKUP_DIR/crm_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"

echo "Backup written to $OUT_FILE"

find "$BACKUP_DIR" -name "crm_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "Pruned backups older than $RETENTION_DAYS days."
