#!/usr/bin/env bash
# Restore a dump produced by scripts/backup.sh into a database of the running compose stack.
# Usage: scripts/restore.sh <dump-file> [target-db]
#   target-db defaults to a NEW database "meridian_restore" so a drill never overwrites live data.
#   Restoring over the live database is deliberate: stop the api first and pass the live db name.
set -euo pipefail
PROJECT=${COMPOSE_PROJECT_NAME:-meridian}
FILE=${1:?dump file required}; TARGET=${2:-meridian_restore}
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "invalid database name" >&2; exit 2; }
if [ -f "$FILE.sha256" ]; then sha256sum -c "$FILE.sha256"; else echo "WARNING: no checksum file next to dump" >&2; fi
docker compose -p "$PROJECT" exec -T db sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $TARGET && createdb -U \"\$POSTGRES_USER\" $TARGET"
docker compose -p "$PROJECT" exec -T db sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TARGET --no-owner --exit-on-error" < "$FILE"
echo "Restored $FILE into database $TARGET"
