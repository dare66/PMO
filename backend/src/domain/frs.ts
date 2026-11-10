/**
 * Domain logic closing FRS-EPMO-001 v1.1 gaps (migration 003). Requirement IDs are the FRS's own.
 */
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { notify, usersWithRole } from '../core/notify.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { createRow, getRow } from '../resources/crud.js';

// ------------------------------------------------------------------ text similarity (FR-INIT-003, PRD-006)
const STOP = new Set('the a an and or of to in for on with by from is are be this that new project request system process improve improvement'.split(' '));
export const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));
export function jaccard(a: Set<string>, b: Set<string>) { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }

/** Possible duplicates among requests, projects (and ideas) by title/description/system/process similarity. */
export async function findDuplicates(db: Db, ctx: Ctx, input: { name: string; description?: string | null; related_system?: string | null; business_process_id?: string | null; exclude_id?: string }) {
  const t = tokens(`${input.name} ${input.description ?? ''} ${input.related_system ?? ''}`);
  const cands = (await db.query(`SELECT 'requests' AS resource, id, code, name, coalesce(description,'') || ' ' || coalesce(problem_statement,'') || ' ' || coalesce(related_system,'') AS text, business_process_id, pipeline_stage AS state FROM requests WHERE org_id=$1 AND deleted_at IS NULL AND classification <> 'restricted'
     UNION ALL SELECT 'projects', id, code, name, coalesce(description,''), NULL, status FROM projects WHERE org_id=$1 AND deleted_at IS NULL AND classification <> 'restricted'
     UNION ALL SELECT 'ideas', id, code, name, coalesce(description,'') || ' ' || coalesce(problem_statement,''), NULL, stage FROM ideas WHERE org_id=$1 AND deleted_at IS NULL AND classification <> 'restricted'`, [ctx.orgId])).rows;
  return cands.filter((c) => c.id !== input.exclude_id).map((c) => {
    let score = jaccard(t, tokens(`${c.name} ${c.text}`)) + jaccard(tokens(input.name), tokens(c.name)) * 0.5;
    if (input.business_process_id && c.business_process_id === input.business_process_id) score += 0.3;
    return { resource: c.resource, id: c.id, code: c.code, name: c.name, state: c.state, similarity: Math.round(Math.min(1, score) * 100) / 100 };
  }).filter((c) => c.similarity >= 0.25).sort((a, b) => b.similarity - a.similarity).slice(0, 8);
}

// ------------------------------------------------------------------ intake pipeline (FR-PORT-003, FR-INIT-005)
const PIPELINE: Record<string, string[]> = {
  submitted: ['screening', 'rejected', 'deferred'], screening: ['discovery', 'proposed', 'rejected', 'deferred'], discovery: ['proposed', 'rejected', 'deferred'],
  proposed: ['approved', 'rejected', 'deferred'], deferred: ['screening', 'rejected'], approved: ['active', 'deferred'], active: ['suspended', 'closed'], suspended: ['active', 'closed'], rejected: [], closed: [],
};
export async function transitionRequest(db: Db, ctx: Ctx, id: string, to: string, reason: string | undefined, deferralDate?: string) {
  const r = (await db.query(`SELECT * FROM requests WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [id, ctx.orgId])).rows[0];
  if (!r) throw notFound('Request');
  if (!PIPELINE[r.pipeline_stage]?.includes(to)) throw unprocessable(`Cannot move from ${r.pipeline_stage} to ${to}`);
  if (['rejected', 'deferred', 'suspended'].includes(to) && !reason) throw badRequest('A reason is required');
  if (to === 'deferred' && !deferralDate) throw badRequest('A deferral review date is required');
  if (to === 'approved' && ctx.userId === r.requester_id) throw forbidden('Segregation of duties: the requester cannot approve their own request');
  if (to === 'active' && !r.converted_project_id) throw unprocessable('Convert the request into a project to activate it');
  await db.query(`UPDATE requests SET pipeline_stage=$2, decision_reason=COALESCE($3, decision_reason), deferral_date=$4, status=CASE WHEN $2 IN ('approved','rejected','deferred','closed') THEN 'decided' ELSE 'in_review' END WHERE id=$1`, [id, to, reason ?? null, deferralDate ?? null]);
  await audit(db, ctx, 'transition', { type: 'requests', id, code: r.code }, { pipeline_stage: r.pipeline_stage }, { pipeline_stage: to, reason });
  if (r.requester_id) await notify(db, ctx.orgId, [r.requester_id], { kind: 'request_update', title: `${r.code} moved to ${to.replace(/_/g, ' ')}`, body: reason, link: `/r/requests?open=${id}` });
  return { from: r.pipeline_stage, to };
}

export async function convertRequest(db: Db, ctx: Ctx, id: string, opts: { template_project_id?: string | null; programme_id?: string | null }) {
  const r = (await db.query(`SELECT * FROM requests WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [id, ctx.orgId])).rows[0];
  if (!r) throw notFound('Request');
  if (r.pipeline_stage !== 'approved') throw unprocessable('Only approved requests can be converted');
  if (r.converted_project_id) throw conflict('Request already converted');
  const tpl = opts.template_project_id ? await getRow(ctx, 'projects', opts.template_project_id, db) : null;
  const typeMap: Record<string, string> = { new_project: 'technology', enhancement: 'product_development', operational_improvement: 'operational_improvement', compliance: 'regulatory', infrastructure: 'infrastructure', product: 'product_development', emergency: 'technology' };
  const p = await createRow(ctx, 'projects', {
    name: r.name, description: r.problem_statement ?? r.description, portfolio_id: r.portfolio_id ?? tpl?.portfolio_id ?? null, programme_id: opts.programme_id ?? null, department_id: r.department_id,
    sponsor_id: r.sponsor_id, project_type: typeMap[r.request_type] ?? 'technology', delivery_approach: tpl?.delivery_approach ?? 'hybrid', scope_statement: tpl?.scope_statement ?? null,
    success_criteria: r.proposed_outcome, end_date: r.target_date, criticality: r.urgency === 'critical' ? 'critical' : r.urgency === 'high' ? 'high' : 'medium',
  }, { db });
  await db.query(`UPDATE projects SET source_request_id=$2, lifecycle_stage='initiation' WHERE id=$1`, [p.id, id]);
  if (r.product_id) await db.query(`INSERT INTO project_products (project_id, product_id, relationship) VALUES ($1,$2,'enhances') ON CONFLICT DO NOTHING`, [p.id, r.product_id]);
  if (tpl) { // FR-INIT-010 create from template: copy milestones (relative) and deliverables
    const ms = (await db.query(`SELECT * FROM milestones WHERE project_id=$1 AND deleted_at IS NULL`, [tpl.id])).rows;
    for (const m of ms) await db.query(`INSERT INTO milestones (org_id, code, name, description, project_id, due_date, is_gate, created_by, updated_by, owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$8)`,
      [ctx.orgId, await nextCode(db, ctx.orgId, 'MS'), m.name, m.description, p.id, new Date(Date.now() + Math.max(14, Math.round((Date.parse(m.due_date) - Date.parse(tpl.start_date ?? m.due_date)) / 864e5)) * 864e5).toISOString().slice(0, 10), m.is_gate, ctx.userId]);
  }
  await db.query(`UPDATE requests SET converted_project_id=$2, pipeline_stage='active', status='decided' WHERE id=$1`, [id, p.id]);
  await audit(db, ctx, 'request_converted', { type: 'requests', id, code: r.code }, null, { project: p.code, template: tpl?.code ?? null });
  return p;
}

