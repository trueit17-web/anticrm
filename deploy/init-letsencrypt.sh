#!/usr/bin/env bash
# One-time bootstrap for the first Let's Encrypt certificate.
#
# nginx refuses to start if the cert files referenced in nginx.conf.template
# don't exist yet, but certbot needs nginx running to answer the HTTP-01
# challenge — so we start nginx with a throwaway self-signed cert first,
# swap in the real one, then reload. Re-running this script is safe.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env not found. Copy .env.production.example to .env and fill it in first." >&2
  exit 1
fi

set -a
source .env
set +a

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "crm.example.com" ]; then
  echo "Set a real DOMAIN in .env before running this script." >&2
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "### Creating dummy certificate for $DOMAIN ..."
$COMPOSE run --rm --entrypoint sh certbot -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost'
"

echo "### Starting nginx (frontend) with the dummy certificate ..."
$COMPOSE up -d frontend

echo "### Deleting dummy certificate ..."
$COMPOSE run --rm --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf
"

restore_dummy_cert() {
  echo "### Restoring dummy certificate so nginx stays up ..." >&2
  $COMPOSE run --rm --entrypoint sh certbot -c "
    mkdir -p /etc/letsencrypt/live/$DOMAIN && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj '/CN=localhost'
  "
  $COMPOSE up -d frontend
}

echo "### Requesting real certificate from Let's Encrypt ..."
if ! $COMPOSE run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "${LETSENCRYPT_EMAIL:-admin@$DOMAIN}" \
  --agree-tos --no-eff-email; then
  restore_dummy_cert
  echo "" >&2
  echo "Certificate request failed (see error above — usually port 80 isn't reachable" >&2
  echo "from the internet yet: check your hosting provider's firewall/security group," >&2
  echo "not just ufw). nginx is back up with a temporary self-signed certificate." >&2
  echo "Fix the underlying issue, then re-run this script." >&2
  exit 1
fi

echo "### Reloading nginx with the real certificate ..."
$COMPOSE exec frontend nginx -s reload

echo "Done. https://$DOMAIN should now be serving a valid certificate."
echo "The 'certbot' service in docker-compose.prod.yml will keep it renewed automatically."
