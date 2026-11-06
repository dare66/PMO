import type { Db } from '../db.js';
/** Allocates human-readable record codes, e.g. PRJ-0007, unique per organisation and prefix. */
export async function nextCode(db: Db, orgId: string, prefix: string): Promise<string> {
  const r = await db.query(
    `INSERT INTO code_counters (org_id, prefix, value) VALUES ($1,$2,1)
     ON CONFLICT (org_id, prefix) DO UPDATE SET value = code_counters.value + 1 RETURNING value`, [orgId, prefix]);
  return `${prefix}-${String(r.rows[0].value).padStart(4, '0')}`;
}
