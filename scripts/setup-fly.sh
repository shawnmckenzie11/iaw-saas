#!/usr/bin/env bash
# First-time Fly.io production setup for iaw-saas.
# Run from repo root after: fly auth login
set -euo pipefail

APP_NAME="${FLY_APP:-iaw-saas}"
DB_NAME="${FLY_DB:-iaw-saas-db}"
REGION="${FLY_REGION:-yyz}"
DOMAIN="${APP_DOMAIN:-iaw.mckenzian.com}"

echo "==> App: $APP_NAME  Region: $REGION  Domain: $DOMAIN"

if ! fly apps list --json | grep -q "\"name\":\"$APP_NAME\""; then
  echo "==> Creating Fly app $APP_NAME"
  fly apps create "$APP_NAME" --org personal
fi

if ! fly postgres list --json 2>/dev/null | grep -q "\"name\":\"$DB_NAME\""; then
  echo "==> Creating Postgres cluster $DB_NAME (smallest dev tier ~\$7/mo)"
  fly postgres create --name "$DB_NAME" --region "$REGION" --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
fi

echo "==> Attaching Postgres to app (idempotent if already attached)"
fly postgres attach "$DB_NAME" --app "$APP_NAME" || true

if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(openssl rand -hex 32)"
  echo "==> Generated JWT_SECRET"
fi

echo "==> Setting secrets"
fly secrets set \
  JWT_SECRET="$JWT_SECRET" \
  NODE_ENV=production \
  SERVE_FRONTEND=true \
  FRONTEND_DIST=/app/frontend/dist \
  PUBLIC_APP_URL="https://$DOMAIN" \
  --app "$APP_NAME"

echo "==> Deploying"
fly deploy --app "$APP_NAME"

echo "==> Requesting TLS certificate for $DOMAIN"
fly certs add "$DOMAIN" --app "$APP_NAME" || true

echo ""
echo "Done. Next steps:"
echo "  1. In Cloudflare DNS for mckenzian.com, add:"
echo "       Type: CNAME   Name: iaw   Target: ${APP_NAME}.fly.dev   Proxy: DNS only (grey cloud)"
echo "  2. Wait for cert: fly certs check $DOMAIN --app $APP_NAME"
echo "  3. Seed database once:"
echo "       fly ssh console --app $APP_NAME -C 'cd /app/backend && node dist/seed.js'"
echo "  4. Open https://$DOMAIN"
