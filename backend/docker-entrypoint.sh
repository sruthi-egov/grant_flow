#!/bin/sh
# Applies database migrations before the API starts.
#
# `migrate deploy` only replays migrations that have not run yet, so this is
# safe on every container start and never resets or drops data.
#
# Seeding is deliberately NOT automatic: it is an explicit operator action
#   docker compose exec backend npx prisma db seed
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

if [ "${SEED_ON_START}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true - seeding demo data (idempotent)..."
  npx prisma db seed || echo "[entrypoint] Seed failed; continuing without it."
fi

echo "[entrypoint] Starting API..."
exec "$@"
