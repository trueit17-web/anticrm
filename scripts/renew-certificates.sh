#!/usr/bin/env bash
# Renews the Let's Encrypt certificate if it's due, and reloads nginx so it
# actually picks up the new one. Run this periodically on the HOST (cron or
# a systemd timer) — it is not run automatically by any container, since
# the renewal needs to reach both the certbot *and* frontend containers,
# which only the host's `docker compose` can do.
#
# Example crontab entry (twice a day, as Let's Encrypt recommends):
#   0 3,15 * * * /path/to/crm/scripts/renew-certificates.sh >> /var/log/crm-cert-renew.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

# `certbot renew` only actually renews certs within ~30 days of expiry —
# most runs are a fast no-op, which is expected and not an error.
if $COMPOSE exec -T certbot certbot renew --webroot -w /var/www/certbot --quiet; then
  # nginx caches the certificate in memory; `-s reload` re-reads it without
  # dropping existing connections. A no-op renewal still reloads here,
  # which is harmless — nginx just re-reads the same files.
  $COMPOSE exec -T frontend nginx -t
  $COMPOSE exec -T frontend nginx -s reload
  echo "Renewal check complete; nginx reloaded."
else
  echo "certbot renew failed — nginx was NOT reloaded, so it keeps serving the current (still valid) certificate." >&2
  exit 1
fi
