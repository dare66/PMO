#!/usr/bin/env bash
# Logical backup of the Meridian database from the running compose stack.
# Usage: scripts/backup.sh [output-dir]   (default ./backups). Produces a custom-format dump + SHA-256.
# Store dumps encrypted and off-host; they contain business data (and password hashes).
set -euo pipefail
PROJECT=${COMPOSE_PROJECT_NAME:-meridian}
OUT=${1:-./backups}; mkdir -p "$OUT"; chmod 700 "$OUT"
TS=$(date -u +%Y%m%dT%H%M%SZ); FILE="$OUT/meridian-$TS.dump"
docker compose -p "$PROJECT" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
