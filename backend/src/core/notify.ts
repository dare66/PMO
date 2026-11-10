import type { Db } from '../db.js';

export async function notify(db: Db, orgId: string, userIds: (string | null | undefined)[], n: { kind: string; title: string; body?: string; link?: string; dedupe?: string }) {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  for (const uid of ids) {
    await db.query(
      `INSERT INTO notifications (org_id, user_id, kind, title, body, link, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING`, [orgId, uid, n.kind, n.title, n.body ?? null, n.link ?? null, n.dedupe ?? null]);
  }
}

/** Users holding a given role key (global scope) in the org. */
export async function usersWithRole(db: Db, orgId: string, roleKey: string): Promise<string[]> {
  const r = await db.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
     WHERE u.org_id=$1 AND r.key=$2 AND u.status='active' AND u.deleted_at IS NULL`, [orgId, roleKey]);
  return r.rows.map((x) => x.id);
}
