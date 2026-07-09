#!/bin/sh
set -e

cd /app/.medusa/server

echo "[entrypoint] Running database migrations..."
# Split schema migrations from migration scripts so first boot logs show exactly
# where startup is. --execute-all-links prevents non-interactive Docker startup
# from waiting on link-sync prompts.
# Redis-backed runtime modules can keep the migration CLI process alive after
# connecting. Schema migrations do not need Redis, so disable it for CLI steps
# and restore it for the server process below.
REDIS_URL="" npx medusa db:migrate --skip-scripts --execute-all-links --concurrency 1 --verbose

echo "[entrypoint] Running one-time Jamora seed..."
REDIS_URL="" npx medusa db:migrate:scripts --verbose

echo "[entrypoint] Ensuring admin user ${MEDUSA_ADMIN_EMAIL}..."
npx medusa user -e "${MEDUSA_ADMIN_EMAIL}" -p "${MEDUSA_ADMIN_PASSWORD}" \
  || echo "[entrypoint] Admin user already exists — skipping."

echo "[entrypoint] Starting Medusa server on :9000 ..."
exec npm run start