// ------------------------------------------------------------------ configurable scoring (FR-PORT-004, PRD-017)
export function computeScore(criteria: { key: string; name: string; weight: number; direction?: 'higher' | 'lower' }[], values: Record<string, number>) {
  const breakdown = criteria.map((c) => {
    const v = values[c.key];
    if (v === undefined || v === null || Number.isNaN(v)) return { key: c.key, name: c.name, weight: c.weight, value: null, points: null };
    const norm = Math.max(0, Math.min(10, v)) / 10;
    const pts = (c.direction === 'lower' ? 1 - norm : norm) * c.weight;
    return { key: c.key, name: c.name, weight: c.weight, value: v, points: Math.round(pts * 100) / 100 };
  });
  const complete = breakdown.every((b) => b.points !== null);
  const wsum = criteria.reduce((a, c) => a + c.weight, 0);
  const total = complete && wsum > 0 ? Math.round((breakdown.reduce((a, b) => a + (b.points ?? 0), 0) / wsum) * 10000) / 100 : null;
  return { breakdown, total, complete };
}

export async function scoreEntity(db: Db, ctx: Ctx, input: { model_id: string; entity_type: string; entity_id: string; values: Record<string, number>; override_total?: number | null; override_reason?: string | null }) {
  const m = (await db.query(`SELECT * FROM scoring_models WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL AND status='active'`, [input.model_id, ctx.orgId])).rows[0];
  if (!m) throw notFound('Scoring model');
  if (m.applies_to !== input.entity_type) throw badRequest(`Model applies to ${m.applies_to}`);
  const ent = await getRow(ctx, input.entity_type, input.entity_id, db);
  if (input.override_total !== undefined && input.override_total !== null && !input.override_reason?.trim()) throw badRequest('An override requires a reason (it is audited)');
  const s = computeScore(m.criteria, input.values);
  const final = input.override_total ?? s.total;
  const row = (await db.query(`INSERT INTO scores (org_id, model_id, entity_type, entity_id, input_values, breakdown, computed_total, override_total, override_reason, scored_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [ctx.orgId, m.id, input.entity_type, input.entity_id, JSON.stringify(input.values), JSON.stringify(s.breakdown), s.total, input.override_total ?? null, input.override_reason ?? null, ctx.userId])).rows[0];
  if (input.entity_type === 'requests') await db.query(`UPDATE requests SET score=$2 WHERE id=$1`, [input.entity_id, final]);
  if (input.entity_type === 'projects' && final !== null) await db.query(`UPDATE projects SET strategic_score=$2 WHERE id=$1`, [input.entity_id, Math.round(final)]);
  await audit(db, ctx, input.override_total != null ? 'score_overridden' : 'scored', { type: input.entity_type, id: ent.id, code: ent.code }, null, { model: m.code, total: s.total, override: input.override_total ?? null, reason: input.override_reason ?? null });
  return { ...row, explain: s };
}

// ------------------------------------------------------------------ baselines (FR-SCP-005, FR-SCH-008, FR-CHG-006, AC-03)
export async function snapshotProject(db: Db, projectId: string) {
  const p = (await db.query(`SELECT * FROM projects WHERE id=$1`, [projectId])).rows[0];
  const ms = (await db.query(`SELECT code, name, due_date, is_gate FROM milestones WHERE project_id=$1 AND deleted_at IS NULL ORDER BY due_date`, [projectId])).rows;
  const bud = (await db.query(`SELECT code, name, amount, currency, expenditure_type, budget_type FROM budgets WHERE context_type='project' AND context_id=$1 AND status='approved' AND deleted_at IS NULL`, [projectId])).rows;
  const scope = (await db.query(`SELECT code, name, status FROM deliverables WHERE project_id=$1 AND deleted_at IS NULL ORDER BY code`, [projectId])).rows;
  return { start: p.start_date, finish: p.end_date, budget_at_completion: p.budget_at_completion, scope_statement: p.scope_statement, milestones: ms, budgets: bud, deliverables: scope };
}
export async function createBaseline(db: Db, ctx: Ctx, projectId: string, reason: string, changeRequestId: string | null) {
  const p = (await db.query(`SELECT * FROM projects WHERE id=$1 AND org_id=$2 FOR UPDATE`, [projectId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Project');
  if (!p.start_date || !p.end_date || p.budget_at_completion === null) throw unprocessable('Start, finish and budget at completion are required to baseline');
  if (p.baseline_version > 0 && !changeRequestId) throw unprocessable('Baseline exists; re-baselining requires an approved change request');
  const snap = await snapshotProject(db, projectId);
  const v = p.baseline_version + 1;
  await db.query(`INSERT INTO project_baselines (org_id, project_id, version, snapshot, reason, change_request_id, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [ctx.orgId, projectId, v, JSON.stringify(snap), reason, changeRequestId, ctx.userId]);
  await db.query(`UPDATE projects SET baseline_version=$2, baseline_start=start_date, baseline_end=end_date WHERE id=$1`, [projectId, v]);
  await db.query(`UPDATE milestones SET baseline_date=due_date WHERE project_id=$1 AND deleted_at IS NULL`, [projectId]);
  await audit(db, ctx, 'baseline_set', { type: 'projects', id: projectId, code: p.code }, { baseline_version: p.baseline_version }, { baseline_version: v, reason, change_request_id: changeRequestId });
  return { version: v, snapshot: snap };
}
/** Guard: once baselined, baseline fields and BAC change only through approved change control. */
export function assertBaselineUnlocked(data: Record<string, any>, before: any) {
  if (!before || !before.baseline_version) return;
  for (const k of ['baseline_start', 'baseline_end', 'budget_at_completion']) {
    if (k in data && JSON.stringify(data[k]) !== JSON.stringify(before[k])) throw unprocessable(`${k} is baselined (v${before.baseline_version}); raise a change request to change it`);
  }
}

// ------------------------------------------------------------------ CPM scheduling (FR-SCH-003/004/006/007)
export function isWorkingDay(d: Date, holidays: Set<string>) { const wd = d.getUTCDay(); return wd !== 0 && wd !== 6 && !holidays.has(d.toISOString().slice(0, 10)); }
export function addWorkingDays(start: string, n: number, holidays: Set<string>) {
  const d = new Date(start + 'T00:00:00Z'); let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkingDay(d, holidays)) left--; }
  while (left < 0) { d.setUTCDate(d.getUTCDate() - 1); if (isWorkingDay(d, holidays)) left++; }
  return d.toISOString().slice(0, 10);
}
export function workingDaysBetween(a: string, b: string, holidays: Set<string>) {
  let n = 0; const d = new Date(a + 'T00:00:00Z'), e = new Date(b + 'T00:00:00Z');
  if (e < d) return 0;
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) if (isWorkingDay(d, holidays)) n++;
  return n;
}
/** Smallest working-day offset k such that addWorkingDays(anchor, k) falls on or after the status date (same convention as date mapping). */
export function statusOffset(anchor: string, statusDate: string, holidays: Set<string>) {
  if (statusDate <= anchor) return 0;
  const d = new Date(anchor + 'T00:00:00Z'); let k = 0;
  while (d.toISOString().slice(0, 10) < statusDate) { do { d.setUTCDate(d.getUTCDate() + 1); } while (!isWorkingDay(d, holidays)); k++; }
  return k;
}
export const pert = (o?: number | null, m?: number | null, p?: number | null) => (o == null || m == null || p == null ? null : Math.round(((o + 4 * m + p) / 6) * 10) / 10);

