#!/usr/bin/env bash
# Backup → restore into a scratch database → compare row counts and the audit hash-chain head. Prints a Markdown table.
set -euo pipefail
PROJECT=${COMPOSE_PROJECT_NAME:-meridian}
DIR=$(mktemp -d); trap 'rm -rf "$DIR"' EXIT
start=$(date +%s)
"$(dirname "$0")/backup.sh" "$DIR" >/dev/null
DUMP=$(ls "$DIR"/*.dump)
"$(dirname "$0")/restore.sh" "$DUMP" meridian_restore_drill >/dev/null
q() { docker compose -p "$PROJECT" exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d $1 -tAc \"$2\""; }
echo "| Table | Live | Restored | Match |"; echo "|---|---|---|---|"
ok=1
for t in organisations users projects products work_items risks budgets cost_entries bia_assessments documents document_versions requests project_baselines audit_events; do
  a=$(q '$POSTGRES_DB' "select count(*) from $t"); b=$(q meridian_restore_drill "select count(*) from $t")
  [ "$a" = "$b" ] && m=yes || { m=NO; ok=0; }; echo "| $t | $a | $b | $m |"
done
h1=$(q '$POSTGRES_DB' "select hash from audit_events order by id desc limit 1"); h2=$(q meridian_restore_drill "select hash from audit_events order by id desc limit 1")
[ "$h1" = "$h2" ] && m=yes || { m=NO; ok=0; }; echo "| audit chain head | ${h1:0:16}… | ${h2:0:16}… | $m |"
q '$POSTGRES_DB' "select 1" >/dev/null; docker compose -p "$PROJECT" exec -T db sh -c 'dropdb -U "$POSTGRES_USER" meridian_restore_drill'
echo; echo "Dump size: $(du -h "$DUMP" | cut -f1) · elapsed $(( $(date +%s) - start ))s · result: $([ $ok = 1 ] && echo PASS || echo FAIL)"
[ $ok = 1 ]
