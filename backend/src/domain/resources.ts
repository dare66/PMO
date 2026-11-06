import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { weeklyLoad } from './calc.js';

export function mondayOf(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - ((day + 6) % 7));
  return x;
}

export async function capacity(db: Db, ctx: Ctx, opts: { from?: string; weeks?: number; department_id?: string; team_id?: string }) {
  const start = mondayOf(opts.from ? new Date(opts.from) : new Date());
  const weeks = Math.min(26, Math.max(1, opts.weeks ?? 12));
  const weekStarts = Array.from({ length: weeks }, (_, i) => new Date(start.getTime() + i * 7 * 86400000).toISOString().slice(0, 10));
  const end = new Date(start.getTime() + weeks * 7 * 86400000).toISOString().slice(0, 10);
  const params: unknown[] = [ctx.orgId];
  let filter = '';
  if (opts.department_id) { params.push(opts.department_id); filter += ` AND u.department_id=$${params.length}`; }
  if (opts.team_id) { params.push(opts.team_id); filter += ` AND u.id IN (SELECT user_id FROM team_members WHERE team_id=$${params.length})`; }
  const users = (await db.query(`SELECT u.id, u.code, u.name, u.title, d.name AS department FROM users u LEFT JOIN departments d ON d.id=u.department_id
    WHERE u.org_id=$1 AND u.deleted_at IS NULL AND u.status='active' AND NOT u.is_service_account${filter} ORDER BY u.name`, params)).rows;
  const ids = users.map((u) => u.id);
  const allocs = (await db.query(`SELECT a.*, COALESCE(p.name, pr.name, pg.name, 'BAU') AS context_name FROM resource_allocations a
     LEFT JOIN projects p ON a.context_type='project' AND p.id=a.context_id LEFT JOIN products pr ON a.context_type='product' AND pr.id=a.context_id LEFT JOIN programmes pg ON a.context_type='programme' AND pg.id=a.context_id
     WHERE a.org_id=$1 AND a.deleted_at IS NULL AND a.status <> 'released' AND a.user_id = ANY($2::uuid[]) AND a.start_date <= $4 AND a.end_date >= $3`, [ctx.orgId, ids, weekStarts[0], end])).rows;
  const leave = (await db.query(`SELECT * FROM availability WHERE org_id=$1 AND deleted_at IS NULL AND status='approved' AND user_id = ANY($2::uuid[]) AND start_date <= $4 AND end_date >= $3`, [ctx.orgId, ids, weekStarts[0], end])).rows;
  const load = weeklyLoad(ids, allocs.map((a) => ({ ...a, allocation_pct: Number(a.allocation_pct) })), leave, weekStarts);
  const conflicts: any[] = [];
  for (const u of users) for (const w of load[u.id]) if (w.over) conflicts.push({ user_id: u.id, user: u.name, week: w.week, allocated: w.allocated, available: w.available });
  const demandByContext: Record<string, number> = {};
  for (const a of allocs) demandByContext[a.context_name] = (demandByContext[a.context_name] ?? 0) + Number(a.allocation_pct);
  return { weeks: weekStarts, users: users.map((u) => ({ ...u, load: load[u.id], allocations: allocs.filter((a) => a.user_id === u.id).map((a) => ({ id: a.id, code: a.code, context_type: a.context_type, context_name: a.context_name, role_name: a.role_name, start_date: a.start_date, end_date: a.end_date, allocation_pct: a.allocation_pct, allocation_type: a.allocation_type })) })), conflicts, demand_by_context: demandByContext };
}