export interface Act { id: string; code: string; name: string; duration: number; start?: string | null; minStart?: number; deps: { pred: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }[] }
/** Critical path method on working-day offsets. Returns ES/EF/LS/LF/total float and the critical path. Throws on cycles. */
export function cpm(acts: Act[]) {
  const byId = new Map(acts.map((a) => [a.id, a]));
  const indeg = new Map(acts.map((a) => [a.id, a.deps.filter((d) => byId.has(d.pred)).length]));
  const order: string[] = []; const q = acts.filter((a) => indeg.get(a.id) === 0).map((a) => a.id);
  while (q.length) { const id = q.shift()!; order.push(id); for (const s of acts) if (s.deps.some((d) => d.pred === id)) { indeg.set(s.id, indeg.get(s.id)! - 1); if (indeg.get(s.id) === 0) q.push(s.id); } }
  if (order.length !== acts.length) throw unprocessable('Dependency cycle detected – the schedule cannot be computed');
  const es = new Map<string, number>(), ef = new Map<string, number>();
  for (const id of order) {
    const a = byId.get(id)!; let start = a.minStart ?? 0;
    for (const d of a.deps) {
      if (!byId.has(d.pred)) continue;
      const p = d.pred;
      const c = d.type === 'FS' ? ef.get(p)! + d.lag : d.type === 'SS' ? es.get(p)! + d.lag : d.type === 'FF' ? ef.get(p)! + d.lag - a.duration : es.get(p)! + d.lag - a.duration;
      start = Math.max(start, c);
    }
    es.set(id, start); ef.set(id, start + a.duration);
  }
  const finish = Math.max(0, ...[...ef.values()]);
  const ls = new Map<string, number>(), lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const a = byId.get(id)!; let latestFinish = finish;
    for (const s of acts) for (const d of s.deps) {
      if (d.pred !== id) continue;
      const c = d.type === 'FS' ? ls.get(s.id)! - d.lag : d.type === 'SS' ? ls.get(s.id)! - d.lag + a.duration : d.type === 'FF' ? lf.get(s.id)! - d.lag : lf.get(s.id)! - d.lag + a.duration;
      latestFinish = Math.min(latestFinish, c);
    }
    lf.set(id, latestFinish); ls.set(id, latestFinish - a.duration);
  }
  const rows = order.map((id) => { const a = byId.get(id)!; const tf = ls.get(id)! - es.get(id)!; return { id, code: a.code, name: a.name, duration: a.duration, es: es.get(id)!, ef: ef.get(id)!, ls: ls.get(id)!, lf: lf.get(id)!, total_float: tf, critical: tf === 0 }; });
  return { project_duration: finish, activities: rows, critical_path: rows.filter((r) => r.critical).map((r) => r.code) };
}

