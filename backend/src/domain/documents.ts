/**
 * Document generation from structured platform data.
 * Rules: never invent facts. Every missing input is rendered as an explicit "MISSING" marker and
 * recorded in missing_fields; every record used is listed in source_refs; status starts as draft.
 */
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { badRequest, notFound } from '../core/errors.js';
import { biaAnalysis } from './bia.js';
import { evaluateBusinessCase, financeSummary } from './finance.js';
import { projectHealth, thresholds } from './dashboard.js';
import { releaseReadiness } from './release.js';
import { riskScore } from './calc.js';

interface Gen { title: string; md: string[]; missing: string[]; sources: { type: string; id: string; code: string }[] }
const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const money = (v: any, cur = 'MYR') => (v === null || v === undefined ? null : `${cur} ${Number(v).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`);

function g(title: string): Gen { return { title, md: [`# ${title}`, ''], missing: [], sources: [] }; }
function field(G: Gen, label: string, v: unknown) {
  const s = fmt(v);
  if (s === null) { G.missing.push(label); G.md.push(`- **${label}:** ⚠ MISSING – not recorded in the platform`); }
  else G.md.push(`- **${label}:** ${s}`);
}
function section(G: Gen, title: string, body?: string | null, label?: string) {
  G.md.push('', `## ${title}`, '');
  if (body === undefined) return;
  if (!body || !String(body).trim()) { G.missing.push(label ?? title); G.md.push(`⚠ MISSING – ${label ?? title} has not been recorded.`); }
  else G.md.push(String(body));
}
function table(G: Gen, headers: string[], rows: (string | number | null)[][], empty = 'None recorded.') {
  if (!rows.length) { G.md.push(`_${empty}_`); return; }
  G.md.push(`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
  for (const r of rows) G.md.push(`| ${r.map((c) => (c === null || c === undefined ? '—' : String(c).replace(/\|/g, '/').replace(/\n/g, ' '))).join(' | ')} |`);
}
const src = (G: Gen, type: string, row: any) => { if (row?.id) G.sources.push({ type, id: row.id, code: row.code }); };

async function loadProject(db: Db, ctx: Ctx, id: string) {
  const p = (await db.query(`SELECT p.*, u.name AS owner_name, s.name AS sponsor_name, pf.name AS portfolio_name, pg.name AS programme_name, o.name AS objective_name
    FROM projects p LEFT JOIN users u ON u.id=p.owner_id LEFT JOIN users s ON s.id=p.sponsor_id LEFT JOIN portfolios pf ON pf.id=p.portfolio_id LEFT JOIN programmes pg ON pg.id=p.programme_id LEFT JOIN objectives o ON o.id=p.objective_id
    WHERE p.id=$1 AND p.org_id=$2 AND p.deleted_at IS NULL`, [id, ctx.orgId])).rows[0];
  if (!p) throw notFound('Project');
  return p;
}

async function loadProcess(db: Db, ctx: Ctx, id?: string) {
  if (!id) throw badRequest('record_id (business process id) is required');
  const proc = (await db.query(`SELECT bp.*, u.name AS owner_name FROM business_processes bp LEFT JOIN users u ON u.id=bp.owner_id WHERE bp.id=$1 AND bp.org_id=$2 AND bp.deleted_at IS NULL`, [id, ctx.orgId])).rows[0];
  if (!proc) throw notFound('Process');
  const steps = (await db.query(`SELECT * FROM process_steps WHERE process_id=$1 AND deleted_at IS NULL AND status='active' ORDER BY seq`, [id])).rows;
  return { proc, steps };
}
const raid = async (db: Db, type: string, id: string) => ({
  risks: (await db.query(`SELECT r.*, u.name owner_name FROM risks r LEFT JOIN users u ON u.id=r.owner_id WHERE context_type=$1 AND context_id=$2 AND r.deleted_at IS NULL ORDER BY likelihood*impact DESC`, [type, id])).rows,
  issues: (await db.query(`SELECT i.*, u.name owner_name FROM issues i LEFT JOIN users u ON u.id=i.owner_id WHERE context_type=$1 AND context_id=$2 AND i.deleted_at IS NULL ORDER BY created_at`, [type, id])).rows,
  assumptions: (await db.query(`SELECT * FROM assumptions WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL`, [type, id])).rows,
  dependencies: (await db.query(`SELECT * FROM dependencies WHERE ((from_type=$1 AND from_id=$2) OR (to_type=$1 AND to_id=$2)) AND deleted_at IS NULL`, [type, id])).rows,
});

const generators: Record<string, (db: Db, ctx: Ctx, p: { context_type?: string; context_id?: string; record_id?: string }) => Promise<Gen>> = {
  async project_charter(db, ctx, { context_id }) {
    const p = await loadProject(db, ctx, context_id!);
    const G = g(`Project Charter – ${p.code} ${p.name}`); src(G, 'projects', p);
    G.md.push(`_Generated from platform records on ${new Date().toISOString().slice(0, 10)}. Status: DRAFT – requires review and approval._`, '');
    section(G, '1. Project details');
    field(G, 'Project manager', p.owner_name); field(G, 'Sponsor', p.sponsor_name); field(G, 'Portfolio', p.portfolio_name); field(G, 'Programme', p.programme_name);
    field(G, 'Strategic objective', p.objective_name); field(G, 'Delivery approach', p.delivery_approach); field(G, 'Planned start', p.start_date); field(G, 'Planned finish', p.end_date);
    field(G, 'Budget at completion', money(p.budget_at_completion, p.currency)); field(G, 'Criticality', p.criticality);
    field(G, 'BIA screening outcome', p.bia_required === null ? null : p.bia_required ? 'BIA required' : 'BIA not required');
    section(G, '2. Purpose and background', p.description, 'Purpose / description');
    section(G, '3. Business case summary', p.business_case, 'Business case');
    section(G, '4. Scope', p.scope_statement, 'Scope statement');
    section(G, '5. Success criteria', p.success_criteria, 'Success criteria');
    const prods = (await db.query(`SELECT pr.id, pr.code, pr.name, pp.relationship FROM project_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.project_id=$1`, [p.id])).rows;
    section(G, '6. Products supported'); table(G, ['Code', 'Product', 'Relationship'], prods.map((x) => [x.code, x.name, x.relationship])); prods.forEach((x) => src(G, 'products', x));
    const ms = (await db.query(`SELECT * FROM milestones WHERE project_id=$1 AND deleted_at IS NULL ORDER BY due_date`, [p.id])).rows;
    section(G, '7. Key milestones'); table(G, ['Code', 'Milestone', 'Due', 'Gate'], ms.map((m) => [m.code, m.name, m.due_date, m.is_gate ? 'Yes' : 'No'])); ms.forEach((m) => src(G, 'milestones', m));
    if (!ms.length) G.missing.push('Milestones');
    const R = await raid(db, 'project', p.id);
    section(G, '8. Initial risks'); table(G, ['Code', 'Risk', 'Score', 'Owner'], R.risks.slice(0, 10).map((r) => [r.code, r.name, riskScore(r.likelihood, r.impact), r.owner_name])); R.risks.forEach((r) => src(G, 'risks', r));
    section(G, '9. Assumptions'); table(G, ['Code', 'Assumption', 'Status'], R.assumptions.map((a) => [a.code, a.name, a.status])); R.assumptions.forEach((a) => src(G, 'assumptions', a));
    section(G, '10. Approval'); G.md.push('This charter has not been approved. Approval is recorded through the platform workflow; signatures are not generated by the system.');
    return G;
  },
  async status_report(db, ctx, { context_id }) {
    const p = await loadProject(db, ctx, context_id!);
    const G = g(`Project Status Report – ${p.code} ${p.name}`); src(G, 'projects', p);
    const h = await projectHealth(db, ctx, p, await thresholds(db, ctx.orgId));
    G.md.push(`_Reporting date ${new Date().toISOString().slice(0, 10)} · generated from live records · DRAFT_`, '');
    section(G, 'Overall health');
    table(G, ['Dimension', 'RAG', 'Basis'], [['Overall', h.overall.toUpperCase(), 'Worst of known dimensions'], ['Schedule', h.schedule.toUpperCase(), `SPI ${h.spi ?? 'n/a'}`], ['Cost', h.cost.toUpperCase(), `CPI ${h.cpi ?? 'n/a'}`], ['Risk', h.risk.toUpperCase(), `${h.high_risks} high risk(s)`], ['Milestones', h.milestones.toUpperCase(), `${h.overdue_milestones} overdue`]]);
    if (h.data_gaps.length) { G.md.push('', `**Data gaps affecting this assessment:** ${h.data_gaps.join(', ')}.`); G.missing.push(...h.data_gaps); }
    section(G, 'Earned value');
    table(G, ['PV', 'EV', 'AC', 'SPI', 'CPI', 'EAC'], [[h.evm.pv, h.evm.ev, h.evm.ac, h.evm.spi, h.evm.cpi, h.evm.eac]]);
    const f = await financeSummary(db, ctx, 'project', p.id);
    section(G, 'Finance');
    field(G, 'Approved budget', money(f.approved_budget, f.currency)); field(G, 'Actual to date', money(f.actual, f.currency)); field(G, 'Commitments', money(f.commitments, f.currency)); field(G, 'Estimate at completion', money(f.estimate_at_completion, f.currency)); field(G, 'Variance at completion', money(f.variance_at_completion, f.currency));
    const ms = (await db.query(`SELECT * FROM milestones WHERE project_id=$1 AND deleted_at IS NULL AND status <> 'achieved' ORDER BY due_date LIMIT 8`, [p.id])).rows;
    section(G, 'Upcoming & overdue milestones'); table(G, ['Code', 'Milestone', 'Due', 'Baseline', 'Status'], ms.map((m) => [m.code, m.name, m.due_date, m.baseline_date, m.status])); ms.forEach((m) => src(G, 'milestones', m));
    const R = await raid(db, 'project', p.id);
    section(G, 'Top risks'); table(G, ['Code', 'Risk', 'Score', 'Treatment'], R.risks.filter((r) => r.status !== 'closed').slice(0, 5).map((r) => [r.code, r.name, riskScore(r.likelihood, r.impact), r.treatment]));
    section(G, 'Open issues'); table(G, ['Code', 'Issue', 'Severity', 'Due'], R.issues.filter((i) => !['resolved', 'closed'].includes(i.status)).map((i) => [i.code, i.name, i.severity, i.due_date]));
    const cr = (await db.query(`SELECT * FROM change_requests WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`, [p.id])).rows;
    section(G, 'Change requests'); table(G, ['Code', 'Change', 'Status', 'Cost impact', 'Days'], cr.map((c) => [c.code, c.name, c.status, c.impact_cost, c.impact_schedule_days])); cr.forEach((c) => src(G, 'change_requests', c));
    [...R.risks, ...R.issues].forEach((r) => src(G, r.code.startsWith('RSK') ? 'risks' : 'issues', r));
    return G;
  },
  async raid_report(db, ctx, { context_type, context_id }) {
    const t = context_type ?? 'project';
    const table_ = { project: 'projects', product: 'products', programme: 'programmes', portfolio: 'portfolios' }[t];
    if (!table_) throw badRequest('RAID report supports project, product, programme or portfolio');
    const e = (await db.query(`SELECT id, code, name FROM ${table_} WHERE id=$1 AND org_id=$2`, [context_id, ctx.orgId])).rows[0];
    if (!e) throw notFound('Context');
    const G = g(`RAID Log – ${e.code} ${e.name}`); src(G, table_, e);
    const R = await raid(db, t, e.id);
    section(G, 'Risks'); table(G, ['Code', 'Risk', 'Category', 'L', 'I', 'Score', 'Treatment', 'Owner', 'Status'], R.risks.map((r) => [r.code, r.name, r.category, r.likelihood, r.impact, riskScore(r.likelihood, r.impact), r.treatment, r.owner_name, r.status]));
    section(G, 'Assumptions'); table(G, ['Code', 'Assumption', 'Validate by', 'Status'], R.assumptions.map((a) => [a.code, a.name, a.validate_by, a.status]));
    section(G, 'Issues'); table(G, ['Code', 'Issue', 'Severity', 'Owner', 'Status'], R.issues.map((i) => [i.code, i.name, i.severity, i.owner_name, i.status]));
    section(G, 'Dependencies'); table(G, ['Code', 'Dependency', 'Type', 'Need by', 'Status'], R.dependencies.map((d) => [d.code, d.name, d.dependency_type, d.need_by, d.status]));
    for (const [k, rows] of Object.entries(R)) rows.forEach((r: any) => src(G, k, r));
    return G;
  },
  async bia_report(db, ctx, { record_id }) {
    if (!record_id) throw badRequest('record_id (BIA id) is required');
    const a = await biaAnalysis(db, ctx, record_id);
    const b = a.bia;
    const G = g(`Business Impact Analysis – ${b.code} ${b.name}`); src(G, 'bia_assessments', b);
    G.md.push(`_Status: ${b.status.toUpperCase()} · Assessment level: ${b.assessment_level} · Aligned to ISO 22301 / ISO/TS 22317 concepts (no certification implied)._`, '');
    section(G, 'Recovery objectives');
    field(G, 'Tolerance threshold (severity)', b.tolerance_threshold); field(G, 'MTPD (hours)', b.mtpd_hours); field(G, 'RTO (hours)', b.rto_hours); field(G, 'RPO (hours)', b.rpo_hours); field(G, 'MBCO (%)', b.mbco_pct); field(G, 'Criticality tier', b.criticality_tier);
    if (b.mtpd_override_reason) G.md.push(`- **MTPD override justification:** ${b.mtpd_override_reason}`);
    section(G, 'Impact over time (severity 0–5)');
    table(G, ['Category', ...a.horizons.map((h) => `${h}h`)], a.matrix.map((m) => [m.category, ...m.cells.map((c: any) => (c ? c.severity : null))]), 'No impacts recorded.');
    if (!a.impacts.length) G.missing.push('Impact assessment');
    section(G, 'Dependencies'); table(G, ['Type', 'Dependency', 'Recovery capability (h)', 'Data-loss capability (h)', 'SPOF'], a.dependencies.map((d: any) => [d.dependency_type, d.name, d.recovery_capability_hours, d.data_loss_capability_hours, d.single_point_of_failure ? 'Yes' : 'No']));
    section(G, 'Recovery strategies'); table(G, ['Code', 'Strategy', 'Type', 'Achievable RTO', 'Last tested', 'Result'], a.strategies.map((s: any) => [s.code, s.name, s.strategy_type, s.achievable_rto_hours, s.last_tested_on, s.test_result])); a.strategies.forEach((s: any) => src(G, 'recovery_strategies', s));
    section(G, 'Manual workarounds', b.manual_workarounds, 'Manual workarounds');
    section(G, 'Business continuity requirements', b.bc_requirements, 'BC requirements');
    section(G, 'Disaster recovery requirements', b.dr_requirements, 'DR requirements');
    section(G, 'Validation findings'); table(G, ['Severity', 'Finding'], a.findings.map((f) => [f.severity.toUpperCase(), f.message]), 'No findings – BIA is internally consistent.');
    return G;
  },
  async business_case(db, ctx, { record_id }) {
    if (!record_id) throw badRequest('record_id (business case id) is required');
    const e = await evaluateBusinessCase(db, ctx, record_id);
    const b = e.business_case;
    const G = g(`Business Case – ${b.code} ${b.name}`); src(G, 'business_cases', b);
    section(G, 'Problem / opportunity', b.problem, 'Problem statement');
    section(G, 'Options considered', b.options_considered, 'Options considered');
    section(G, 'Recommended option', b.recommended_option, 'Recommended option');
    section(G, 'Financial appraisal');
    field(G, 'Discount rate', `${(Number(b.discount_rate) * 100).toFixed(1)}%`); field(G, 'Cash flows (year 0..n)', (b.cash_flows ?? []).length ? b.cash_flows.join(', ') : null);
    field(G, 'NPV', e.npv); field(G, 'IRR', e.irr === null ? null : `${(e.irr * 100).toFixed(1)}%`); field(G, 'Payback (years)', e.payback_years); field(G, 'ROI', e.roi_pct === null ? null : `${e.roi_pct}%`); field(G, 'Total cost of ownership', b.total_cost_of_ownership);
    if (e.irr === null && (b.cash_flows ?? []).length) G.md.push('', '_IRR is undefined for these cash flows (no sign change)._');
    return G;
  },
  async closure_report(db, ctx, { context_id }) {
    const p = await loadProject(db, ctx, context_id!);
    const G = g(`Project Closure Report – ${p.code} ${p.name}`); src(G, 'projects', p);
    section(G, 'Schedule performance');
    field(G, 'Baseline finish', p.baseline_end); field(G, 'Forecast / planned finish', p.end_date); field(G, 'Actual finish', p.actual_end);
    const f = await financeSummary(db, ctx, 'project', p.id);
    section(G, 'Cost performance'); field(G, 'Approved budget', money(f.approved_budget, f.currency)); field(G, 'Actual cost', money(f.actual, f.currency)); field(G, 'Variance', money(f.approved_budget === null ? null : f.approved_budget - f.actual, f.currency));
    const d = (await db.query(`SELECT * FROM deliverables WHERE project_id=$1 AND deleted_at IS NULL`, [p.id])).rows;
    section(G, 'Deliverables'); table(G, ['Code', 'Deliverable', 'Status'], d.map((x) => [x.code, x.name, x.status])); d.forEach((x) => src(G, 'deliverables', x));
    const bens = (await db.query(`SELECT * FROM benefits WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`, [p.id])).rows;
    section(G, 'Benefits handed over for tracking'); table(G, ['Code', 'Benefit', 'Baseline', 'Target', 'Actual', 'Owner status'], bens.map((b) => [b.code, b.name, b.baseline_value, b.target_value, b.actual_value, b.status])); bens.forEach((b) => src(G, 'benefits', b));
    const open = await raid(db, 'project', p.id);
    section(G, 'Open items transferred'); table(G, ['Code', 'Item', 'Status'], [...open.risks.filter((r) => r.status !== 'closed'), ...open.issues.filter((i) => !['resolved', 'closed'].includes(i.status))].map((x) => [x.code, x.name, x.status]));
    section(G, 'Closure summary', p.closure_summary, 'Closure summary');
    section(G, 'Lessons learned', p.lessons_learned, 'Lessons learned');
    G.md.push('', '_Note: closing a project does not close the products it supported; product lifecycle continues independently._');
    return G;
  },
  async release_readiness(db, ctx, { record_id }) {
    if (!record_id) throw badRequest('record_id (release id) is required');
    const r = await releaseReadiness(db, ctx, record_id);
    const G = g(`Release Readiness / CAB Pack – ${r.release.code} ${r.release.name}`); src(G, 'releases', r.release);
    field(G, 'Version', r.release.version_label); field(G, 'Planned date', r.release.planned_date); field(G, 'Release type', r.release.release_type);
    section(G, 'Readiness verdict'); G.md.push(r.ready ? '**All mandatory readiness checks pass.** Deployment still requires human authorisation.' : '**NOT READY** – one or more mandatory checks fail.');
    section(G, 'Checks'); table(G, ['Check', 'Mandatory', 'Result', 'Detail'], r.checks.map((c) => [c.label, c.mandatory ? 'Yes' : 'No', c.passed ? 'PASS' : 'FAIL', c.detail]));
    section(G, 'Deployment plan', r.release.deployment_plan, 'Deployment plan');
    section(G, 'Rollback plan', r.release.rollback_plan, 'Rollback plan');
    section(G, 'Support model', r.release.support_model, 'Support model');
    return G;
  },

  // ---------------------------------------------------------------- FRS v1.1 generators (FR-DOC-004..007, FR-BA-009, FR-TST-009, FR-MTG-006, AC-09)
  async sop(db, ctx, { record_id }) {
    const { proc, steps } = await loadProcess(db, ctx, record_id);
    const G = g(`SOP – ${proc.name}`); src(G, 'business_processes', proc);
    field(G, 'Process', `${proc.code} ${proc.name} (v${proc.version_label}, ${proc.process_state})`); field(G, 'Process owner', proc.owner_name); field(G, 'Criticality', proc.criticality);
    section(G, 'Purpose', proc.description, 'Process purpose / description');
    section(G, 'Roles'); table(G, ['Role / lane', 'Steps'], [...new Set(steps.map((x: any) => x.lane ?? 'Unassigned'))].map((l) => [l, steps.filter((x: any) => (x.lane ?? 'Unassigned') === l).map((x: any) => x.seq).join(', ')]));
    if (steps.some((x: any) => !x.lane)) G.missing.push('Role (lane) for one or more steps');
    section(G, 'Procedure');
    if (!steps.length) { G.missing.push('Process steps'); G.md.push('⚠ MISSING – no approved process steps recorded.'); }
    for (const st of steps) { G.md.push(`${st.seq}. **${st.name}**${st.lane ? ` _(${st.lane})_` : ''}${st.step_type === 'decision' ? ' – decision point' : ''}`); if (st.description) G.md.push(`   ${st.description}`); src(G, 'process_steps', st); }
    const ctrls = (await db.query(`SELECT code, name, framework, effectiveness FROM controls WHERE org_id=$1 AND deleted_at IS NULL AND (name ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%') LIMIT 10`, [ctx.orgId, proc.name.split(' ')[0]])).rows;
    section(G, 'Controls & evidence'); table(G, ['Control', 'Framework', 'Effectiveness'], ctrls.map((c: any) => [`${c.code} ${c.name}`, c.framework, c.effectiveness]), 'No linked controls recorded – confirm with the control owner.');
    section(G, 'Exceptions'); const dec = steps.filter((x: any) => x.step_type === 'decision'); table(G, ['Decision step', 'Guidance'], dec.map((d: any) => [d.name, d.description]), 'No decision/exception paths modelled.');
    section(G, 'Revision history'); const hist = (await db.query(`SELECT action, occurred_at FROM audit_events WHERE entity_id=$1 ORDER BY id DESC LIMIT 10`, [proc.id])).rows;
    table(G, ['Change', 'When'], hist.map((h: any) => [h.action, new Date(h.occurred_at).toISOString().slice(0, 10)]));
    return G;
  },
  async process_flow(db, ctx, { record_id }) {
    const { proc, steps } = await loadProcess(db, ctx, record_id);
    const G = g(`Process flow – ${proc.name}`); src(G, 'business_processes', proc);
    field(G, 'Version', proc.version_label); field(G, 'State', proc.process_state);
    section(G, 'Flow (Mermaid)'); if (!steps.length) { G.missing.push('Process steps'); G.md.push('⚠ MISSING – no process steps.'); return G; }
    const id = (n: number) => `S${n}`; const label = (t: string) => t.replace(/["[\]{}()<>|]/g, ' ');
    G.md.push('```mermaid', 'flowchart LR');
    for (const st of steps) G.md.push(`  ${id(st.seq)}${st.step_type === 'decision' ? `{"${label(st.name)}"}` : st.step_type === 'start' || st.step_type === 'end' ? `(["${label(st.name)}"])` : `["${label(st.name)}"]`}`);
    for (const [i, st] of steps.entries()) { const nx: number[] = st.next_step_seq?.length ? st.next_step_seq : steps[i + 1] ? [steps[i + 1].seq] : []; for (const n of nx) G.md.push(`  ${id(st.seq)} --> ${id(n)}`); }
    G.md.push('```', '', `BPMN 2.0 XML export: GET /api/processes/${proc.id}/bpmn`);
    return G;
  },
  async user_guide(db, ctx, { record_id }) {
    const { proc, steps } = await loadProcess(db, ctx, record_id);
    const G = g(`User guide – ${proc.name}`); src(G, 'business_processes', proc);
    section(G, 'Who this guide is for'); const lanes = [...new Set(steps.map((x: any) => x.lane).filter(Boolean))]; G.md.push(lanes.length ? lanes.map((l) => `- ${l}`).join('\n') : '⚠ MISSING – roles (lanes) not modelled.'); if (!lanes.length) G.missing.push('Roles');
    section(G, 'Prerequisites', proc.description, 'Prerequisites / process context');
    for (const l of lanes.length ? lanes : ['All users']) {
      section(G, `Instructions – ${l}`);
      const mine = steps.filter((x: any) => !lanes.length || x.lane === l);
      mine.forEach((st: any, i: number) => G.md.push(`${i + 1}. ${st.name}${st.description ? ` – ${st.description}` : ''}`));
    }
    section(G, 'Screenshots'); G.md.push('⚠ MISSING – attach screenshots via the document Files panel; they are not generated automatically.'); G.missing.push('Screenshots');
    section(G, 'Troubleshooting'); const ke = (await db.query(`SELECT code, name, root_cause FROM defects WHERE org_id=$1 AND status='known_error' AND deleted_at IS NULL LIMIT 10`, [ctx.orgId])).rows;
    table(G, ['Known error', 'Cause / workaround'], ke.map((k: any) => [`${k.code} ${k.name}`, k.root_cause]), 'No known errors recorded.');
    return G;
  },
  async project_management_plan(db, ctx, { context_id }) {
    const p = await loadProject(db, ctx, context_id!); const G = g(`Project Management Plan – ${p.code} ${p.name}`); src(G, 'projects', p);
    field(G, 'Sponsor', p.sponsor_name); field(G, 'Project manager', p.owner_name); field(G, 'Delivery approach', p.delivery_approach); field(G, 'Governance tier', p.governance_tier);
    section(G, 'Scope management', p.scope_statement, 'Scope statement');
    const bl = (await db.query(`SELECT version, reason, created_at FROM project_baselines WHERE project_id=$1 ORDER BY version`, [p.id])).rows;
    section(G, 'Schedule management'); field(G, 'Baseline start', p.baseline_start); field(G, 'Baseline finish', p.baseline_end); field(G, 'Current forecast finish', p.end_date);
    table(G, ['Baseline version', 'Reason', 'Date'], bl.map((b: any) => [b.version, b.reason, new Date(b.created_at).toISOString().slice(0, 10)]), 'No baseline set – baselines are required before execution.'); if (!bl.length) G.missing.push('Approved baseline');
    const ms = (await db.query(`SELECT code, name, due_date, baseline_date, is_gate, status FROM milestones WHERE project_id=$1 AND deleted_at IS NULL ORDER BY due_date`, [p.id])).rows;
    table(G, ['Milestone', 'Due', 'Baseline', 'Gate', 'Status'], ms.map((m: any) => [`${m.code} ${m.name}`, m.due_date, m.baseline_date, m.is_gate ? 'Yes' : 'No', m.status]));
    section(G, 'Cost management'); field(G, 'Budget at completion', money(p.budget_at_completion, p.currency));
    const fs = await financeSummary(db, ctx, 'project', p.id); G.md.push(`- Approved budget: ${money(fs.approved_budget) ?? '—'}; actuals: ${money(fs.actual) ?? '—'}; commitments: ${money(fs.commitments) ?? '—'}`);
    section(G, 'Quality management'); const qr = (await db.query(`SELECT code, name, review_type, scheduled_on, result FROM quality_reviews WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL ORDER BY scheduled_on`, [p.id])).rows;
    table(G, ['Review', 'Type', 'Scheduled', 'Result'], qr.map((q: any) => [`${q.code} ${q.name}`, q.review_type, q.scheduled_on, q.result]), 'No quality reviews planned.'); if (!qr.length) G.missing.push('Quality assurance activities');
    section(G, 'Responsibilities (RACI)'); const raci = (await db.query(`SELECT ra.name, ra.responsibility, u.name person FROM raci_assignments ra JOIN users u ON u.id=ra.user_id WHERE ra.context_type='project' AND ra.context_id=$1 AND ra.deleted_at IS NULL ORDER BY ra.name, ra.responsibility`, [p.id])).rows;
    table(G, ['Item', 'R/A/C/I', 'Person'], raci.map((r: any) => [r.name, r.responsibility, r.person]), 'No RACI recorded.'); if (!raci.length) G.missing.push('RACI');
    section(G, 'Communications'); const com = (await db.query(`SELECT name, audience, channel, frequency FROM communications WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`, [p.id])).rows;
    table(G, ['Communication', 'Audience', 'Channel', 'Frequency'], com.map((x: any) => [x.name, x.audience, x.channel, x.frequency]), 'No communication plan recorded.'); if (!com.length) G.missing.push('Communication plan');
    const R = await raid(db, 'project', p.id);
    section(G, 'Risk management'); G.md.push(`${R.risks.length} risk(s) recorded; ${R.risks.filter((r: any) => riskScore(r.likelihood, r.impact)! >= 12).length} high or critical. See RAID report for detail.`);
    section(G, 'Change control'); G.md.push('Baselined scope, schedule and budget change only through approved change requests (impact-assessed, authority-routed). An approved change on a baselined project creates a new baseline version automatically.');
    return G;
  },
  async requirements_spec(db, ctx, { context_type, context_id }) {
    if (!context_type || !context_id || !['project', 'product'].includes(context_type)) throw badRequest('requirements_spec requires context_type project|product and context_id');
    const ctxRow = (await db.query(`SELECT id, code, name FROM ${context_type === 'project' ? 'projects' : 'products'} WHERE id=$1 AND org_id=$2`, [context_id, ctx.orgId])).rows[0]; if (!ctxRow) throw notFound('Context');
    const G = g(`Requirements Specification (BRD/FRS) – ${ctxRow.code} ${ctxRow.name}`); src(G, context_type === 'project' ? 'projects' : 'products', ctxRow);
    const reqs = (await db.query(`SELECT r.*, o.code AS objective_code, (SELECT string_agg(tc.code || ':' || COALESCE((SELECT te.result FROM test_executions te WHERE te.test_case_id=tc.id AND te.deleted_at IS NULL ORDER BY executed_at DESC LIMIT 1),'not_run'), ' ') FROM test_cases tc WHERE tc.requirement_id=r.id AND tc.deleted_at IS NULL) AS tests
      FROM requirements r LEFT JOIN objectives o ON o.id=r.objective_id WHERE r.context_type=$1 AND r.context_id=$2 AND r.deleted_at IS NULL AND r.classification <> 'restricted' ORDER BY r.req_type, r.code`, [context_type, context_id])).rows;
    if (!reqs.length) { G.missing.push('Requirements'); G.md.push('⚠ MISSING – no requirements recorded.'); return G; }
    for (const t of ['business', 'functional', 'non_functional', 'regulatory', 'bc_dr']) {
      const rs = reqs.filter((r: any) => r.req_type === t); if (!rs.length) continue;
      section(G, `${t.replace('_', '-').replace(/^./, (c) => c.toUpperCase())} requirements`);
      for (const r of rs) { src(G, 'requirements', r); G.md.push(`### ${r.code} ${r.name}`, `- Priority: ${r.priority} · Status: ${r.status} · Version: ${r.version ?? 1}${r.origin === 'ai' ? ' · Origin: AI draft (human-accepted)' : ''}`, r.description ? r.description : '', `- **Acceptance criteria:** ${r.acceptance_criteria ?? '⚠ MISSING'}`); if (!r.acceptance_criteria) G.missing.push(`${r.code} acceptance criteria`); G.md.push(''); }
    }
    section(G, 'Requirements traceability matrix'); table(G, ['Requirement', 'Objective', 'Tests (last result)', 'Status'], reqs.map((r: any) => [r.code, r.objective_code, r.tests, r.status]));
    return G;
  },
  async uat_report(db, ctx, { record_id }) {
    if (!record_id) throw badRequest('record_id (test plan id) is required');
    const tp = (await db.query(`SELECT tp.*, u.name AS business_owner FROM test_plans tp LEFT JOIN users u ON u.id=tp.business_owner_id WHERE tp.id=$1 AND tp.org_id=$2 AND tp.deleted_at IS NULL`, [record_id, ctx.orgId])).rows[0]; if (!tp) throw notFound('Test plan');
    const G = g(`${tp.test_level === 'uat' ? 'UAT' : 'Test completion'} report – ${tp.code} ${tp.name}`); src(G, 'test_plans', tp);
    field(G, 'Test level', tp.test_level); field(G, 'Business owner', tp.business_owner); field(G, 'Pass threshold', `${tp.pass_threshold_pct}%`); field(G, 'Plan status', tp.status);
    section(G, 'Entry criteria', tp.entry_criteria, 'Entry criteria'); section(G, 'Exit criteria', tp.exit_criteria, 'Exit criteria');
    const cases = (await db.query(`SELECT tc.code, tc.name, r.code AS req, (SELECT row_to_json(x) FROM (SELECT te.result, te.executed_at, te.build_version, te.evidence_ref, u.name AS tester FROM test_executions te LEFT JOIN users u ON u.id=te.executed_by WHERE te.test_case_id=tc.id AND te.deleted_at IS NULL ORDER BY te.executed_at DESC LIMIT 1) x) AS last
      FROM test_cases tc LEFT JOIN requirements r ON r.id=tc.requirement_id WHERE tc.test_plan_id=$1 AND tc.deleted_at IS NULL ORDER BY tc.code`, [tp.id])).rows;
    const run = cases.filter((c: any) => c.last && c.last.result !== 'not_run'); const passed = run.filter((c: any) => c.last.result === 'passed').length;
    section(G, 'Summary'); G.md.push(cases.length ? `${cases.length} case(s); ${run.length} executed; ${passed} passed; pass rate ${run.length ? Math.round((passed / cases.length) * 1000) / 10 + '%' : 'not available (no executions)'} of all cases.` : '⚠ MISSING – no test cases.'); if (!cases.length) G.missing.push('Test cases');
    table(G, ['Case', 'Requirement', 'Result', 'Tester', 'Build', 'Evidence'], cases.map((c: any) => [`${c.code} ${c.name}`, c.req, c.last?.result ?? 'not run', c.last?.tester, c.last?.build_version, c.last?.evidence_ref]));
    const defs = (await db.query(`SELECT code, name, severity, status FROM defects WHERE ((context_type=$1 AND context_id=$2) OR release_id IS NOT DISTINCT FROM $3) AND deleted_at IS NULL AND status NOT IN ('closed') ORDER BY severity`, [tp.context_type, tp.context_id, tp.release_id])).rows;
    section(G, 'Open defects & dispositions'); table(G, ['Defect', 'Severity', 'Status'], defs.map((d: any) => [`${d.code} ${d.name}`, d.severity, d.status]));
    section(G, 'Business sign-off'); G.md.push(tp.status === 'signed_off' ? `Signed off by ${tp.business_owner ?? '⚠ MISSING owner'}.` : '**Not signed off.** Sign-off is recorded by the business owner on the test plan; this report does not constitute acceptance.');
    return G;
  },
  async meeting_minutes(db, ctx, { record_id }) {
    if (!record_id) throw badRequest('record_id (meeting id) is required');
    const m = (await db.query(`SELECT * FROM meetings WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [record_id, ctx.orgId])).rows[0]; if (!m) throw notFound('Meeting');
    const G = g(`Minutes – ${m.name}`); src(G, 'meetings', m);
    field(G, 'Date/time', m.meeting_at ? new Date(m.meeting_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : null); field(G, 'Type', m.meeting_type); field(G, 'Attendees', m.attendees); field(G, 'Apologies', m.apologies);
    section(G, 'Agenda', m.agenda, 'Agenda'); section(G, 'Minutes', m.minutes, 'Minutes');
    const acts = (await db.query(`SELECT w.code, w.name, w.due_date, w.status, u.name AS owner FROM work_items w LEFT JOIN users u ON u.id=COALESCE(w.assignee_id, w.owner_id) WHERE w.meeting_id=$1 AND w.deleted_at IS NULL ORDER BY w.due_date`, [m.id])).rows;
    section(G, 'Actions'); table(G, ['Action', 'Owner', 'Due', 'Status'], acts.map((a: any) => [`${a.code} ${a.name}`, a.owner, a.due_date, a.status]), 'No actions linked to this meeting.');
    const decs = m.context_id ? (await db.query(`SELECT code, name, decision, decided_on FROM decisions WHERE context_id=$1 AND deleted_at IS NULL AND (decided_on IS NULL OR decided_on >= $2::date - 1) ORDER BY code LIMIT 20`, [m.context_id, m.meeting_at ?? new Date()])).rows : [];
    section(G, 'Decisions'); table(G, ['Decision', 'Outcome', 'Date'], decs.map((d: any) => [`${d.code} ${d.name}`, d.decision, d.decided_on]), 'No decisions recorded.');
    return G;
  },
};

export const DOC_GENERATORS = Object.keys(generators);

export async function generateDocument(db: Db, ctx: Ctx, input: { doc_type: string; context_type?: string; context_id?: string; record_id?: string }) {
  const gen = generators[input.doc_type];
  if (!gen) throw badRequest(`No generator for document type ${input.doc_type}. Available: ${DOC_GENERATORS.join(', ')}`);
  if (['project_charter', 'status_report', 'closure_report', 'project_management_plan'].includes(input.doc_type) && (input.context_type !== 'project' || !input.context_id)) throw badRequest('This document requires context_type=project and context_id');
  const G = await gen(db, ctx, input);
  const header = `> **Controlled document metadata** – Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by ${ctx.name} from platform records${input.context_type ? ` (${input.context_type})` : ''}. Status: **DRAFT – not approved** until the document approval workflow completes (FR-DOC-013/014).\n\n`;
  const content = header + G.md.join('\n') + `\n\n---\n**Source records:** ${[...new Map(G.sources.map((s) => [s.id, s])).values()].map((s) => s.code).join(', ') || 'none'}\n\n**Missing information (${G.missing.length}):** ${G.missing.length ? [...new Set(G.missing)].join('; ') : 'none'}\n`;
  const ctxType = input.context_type ?? 'none';
  const ctxId = input.context_type ? input.context_id ?? null : null;
  let doc = (await db.query(`SELECT * FROM documents WHERE org_id=$1 AND doc_type=$2 AND context_type IS NOT DISTINCT FROM $3 AND context_id IS NOT DISTINCT FROM $4 AND name=$5 AND deleted_at IS NULL FOR UPDATE`,
    [ctx.orgId, input.doc_type, ctxType, ctxId, G.title])).rows[0];
  if (!doc) {
    const code = await nextCode(db, ctx.orgId, 'DOC');
    doc = (await db.query(`INSERT INTO documents (org_id, code, name, context_type, context_id, doc_type, owner_id, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7) RETURNING *`,
      [ctx.orgId, code, G.title, ctxType, ctxId, input.doc_type, ctx.userId])).rows[0];
  }
  const version = doc.current_version + 1;
  await db.query(`INSERT INTO document_versions (org_id, document_id, version, content, generated, source_refs, missing_fields, created_by, change_note) VALUES ($1,$2,$3,$4,true,$5,$6,$7,'Generated from platform data')`,
    [ctx.orgId, doc.id, version, content, JSON.stringify(G.sources), JSON.stringify([...new Set(G.missing)]), ctx.userId]);
  await db.query(`UPDATE documents SET current_version=$2, status='draft' WHERE id=$1`, [doc.id, version]);
  await audit(db, ctx, 'generate', { type: 'documents', id: doc.id, code: doc.code }, null, { version, doc_type: input.doc_type, missing: G.missing.length });
  return { document_id: doc.id, code: doc.code, version, title: G.title, content, missing_fields: [...new Set(G.missing)], source_refs: G.sources };
}
