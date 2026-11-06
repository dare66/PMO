/**
 * Routes closing FRS-EPMO-001 v1.1 gaps (migration 003). Requirement IDs in comments are the FRS's own IDs.
 * Every route checks permissions server-side, validates input with strict zod schemas and audits mutations
 * inside the same transaction.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { notify, usersWithRole } from '../core/notify.js';
import { getRow, listRows, requirePerm, visibilityClause } from '../resources/crud.js';
import { getResource } from '../resources/registry.js';
import { requestApproval } from '../domain/workflow.js';
import { releaseReadiness } from '../domain/release.js';
import {
  addComment, changeMetrics, clusterTexts, convertRequest, createBaseline, exportProject, findDuplicates, ocmSummary, projectSchedule,
  qualityStatus, recordGoNoGo, reverseCostEntry, scoreEntity, sprintReport, transitionRequest, weightedProgress, cpm,
} from '../domain/frs.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v);
  if (!r.success) throw badRequest('Validation failed', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  return r.data;
};
const CTX_TABLE: Record<string, string> = { project: 'projects', product: 'products', programme: 'programmes', portfolio: 'portfolios', service: 'services' };
const P = (req: FastifyRequest) => req.params as Record<string, string>;

/** Simple line diff (LCS) for document version comparison (FR-DOC-006). */
export function lineDiff(a: string, b: string) {
  const x = a.split('\n'), y = b.split('\n');
  if (x.length * y.length > 4_000_000) throw unprocessable('Documents too large to compare line by line');
  const m = x.length, n = y.length; const L = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { op: ' ' | '+' | '-'; text: string }[] = []; let i = 0, j = 0;
  while (i < m && j < n) { if (x[i] === y[j]) { out.push({ op: ' ', text: x[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: x[i++] }); else out.push({ op: '+', text: y[j++] }); }
  while (i < m) out.push({ op: '-', text: x[i++] }); while (j < n) out.push({ op: '+', text: y[j++] });
  return { added: out.filter((o) => o.op === '+').length, removed: out.filter((o) => o.op === '-').length, lines: out };
}

/** RACI rule: exactly one Accountable per item, at least one Responsible (FR-RES-008). */
export function validateRaci(rows: { name: string; item_ref: string | null; responsibility: string }[]) {
  const items = new Map<string, { a: number; r: number }>();
  for (const r of rows) { const k = r.item_ref || r.name; const v = items.get(k) ?? { a: 0, r: 0 }; if (r.responsibility === 'A') v.a++; if (r.responsibility === 'R') v.r++; items.set(k, v); }
  return [...items.entries()].map(([item, v]) => ({ item, accountable: v.a, responsible: v.r, valid: v.a === 1 && v.r >= 1, issue: v.a === 0 ? 'No accountable person' : v.a > 1 ? 'More than one accountable person' : v.r === 0 ? 'No responsible person' : null }));
}

export function registerFrsRoutes(r: FastifyInstance) {
  const C = (req: FastifyRequest): Ctx => req.ctx;

  // ================================================================ demand / intake (FR-PORT-003, FR-INIT-001..010)
  r.post('/api/requests/duplicates', async (req) => {
    const c = C(req); requirePerm(c, 'requests:read');
    const b = parse(z.object({ name: z.string().min(3).max(500), description: z.string().max(20000).nullish(), related_system: z.string().max(500).nullish(), business_process_id: uuid.nullish(), exclude_id: uuid.optional() }).strict(), req.body);
    return findDuplicates(pool, c, b);
  });
  r.get('/api/requests/:id/duplicates', async (req) => {
    const c = C(req); const rq = await getRow(c, 'requests', P(req).id);
    return findDuplicates(pool, c, { name: rq.name, description: `${rq.description ?? ''} ${rq.problem_statement ?? ''}`, related_system: rq.related_system, business_process_id: rq.business_process_id, exclude_id: rq.id });
  });
  r.post('/api/requests/:id/transition', async (req) => {
    const c = C(req); requirePerm(c, 'requests:write');
    const b = parse(z.object({ to: z.enum(['screening', 'discovery', 'proposed', 'approved', 'deferred', 'rejected', 'suspended', 'closed', 'active']), reason: z.string().max(4000).optional(), deferral_date: date.optional() }).strict(), req.body);
    if (b.to === 'approved') { requirePerm(c, 'requests:approve'); if (c.actorType !== 'user') throw forbidden('Only people can approve requests'); }
    await getRow(c, 'requests', P(req).id);
    return tx((db) => transitionRequest(db, c, P(req).id, b.to, b.reason, b.deferral_date));
  });
  r.post('/api/requests/:id/convert', async (req, reply) => {
    const c = C(req); requirePerm(c, 'requests:write'); requirePerm(c, 'projects:write');
    const b = parse(z.object({ template_project_id: uuid.nullish(), programme_id: uuid.nullish() }).strict(), req.body ?? {});
    await getRow(c, 'requests', P(req).id);
    reply.status(201);
    return tx((db) => convertRequest(db, c, P(req).id, b));
  });

  // ================================================================ configurable scoring (FR-PORT-004, PRD-017)
  const criteriaSchema = z.array(z.object({ key: z.string().regex(/^[a-z_]{2,40}$/), name: z.string().min(1).max(120), weight: z.number().min(0).max(100), direction: z.enum(['higher', 'lower']).default('higher') }).strict()).min(1).max(20);
  r.put('/api/scoring-models/:id/criteria', async (req) => {
    const c = C(req); requirePerm(c, 'scoring_models:write');
    const b = parse(z.object({ criteria: criteriaSchema }).strict(), req.body);
    if (new Set(b.criteria.map((x) => x.key)).size !== b.criteria.length) throw badRequest('Criterion keys must be unique');
    if (Math.abs(b.criteria.reduce((a, x) => a + x.weight, 0) - 100) > 0.01) throw badRequest('Criteria weights must sum to 100');
    const m = await getRow(c, 'scoring_models', P(req).id);
    return tx(async (db) => { await db.query(`UPDATE scoring_models SET criteria=$2 WHERE id=$1`, [m.id, JSON.stringify(b.criteria)]); await audit(db, c, 'scoring_criteria_set', { type: 'scoring_models', id: m.id, code: m.code }, { criteria: m.criteria }, { criteria: b.criteria }); return { ok: true, criteria: b.criteria }; });
  });
  r.get('/api/scoring-models/:id/criteria', async (req) => { const c = C(req); const m = await getRow(c, 'scoring_models', P(req).id); return (await pool.query(`SELECT criteria FROM scoring_models WHERE id=$1`, [m.id])).rows[0].criteria; });
  r.post('/api/scores', async (req, reply) => {
    const c = C(req);
    const b = parse(z.object({ model_id: uuid, entity_type: z.enum(['requests', 'ideas', 'projects']), entity_id: uuid, values: z.record(z.number().min(0).max(10)), override_total: z.number().min(0).max(100).nullish(), override_reason: z.string().max(2000).nullish() }).strict(), req.body);
    requirePerm(c, `${b.entity_type}:write`);
    reply.status(201);
    return tx((db) => scoreEntity(db, c, b));
  });
  r.get('/api/scores/:type/:id', async (req) => {
    const c = C(req); const { type, id } = P(req); if (!['requests', 'ideas', 'projects'].includes(type)) throw badRequest('Unsupported entity type');
    await getRow(c, type, id);
    return (await pool.query(`SELECT s.*, m.code AS model_code, m.name AS model_name, u.name AS scored_by_name FROM scores s JOIN scoring_models m ON m.id=s.model_id LEFT JOIN users u ON u.id=s.scored_by WHERE s.entity_type=$1 AND s.entity_id=$2 ORDER BY s.scored_at DESC`, [type, id])).rows;
  });

  // ================================================================ baselines, schedule, progress, export (FR-SCP-005, FR-SCH-003..008, FR-WRK-010, NFR-016)
  r.post('/api/projects/:id/baseline', async (req, reply) => {
    const c = C(req); requirePerm(c, 'projects:write');
    if (c.actorType !== 'user') throw forbidden('Baselines are set by people');
    const b = parse(z.object({ reason: z.string().min(3).max(2000), change_request_id: uuid.nullish() }).strict(), req.body);
    await getRow(c, 'projects', P(req).id);
    if (b.change_request_id) { const cr = await getRow(c, 'change_requests', b.change_request_id); if (!['approved', 'implemented', 'verified'].includes(cr.status)) throw unprocessable('Re-baselining requires an approved change request'); if (cr.context_id !== P(req).id) throw badRequest('Change request belongs to another context'); }
    reply.status(201);
    return tx((db) => createBaseline(db, c, P(req).id, b.reason, b.change_request_id ?? null));
  });
  r.get('/api/projects/:id/baselines', async (req) => { const c = C(req); const p = await getRow(c, 'projects', P(req).id); return (await pool.query(`SELECT b.*, u.name AS approved_by_name FROM project_baselines b LEFT JOIN users u ON u.id=b.approved_by WHERE project_id=$1 ORDER BY version DESC`, [p.id])).rows; });
  r.get('/api/projects/:id/schedule', async (req) => { const c = C(req); requirePerm(c, 'work_items:read'); return projectSchedule(pool, c, P(req).id); });
  r.get('/api/projects/:id/progress', async (req) => { const c = C(req); requirePerm(c, 'work_items:read'); return weightedProgress(pool, c, P(req).id); });
  r.get('/api/projects/:id/export', async (req, reply) => {
    const c = C(req); const out = await tx((db) => exportProject(db, c, P(req).id));
    reply.header('content-disposition', `attachment; filename="${(out.project as any).code}-export.json"`);
    return out;
  });

  r.post('/api/work-dependencies', async (req, reply) => {
    const c = C(req); requirePerm(c, 'work_items:write');
    const b = parse(z.object({ predecessor_id: uuid, successor_id: uuid, dep_type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'), lag_days: z.number().int().min(-365).max(365).default(0) }).strict(), req.body);
    if (b.predecessor_id === b.successor_id) throw badRequest('An item cannot depend on itself');
    const pred = await getRow(c, 'work_items', b.predecessor_id), succ = await getRow(c, 'work_items', b.successor_id);
    return tx(async (db) => {
      // refuse dependencies that would create a cycle within the successor's project
      if (succ.context_type === 'project' && succ.context_id) {
        const items = (await db.query(`SELECT id, code, name FROM work_items WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`, [succ.context_id])).rows;
        const deps = (await db.query(`SELECT d.* FROM work_dependencies d JOIN work_items w ON w.id=d.successor_id WHERE w.context_type='project' AND w.context_id=$1`, [succ.context_id])).rows;
        deps.push({ predecessor_id: b.predecessor_id, successor_id: b.successor_id, dep_type: b.dep_type, lag_days: b.lag_days });
        cpm(items.map((w) => ({ id: w.id, code: w.code, name: w.name, duration: 1, deps: deps.filter((d) => d.successor_id === w.id).map((d) => ({ pred: d.predecessor_id, type: d.dep_type, lag: d.lag_days })) })));
      }
      const row = (await db.query(`INSERT INTO work_dependencies (org_id, predecessor_id, successor_id, dep_type, lag_days, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (predecessor_id, successor_id) DO UPDATE SET dep_type=EXCLUDED.dep_type, lag_days=EXCLUDED.lag_days RETURNING *`,
        [c.orgId, b.predecessor_id, b.successor_id, b.dep_type, b.lag_days, c.userId])).rows[0];
      await audit(db, c, 'dependency_set', { type: 'work_items', id: succ.id, code: succ.code }, null, { predecessor: pred.code, type: b.dep_type, lag: b.lag_days });
      reply.status(201); return row;
    });
  });
  r.get('/api/work-items/:id/dependencies', async (req) => {
    const c = C(req); const w = await getRow(c, 'work_items', P(req).id);
    return (await pool.query(`SELECT d.*, p.code AS predecessor_code, p.name AS predecessor_name, s.code AS successor_code, s.name AS successor_name FROM work_dependencies d JOIN work_items p ON p.id=d.predecessor_id JOIN work_items s ON s.id=d.successor_id WHERE d.org_id=$1 AND (d.predecessor_id=$2 OR d.successor_id=$2)`, [c.orgId, w.id])).rows;
  });
  r.delete('/api/work-dependencies/:id', async (req) => {
    const c = C(req); requirePerm(c, 'work_items:write');
    return tx(async (db) => {
      const d = (await db.query(`DELETE FROM work_dependencies WHERE id=$1 AND org_id=$2 RETURNING *`, [P(req).id, c.orgId])).rows[0];
      if (!d) throw notFound('Dependency');
      await getRow(c, 'work_items', d.successor_id, db);
      await audit(db, c, 'dependency_removed', { type: 'work_items', id: d.successor_id }, d, null);
      return { ok: true };
    });
  });
  // working calendar (FR-SCH-006)
  r.get('/api/holidays', async (req) => (await pool.query(`SELECT holiday_date, name, calendar FROM holidays WHERE org_id=$1 ORDER BY holiday_date`, [C(req).orgId])).rows);
  r.put('/api/holidays', async (req) => {
    const c = C(req); requirePerm(c, 'admin:config');
    const b = parse(z.object({ calendar: z.string().regex(/^[a-z0-9_-]{1,40}$/).default('default'), holidays: z.array(z.object({ date, name: z.string().min(1).max(120) }).strict()).max(400) }).strict(), req.body);
    return tx(async (db) => {
      await db.query(`DELETE FROM holidays WHERE org_id=$1 AND calendar=$2`, [c.orgId, b.calendar]);
      for (const h of b.holidays) await db.query(`INSERT INTO holidays (org_id, holiday_date, name, calendar) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [c.orgId, h.date, h.name, b.calendar]);
      await audit(db, c, 'holidays_set', { type: 'organisations', id: c.orgId }, null, { calendar: b.calendar, count: b.holidays.length });
      return { ok: true, count: b.holidays.length };
    });
  });
  // move a work item between projects/products (FR-WRK-005 / FR-INT-005) – audited, history retained
  r.post('/api/work-items/:id/move', async (req) => {
    const c = C(req); requirePerm(c, 'work_items:write');
    const b = parse(z.object({ context_type: z.enum(['project', 'product', 'programme', 'service']), context_id: uuid, reason: z.string().min(3).max(1000) }).strict(), req.body);
    const w = await getRow(c, 'work_items', P(req).id); const target = await getRow(c, CTX_TABLE[b.context_type], b.context_id);
    return tx(async (db) => {
      await db.query(`DELETE FROM work_dependencies WHERE predecessor_id=$1 OR successor_id=$1`, [w.id]);
      await db.query(`UPDATE work_items SET context_type=$2, context_id=$3, sprint_id=NULL, parent_id=NULL, updated_by=$4 WHERE id=$1`, [w.id, b.context_type, b.context_id, c.userId]);
      await audit(db, c, 'work_item_moved', { type: 'work_items', id: w.id, code: w.code }, { context_type: w.context_type, context_id: w.context_id }, { context_type: b.context_type, context_id: b.context_id, target: target.code, reason: b.reason });
      return { ok: true, moved_to: target.code };
    });
  });

  // ================================================================ sprints (FR-SCH-012)
  r.get('/api/sprints/:id/report', async (req) => { const c = C(req); requirePerm(c, 'work_items:read'); return sprintReport(pool, c, P(req).id); });

  // ================================================================ comments, mentions & watchers (FR-WRK-006, PRD-041)
  const commentable = (t: string) => { const d = getResource(t); if (!d) throw badRequest('Unknown entity type'); return d; };
  r.get('/api/comments', async (req) => {
    const c = C(req); const q = parse(z.object({ entity_type: z.string(), entity_id: uuid }), req.query); commentable(q.entity_type); await getRow(c, q.entity_type, q.entity_id);
    return (await pool.query(`SELECT cm.id, cm.body, cm.mentions, cm.created_at, cm.edited_at, cm.created_by, u.name AS author FROM comments cm JOIN users u ON u.id=cm.created_by WHERE cm.org_id=$1 AND cm.entity_type=$2 AND cm.entity_id=$3 AND cm.deleted_at IS NULL ORDER BY cm.created_at`, [c.orgId, q.entity_type, q.entity_id])).rows;
  });
  r.post('/api/comments', async (req, reply) => {
    const c = C(req); const b = parse(z.object({ entity_type: z.string(), entity_id: uuid, body: z.string().trim().min(1).max(10000) }).strict(), req.body);
    commentable(b.entity_type); requirePerm(c, `${b.entity_type}:read`);
    reply.status(201); return tx((db) => addComment(db, c, b.entity_type, b.entity_id, b.body));
  });
  r.delete('/api/comments/:id', async (req) => {
    const c = C(req);
    return tx(async (db) => {
      const cm = (await db.query(`SELECT * FROM comments WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [P(req).id, c.orgId])).rows[0];
      if (!cm) throw notFound('Comment');
      if (cm.created_by !== c.userId && !can(c, 'admin:config')) throw forbidden('Only the author can remove a comment');
      await db.query(`UPDATE comments SET deleted_at=now() WHERE id=$1`, [cm.id]);
      await audit(db, c, 'comment_deleted', { type: cm.entity_type, id: cm.entity_id }, { body: cm.body }, null);
      return { ok: true };
    });
  });
  r.post('/api/watch', async (req) => {
    const c = C(req); const b = parse(z.object({ entity_type: z.string(), entity_id: uuid, watch: z.boolean() }).strict(), req.body);
    commentable(b.entity_type); await getRow(c, b.entity_type, b.entity_id);
    if (b.watch) await pool.query(`INSERT INTO watchers (entity_type, entity_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [b.entity_type, b.entity_id, c.userId]);
    else await pool.query(`DELETE FROM watchers WHERE entity_type=$1 AND entity_id=$2 AND user_id=$3`, [b.entity_type, b.entity_id, c.userId]);
    return { watching: b.watch };
  });

  // ================================================================ time entries (FR-RES-007, FR-FIN-005)
  r.post('/api/time-entries/:id/decide', async (req) => {
    const c = C(req); requirePerm(c, 'time_entries:approve');
    if (c.actorType !== 'user') throw forbidden('Timesheet approval is made by people');
    const b = parse(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() }).strict(), req.body);
    const t = await getRow(c, 'time_entries', P(req).id);
    if (t.user_id === c.userId) throw forbidden('Segregation of duties: you cannot approve your own time');
    if (t.status !== 'submitted') throw conflict(`Time entry is already ${t.status}`);
    if (b.decision === 'rejected' && !b.note) throw badRequest('A reason is required when rejecting');
    return tx(async (db) => {
      await db.query(`UPDATE time_entries SET status=$2, approved_by=$3, approved_at=now(), notes=COALESCE(notes,'') || CASE WHEN $4::text IS NULL THEN '' ELSE E'\n[Reviewer] ' || $4 END WHERE id=$1`, [t.id, b.decision, c.userId, b.note ?? null]);
      if (b.decision === 'approved') await db.query(`UPDATE work_items SET actual_hours = COALESCE(actual_hours,0) + $2 WHERE id=$1`, [t.work_item_id, t.hours]);
      await audit(db, c, b.decision === 'approved' ? 'approve' : 'reject', { type: 'time_entries', id: t.id, code: t.code }, { status: t.status }, { status: b.decision, note: b.note });
      await notify(db, c.orgId, [t.user_id], { kind: 'timesheet', title: `Time entry ${t.code} ${b.decision}`, body: b.note });
      return { ok: true, status: b.decision };
    });
  });

  // ================================================================ resource requests (FR-RES-004/005)
  r.post('/api/resource-allocations/:id/request-approval', async (req) => {
    const c = C(req); requirePerm(c, 'resource_allocations:write');
    const a = await getRow(c, 'resource_allocations', P(req).id);
    if (a.status !== 'requested') throw unprocessable('Only requested allocations need approval');
    return tx(async (db) => {
      if ((await db.query(`SELECT 1 FROM approvals WHERE entity_type='resource_allocations' AND entity_id=$1 AND status='pending'`, [a.id])).rowCount) throw conflict('Approval already pending');
      const over = (await db.query(`SELECT COALESCE(sum(allocation_pct),0)::numeric AS pct FROM resource_allocations WHERE user_id=$1 AND status='active' AND deleted_at IS NULL AND start_date <= $3 AND end_date >= $2`, [a.user_id, a.start_date, a.end_date])).rows[0].pct;
      const prev = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE entity_type='resource_allocations' AND entity_id=$1`, [a.id])).rows[0].r;
      const apr = await requestApproval(db, c, { entity_type: 'resource_allocations', entity_id: a.id, entity_code: a.code, approval_type: 'resource', roles: ['resource_manager'], round: prev + 1 });
      return { approvals: apr, resulting_allocation_pct: Number(over) + Number(a.allocation_pct), over_allocated: Number(over) + Number(a.allocation_pct) > 100 };
    });
  });

  // ================================================================ RACI (FR-RES-008)
  r.get('/api/raci/:type/:id', async (req) => {
    const c = C(req); const { type, id } = P(req); if (!CTX_TABLE[type]) throw badRequest('Unsupported context'); requirePerm(c, 'raci_assignments:read'); await getRow(c, CTX_TABLE[type], id);
    const rows = (await pool.query(`SELECT ra.id, ra.code, ra.name, ra.item_type, ra.item_ref, ra.responsibility, ra.user_id, u.name AS person FROM raci_assignments ra JOIN users u ON u.id=ra.user_id WHERE ra.org_id=$1 AND ra.context_type=$2 AND ra.context_id=$3 AND ra.deleted_at IS NULL AND ra.status='active' ORDER BY ra.name, u.name`, [c.orgId, type, id])).rows;
    return { assignments: rows, validation: validateRaci(rows) };
  });

  // ================================================================ announcements with acknowledgement (FR-STK-006)
  r.post('/api/announcements/:id/publish', async (req) => {
    const c = C(req); requirePerm(c, 'announcements:write');
    const b = parse(z.object({ audience_roles: z.array(z.string().regex(/^[a-z_]+$/)).max(30).default([]) }).strict(), req.body ?? {});
    const a = await getRow(c, 'announcements', P(req).id);
    if (a.status === 'published') throw conflict('Already published');
    return tx(async (db) => {
      await db.query(`UPDATE announcements SET status='published', published_at=now(), audience_roles=$2 WHERE id=$1`, [a.id, b.audience_roles]);
      const users = b.audience_roles.length ? (await db.query(`SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.org_id=$1 AND r.key = ANY($2::text[])`, [c.orgId, b.audience_roles])).rows.map((x) => x.user_id)
        : (await db.query(`SELECT id FROM users WHERE org_id=$1 AND status='active' AND deleted_at IS NULL`, [c.orgId])).rows.map((x) => x.id);
      await notify(db, c.orgId, users.filter((u: string) => u !== c.userId), { kind: 'announcement', title: a.name, body: String(a.body).slice(0, 200), link: `/r/announcements?open=${a.id}`, dedupe: `ann:${a.id}` });
      await audit(db, c, 'announcement_published', { type: 'announcements', id: a.id, code: a.code }, { status: a.status }, { status: 'published', audience: b.audience_roles, recipients: users.length });
      return { ok: true, recipients: users.length };
    });
  });
  r.post('/api/announcements/:id/ack', async (req) => {
    const c = C(req); const a = await getRow(c, 'announcements', P(req).id);
    if (a.status !== 'published') throw unprocessable('Only published announcements can be acknowledged');
    await tx(async (db) => { const ins = await db.query(`INSERT INTO announcement_acks (announcement_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, c.userId]); if (ins.rowCount) await audit(db, c, 'acknowledged', { type: 'announcements', id: a.id, code: a.code }, null, { user: c.email }); });
    return { ok: true };
  });
  r.get('/api/announcements/:id/acks', async (req) => {
    const c = C(req); requirePerm(c, 'announcements:write'); const a = await getRow(c, 'announcements', P(req).id);
    const roles: string[] = a.audience_roles ?? [];
    const audience = (await pool.query(roles.length ? `SELECT DISTINCT u.id, u.name, u.email FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.org_id=$1 AND r.key = ANY($2::text[]) AND u.status='active'` : `SELECT id, name, email FROM users WHERE org_id=$1 AND status='active' AND deleted_at IS NULL AND $2::text[] IS NOT NULL`, [c.orgId, roles])).rows;
    const acks = new Map((await pool.query(`SELECT user_id, acked_at FROM announcement_acks WHERE announcement_id=$1`, [a.id])).rows.map((x) => [x.user_id, x.acked_at]));
    const rows = audience.map((u) => ({ ...u, acked_at: acks.get(u.id) ?? null }));
    return { audience: rows.length, acknowledged: rows.filter((x) => x.acked_at).length, pct: rows.length ? Math.round((rows.filter((x) => x.acked_at).length / rows.length) * 1000) / 10 : null, rows };
  });

  // ================================================================ RAID (FR-RAID-005/006)
  r.post('/api/issues/:id/convert-to-work', async (req, reply) => {
    const c = C(req); requirePerm(c, 'issues:write'); requirePerm(c, 'work_items:write');
    const i = await getRow(c, 'issues', P(req).id);
    if (i.converted_work_item_id) throw conflict('Issue already converted');
    return tx(async (db) => {
      const code = await nextCode(db, c.orgId, 'WI');
      const w = (await db.query(`INSERT INTO work_items (org_id, code, name, description, context_type, context_id, work_type, priority, assignee_id, due_date, created_by, updated_by, owner_id, classification)
        VALUES ($1,$2,$3,$4,$5,$6,'action',$7,$8,$9,$10,$10,$10,$11) RETURNING id, code`, [c.orgId, code, `Resolve ${i.code}: ${i.name}`, i.description, i.context_type, i.context_id, ['critical', 'high', 'medium', 'low'].includes(i.severity) ? i.severity : 'medium', i.owner_id, i.due_date, c.userId, i.classification ?? 'internal'])).rows[0];
      await db.query(`UPDATE issues SET converted_work_item_id=$2, status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=$1`, [i.id, w.id]);
      await audit(db, c, 'issue_converted', { type: 'issues', id: i.id, code: i.code }, null, { work_item: w.code });
      reply.status(201); return w;
    });
  });

  // ================================================================ quality, defects waivers, change metrics, OCM (FR-QLT-*, FR-TST-*, FR-CHG-010, FR-OCM-007)
  r.get('/api/quality/:type/:id', async (req) => {
    const c = C(req); const { type, id } = P(req); if (!['project', 'product'].includes(type)) throw badRequest('Unsupported context'); requirePerm(c, 'defects:read'); await getRow(c, CTX_TABLE[type], id);
    return qualityStatus(pool, c, type, id);
  });
  r.post('/api/defects/:id/request-waiver', async (req) => {
    const c = C(req); requirePerm(c, 'defects:write');
    const b = parse(z.object({ disposition: z.enum(['waived', 'known_error']), reason: z.string().min(10).max(4000) }).strict(), req.body);
    const d = await getRow(c, 'defects', P(req).id);
    if (['closed', 'waived', 'known_error'].includes(d.status)) throw conflict(`Defect is ${d.status}`);
    return tx(async (db) => {
      if ((await db.query(`SELECT 1 FROM approvals WHERE entity_type='defects' AND entity_id=$1 AND status='pending'`, [d.id])).rowCount) throw conflict('Approval already pending');
      await db.query(`UPDATE defects SET waiver_reason=$2 WHERE id=$1`, [d.id, `[${b.disposition}] ${b.reason}`]);
      const prev = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE entity_type='defects' AND entity_id=$1`, [d.id])).rows[0].r;
      const roles = ['critical', 'high'].includes(d.severity) ? ['pmo_manager', 'product_manager'] : ['pmo_manager'];
      return requestApproval(db, c, { entity_type: 'defects', entity_id: d.id, entity_code: d.code, approval_type: 'waiver', roles, round: prev + 1 });
    });
  });
  r.get('/api/change-metrics', async (req) => {
    const c = C(req); requirePerm(c, 'change_requests:read');
    const q = parse(z.object({ context_type: z.string().optional(), context_id: uuid.optional() }), req.query);
    if (q.context_type && q.context_id) { if (!CTX_TABLE[q.context_type]) throw badRequest('Unsupported context'); await getRow(c, CTX_TABLE[q.context_type], q.context_id); }
    return changeMetrics(pool, c, q.context_type, q.context_id);
  });
  r.get('/api/ocm/:type/:id', async (req) => {
    const c = C(req); const { type, id } = P(req); if (!['project', 'product', 'programme'].includes(type)) throw badRequest('Unsupported context'); requirePerm(c, 'ocm_impacts:read'); await getRow(c, CTX_TABLE[type], id);
    return ocmSummary(pool, c, type, id);
  });

  // ================================================================ finance controls (FR-FIN-006/014)
  r.get('/api/finance/periods', async (req) => { const c = C(req); requirePerm(c, 'budgets:read'); return (await pool.query(`SELECT fp.*, lu.name AS locked_by_name, su.name AS signed_off_by_name FROM finance_periods fp LEFT JOIN users lu ON lu.id=fp.locked_by LEFT JOIN users su ON su.id=fp.signed_off_by WHERE fp.org_id=$1 ORDER BY period DESC`, [c.orgId])).rows; });
  r.post('/api/finance/periods/:period/lock', async (req) => {
    const c = C(req); requirePerm(c, 'finance:lock');
    if (c.actorType !== 'user') throw forbidden('Finance periods are locked by people');
    const period = parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM'), P(req).period);
    const b = parse(z.object({ locked: z.boolean(), sign_off: z.boolean().default(false), reason: z.string().max(1000).optional() }).strict(), req.body);
    if (!b.locked && !b.reason) throw badRequest('A reason is required to reopen a period');
    return tx(async (db) => {
      const before = (await db.query(`SELECT * FROM finance_periods WHERE org_id=$1 AND period=$2 FOR UPDATE`, [c.orgId, period])).rows[0] ?? null;
      if (before?.signed_off_at && !b.locked) throw unprocessable('A signed-off period cannot be reopened; post corrections in an open period');
      const row = (await db.query(`INSERT INTO finance_periods (org_id, period, locked, locked_by, locked_at, signed_off_by, signed_off_at) VALUES ($1,$2,$3,$4,CASE WHEN $3 THEN now() END,CASE WHEN $5 THEN $4::uuid END,CASE WHEN $5 THEN now() END)
        ON CONFLICT (org_id, period) DO UPDATE SET locked=$3, locked_by=$4, locked_at=CASE WHEN $3 THEN now() ELSE NULL END, signed_off_by=COALESCE(finance_periods.signed_off_by, CASE WHEN $5 THEN $4::uuid END), signed_off_at=COALESCE(finance_periods.signed_off_at, CASE WHEN $5 THEN now() END) RETURNING *`,
      [c.orgId, period, b.locked, c.userId, b.sign_off && b.locked])).rows[0];
      await audit(db, c, b.locked ? (b.sign_off ? 'period_signed_off' : 'period_locked') : 'period_reopened', { type: 'finance_periods', id: c.orgId, code: period }, before, { ...row, reason: b.reason });
      return row;
    });
  });
  r.post('/api/cost-entries/:id/reverse', async (req, reply) => {
    const c = C(req); requirePerm(c, 'cost_entries:write');
    const b = parse(z.object({ reason: z.string().min(5).max(1000), post_date: date }).strict(), req.body);
    await getRow(c, 'cost_entries', P(req).id);
    reply.status(201); return tx((db) => reverseCostEntry(db, c, P(req).id, b.reason, b.post_date));
  });

  // ================================================================ procurement (FR-PROC-004/007)
  r.post('/api/tenders/:id/coi', async (req, reply) => {
    const c = C(req); const t = await getRow(c, 'tenders', P(req).id);
    const b = parse(z.object({ has_conflict: z.boolean(), details: z.string().max(4000).optional() }).strict(), req.body);
    if (b.has_conflict && !b.details) throw badRequest('Describe the conflict');
    return tx(async (db) => {
      const row = (await db.query(`INSERT INTO coi_declarations (org_id, tender_id, user_id, has_conflict, details) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tender_id, user_id) DO UPDATE SET has_conflict=EXCLUDED.has_conflict, details=EXCLUDED.details, declared_at=now() RETURNING *`, [c.orgId, t.id, c.userId, b.has_conflict, b.details ?? null])).rows[0];
      await audit(db, c, 'coi_declared', { type: 'tenders', id: t.id, code: t.code }, null, { has_conflict: b.has_conflict });
      if (b.has_conflict) await notify(db, c.orgId, await usersWithRole(db, c.orgId, 'procurement'), { kind: 'coi', title: `Conflict of interest declared on ${t.code}`, body: `${c.name}: ${b.details}` });
      reply.status(201); return row;
    });
  });
  r.get('/api/tenders/:id/coi', async (req) => { const c = C(req); requirePerm(c, 'tenders:write'); const t = await getRow(c, 'tenders', P(req).id); return (await pool.query(`SELECT d.*, u.name FROM coi_declarations d JOIN users u ON u.id=d.user_id WHERE tender_id=$1 ORDER BY declared_at`, [t.id])).rows; });
  r.post('/api/contract-milestones/:id/accept', async (req) => {
    const c = C(req); requirePerm(c, 'contract_milestones:approve');
    if (c.actorType !== 'user') throw forbidden('Deliverable acceptance is made by people');
    const b = parse(z.object({ decision: z.enum(['accepted', 'rejected']), note: z.string().max(2000).optional() }).strict(), req.body);
    const m = await getRow(c, 'contract_milestones', P(req).id);
    if (!['planned', 'delivered'].includes(m.status)) throw conflict(`Milestone is ${m.status}`);
    if (b.decision === 'rejected' && !b.note) throw badRequest('A reason is required when rejecting');
    return tx(async (db) => {
      await db.query(`UPDATE contract_milestones SET status=$2, accepted_on=CASE WHEN $2='accepted' THEN current_date END, accepted_by=CASE WHEN $2='accepted' THEN $3::uuid END WHERE id=$1`, [m.id, b.decision, c.userId]);
      await audit(db, c, b.decision === 'accepted' ? 'deliverable_accepted' : 'deliverable_rejected', { type: 'contract_milestones', id: m.id, code: m.code }, { status: m.status }, { status: b.decision, note: b.note });
      return { ok: true, status: b.decision };
    });
  });

  // ================================================================ BIA history (FR-BIA-010, §8.2)
  r.get('/api/bia/:id/versions', async (req) => { const c = C(req); const b = await getRow(c, 'bia_assessments', P(req).id); return (await pool.query(`SELECT v.id, v.version, v.approved_at, v.created_at, u.name AS approved_by_name, v.snapshot FROM bia_versions v LEFT JOIN users u ON u.id=v.approved_by WHERE bia_id=$1 ORDER BY version DESC`, [b.id])).rows; });

  // ================================================================ documents: lock, compare, retention, acknowledgement (FR-DOC-004..010)
  r.post('/api/documents/:id/checkout', async (req) => {
    const c = C(req); requirePerm(c, 'documents:write'); const d = await getRow(c, 'documents', P(req).id);
    return tx(async (db) => {
      const cur = (await db.query(`SELECT checked_out_by FROM documents WHERE id=$1 FOR UPDATE`, [d.id])).rows[0];
      if (cur.checked_out_by && cur.checked_out_by !== c.userId) throw conflict('Document is checked out by another user');
      await db.query(`UPDATE documents SET checked_out_by=$2, checked_out_at=now() WHERE id=$1`, [d.id, c.userId]);
      await audit(db, c, 'document_checkout', { type: 'documents', id: d.id, code: d.code }, null, { by: c.email });
      return { ok: true };
    });
  });
  r.post('/api/documents/:id/checkin', async (req) => {
    const c = C(req); requirePerm(c, 'documents:write');
    const b = parse(z.object({ content: z.string().min(1).max(500000).optional(), change_note: z.string().max(500).optional(), discard: z.boolean().default(false) }).strict(), req.body ?? {});
    const d = await getRow(c, 'documents', P(req).id);
    return tx(async (db) => {
      const cur = (await db.query(`SELECT checked_out_by, current_version FROM documents WHERE id=$1 FOR UPDATE`, [d.id])).rows[0];
      if (cur.checked_out_by !== c.userId && !can(c, 'documents:admin')) throw conflict('You do not hold the lock on this document');
      let version = cur.current_version;
      if (b.content && !b.discard) {
        version++;
        await db.query(`INSERT INTO document_versions (org_id, document_id, version, content, generated, created_by, change_note) VALUES ($1,$2,$3,$4,false,$5,$6)`, [c.orgId, d.id, version, b.content, c.userId, b.change_note ?? null]);
        await db.query(`UPDATE documents SET current_version=$2, status='draft' WHERE id=$1`, [d.id, version]);
      }
      await db.query(`UPDATE documents SET checked_out_by=NULL, checked_out_at=NULL WHERE id=$1`, [d.id]);
      await audit(db, c, 'document_checkin', { type: 'documents', id: d.id, code: d.code }, { version: cur.current_version }, { version, discarded: b.discard, forced: cur.checked_out_by !== c.userId });
      return { ok: true, version };
    });
  });
  r.get('/api/documents/:id/compare', async (req) => {
    const c = C(req); const d = await getRow(c, 'documents', P(req).id);
    const q = parse(z.object({ from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) }), req.query);
    const vs = (await pool.query(`SELECT version, content FROM document_versions WHERE document_id=$1 AND version = ANY($2::int[])`, [d.id, [q.from, q.to]])).rows;
    const a = vs.find((v) => v.version === q.from), b = vs.find((v) => v.version === q.to);
    if (!a || !b) throw notFound('Version');
    return { from: q.from, to: q.to, ...lineDiff(a.content, b.content) };
  });
  r.put('/api/documents/:id/retention', async (req) => {
    const c = C(req); requirePerm(c, 'documents:admin');
    const b = parse(z.object({ retention_category: z.string().max(80).nullable().optional(), retention_until: date.nullable().optional(), legal_hold: z.boolean().optional(), reason: z.string().min(3).max(1000) }).strict(), req.body);
    const d = await getRow(c, 'documents', P(req).id);
    return tx(async (db) => {
      await db.query(`UPDATE documents SET retention_category=COALESCE($2, retention_category), retention_until=CASE WHEN $5 THEN $3::date ELSE retention_until END, legal_hold=COALESCE($4, legal_hold) WHERE id=$1`, [d.id, b.retention_category ?? null, b.retention_until ?? null, b.legal_hold ?? null, b.retention_until !== undefined]);
      await audit(db, c, 'retention_set', { type: 'documents', id: d.id, code: d.code }, { retention_category: d.retention_category, retention_until: d.retention_until, legal_hold: d.legal_hold }, b);
      return { ok: true };
    });
  });
  r.post('/api/documents/:id/ack', async (req) => {
    const c = C(req); const d = await getRow(c, 'documents', P(req).id);
    if (d.status !== 'approved') throw unprocessable('Only approved documents can be acknowledged');
    await tx(async (db) => { const ins = await db.query(`INSERT INTO document_acks (document_id, version, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [d.id, d.current_version, c.userId]); if (ins.rowCount) await audit(db, c, 'acknowledged', { type: 'documents', id: d.id, code: d.code }, null, { version: d.current_version }); });
    return { ok: true, version: d.current_version };
  });
  r.get('/api/documents/:id/acks', async (req) => { const c = C(req); const d = await getRow(c, 'documents', P(req).id); return (await pool.query(`SELECT a.version, a.acked_at, u.name, u.email FROM document_acks a JOIN users u ON u.id=a.user_id WHERE document_id=$1 ORDER BY acked_at DESC`, [d.id])).rows; });

  // ================================================================ releases: cutover, go/no-go, service acceptance, hypercare (FR-OPS-004..010, AC-11)
  r.get('/api/releases/:id/cutover', async (req) => {
    const c = C(req); const rel = await getRow(c, 'releases', P(req).id);
    const steps = (await pool.query(`SELECT s.*, u.name AS step_owner FROM cutover_steps s LEFT JOIN users u ON u.id=s.step_owner_id WHERE release_id=$1 AND s.deleted_at IS NULL ORDER BY seq`, [rel.id])).rows;
    return { steps, total: steps.length, done: steps.filter((s) => s.status === 'done').length, failed: steps.filter((s) => s.status === 'failed').length, complete: steps.length > 0 && steps.every((s) => ['done', 'skipped'].includes(s.status)) };
  });
  r.post('/api/releases/:id/go-no-go', async (req) => {
    const c = C(req); requirePerm(c, 'releases:approve');
    const b = parse(z.object({ decision: z.enum(['go', 'no_go', 'go_with_conditions']), conditions: z.string().max(4000).optional(), exception_justification: z.string().max(4000).optional() }).strict(), req.body);
    const readiness = await releaseReadiness(pool, c, P(req).id);
    return tx((db) => recordGoNoGo(db, c, P(req).id, b, readiness));
  });
  r.post('/api/releases/:id/service-acceptance', async (req) => {
    const c = C(req); requirePerm(c, 'releases:approve');
    if (c.actorType !== 'user') throw forbidden('Service acceptance is made by people');
    const b = parse(z.object({ residual_risks: z.string().max(4000).optional(), accept: z.literal(true) }).strict(), req.body);
    const rel = await getRow(c, 'releases', P(req).id);
    if (!['deployed', 'hypercare'].includes(rel.status)) throw unprocessable('Service acceptance follows deployment');
    const open = (await pool.query(`SELECT count(*)::int n FROM defects WHERE release_id=$1 AND severity IN ('critical','high') AND status NOT IN ('closed','waived','known_error','deferred') AND deleted_at IS NULL`, [rel.id])).rows[0].n;
    if (open && !b.residual_risks) throw unprocessable(`${open} open critical/high defect(s); record them as residual risks to accept`);
    return tx(async (db) => {
      await db.query(`UPDATE releases SET service_accepted_by=$2, residual_risks=$3, operational_acceptance=true WHERE id=$1`, [rel.id, c.userId, b.residual_risks ?? null]);
      await audit(db, c, 'service_accepted', { type: 'releases', id: rel.id, code: rel.code }, null, { residual_risks: b.residual_risks ?? null });
      return { ok: true };
    });
  });
  r.post('/api/releases/:id/hypercare', async (req) => {
    const c = C(req); requirePerm(c, 'releases:write');
    const b = parse(z.object({ action: z.enum(['start', 'exit']), note: z.string().max(2000).optional() }).strict(), req.body);
    const rel = await getRow(c, 'releases', P(req).id);
    if (b.action === 'start' && rel.status !== 'deployed') throw unprocessable('Hypercare starts after deployment');
    if (b.action === 'exit') {
      if (rel.status !== 'hypercare') throw unprocessable('Release is not in hypercare');
      if (!rel.hypercare_exit_criteria?.trim()) throw unprocessable('Define hypercare exit criteria first');
      if (!rel.service_accepted_by) throw unprocessable('Service acceptance is required before exiting hypercare');
      if (!b.note) throw badRequest('Record evidence that the exit criteria are met');
    }
    return tx(async (db) => {
      const to = b.action === 'start' ? 'hypercare' : 'closed';
      await db.query(`UPDATE releases SET status=$2 WHERE id=$1`, [rel.id, to]);
      await audit(db, c, `hypercare_${b.action}`, { type: 'releases', id: rel.id, code: rel.code }, { status: rel.status }, { status: to, note: b.note });
      return { ok: true, status: to };
    });
  });

  // ================================================================ product metrics & roadmap versions (PRD-020/030/034)
  r.post('/api/product-metrics/:id/values', async (req, reply) => {
    const c = C(req); requirePerm(c, 'product_metrics:write');
    const b = parse(z.object({ values: z.array(z.object({ period_date: date, value: z.number().finite(), segment: z.string().max(80).default('all') }).strict()).min(1).max(500) }).strict(), req.body);
    const m = await getRow(c, 'product_metrics', P(req).id);
    return tx(async (db) => {
      for (const v of b.values) await db.query(`INSERT INTO metric_values (org_id, metric_id, period_date, value, segment, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (metric_id, period_date, segment) DO UPDATE SET value=EXCLUDED.value, recorded_by=EXCLUDED.recorded_by, recorded_at=now()`, [c.orgId, m.id, v.period_date, v.value, v.segment, c.userId]);
      await audit(db, c, 'metric_values_recorded', { type: 'product_metrics', id: m.id, code: m.code }, null, { count: b.values.length });
      reply.status(201); return { ok: true, count: b.values.length };
    });
  });
  r.get('/api/product-metrics/:id/series', async (req) => {
    const c = C(req); const m = await getRow(c, 'product_metrics', P(req).id);
    const rows = (await pool.query(`SELECT period_date, value::float AS value, segment FROM metric_values WHERE metric_id=$1 ORDER BY period_date`, [m.id])).rows;
    const latest = rows.filter((x) => x.segment === 'all').at(-1) ?? null;
    const target = m.target_value === null ? null : Number(m.target_value);
    const onTrack = latest && target !== null ? (m.direction === 'lower_is_better' ? latest.value <= target : latest.value >= target) : null;
    return { metric: m, series: rows, latest, target, on_track: onTrack, note: rows.length ? undefined : 'No values recorded – status unknown' };
  });
  r.get('/api/products/:id/health', async (req) => {
    const c = C(req); const p = await getRow(c, 'products', P(req).id);
    const metrics = (await pool.query(`SELECT m.id, m.code, m.name, m.target_value::float AS target, m.direction, (SELECT value::float FROM metric_values v WHERE v.metric_id=m.id AND v.segment='all' ORDER BY period_date DESC LIMIT 1) AS latest FROM product_metrics m WHERE m.product_id=$1 AND m.deleted_at IS NULL AND m.status='active'`, [p.id])).rows;
    const scored = metrics.map((m) => ({ ...m, on_track: m.latest === null || m.target === null ? null : m.direction === 'lower_is_better' ? m.latest <= m.target : m.latest >= m.target }));
    const known = scored.filter((m) => m.on_track !== null);
    const debt = (await pool.query(`SELECT count(*) FILTER (WHERE risk IN ('critical','high'))::int high, count(*)::int n FROM tech_debt_items WHERE product_id=$1 AND status NOT IN ('resolved') AND deleted_at IS NULL`, [p.id])).rows[0];
    const defects = (await pool.query(`SELECT count(*)::int n FROM defects WHERE context_type='product' AND context_id=$1 AND severity IN ('critical','high') AND status NOT IN ('closed','waived','known_error','deferred') AND deleted_at IS NULL`, [p.id])).rows[0].n;
    const pct = known.length ? known.filter((m) => m.on_track).length / known.length : null;
    const overall = pct === null ? 'unknown' : pct >= 0.8 && defects === 0 && debt.high === 0 ? 'green' : pct >= 0.5 ? 'amber' : 'red';
    return { product: { id: p.id, code: p.code, name: p.name }, overall, metrics: scored, metrics_on_track_pct: pct === null ? null : Math.round(pct * 1000) / 10, open_high_defects: defects, tech_debt: debt,
      data_gaps: [...(metrics.length ? [] : ['No product metrics defined']), ...scored.filter((m) => m.on_track === null).map((m) => `${m.code}: no value or target`)] };
  });
  r.post('/api/products/:id/roadmap-versions', async (req, reply) => {
    const c = C(req); requirePerm(c, 'roadmap_items:write');
    const b = parse(z.object({ rationale: z.string().min(5).max(4000) }).strict(), req.body);
    const p = await getRow(c, 'products', P(req).id);
    return tx(async (db) => {
      const items = (await db.query(`SELECT code, name, lane, status, start_date, end_date, confidence FROM roadmap_items WHERE product_id=$1 AND deleted_at IS NULL ORDER BY start_date NULLS LAST, code`, [p.id])).rows;
      const v = (await db.query(`SELECT COALESCE(max(version),0)+1 AS v FROM roadmap_versions WHERE product_id=$1`, [p.id])).rows[0].v;
      const row = (await db.query(`INSERT INTO roadmap_versions (org_id, product_id, version, snapshot, rationale, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, version, created_at`, [c.orgId, p.id, v, JSON.stringify(items), b.rationale, c.userId])).rows[0];
      await audit(db, c, 'roadmap_versioned', { type: 'products', id: p.id, code: p.code }, null, { version: v, items: items.length, rationale: b.rationale });
      reply.status(201); return row;
    });
  });
  r.get('/api/products/:id/roadmap-versions', async (req) => { const c = C(req); const p = await getRow(c, 'products', P(req).id); return (await pool.query(`SELECT rv.*, u.name AS created_by_name FROM roadmap_versions rv LEFT JOIN users u ON u.id=rv.created_by WHERE product_id=$1 ORDER BY version DESC`, [p.id])).rows; });

  // ================================================================ AI-assisted idea clustering (PRD-045) – analysis only, never writes
  r.get('/api/ai/idea-clusters', async (req) => {
    const c = C(req); requirePerm(c, 'ideas:read');
    const q = parse(z.object({ product_id: uuid.optional(), threshold: z.coerce.number().min(0.05).max(0.9).default(0.2) }), req.query);
    const vis = visibilityClause(c, 'i', q.product_id ? 3 : 2);
    const rows = (await pool.query(`SELECT i.id, i.code, i.name || ' ' || coalesce(i.description,'') || ' ' || coalesce(i.problem_statement,'') AS text FROM ideas i WHERE i.org_id=$1 AND i.deleted_at IS NULL${q.product_id ? ' AND i.product_id=$2' : ''}${vis.sql} LIMIT 500`, [c.orgId, ...(q.product_id ? [q.product_id] : []), ...vis.params])).rows;
    return { provider: 'local-rules', disclaimer: 'Suggested themes for human review. Nothing has been changed.', clusters: clusterTexts(rows, q.threshold) };
  });

  // ================================================================ organisation locale & time zone (NFR-013)
  r.get('/api/org/settings', async (req) => (await pool.query(`SELECT id, name, settings FROM organisations WHERE id=$1`, [C(req).orgId])).rows[0]);
  r.put('/api/org/settings', async (req) => {
    const c = C(req); requirePerm(c, 'admin:config');
    const b = parse(z.object({ locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(), time_zone: z.string().max(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown IANA time zone').optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), fiscal_year_start_month: z.number().int().min(1).max(12).optional(), date_format: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']).optional() }).strict(), req.body);
    return tx(async (db) => {
      const before = (await db.query(`SELECT settings FROM organisations WHERE id=$1 FOR UPDATE`, [c.orgId])).rows[0].settings ?? {};
      const after = { ...before, ...b };
      await db.query(`UPDATE organisations SET settings=$2 WHERE id=$1`, [c.orgId, JSON.stringify(after)]);
      await audit(db, c, 'org_settings', { type: 'organisations', id: c.orgId }, before, after);
      return after;
    });
  });

  // ================================================================ lessons-learned search for new initiatives (FR-CLO-004)
  r.get('/api/lessons/relevant', async (req) => {
    const c = C(req); requirePerm(c, 'lessons:read');
    const q = parse(z.object({ q: z.string().min(2).max(500) }), req.query);
    const res = await listRows(c, 'lessons', { q: q.q, pageSize: '20' });
    return res.data.filter((l: any) => l.reusable !== false);
  });

  void can;
}