export async function projectSchedule(db: Db, ctx: Ctx, projectId: string) {
  const p = await getRow(ctx, 'projects', projectId, db);
  const holidays = new Set<string>((await db.query(`SELECT holiday_date FROM holidays WHERE org_id=$1`, [ctx.orgId])).rows.map((r) => r.holiday_date));
  const items = (await db.query(`SELECT * FROM work_items WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL AND status <> 'cancelled'`, [projectId])).rows;
  const deps = (await db.query(`SELECT d.* FROM work_dependencies d JOIN work_items w ON w.id=d.successor_id WHERE w.context_type='project' AND w.context_id=$1`, [projectId])).rows;
  const anchor = p.start_date ?? new Date().toISOString().slice(0, 10);
  const statusDate = new Date().toISOString().slice(0, 10);
  // Status date: remaining (not done) work cannot be scheduled before today.
  const todayOffset = statusOffset(anchor, statusDate, holidays);
  const acts: Act[] = items.map((w) => {
    const est = pert(w.optimistic_days, w.most_likely_days, w.pessimistic_days);
    const dur = est ?? (w.start_date && w.due_date ? workingDaysBetween(w.start_date, w.due_date, holidays) : w.estimate_hours ? Math.ceil(Number(w.estimate_hours) / 8) : 1);
    return { id: w.id, code: w.code, name: w.name, duration: w.status === 'done' ? 0 : Math.max(0, Math.round(dur)), start: w.start_date, minStart: w.status === 'done' ? 0 : todayOffset, deps: deps.filter((d) => d.successor_id === w.id).map((d) => ({ pred: d.predecessor_id, type: d.dep_type, lag: d.lag_days })) };
  });
  const r = cpm(acts);
  const withDates = r.activities.map((a) => ({ ...a, early_start: addWorkingDays(anchor, a.es, holidays), early_finish: addWorkingDays(anchor, Math.max(0, a.ef - 1), holidays), late_finish: addWorkingDays(anchor, Math.max(0, a.lf - 1), holidays), pert_estimate: pert(items.find((w) => w.id === a.id)?.optimistic_days, items.find((w) => w.id === a.id)?.most_likely_days, items.find((w) => w.id === a.id)?.pessimistic_days) }));
  const forecastFinish = addWorkingDays(anchor, Math.max(0, r.project_duration - 1), holidays);
  return { anchor, status_date: statusDate, project_duration_days: r.project_duration, forecast_finish: forecastFinish, planned_finish: p.end_date, baseline_finish: p.baseline_end,
    slippage_days_vs_baseline: p.baseline_end ? Math.round((Date.parse(forecastFinish) - Date.parse(p.baseline_end)) / 864e5) : null, critical_path: r.critical_path, activities: withDates, dependencies: deps, holidays: holidays.size };
}

// ------------------------------------------------------------------ sprints (FR-SCH-012)
export async function sprintReport(db: Db, ctx: Ctx, sprintId: string) {
  const s = await getRow(ctx, 'sprints', sprintId, db);
  const items = (await db.query(`SELECT id, code, name, status, story_points, completed_at FROM work_items WHERE sprint_id=$1 AND deleted_at IS NULL`, [sprintId])).rows;
  const total = items.reduce((a, w) => a + (w.story_points ?? 0), 0);
  const days: { date: string; remaining: number; ideal: number }[] = [];
  const start = Date.parse(s.start_date), end = Date.parse(s.end_date); const span = Math.max(1, Math.round((end - start) / 864e5));
  for (let i = 0; i <= span; i++) {
    const d = new Date(start + i * 864e5).toISOString().slice(0, 10);
    const done = items.filter((w) => w.status === 'done' && w.completed_at && String(w.completed_at).slice(0, 10) <= d).reduce((a, w) => a + (w.story_points ?? 0), 0);
    days.push({ date: d, remaining: Date.parse(d) > Date.now() ? (null as any) : total - done, ideal: Math.round((total - (total * i) / span) * 10) / 10 });
  }
  const velocity = (await db.query(`SELECT sp.id, sp.code, sp.name, sp.end_date, COALESCE(sum(w.story_points) FILTER (WHERE w.status='done'),0)::int AS completed, COALESCE(sum(w.story_points),0)::int AS committed
     FROM sprints sp LEFT JOIN work_items w ON w.sprint_id=sp.id AND w.deleted_at IS NULL WHERE sp.org_id=$1 AND sp.team_id IS NOT DISTINCT FROM $2 AND sp.deleted_at IS NULL GROUP BY sp.id ORDER BY sp.end_date DESC LIMIT 8`, [ctx.orgId, s.team_id])).rows.reverse();
  const done = velocity.filter((v) => v.end_date < new Date().toISOString().slice(0, 10));
  return { sprint: s, committed_points: total, completed_points: items.filter((w) => w.status === 'done').reduce((a, w) => a + (w.story_points ?? 0), 0), unestimated_items: items.filter((w) => w.story_points === null).length, burndown: days, velocity, average_velocity: done.length ? Math.round(done.reduce((a, v) => a + v.completed, 0) / done.length) : null };
}

