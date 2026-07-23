#!/usr/bin/env bash
# One-time bootstrap for the first Let's Encrypt certificate.
#
# nginx refuses to start if the cert files referenced in nginx.conf.template
# don't exist yet, but certbot needs nginx running to answer the HTTP-01
# challenge — so we start nginx with a throwaway self-signed cert first,
# swap in the real one, then reload.
#
# Re-running this script is safe ONLY because of the guard right below: if
# a real (non-dummy) certificate for $DOMAIN already exists, it exits
# immediately instead of repeating the dummy-cert dance, which used to
# unconditionally delete the live certificate's archive/renewal metadata
# before requesting a replacement — a failed re-request (rate limit,
# transient network issue, etc.) left a previously-working HTTPS site
# downgraded to a 1-day self-signed certificate.
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
DUMMY_MARKER="/etc/letsencrypt/.anticrm-dummy-$DOMAIN"

if $COMPOSE run --rm --no-deps --entrypoint sh certbot -c "
    test ! -e '$DUMMY_MARKER' && \
    test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem && \
    test -s /etc/letsencrypt/live/$DOMAIN/privkey.pem && \
    test -s /etc/letsencrypt/renewal/$DOMAIN.conf
  " 2>/dev/null \
  && $COMPOSE run --rm --no-deps --entrypoint certbot certbot certificates --cert-name "$DOMAIN" 2>/dev/null | grep -q 'VALID'
then
  echo "A valid certificate for $DOMAIN already exists — bootstrap skipped."
  echo "(Renewal is handled by scripts/renew-certificates.sh, not this script.)"
  exit 0
fi

echo "### Creating dummy certificate for $DOMAIN ..."
$COMPOSE run --rm --entrypoint sh certbot -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost' && \
  touch '$DUMMY_MARKER'
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
      -subj '/CN=localhost' && \
    touch '$DUMMY_MARKER'
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

# A real certificate is now live — clear the marker so a future re-run of
# this script recognizes it and skips straight to "already valid" instead
# of repeating the dummy-cert dance against a working certificate.
$COMPOSE run --rm --no-deps --entrypoint sh certbot -c "rm -f '$DUMMY_MARKER'"

echo "Done. https://$DOMAIN should now be serving a valid certificate."
echo "Set up scripts/renew-certificates.sh on a cron/systemd timer to keep it renewed —"
echo "it is not renewed automatically by anything running inside Docker."
