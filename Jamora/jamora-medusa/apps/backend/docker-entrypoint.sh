#!/bin/sh
set -e

cd /app/.medusa/server

run_medusa_cli() {
  label="$1"
  shift
  timeout_seconds="${MEDUSA_CLI_TIMEOUT_SECONDS:-240}"

  echo "[entrypoint] ${label} (timeout: ${timeout_seconds}s)..."
  set +e
  REDIS_URL="" timeout "${timeout_seconds}" npx medusa "$@"
  status="$?"
  set -e

  if [ "$status" -eq 124 ]; then
    echo "[entrypoint] ${label} timed out after ${timeout_seconds}s; continuing so the server can report any remaining DB issue."
    return 0
  fi

  if [ "$status" -ne 0 ]; then
    echo "[entrypoint] ${label} failed with exit code ${status}."
    return "$status"
  fi
}

# Split schema migrations from migration scripts so first boot logs show exactly
# where startup is. --execute-all-links prevents non-interactive Docker startup
# from waiting on link-sync prompts.
# Redis-backed runtime modules can keep the migration CLI process alive after
# connecting. Schema migrations do not need Redis, so disable it for CLI steps
# and restore it for the server process below.
run_medusa_cli "Running database migrations" db:migrate --skip-scripts --execute-all-links --concurrency 1 --verbose
run_medusa_cli "Running one-time Jamora seed" db:migrate:scripts --verbose

echo "[entrypoint] Ensuring admin user ${MEDUSA_ADMIN_EMAIL}..."
REDIS_URL="" timeout "${MEDUSA_CLI_TIMEOUT_SECONDS:-240}" npx medusa user -e "${MEDUSA_ADMIN_EMAIL}" -p "${MEDUSA_ADMIN_PASSWORD}" \
  || echo "[entrypoint] Admin user already exists — skipping."

echo "[entrypoint] Starting Medusa server on :9000 ..."
exec npm run start