// ------------------------------------------------------------------ weighted progress (FR-WRK-010)
export async function weightedProgress(db: Db, ctx: Ctx, projectId: string) {
  const p = await getRow(ctx, 'projects', projectId, db);
  const items = (await db.query(`SELECT status, estimate_hours, remaining_hours, progress_weight, work_type FROM work_items WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL AND status <> 'cancelled' AND work_type NOT IN ('epic','phase')`, [projectId])).rows;
  const ms = (await db.query(`SELECT count(*)::int n, count(*) FILTER (WHERE status='achieved')::int a FROM milestones WHERE project_id=$1 AND deleted_at IS NULL`, [projectId])).rows[0];
  const weighted = (() => {
    const w = items.map((i) => ({ weight: Number(i.progress_weight ?? i.estimate_hours ?? 0), done: i.status === 'done' ? 1 : i.estimate_hours && i.remaining_hours != null ? Math.max(0, Math.min(1, 1 - Number(i.remaining_hours) / Number(i.estimate_hours))) : 0 }));
    const tw = w.reduce((a, x) => a + x.weight, 0);
    return tw > 0 ? Math.round((w.reduce((a, x) => a + x.weight * x.done, 0) / tw) * 1000) / 10 : null;
  })();
  return { method: p.progress_method, manual_pct: p.percent_complete, weighted_effort_pct: weighted, milestone_pct: ms.n ? Math.round((ms.a / ms.n) * 1000) / 10 : null, task_count_pct_not_used: items.length ? Math.round((items.filter((i) => i.status === 'done').length / items.length) * 1000) / 10 : null,
    note: 'Task-count completion is shown for reference only and is never used as project progress (FR-WRK-010). Unweighted items count as zero weight.' };
}

// ------------------------------------------------------------------ comments & mentions (FR-WRK-006, PRD-041)
export async function addComment(db: Db, ctx: Ctx, entityType: string, entityId: string, body: string) {
  const ent = await getRow(ctx, entityType, entityId, db);
  const mentionEmails = [...body.matchAll(/@([\w.+-]+@[\w-]+\.[\w.-]+)/g)].map((m) => m[1].toLowerCase());
  const mentioned = mentionEmails.length ? (await db.query(`SELECT id FROM users WHERE org_id=$1 AND lower(email) = ANY($2::text[]) AND status='active'`, [ctx.orgId, mentionEmails])).rows.map((r) => r.id) : [];
  const row = (await db.query(`INSERT INTO comments (org_id, entity_type, entity_id, body, mentions, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ctx.orgId, entityType, entityId, body, mentioned, ctx.userId])).rows[0];
  const watchers = (await db.query(`SELECT user_id FROM watchers WHERE entity_type=$1 AND entity_id=$2`, [entityType, entityId])).rows.map((r) => r.user_id);
  await notify(db, ctx.orgId, mentioned.filter((u: string) => u !== ctx.userId), { kind: 'mention', title: `${ctx.name} mentioned you on ${ent.code}`, body: body.slice(0, 200), link: `/r/${entityType}?open=${entityId}` });
  await notify(db, ctx.orgId, watchers.filter((u: string) => u !== ctx.userId && !mentioned.includes(u)), { kind: 'comment', title: `New comment on ${ent.code}`, body: body.slice(0, 200), link: `/r/${entityType}?open=${entityId}` });
  await db.query(`INSERT INTO watchers (entity_type, entity_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [entityType, entityId, ctx.userId]);
  await audit(db, ctx, 'comment', { type: entityType, id: entityId, code: ent.code }, null, { mentions: mentioned.length });
  return row;
}

// ------------------------------------------------------------------ finance controls (FR-FIN-006/014)
export async function assertPeriodOpen(db: Db, orgId: string, date: string | null | undefined) {
  if (!date) return;
  const r = (await db.query(`SELECT locked FROM finance_periods WHERE org_id=$1 AND period=$2`, [orgId, String(date).slice(0, 7)])).rows[0];
  if (r?.locked) throw unprocessable(`Finance period ${String(date).slice(0, 7)} is locked; post a correction in an open period`);
}
export async function reverseCostEntry(db: Db, ctx: Ctx, id: string, reason: string, postDate: string) {
  const e = (await db.query(`SELECT * FROM cost_entries WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [id, ctx.orgId])).rows[0];
  if (!e) throw notFound('Cost entry');
  if (e.reversed) throw conflict('Entry already reversed');
  if (e.reversal_of) throw unprocessable('A reversal cannot itself be reversed');
  await assertPeriodOpen(db, ctx.orgId, postDate);
  const code = await nextCode(db, ctx.orgId, 'CST');
  const rev = (await db.query(`INSERT INTO cost_entries (org_id, code, name, context_type, context_id, entry_kind, expenditure_type, cost_category, cbs_code, amount, currency, entry_date, vendor_id, contract_id, reversal_of, created_by, updated_by, owner_id, classification)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$16,$17) RETURNING *`,
  [ctx.orgId, code, `Reversal of ${e.code}: ${reason}`, e.context_type, e.context_id, e.entry_kind, e.expenditure_type, e.cost_category, e.cbs_code, -Number(e.amount), e.currency, postDate, e.vendor_id, e.contract_id, e.id, ctx.userId, e.classification])).rows[0];
  await db.query(`UPDATE cost_entries SET reversed=true WHERE id=$1`, [id]);
  await audit(db, ctx, 'cost_reversed', { type: 'cost_entries', id, code: e.code }, { amount: e.amount }, { reversal: rev.code, reason });
  return rev;
}

// ------------------------------------------------------------------ quality & testing metrics (FR-QLT-006, FR-TST-008)
export async function qualityStatus(db: Db, ctx: Ctx, type: string, id: string) {
  const nc = (await db.query(`SELECT severity, count(*)::int n FROM non_conformances WHERE context_type=$1 AND context_id=$2 AND status NOT IN ('verified','closed') AND deleted_at IS NULL GROUP BY severity`, [type, id])).rows;
  const reviews = (await db.query(`SELECT result, count(*)::int n FROM quality_reviews WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL GROUP BY result`, [type, id])).rows;
  const reqs = (await db.query(`SELECT count(*)::int n, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM test_cases tc WHERE tc.requirement_id=r.id AND tc.deleted_at IS NULL))::int covered FROM requirements r WHERE r.context_type=$1 AND r.context_id=$2 AND r.deleted_at IS NULL`, [type, id])).rows[0];
  const latest = (await db.query(`WITH l AS (SELECT DISTINCT ON (tc.id) te.result FROM test_cases tc JOIN test_plans tp ON tp.id=tc.test_plan_id JOIN test_executions te ON te.test_case_id=tc.id AND te.deleted_at IS NULL WHERE tp.context_type=$1 AND tp.context_id=$2 AND tc.deleted_at IS NULL ORDER BY tc.id, te.executed_at DESC) SELECT count(*)::int n, count(*) FILTER (WHERE result='passed')::int p FROM l`, [type, id])).rows[0];
  const d = (await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE found_in_env='production')::int prod, count(*) FILTER (WHERE reopen_count>0)::int reopened, count(*) FILTER (WHERE status NOT IN ('closed','deferred','waived','known_error') AND severity IN ('critical','high'))::int open_high FROM defects WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL`, [type, id])).rows[0];
  const openNc = nc.reduce((a, x) => a + x.n, 0);
  return {
    open_non_conformances: openNc, nc_by_severity: Object.fromEntries(nc.map((x) => [x.severity, x.n])), reviews: Object.fromEntries(reviews.map((x) => [x.result ?? 'not_conducted', x.n])),
    requirement_coverage_pct: reqs.n ? Math.round((reqs.covered / reqs.n) * 1000) / 10 : null, pass_rate_pct: latest.n ? Math.round((latest.p / latest.n) * 1000) / 10 : null,
    defect_leakage_pct: d.total ? Math.round((d.prod / d.total) * 1000) / 10 : null, reopen_rate_pct: d.total ? Math.round((d.reopened / d.total) * 1000) / 10 : null, outstanding_high_defects: d.open_high,
    gate: openNc === 0 && d.open_high === 0 && !reviews.some((r) => r.result === 'fail') ? 'pass' : 'exceptions',
  };
}

