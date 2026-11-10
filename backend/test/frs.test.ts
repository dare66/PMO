/**
 * Integration tests for capabilities added against FRS-EPMO-001 v1.1 (migrations 002/003).
 * Test IDs reference the FRS's own requirement IDs. Runs against real PostgreSQL with the synthetic demo dataset.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { api, find, getApp, PASSWORD } from './helpers.js';
import { pool, tx } from '../src/db.js';
import { loadCtx } from '../src/auth/auth.js';
import { cpm, computeScore, pert, addWorkingDays, clusterTexts, statusOffset } from '../src/domain/frs.js';
import { recordGoNoGo } from '../src/domain/frs.js';
import { lineDiff, validateRaci } from '../src/routes/frs.js';
import { toCsv } from '../src/domain/extended.js';
import { acceptIntake } from '../src/ai/intake.js';

const byName = (rows: any[], name: string) => rows.find((r) => r.name === name);
const uid = async (k: string) => (await pool.query(`SELECT id FROM users WHERE email=$1`, [`${k}@demo.example`])).rows[0].id as string;
const ctxOf = async (k: string) => (await loadCtx(await uid(k)))!;
const today = () => new Date().toISOString().slice(0, 10);
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let projects: any[]; let products: any[];

beforeAll(async () => {
  await getApp();
  projects = await find('admin', 'projects', {});
  products = await find('admin', 'products', {});
});

// ------------------------------------------------------------------ pure calculations
describe('Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004)', () => {
  it('CPM handles FS/SS/FF/SF with lag and finds the critical path', () => {
    const r = cpm([
      { id: 'a', code: 'A', name: 'A', duration: 3, deps: [] },
      { id: 'b', code: 'B', name: 'B', duration: 2, deps: [{ pred: 'a', type: 'FS', lag: 1 }] },
      { id: 'c', code: 'C', name: 'C', duration: 1, deps: [{ pred: 'a', type: 'SS', lag: 0 }] },
      { id: 'd', code: 'D', name: 'D', duration: 2, deps: [{ pred: 'b', type: 'FF', lag: 0 }, { pred: 'c', type: 'FS', lag: 0 }] },
    ]);
    expect(r.project_duration).toBe(6);
    expect(r.critical_path).toEqual(['A', 'B', 'D']);
    expect(r.activities.find((a) => a.code === 'C')!.total_float).toBe(3);
  });
  it('CPM rejects dependency cycles', () => {
    expect(() => cpm([{ id: 'a', code: 'A', name: 'A', duration: 1, deps: [{ pred: 'b', type: 'FS', lag: 0 }] }, { id: 'b', code: 'B', name: 'B', duration: 1, deps: [{ pred: 'a', type: 'FS', lag: 0 }] }])).toThrow(/cycle/);
  });
  it('PERT needs all three estimates; working days skip weekends and holidays', () => {
    expect(pert(2, 4, 12)).toBe(5); expect(pert(2, null, 12)).toBeNull();
    expect(addWorkingDays('2026-11-06', 1, new Set())).toBe('2026-11-09'); // Friday → Monday
    expect(addWorkingDays('2026-11-06', 1, new Set(['2026-11-09']))).toBe('2026-11-10');
    // status offset maps back to a date on/after the status date, including weekend anchors
    for (const [a, t] of [['2026-10-31', '2026-11-10'], ['2026-11-02', '2026-11-10'], ['2026-11-06', '2026-11-08']]) expect(addWorkingDays(a, statusOffset(a, t, new Set()), new Set()) >= t).toBe(true);
    expect(addWorkingDays('2026-11-02', statusOffset('2026-11-02', '2026-11-10', new Set()), new Set())).toBe('2026-11-10');
  });
  it('weighted score is null until every criterion is scored', () => {
    const crit = [{ key: 'value', name: 'Value', weight: 60 }, { key: 'risk', name: 'Risk', weight: 40, direction: 'lower' as const }];
    expect(computeScore(crit, { value: 8 }).total).toBeNull();
    expect(computeScore(crit, { value: 8, risk: 2 }).total).toBe(80);
  });
  it('RACI needs exactly one A and at least one R; diff and clustering helpers', () => {
    const v = validateRaci([{ name: 'X', item_ref: null, responsibility: 'R' }, { name: 'Y', item_ref: null, responsibility: 'A' }, { name: 'Y', item_ref: null, responsibility: 'R' }]);
    expect(v.find((x) => x.item === 'X')!.valid).toBe(false); expect(v.find((x) => x.item === 'Y')!.valid).toBe(true);
    const d = lineDiff('a\nb\nc', 'a\nc\nd'); expect(d.added).toBe(1); expect(d.removed).toBe(1);
    const cl = clusterTexts([{ id: '1', code: 'I1', text: 'offline payments queue sync' }, { id: '2', code: 'I2', text: 'offline payments retry sync' }, { id: '3', code: 'I3', text: 'dark mode theme' }]);
    expect(cl[0].size).toBe(2);
  });
  it('CSV export neutralises spreadsheet formula injection (NFR-004)', () => {
    expect(toCsv(['a'], [['=HYPERLINK("x")']])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

// ------------------------------------------------------------------ demand intake
describe('Demand intake pipeline (FR-PORT-003, FR-INIT-003/005/010)', () => {
  it('detects duplicates, enforces reasons/SoD and converts to a linked project', async () => {
    const a = await api('dev1', 'POST', '/api/r/requests', { name: 'Offline card payments for field agents', description: 'Allow field agents to accept card payments offline', related_system: 'FieldPay', request_type: 'enhancement' });
    expect(a.status).toBe(201); expect(a.body.pipeline_stage).toBe('submitted');
    const b = await api('dev2', 'POST', '/api/r/requests', { name: 'Field agents offline card payments', description: 'Card payments when agents are offline', related_system: 'FieldPay' });
    const dup = await api('dev2', 'GET', `/api/requests/${b.body.id}/duplicates`);
    expect(dup.body.some((d: any) => d.id === a.body.id)).toBe(true);
    // pipeline_stage is read-only through CRUD
    expect((await api('portfolio', 'PATCH', `/api/r/requests/${a.body.id}`, { pipeline_stage: 'approved' })).status).toBe(400);
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'approved' })).status).toBe(422); // must pass screening first
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'deferred', reason: 'Budget' })).status).toBe(400); // deferral date required
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'screening' })).status).toBe(200);
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'proposed' })).status).toBe(200);
    expect((await api('dev1', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'approved' })).status).toBe(403); // no requests:approve
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/transition`, { to: 'approved', reason: 'Strategic fit' })).status).toBe(200);
    const conv = await api('portfolio', 'POST', `/api/requests/${a.body.id}/convert`, {});
    expect(conv.status).toBe(201);
    const p = (await pool.query(`SELECT source_request_id FROM projects WHERE id=$1`, [conv.body.id])).rows[0];
    expect(p.source_request_id).toBe(a.body.id);
    expect((await api('portfolio', 'POST', `/api/requests/${a.body.id}/convert`, {})).status).toBe(422);
  });
  it('a requester cannot approve their own request (segregation of duties)', async () => {
    const r = await api('portfolio', 'POST', '/api/r/requests', { name: 'Treasury dashboard refresh for SoD test' });
    await api('portfolio', 'POST', `/api/requests/${r.body.id}/transition`, { to: 'screening' });
    await api('portfolio', 'POST', `/api/requests/${r.body.id}/transition`, { to: 'proposed' });
    const s = await api('portfolio', 'POST', `/api/requests/${r.body.id}/transition`, { to: 'approved' });
    expect(s.status).toBe(403); expect(s.body.message).toMatch(/Segregation of duties/);
  });
  it('scoring models: weights must sum to 100 and overrides need a reason; scores are immutable', async () => {
    const m = await api('portfolio', 'POST', '/api/r/scoring_models', { name: 'Request triage model', applies_to: 'requests' });
    expect((await api('portfolio', 'PUT', `/api/scoring-models/${m.body.id}/criteria`, { criteria: [{ key: 'value', name: 'Value', weight: 50 }] })).status).toBe(400);
    expect((await api('portfolio', 'PUT', `/api/scoring-models/${m.body.id}/criteria`, { criteria: [{ key: 'value', name: 'Value', weight: 70 }, { key: 'effort', name: 'Effort', weight: 30, direction: 'lower' }] })).status).toBe(200);
    const rq = await api('portfolio', 'POST', '/api/r/requests', { name: 'Scoring subject request' });
    expect((await api('portfolio', 'POST', '/api/scores', { model_id: m.body.id, entity_type: 'requests', entity_id: rq.body.id, values: { value: 9, effort: 3 }, override_total: 95 })).status).toBe(400);
    const s = await api('portfolio', 'POST', '/api/scores', { model_id: m.body.id, entity_type: 'requests', entity_id: rq.body.id, values: { value: 9, effort: 3 } });
    expect(s.status).toBe(201); expect(Number(s.body.computed_total)).toBe(84);
    expect(Number((await api('portfolio', 'GET', `/api/r/requests/${rq.body.id}`)).body.score)).toBe(84);
    await expect(pool.query(`UPDATE scores SET computed_total=100 WHERE id=$1`, [s.body.id])).rejects.toThrow();
  });
});

// ------------------------------------------------------------------ baselines & schedule
describe('Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010)', () => {
  let proj: any;
  it('baselines lock baseline dates and BAC; re-baselining needs an approved change', async () => {
    proj = (await api('pm1', 'POST', '/api/r/projects', { name: 'Baseline test project', start_date: day(-10), end_date: day(80), budget_at_completion: 500000 })).body;
    expect(proj.id).toBeTruthy();
    const b1 = await api('pm1', 'POST', `/api/projects/${proj.id}/baseline`, { reason: 'Approved plan' });
    expect(b1.status).toBe(201); expect(b1.body.version).toBe(1);
    expect((await api('pm1', 'PATCH', `/api/r/projects/${proj.id}`, { baseline_end: day(120) })).status).toBe(422);
    expect((await api('pm1', 'PATCH', `/api/r/projects/${proj.id}`, { budget_at_completion: 900000 })).status).toBe(422);
    expect((await api('pm1', 'POST', `/api/projects/${proj.id}/baseline`, { reason: 'Again' })).status).toBe(422);
    await expect(pool.query(`DELETE FROM project_baselines WHERE project_id=$1`, [proj.id])).rejects.toThrow();
  });
  it('computes a critical path over dependencies and refuses cycles', async () => {
    const mk = async (n: string, d: number) => (await api('pm1', 'POST', '/api/r/work_items', { name: n, context_type: 'project', context_id: proj.id, work_type: 'task', optimistic_days: d, most_likely_days: d, pessimistic_days: d })).body;
    const a = await mk('Design', 5), b = await mk('Build', 10), c = await mk('Docs', 2);
    expect((await api('pm1', 'POST', '/api/work-dependencies', { predecessor_id: a.id, successor_id: b.id })).status).toBe(201);
    expect((await api('pm1', 'POST', '/api/work-dependencies', { predecessor_id: a.id, successor_id: c.id, dep_type: 'SS', lag_days: 1 })).status).toBe(201);
    expect((await api('pm1', 'POST', '/api/work-dependencies', { predecessor_id: b.id, successor_id: a.id })).status).toBe(422);
    const s = await api('pm1', 'GET', `/api/projects/${proj.id}/schedule`);
    expect(s.status).toBe(200);
    // remaining work is scheduled from the status date (today), and the dependent chain is 5 + 10 = 15 working days
    const minEs = Math.min(...s.body.activities.map((x: any) => x.es));
    expect(s.body.project_duration_days - minEs).toBe(15);
    expect(s.body.activities.every((x: any) => x.early_start >= s.body.status_date)).toBe(true);
    expect(s.body.critical_path).toEqual([a.code, b.code]);
    expect(s.body.slippage_days_vs_baseline).not.toBeNull();
  });
  it('items requiring evidence cannot be completed without it; blocked needs a reason', async () => {
    const w = (await api('pm1', 'POST', '/api/r/work_items', { name: 'Evidence item', context_type: 'project', context_id: proj.id, requires_evidence: true })).body;
    expect((await api('pm1', 'PATCH', `/api/r/work_items/${w.id}`, { status: 'done' })).status).toBe(422);
    expect((await api('pm1', 'PATCH', `/api/r/work_items/${w.id}`, { status: 'blocked' })).status).toBe(422);
    expect((await api('pm1', 'PATCH', `/api/r/work_items/${w.id}`, { status: 'done', completion_evidence: 'Test report TR-12 attached in DMS' })).status).toBe(200);
  });
  it('weighted progress never uses task counts and reports unknown when no weights', async () => {
    const p = await api('pm1', 'GET', `/api/projects/${proj.id}/progress`);
    expect(p.status).toBe(200); expect(p.body.note).toMatch(/never used/);
  });
  it('an approved change on a baselined project creates a new baseline version', async () => {
    const cr = (await api('pm1', 'POST', '/api/r/change_requests', { name: 'Extend baseline test', context_type: 'project', context_id: proj.id, change_type: 'schedule', justification: 'Vendor delay', impact_schedule_days: 7, risk_level: 'low' })).body;
    await pool.query(`UPDATE impact_assessments SET status='completed' WHERE change_request_id=$1`, [cr.id]);
    const sub = await api('pm1', 'POST', `/api/change-requests/${cr.id}/submit`);
    expect(sub.status).toBe(200);
    for (const ap of sub.body) {
      const role = ap.approver_role; const user = role === 'pmo_manager' ? 'pmo' : role === 'executive' ? 'ceo' : 'finance';
      expect((await api(user, 'POST', `/api/approvals/${ap.id}/decide`, { decision: 'approved' })).status).toBe(200);
    }
    const bl = await api('pm1', 'GET', `/api/projects/${proj.id}/baselines`);
    expect(bl.body[0].version).toBe(2); expect(bl.body[0].change_request_id).toBe(cr.id);
  });
  it('project export is complete but scoped by permission (NFR-016, AC-14)', async () => {
    const pm = await api('pm1', 'GET', `/api/projects/${proj.id}/export`);
    expect(pm.status).toBe(200); expect(pm.body.baselines.length).toBe(2); expect(pm.body.budgets).toBeDefined();
    expect(pm.body.audit_trail).toBeUndefined(); expect(pm.body.audit_trail_excluded).toMatch(/audit:read/);
    const au = await api('auditor', 'GET', `/api/projects/${proj.id}/export`);
    expect(Array.isArray(au.body.audit_trail)).toBe(true);
  });
});

// ------------------------------------------------------------------ time, resources, RACI
describe('Time, resource requests and RACI (FR-RES-004/005/007/008/011)', () => {
  it('people record only their own time; approval is by someone else', async () => {
    const w = (await find('dev1', 'work_items', { assignee_id: await uid('dev1') }))[0] ?? (await find('dev1', 'work_items', {}))[0];
    expect((await api('dev1', 'POST', '/api/r/time_entries', { name: 'Someone else', work_item_id: w.id, user_id: await uid('dev2'), entry_date: today(), hours: 2 })).status).toBe(403);
    const t = await api('dev1', 'POST', '/api/r/time_entries', { name: 'Coding', work_item_id: w.id, user_id: await uid('dev1'), entry_date: today(), hours: 3 });
    expect(t.status).toBe(201);
    expect((await api('dev1', 'PATCH', `/api/r/time_entries/${t.body.id}`, { status: 'approved' })).status).toBe(422);
    expect((await api('dev1', 'POST', `/api/time-entries/${t.body.id}/decide`, { decision: 'approved' })).status).toBe(403);
    expect((await api('resources', 'POST', `/api/time-entries/${t.body.id}/decide`, { decision: 'approved' })).status).toBe(200);
    expect((await api('dev1', 'PATCH', `/api/r/time_entries/${t.body.id}`, { hours: 8 })).status).toBe(422);
  });
  it('allocation requests are approved by the resource manager', async () => {
    const p = byName(projects, 'Mobile App 3.0 Redesign');
    const a = await api('pm1', 'POST', '/api/r/resource_allocations', { name: 'Extra QA', context_type: 'project', context_id: p.id, user_id: await uid('dev2'), start_date: day(1), end_date: day(30), allocation_pct: 30, status: 'requested' });
    const req = await api('pm1', 'POST', `/api/resource-allocations/${a.body.id}/request-approval`);
    expect(req.status).toBe(200); expect(req.body.approvals[0].approver_role).toBe('resource_manager');
    expect((await api('resources', 'POST', `/api/approvals/${req.body.approvals[0].id}/decide`, { decision: 'approved' })).status).toBe(200);
    expect((await api('pm1', 'GET', `/api/r/resource_allocations/${a.body.id}`)).body.status).toBe('active');
  });
  it('only one Accountable per RACI item', async () => {
    const p = byName(projects, 'Mobile App 3.0 Redesign');
    expect((await api('pm1', 'POST', '/api/r/raci_assignments', { name: 'Test RACI item', context_type: 'project', context_id: p.id, user_id: await uid('pm1'), responsibility: 'A' })).status).toBe(201);
    expect((await api('pm1', 'POST', '/api/r/raci_assignments', { name: 'Test RACI item', context_type: 'project', context_id: p.id, user_id: await uid('pm2'), responsibility: 'A' })).status).toBe(422);
    await api('pm1', 'POST', '/api/r/raci_assignments', { name: 'Test RACI item', context_type: 'project', context_id: p.id, user_id: await uid('dev1'), responsibility: 'R' });
    const m = await api('pm1', 'GET', `/api/raci/project/${p.id}`);
    expect(m.body.validation.find((v: any) => v.item === 'Test RACI item').valid).toBe(true);
  });
  it('access ends automatically after the access end date', async () => {
    await pool.query(`UPDATE users SET access_end_date=current_date - 1 WHERE email='dev3@demo.example'`);
    const app = await getApp();
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'dev3@demo.example', password: PASSWORD } })).statusCode).toBe(401);
    expect(await loadCtx(await uid('dev3'))).toBeNull();
    await pool.query(`UPDATE users SET access_end_date=NULL WHERE email='dev3@demo.example'`);
  });
});

// ------------------------------------------------------------------ finance controls
describe('Finance period locks and reversals (FR-FIN-006/014)', () => {
  it('locked periods reject postings; actuals are corrected by reversal only', async () => {
    const p = byName(projects, 'PDPA Compliance Uplift');
    const lockMonth = day(-400).slice(0, 7);
    expect((await api('pm1', 'POST', `/api/finance/periods/${lockMonth}/lock`, { locked: true })).status).toBe(403);
    expect((await api('finance', 'POST', `/api/finance/periods/${lockMonth}/lock`, { locked: true, sign_off: true })).status).toBe(200);
    expect((await api('finance', 'POST', '/api/r/cost_entries', { name: 'Late invoice', context_type: 'project', context_id: p.id, entry_kind: 'actual', amount: 1000, entry_date: `${lockMonth}-15` })).status).toBe(422);
    expect((await api('finance', 'POST', `/api/finance/periods/${lockMonth}/lock`, { locked: false, reason: 'reopen' })).status).toBe(422); // signed off
    const e = await api('finance', 'POST', '/api/r/cost_entries', { name: 'Consulting', context_type: 'project', context_id: p.id, entry_kind: 'actual', amount: 12000, entry_date: today() });
    expect(e.status).toBe(201);
    expect((await api('finance', 'PATCH', `/api/r/cost_entries/${e.body.id}`, { amount: 9000 })).status).toBe(422);
    expect((await api('finance', 'DELETE', `/api/r/cost_entries/${e.body.id}`)).status).toBe(422);
    const rev = await api('finance', 'POST', `/api/cost-entries/${e.body.id}/reverse`, { reason: 'Wrong project', post_date: today() });
    expect(rev.status).toBe(201); expect(Number(rev.body.amount)).toBe(-12000);
    expect((await api('finance', 'POST', `/api/cost-entries/${e.body.id}/reverse`, { reason: 'Again please', post_date: today() })).status).toBe(409);
  });
});

// ------------------------------------------------------------------ quality, release, documents
describe('Quality, release and document controls (FR-QLT, FR-OPS-007/009, FR-DOC, AC-11)', () => {
  it('defects are waived only through approval', async () => {
    const p = byName(projects, 'Mobile App 3.0 Redesign');
    const d = await api('tester', 'POST', '/api/r/defects', { name: 'Minor label clipping', context_type: 'project', context_id: p.id, severity: 'low' });
    expect((await api('tester', 'PATCH', `/api/r/defects/${d.body.id}`, { status: 'waived' })).status).toBe(422);
    const w = await api('tester', 'POST', `/api/defects/${d.body.id}/request-waiver`, { disposition: 'waived', reason: 'Cosmetic, fixed in next release' });
    expect(w.status).toBe(200);
    expect((await api('pmo', 'POST', `/api/approvals/${w.body[0].id}/decide`, { decision: 'approved' })).status).toBe(200);
    expect((await api('tester', 'GET', `/api/r/defects/${d.body.id}`)).body.status).toBe('waived');
    const q = await api('pm1', 'GET', `/api/quality/project/${p.id}`);
    expect(q.status).toBe(200); expect(q.body).toHaveProperty('gate');
  });
  it('a go decision without readiness evidence needs a justified exception; AI cannot decide', async () => {
    const rel = (await api('release', 'POST', '/api/r/releases', { name: 'Go/no-go test release', product_id: byName(products, 'Customer Mobile App').id })).body;
    expect((await api('release', 'POST', `/api/releases/${rel.id}/go-no-go`, { decision: 'go' })).status).toBe(422);
    const ok = await api('release', 'POST', `/api/releases/${rel.id}/go-no-go`, { decision: 'go', exception_justification: 'Regulatory deadline; CAB chair approved by phone, evidence to follow' });
    expect(ok.status).toBe(200); expect(ok.body.decision_record).toMatch(/^DEC-/);
    const audit = (await pool.query(`SELECT action FROM audit_events WHERE entity_id=$1 ORDER BY id DESC LIMIT 1`, [rel.id])).rows[0];
    expect(audit.action).toBe('go_no_go_exception');
    const ctx = await ctxOf('release');
    await expect(tx((db) => recordGoNoGo(db, { ...ctx, actorType: 'ai' }, rel.id, { decision: 'no_go' }, { ready: true, checks: [] }))).rejects.toThrow(/made by people/);
  });
  it('legal hold blocks deletion; check-out blocks other editors; versions can be compared', async () => {
    const d = await api('pmo', 'POST', '/api/r/documents', { name: 'Hold test document', doc_type: 'other', context_type: 'none' });
    expect(d.status).toBe(201);
    expect((await api('pmo', 'POST', `/api/documents/${d.body.id}/versions`, { content: 'line 1\nline 2' })).status).toBe(200);
    expect((await api('pmo', 'POST', `/api/documents/${d.body.id}/checkout`)).status).toBe(200);
    expect((await api('pm1', 'PATCH', `/api/r/documents/${d.body.id}`, { name: 'Edited by someone else' })).status).toBe(422);
    expect((await api('pm1', 'POST', `/api/documents/${d.body.id}/checkout`)).status).toBe(409);
    expect((await api('pmo', 'POST', `/api/documents/${d.body.id}/checkin`, { content: 'line 1\nline 2 changed\nline 3', change_note: 'edit' })).body.version).toBe(2);
    const cmp = await api('pmo', 'GET', `/api/documents/${d.body.id}/compare?from=1&to=2`);
    expect(cmp.body.added).toBe(2); expect(cmp.body.removed).toBe(1);
    expect((await api('pmo', 'PUT', `/api/documents/${d.body.id}/retention`, { legal_hold: true, reason: 'Litigation L-42' })).status).toBe(200);
    expect((await api('admin', 'DELETE', `/api/r/documents/${d.body.id}`)).status).toBe(422);
  });
  it('approved BIA history is immutable and a material edit re-opens review (§8.2)', async () => {
    const bia = (await pool.query(`SELECT id FROM bia_assessments WHERE status='approved' AND deleted_at IS NULL LIMIT 1`)).rows[0];
    if (!bia) return;
    const before = (await api('bcm', 'GET', `/api/bia/${bia.id}/versions`)).body.length;
    const pr = await api('bcm', 'PATCH', `/api/r/bia_assessments/${bia.id}`, { critical_outputs: 'Authorisation decisions; settlement files' });
    expect(pr.status).toBe(200); expect(pr.body.status).toBe('draft'); expect(pr.body.review_trigger).toMatch(/critical_outputs/);
    expect((await api('bcm', 'GET', `/api/bia/${bia.id}/versions`)).body.length).toBe(before);
  });
});

// ------------------------------------------------------------------ procurement, comms, products
describe('Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034)', () => {
  it('a declared conflict of interest blocks bid scoring', async () => {
    const t = (await find('procurement', 'tenders', {}))[0];
    const bid = (await find('procurement', 'tender_bids', { tender_id: t.id }))[0];
    expect((await api('procurement', 'POST', `/api/tenders/${t.id}/coi`, { has_conflict: true })).status).toBe(400);
    expect((await api('procurement', 'POST', `/api/tenders/${t.id}/coi`, { has_conflict: true, details: 'Former employer' })).status).toBe(201);
    expect((await api('procurement', 'PUT', `/api/tender-bids/${bid.id}/scores`, { scores: { capability: 5 } })).status).toBe(403);
    await api('procurement', 'POST', `/api/tenders/${t.id}/coi`, { has_conflict: false });
  });
  it('announcements are published via the endpoint and acknowledgements tracked', async () => {
    const a = await api('pmo', 'POST', '/api/r/announcements', { name: 'Freeze window', body: 'Change freeze from Friday.', context_type: 'none' });
    expect((await api('pmo', 'PATCH', `/api/r/announcements/${a.body.id}`, { status: 'published' })).status).toBe(422);
    expect((await api('dev1', 'POST', `/api/announcements/${a.body.id}/ack`)).status).toBe(422);
    expect((await api('pmo', 'POST', `/api/announcements/${a.body.id}/publish`, { audience_roles: ['member'] })).status).toBe(200);
    expect((await api('dev1', 'POST', `/api/announcements/${a.body.id}/ack`)).status).toBe(200);
    const s = await api('pmo', 'GET', `/api/announcements/${a.body.id}/acks`);
    expect(s.body.acknowledged).toBe(1); expect(s.body.audience).toBeGreaterThanOrEqual(4);
  });
  it('product health is unknown without metric data, and computed once values exist', async () => {
    const pr = byName(products, 'Customer Mobile App');
    const m = await api('product', 'POST', '/api/r/product_metrics', { name: 'Weekly active users', product_id: pr.id, metric_key: 'wau', target_value: 1000 });
    expect(m.status).toBe(201);
    const s0 = await api('product', 'GET', `/api/product-metrics/${m.body.id}/series`);
    expect(s0.body.on_track).toBeNull();
    await api('product', 'POST', `/api/product-metrics/${m.body.id}/values`, { values: [{ period_date: day(-7), value: 900 }, { period_date: today(), value: 1100 }] });
    const s1 = await api('product', 'GET', `/api/product-metrics/${m.body.id}/series`);
    expect(s1.body.on_track).toBe(true);
    const rv = await api('product', 'POST', `/api/products/${pr.id}/roadmap-versions`, { rationale: 'Quarterly re-plan' });
    expect(rv.status).toBe(201);
    await expect(pool.query(`UPDATE roadmap_versions SET rationale='x' WHERE id=$1`, [rv.body.id])).rejects.toThrow();
  });
  it('comments notify @mentioned users', async () => {
    const p = byName(projects, 'Mobile App 3.0 Redesign');
    const c = await api('pm1', 'POST', '/api/comments', { entity_type: 'projects', entity_id: p.id, body: 'Please review the plan @dev2@demo.example' });
    expect(c.status).toBe(201); expect(c.body.mentions.length).toBe(1);
    const n = (await pool.query(`SELECT 1 FROM notifications WHERE user_id=$1 AND kind='mention'`, [await uid('dev2')])).rowCount;
    expect(n).toBeGreaterThan(0);
  });
  it('AI drafts can only be accepted by a person (AI never writes records)', async () => {
    const ctx = await ctxOf('pm1');
    const it = (await pool.query(`SELECT id FROM ai_intakes LIMIT 1`)).rows[0];
    await expect(tx((db) => acceptIntake(db, { ...ctx, actorType: 'ai' }, it?.id ?? '00000000-0000-0000-0000-000000000000', {}))).rejects.toThrow(/person|not found/i);
  });
  it('BPMN import rejects DTD/entity declarations (XXE)', async () => {
    const proc = (await find('ba', 'business_processes', {}))[0];
    const r = await api('ba', 'POST', `/api/processes/${proc.id}/bpmn`, { xml: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><definitions><process id="p"/></definitions>' });
    expect(r.status).toBe(400);
  });
  it('uploads with a malware signature are quarantined and cannot be downloaded', async () => {
    const app = await getApp(); const w = (await find('pm1', 'work_items', {}))[0];
    const boundary = '----meridiantest';
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const body = [`--${boundary}`, 'Content-Disposition: form-data; name="entity_type"', '', 'work_items', `--${boundary}`, 'Content-Disposition: form-data; name="entity_id"', '', w.id, `--${boundary}`, 'Content-Disposition: form-data; name="file"; filename="note.txt"', 'Content-Type: text/plain', '', eicar, `--${boundary}--`, ''].join('\r\n');
    const tok = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'pm1@demo.example', password: PASSWORD } })).json().token;
    const up = await app.inject({ method: 'POST', url: '/api/files', payload: body, headers: { authorization: `Bearer ${tok}`, 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(up.statusCode).toBe(201); expect(up.json().scan_status).not.toBe('clean');
    const dl = await app.inject({ method: 'GET', url: `/api/files/${up.json().id}/download`, headers: { authorization: `Bearer ${tok}` } });
    expect(dl.statusCode).toBe(403);
  });
});

describe('Controlled document generation (FR-DOC-004..007/013/014, FR-BA-009, FR-TST-009, AC-09)', () => {
  it('generates SOP, process flow, user guide, PMP, BRD/FRS, UAT report and minutes as drafts with sources and missing markers', async () => {
    const proc = (await find('ba', 'business_processes', {}))[0];
    const p = byName(projects, 'Mobile App 3.0 Redesign');
    const tp = (await find('tester', 'test_plans', {}))[0];
    const mtg = (await find('pmo', 'meetings', {}))[0];
    const cases: [string, Record<string, string>][] = [
      ['sop', { record_id: proc.id }], ['process_flow', { record_id: proc.id }], ['user_guide', { record_id: proc.id }],
      ['project_management_plan', { context_type: 'project', context_id: p.id }], ['requirements_spec', { context_type: 'project', context_id: p.id }],
      ['uat_report', { record_id: tp.id }], ['meeting_minutes', { record_id: mtg.id }],
    ];
    for (const [doc_type, extra] of cases) {
      const r = await api('pmo', 'POST', '/api/documents/generate', { doc_type, ...extra });
      expect(r.status, `${doc_type}: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(200);
      expect(r.body.content).toMatch(/DRAFT – not approved/);
      expect(r.body.source_refs.length).toBeGreaterThan(0);
      const d = await api('pmo', 'GET', `/api/r/documents/${r.body.document_id}`);
      expect(d.body.status).toBe('draft');
    }
    const flow = await api('pmo', 'POST', '/api/documents/generate', { doc_type: 'process_flow', record_id: proc.id });
    expect(flow.body.content).toMatch(/flowchart LR/);
    const ug = await api('pmo', 'POST', '/api/documents/generate', { doc_type: 'user_guide', record_id: proc.id });
    expect(ug.body.missing_fields).toContain('Screenshots');
  });
});
