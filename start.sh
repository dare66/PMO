#!/usr/bin/env bash
# Starts Meridian with Docker Compose. On first run creates .env with random secrets.
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rand 24)|; s|^JWT_SECRET=.*|JWT_SECRET=$(rand 48)|; s|^DEMO_PASSWORD=.*|DEMO_PASSWORD=Demo-$(rand 10)1|" .env && rm -f .env.bak
  echo "Created .env with random secrets."
fi
docker compose up -d --build
PORT=$(grep -E '^WEB_PORT=' .env | cut -d= -f2); PORT=${PORT:-8080}
echo
echo "Meridian is starting at http://localhost:${PORT}"
if grep -q '^SEED_DEMO=true' .env; then
  echo "Demo sign-in: admin@demo.example (or ceo@, pmo@, pm1@, product@, bcm@, finance@, tester@, release@, ops@, auditor@ ...)"
  echo "Demo password: $(grep -E '^DEMO_PASSWORD=' .env | cut -d= -f2)"
fi