// ------------------------------------------------------------------ change metrics (FR-CHG-010)
export async function changeMetrics(db: Db, ctx: Ctx, type?: string, id?: string) {
  const params: unknown[] = [ctx.orgId]; let where = 'org_id=$1 AND deleted_at IS NULL';
  if (type && id) { params.push(type, id); where += ' AND context_type=$2 AND context_id=$3'; }
  const rows = (await db.query(`SELECT status, change_type, emergency, created_at, decided_at, impact_cost, impact_schedule_days FROM change_requests WHERE ${where}`, params)).rows;
  const decided = rows.filter((r) => r.decided_at);
  return {
    total: rows.length, by_status: rows.reduce((a: any, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}), by_type: rows.reduce((a: any, r) => ((a[r.change_type] = (a[r.change_type] ?? 0) + 1), a), {}),
    emergency: rows.filter((r) => r.emergency).length, rejected: rows.filter((r) => r.status === 'rejected').length,
    avg_approval_days: decided.length ? Math.round((decided.reduce((a, r) => a + (Date.parse(r.decided_at) - Date.parse(r.created_at)) / 864e5, 0) / decided.length) * 10) / 10 : null,
    cumulative_approved_cost: rows.filter((r) => ['approved', 'implemented', 'verified'].includes(r.status)).reduce((a, r) => a + Number(r.impact_cost ?? 0), 0),
    cumulative_approved_days: rows.filter((r) => ['approved', 'implemented', 'verified'].includes(r.status)).reduce((a, r) => a + Number(r.impact_schedule_days ?? 0), 0),
  };
}

// ------------------------------------------------------------------ OCM summary (FR-OCM-007)
export async function ocmSummary(db: Db, ctx: Ctx, type: string, id: string) {
  const imp = (await db.query(`SELECT dimension, count(*)::int n, round(avg(magnitude),1) avg_mag, COALESCE(sum(headcount),0)::int people FROM ocm_impacts WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL GROUP BY dimension`, [type, id])).rows;
  const ready = (await db.query(`SELECT * FROM readiness_assessments WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL ORDER BY assessed_on`, [type, id])).rows.map((r) => {
    const xs = [r.awareness, r.understanding, r.willingness, r.ability, r.reinforcement].filter((x) => x !== null);
    return { date: r.assessed_on, gate: r.gate_key, index: xs.length === 5 ? Math.round((xs.reduce((a: number, b: number) => a + b, 0) / 5) * 20) : null, awareness: r.awareness, understanding: r.understanding, willingness: r.willingness, ability: r.ability, reinforcement: r.reinforcement };
  });
  const tr = (await db.query(`SELECT COALESCE(sum(attendees_planned),0)::int planned, COALESCE(sum(attendees_actual),0)::int actual, round(avg(assessment_pass_pct),1) pass FROM training_activities WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL`, [type, id])).rows[0];
  return { impacts: imp, readiness_trend: ready, latest_readiness_index: ready.length ? ready[ready.length - 1].index : null, training: { planned: tr.planned, attended: tr.actual, attendance_pct: tr.planned ? Math.round((tr.actual / tr.planned) * 1000) / 10 : null, avg_pass_pct: tr.pass === null ? null : Number(tr.pass) } };
}

