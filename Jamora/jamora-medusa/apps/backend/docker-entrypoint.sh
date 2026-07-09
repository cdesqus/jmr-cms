#!/bin/sh
set -e

cd /app

echo "[entrypoint] Running database migrations + one-time Jamora seed..."
# db:migrate also runs the tracked script in src/migration-scripts (the seed),
# which is recorded so it only executes once even across restarts.
npx medusa db:migrate

echo "[entrypoint] Ensuring admin user ${MEDUSA_ADMIN_EMAIL}..."
npx medusa user -e "${MEDUSA_ADMIN_EMAIL}" -p "${MEDUSA_ADMIN_PASSWORD}" \
  || echo "[entrypoint] Admin user already exists — skipping."

echo "[entrypoint] Starting Medusa server on :9000 ..."
cd /app/.medusa/server
exec npm run start
