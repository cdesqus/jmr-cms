#!/bin/sh
set -e

cd /app

echo "[entrypoint] Running database migrations..."
# Split schema migrations from migration scripts so first boot logs show exactly
# where startup is. --execute-all-links prevents non-interactive Docker startup
# from waiting on link-sync prompts.
npx medusa db:migrate --skip-scripts --execute-all-links --verbose

echo "[entrypoint] Running one-time Jamora seed..."
npx medusa db:migrate:scripts --verbose

echo "[entrypoint] Ensuring admin user ${MEDUSA_ADMIN_EMAIL}..."
npx medusa user -e "${MEDUSA_ADMIN_EMAIL}" -p "${MEDUSA_ADMIN_PASSWORD}" \
  || echo "[entrypoint] Admin user already exists — skipping."

echo "[entrypoint] Starting Medusa server on :9000 ..."
cd /app/.medusa/server
exec npm run start