// ------------------------------------------------------------------ go/no-go & service acceptance (FR-OPS-007/009, AC-11)
export async function recordGoNoGo(db: Db, ctx: Ctx, releaseId: string, input: { decision: 'go' | 'no_go' | 'go_with_conditions'; conditions?: string; exception_justification?: string }, readiness: { ready: boolean; checks: any[] }) {
  if (ctx.actorType !== 'user') throw forbidden('Go/no-go decisions are made by people');
  const rel = await getRow(ctx, 'releases', releaseId, db);
  if (input.decision !== 'no_go' && !readiness.ready && !input.exception_justification?.trim()) throw unprocessable('Mandatory readiness evidence is missing; a go decision requires an authorised exception with justification', readiness.checks.filter((c) => c.mandatory && !c.passed));
  if (input.decision === 'go_with_conditions' && !input.conditions?.trim()) throw badRequest('State the conditions');
  await db.query(`UPDATE releases SET go_no_go_decision=$2, go_no_go_at=now(), go_no_go_conditions=$3 WHERE id=$1`, [releaseId, input.decision, input.conditions ?? input.exception_justification ?? null]);
  const code = await nextCode(db, ctx.orgId, 'DEC');
  await db.query(`INSERT INTO decisions (org_id, code, name, context_type, context_id, forum, decision, rationale, decided_on, decided_by, status, created_by, updated_by, owner_id) VALUES ($1,$2,$3,'product',$4,'Go/no-go',$5,$6,current_date,$7,'decided',$7,$7,$7)`,
    [ctx.orgId, code, `Go/no-go: ${rel.name}`, rel.product_id, input.decision, input.exception_justification ? `EXCEPTION: ${input.exception_justification}` : input.conditions ?? 'Readiness criteria met', ctx.userId]);
  await audit(db, ctx, readiness.ready ? 'go_no_go' : 'go_no_go_exception', { type: 'releases', id: releaseId, code: rel.code }, null, { decision: input.decision, conditions: input.conditions, exception: input.exception_justification, failed: readiness.checks.filter((c) => c.mandatory && !c.passed).map((c) => c.key) });
  return { decision: input.decision, decision_record: code };
}

