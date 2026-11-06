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
};

export const DOC_GENERATORS = Object.keys(generators);

export async function generateDocument(db: Db, ctx: Ctx, input: { doc_type: string; context_type?: string; context_id?: string; record_id?: string }) {
  const gen = generators[input.doc_type];
  if (!gen) throw badRequest(`No generator for document type ${input.doc_type}. Available: ${DOC_GENERATORS.join(', ')}`);
  if (['project_charter', 'status_report', 'closure_report'].includes(input.doc_type) && (input.context_type !== 'project' || !input.context_id)) throw badRequest('This document requires context_type=project and context_id');
  const G = await gen(db, ctx, input);
  const content = G.md.join('\n') + `\n\n---\n**Source records:** ${[...new Map(G.sources.map((s) => [s.id, s])).values()].map((s) => s.code).join(', ') || 'none'}\n\n**Missing information (${G.missing.length}):** ${G.missing.length ? [...new Set(G.missing)].join('; ') : 'none'}\n`;
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
