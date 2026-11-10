import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { RESOURCES } from '../resources/registry.js';

/** Global search across every searchable resource the user may read (permission-trimmed, restricted rows hidden). */
export async function globalSearch(db: Db, ctx: Ctx, term: string, limit = 30) {
  const t = term.trim();
  if (t.length < 2) return [];
  const defs = RESOURCES.filter((d) => d.searchable && can(ctx, `${d.key}:read`));
  if (!defs.length) return [];
  const restricted = can(ctx, 'restricted:read');
  const parts = defs.map((d) => `SELECT '${d.key}' AS resource, '${d.label}' AS label, id, code, name, status, updated_at FROM ${d.table}
     WHERE org_id=$1 AND deleted_at IS NULL AND (name ILIKE $2 OR code ILIKE $2${d.fields.some((f) => f.n === 'description') ? ' OR description ILIKE $2' : ''})
     ${restricted ? 'AND $3::uuid IS NOT NULL' : `AND (classification IS DISTINCT FROM 'restricted' OR owner_id=$3 OR created_by=$3)`}`);
  const sql = `SELECT * FROM (${parts.join(' UNION ALL ')}) s ORDER BY (code ILIKE $4) DESC, (name ILIKE $4) DESC, updated_at DESC LIMIT ${Math.min(100, limit)}`;
  const like = `%${t.replace(/[%_]/g, '\\$&')}%`;
  return (await db.query(sql, [ctx.orgId, like, ctx.userId, `${t}%`])).rows;
}