// ------------------------------------------------------------------ AI idea clustering (PRD-045, PRD-006)
export function clusterTexts(items: { id: string; code: string; text: string }[], threshold = 0.2) {
  const toks = items.map((i) => ({ ...i, t: tokens(i.text) }));
  const clusters: { members: typeof toks; terms: Map<string, number> }[] = [];
  for (const it of toks) {
    let best = -1, bestScore = 0;
    clusters.forEach((c, idx) => { const s = Math.max(...c.members.map((m) => jaccard(m.t, it.t))); if (s > bestScore) { bestScore = s; best = idx; } });
    if (best >= 0 && bestScore >= threshold) clusters[best].members.push(it); else clusters.push({ members: [it], terms: new Map() });
  }
  return clusters.map((c) => {
    const freq = new Map<string, number>(); for (const m of c.members) for (const t of m.t) freq.set(t, (freq.get(t) ?? 0) + 1);
    const theme = [...freq.entries()].filter(([, n]) => n > 1 || c.members.length === 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(' / ');
    return { theme: theme || 'misc', size: c.members.length, members: c.members.map((m) => ({ id: m.id, code: m.code })) };
  }).sort((a, b) => b.size - a.size);
}

// ------------------------------------------------------------------ escalations & exception alerts (FR-PORT-010, FR-RAID-007, FR-FIN-012, FR-MTG-005, FR-CHG-007, PRD-037)
export async function runEscalations(db: Db, orgId: string) {
  const out: Record<string, number> = {};
  const pm = await usersWithRole(db, orgId, 'pmo_manager');
  for (const r of (await db.query(`UPDATE risks SET escalated=true WHERE org_id=$1 AND status='open' AND deleted_at IS NULL AND NOT escalated AND (likelihood*impact >= 20 OR (due_date < current_date AND likelihood*impact >= 12)) RETURNING id, code, name, owner_id`, [orgId])).rows) {
    await notify(db, orgId, [r.owner_id, ...pm], { kind: 'risk_escalation', title: `Risk escalated: ${r.code} ${r.name}`, link: `/r/risks?open=${r.id}`, dedupe: `riskesc:${r.id}` }); out.risks = (out.risks ?? 0) + 1;
  }
  for (const i of (await db.query(`UPDATE issues SET escalated=true WHERE org_id=$1 AND status IN ('open','in_progress') AND deleted_at IS NULL AND NOT escalated AND due_date < current_date AND severity IN ('high','critical') RETURNING id, code, name, owner_id`, [orgId])).rows) {
    await notify(db, orgId, [i.owner_id, ...pm], { kind: 'issue_escalation', title: `Issue overdue & escalated: ${i.code}`, link: `/r/issues?open=${i.id}`, dedupe: `issesc:${i.id}` }); out.issues = (out.issues ?? 0) + 1;
  }
  for (const w of (await db.query(`SELECT id, code, name, assignee_id, owner_id FROM work_items WHERE org_id=$1 AND work_type='action' AND status NOT IN ('done','cancelled') AND due_date < current_date AND deleted_at IS NULL`, [orgId])).rows) {
    await notify(db, orgId, [w.assignee_id ?? w.owner_id], { kind: 'action_overdue', title: `Action overdue: ${w.code} ${w.name}`, link: `/r/work_items?open=${w.id}`, dedupe: `act:${w.id}` }); out.actions = (out.actions ?? 0) + 1;
  }
  for (const w of (await db.query(`UPDATE work_items SET sla_breached=true WHERE org_id=$1 AND sla_due_at < now() AND status NOT IN ('done','cancelled') AND NOT sla_breached AND deleted_at IS NULL RETURNING id, code, name, assignee_id`, [orgId])).rows) {
    await notify(db, orgId, [w.assignee_id], { kind: 'sla_breach', title: `SLA breached: ${w.code} ${w.name}`, link: `/r/work_items?open=${w.id}`, dedupe: `sla:${w.id}` }); out.sla = (out.sla ?? 0) + 1;
  }
  for (const c of (await db.query(`SELECT id, code, owner_id FROM change_requests WHERE org_id=$1 AND emergency AND status IN ('approved','implemented') AND (retrospective_review IS NULL OR retrospective_review='') AND created_at < now() - interval '5 days' AND deleted_at IS NULL`, [orgId])).rows) {
    await notify(db, orgId, [c.owner_id, ...pm], { kind: 'emergency_change', title: `Emergency change ${c.code} needs its retrospective review`, link: `/r/change_requests?open=${c.id}`, dedupe: `emc:${c.id}` }); out.emergency = (out.emergency ?? 0) + 1;
  }
  for (const p of (await db.query(`SELECT p.id, p.code, p.name, p.owner_id, p.budget_at_completion, (SELECT COALESCE(sum(amount),0) FROM cost_entries c WHERE c.context_type='project' AND c.context_id=p.id AND c.deleted_at IS NULL) AS eac FROM projects p WHERE p.org_id=$1 AND p.status='active' AND p.deleted_at IS NULL AND p.budget_at_completion IS NOT NULL`, [orgId])).rows) {
    if (Number(p.eac) > Number(p.budget_at_completion) * 1.05) { await notify(db, orgId, [p.owner_id, ...(await usersWithRole(db, orgId, 'finance_controller'))], { kind: 'finance_exception', title: `Forecast exceeds budget by >5%: ${p.code}`, link: `/projects/${p.id}`, dedupe: `finx:${p.id}:${new Date().toISOString().slice(0, 7)}` }); out.finance = (out.finance ?? 0) + 1; }
  }
  for (const pr of (await db.query(`SELECT id, code, name, owner_id FROM products WHERE org_id=$1 AND deleted_at IS NULL AND next_review_date IS NOT NULL AND next_review_date <= current_date`, [orgId])).rows) {
    await notify(db, orgId, [pr.owner_id], { kind: 'product_review', title: `Product lifecycle review due: ${pr.code} ${pr.name}`, link: `/products/${pr.id}`, dedupe: `prodrev:${pr.id}:${new Date().toISOString().slice(0, 10)}` }); out.products = (out.products ?? 0) + 1;
  }
  for (const r of (await db.query(`SELECT id, code, requester_id, owner_id FROM requests WHERE org_id=$1 AND pipeline_stage='deferred' AND deferral_date <= current_date AND deleted_at IS NULL`, [orgId])).rows) {
    await notify(db, orgId, [r.owner_id, r.requester_id], { kind: 'request_deferral', title: `Deferred request ${r.code} is due for re-review`, link: `/r/requests?open=${r.id}`, dedupe: `defer:${r.id}` }); out.requests = (out.requests ?? 0) + 1;
  }
  return out;
}

// ------------------------------------------------------------------ complete project export (NFR-016, AC-14)
export async function exportProject(db: Db, ctx: Ctx, projectId: string) {
  const p = await getRow(ctx, 'projects', projectId, db);
  const q = async (sql: string, params: unknown[] = [projectId]) => (await db.query(sql, params)).rows;
  const ctxRows = (t: string) => q(`SELECT * FROM ${t} WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`);
  const out: Record<string, unknown> = {
    format: 'meridian-project-export', format_version: 1, exported_at: new Date().toISOString(), exported_by: ctx.email, project: p,
    products: await q(`SELECT pp.relationship, pr.* FROM project_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.project_id=$1`),
    milestones: await q(`SELECT * FROM milestones WHERE project_id=$1 AND deleted_at IS NULL`), deliverables: await q(`SELECT * FROM deliverables WHERE project_id=$1 AND deleted_at IS NULL`),
    baselines: await q(`SELECT * FROM project_baselines WHERE project_id=$1 ORDER BY version`),
    work_items: await ctxRows('work_items'), work_dependencies: await q(`SELECT d.* FROM work_dependencies d JOIN work_items w ON w.id=d.successor_id WHERE w.context_type='project' AND w.context_id=$1`),
    requirements: await ctxRows('requirements'), risks: await ctxRows('risks'), issues: await ctxRows('issues'), assumptions: await ctxRows('assumptions'),
    change_requests: await ctxRows('change_requests'), stakeholders: await ctxRows('stakeholders'), communications: await ctxRows('communications'),
    test_plans: await ctxRows('test_plans'), defects: await ctxRows('defects'), quality_reviews: await ctxRows('quality_reviews'), non_conformances: await ctxRows('non_conformances'),
    ocm_impacts: await ctxRows('ocm_impacts'), readiness_assessments: await ctxRows('readiness_assessments'), training_activities: await ctxRows('training_activities'),
    lessons: await ctxRows('lessons'), decisions: await ctxRows('decisions'), meetings: await ctxRows('meetings'), raci: await ctxRows('raci_assignments'),
    approvals: await q(`SELECT * FROM approvals WHERE entity_type='projects' AND entity_id=$1`),
    documents: await q(`SELECT d.*, (SELECT json_agg(v ORDER BY v.version) FROM (SELECT version, content, source_refs, missing_fields, created_at FROM document_versions WHERE document_id=d.id) v) AS versions FROM documents d WHERE d.context_type='project' AND d.context_id=$1 AND d.deleted_at IS NULL`),
    files: await q(`SELECT id, entity_type, entity_id, filename, mime_type, size_bytes, sha256, scan_status, created_at FROM files WHERE org_id=$2 AND deleted_at IS NULL AND (entity_id=$1 OR entity_id IN (SELECT id FROM work_items WHERE context_id=$1) OR entity_id IN (SELECT id FROM documents WHERE context_id=$1))`, [projectId, ctx.orgId]),
  };
  // the audit trail is a sensitive, explicit-only permission (never granted by wildcards)
  if (can(ctx, 'audit:read')) out.audit_trail = await q(`SELECT action, actor_type, entity_type, entity_code, before, after, occurred_at, hash FROM audit_events WHERE entity_id=$1 ORDER BY id`);
  else out.audit_trail_excluded = 'Audit trail excluded: requires audit:read';
  if (can(ctx, 'budgets:read')) { out.budgets = await ctxRows('budgets'); out.cost_entries = await ctxRows('cost_entries'); out.benefits = await ctxRows('benefits'); }
  else out.finance_excluded = 'Financial records excluded: you lack budgets:read (FR-FIN-013)';
  await audit(db, ctx, 'project_exported', { type: 'projects', id: projectId, code: p.code }, null, { sections: Object.keys(out).length });
  return out;
}
