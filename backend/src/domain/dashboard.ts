/**
 * Executive intelligence – every figure here is computed live from structured records.
 * Each block declares the metric keys it uses (see metric_definitions) so the UI can show
 * formula, source, refresh and owner. Missing data yields null/'unknown', never zero or green.
 */
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { benefitRealisationPct, keyResultProgress, rag, riskScore, worstRag, type Rag, type Threshold } from './calc.js';
import { projectEvm, fxContext } from './finance.js';
import { toBase } from './calc.js';
import { capacity } from './resources.js';

export async function thresholds(db: Db, orgId: string): Promise<Record<string, Threshold>> {
  const out: Record<string, Threshold> = {};
  for (const r of (await db.query(`SELECT * FROM rag_thresholds WHERE org_id=$1`, [orgId])).rows) out[r.metric_key] = { direction: r.direction, green_at: Number(r.green_at), amber_at: Number(r.amber_at) };
  out.spi ??= { direction: 'higher_is_better', green_at: 0.95, amber_at: 0.85 };
  out.cpi ??= { direction: 'higher_is_better', green_at: 0.95, amber_at: 0.85 };
  out.high_risks ??= { direction: 'lower_is_better', green_at: 0, amber_at: 2 };
  out.overdue_milestones ??= { direction: 'lower_is_better', green_at: 0, amber_at: 1 };
  return out;
}

export async function projectHealth(db: Db, ctx: Ctx, p: any, th: Record<string, Threshold>) {
  const e = await projectEvm(db, ctx, p.id);
  const rk = (await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE status='open' AND likelihood*impact >= 12)::int high FROM risks WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`, [p.id])).rows[0];
  const hr = rk.high;
  const ms = (await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE due_date < current_date AND status NOT IN ('achieved'))::int overdue FROM milestones WHERE project_id=$1 AND deleted_at IS NULL`, [p.id])).rows[0];
  const schedule = rag(e.spi, th.spi), cost = rag(e.cpi, th.cpi);
  const risk: Rag = rk.total ? rag(hr, th.high_risks) : 'unknown'; // an empty risk register is a data gap, not "no risk"
  const milestones: Rag = ms.total ? rag(ms.overdue, th.overdue_milestones) : 'unknown';
  const overall = worstRag([schedule, cost, risk, milestones]);
  const gaps = [...e.missing, ...(ms.total ? [] : ['milestones']), ...(rk.total ? [] : ['risk register'])];
  return { schedule, cost, risk, milestones, overall, spi: e.spi, cpi: e.cpi, high_risks: hr, overdue_milestones: ms.overdue, data_gaps: gaps, evm: e };
}

export async function executiveDashboard(db: Db, ctx: Ctx) {
  const org = ctx.orgId;
  const th = await thresholds(db, org);
  const { base, rates } = await fxContext(db, org);
  const conv = (a: number, c: string) => toBase(Number(a), c, base, rates) ?? 0;

  const projects = (await db.query(`SELECT p.*, pf.name AS portfolio_name FROM projects p LEFT JOIN portfolios pf ON pf.id=p.portfolio_id WHERE p.org_id=$1 AND p.deleted_at IS NULL AND p.classification <> 'restricted' ORDER BY p.code`, [org])).rows;
  const active = projects.filter((p) => p.status === 'active');
  const health: any[] = [];
  for (const p of active) health.push({ id: p.id, code: p.code, name: p.name, portfolio: p.portfolio_name, stage: p.lifecycle_stage, strategic_score: p.strategic_score, risk_score: p.risk_score, bac: p.budget_at_completion, percent_complete: p.percent_complete, end_date: p.end_date, ...(await projectHealth(db, ctx, p, th)) });
  const dist = { green: 0, amber: 0, red: 0, unknown: 0 } as Record<Rag, number>;
  for (const h of health) dist[h.overall as Rag]++;

  // portfolio investment (approved budgets vs actuals, rolled up)
  const portfolios = (await db.query(`SELECT * FROM portfolios WHERE org_id=$1 AND deleted_at IS NULL ORDER BY code`, [org])).rows;
  const investment = [];
  for (const pf of portfolios) {
    const rows = (await db.query(`
      WITH ctx AS (SELECT 'portfolio'::text t, $1::uuid i UNION ALL SELECT 'project', id FROM projects WHERE portfolio_id=$1 AND deleted_at IS NULL
                   UNION ALL SELECT 'programme', id FROM programmes WHERE portfolio_id=$1 AND deleted_at IS NULL UNION ALL SELECT 'product', id FROM products WHERE portfolio_id=$1 AND deleted_at IS NULL)
      SELECT 'budget' k, b.amount, b.currency, b.expenditure_type FROM budgets b JOIN ctx ON b.context_type=ctx.t AND b.context_id=ctx.i WHERE b.status='approved' AND b.deleted_at IS NULL
      UNION ALL SELECT c.entry_kind, c.amount, c.currency, c.expenditure_type FROM cost_entries c JOIN ctx ON c.context_type=ctx.t AND c.context_id=ctx.i WHERE c.deleted_at IS NULL AND c.status='posted'`, [pf.id])).rows;
    const s = (k: string) => rows.filter((r) => r.k === k).reduce((a, r) => a + conv(r.amount, r.currency), 0);
    const hasBudget = rows.some((r) => r.k === 'budget');
    investment.push({ id: pf.id, code: pf.code, name: pf.name, theme: pf.investment_theme, envelope: pf.funding_envelope, approved_budget: hasBudget ? s('budget') : null, actual: s('actual'), commitment: s('commitment'), forecast: s('forecast'),
      capex: rows.filter((r) => r.k === 'budget' && r.expenditure_type === 'capex').reduce((a, r) => a + conv(r.amount, r.currency), 0),
      opex: rows.filter((r) => r.k === 'budget' && r.expenditure_type === 'opex').reduce((a, r) => a + conv(r.amount, r.currency), 0) });
  }

  // monthly actual spend trend (last 12 months)
  const trend = (await db.query(`SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') m, entry_kind, currency, sum(amount) amt FROM cost_entries
      WHERE org_id=$1 AND deleted_at IS NULL AND status='posted' AND entry_date >= (date_trunc('month', current_date) - interval '11 months') AND entry_date < (date_trunc('month', current_date) + interval '1 month')
      GROUP BY 1,2,3 ORDER BY 1`, [org])).rows;
  const months: Record<string, { month: string; actual: number; forecast: number; commitment: number }> = {};
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); const k = d.toISOString().slice(0, 7); months[k] = { month: k, actual: 0, forecast: 0, commitment: 0 }; }
  for (const t of trend) if (months[t.m]) (months[t.m] as any)[t.entry_kind] += conv(t.amt, t.currency);

  // risk heatmap & top risks
  const risks = (await db.query(`SELECT id, code, name, likelihood, impact, category, context_type, context_id, owner_id, treatment FROM risks WHERE org_id=$1 AND status <> 'closed' AND deleted_at IS NULL AND classification <> 'restricted'`, [org])).rows;
  const heat = Array.from({ length: 5 }, (_, li) => Array.from({ length: 5 }, (_, ii) => risks.filter((r) => r.likelihood === li + 1 && r.impact === ii + 1).length));
  const topRisks = risks.map((r) => ({ ...r, score: riskScore(r.likelihood, r.impact) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);
  const issues = (await db.query(`SELECT id, code, name, severity, due_date, context_type, context_id FROM issues WHERE org_id=$1 AND status IN ('open','in_progress') AND severity IN ('critical','high') AND deleted_at IS NULL ORDER BY severity='critical' DESC, due_date NULLS LAST LIMIT 8`, [org])).rows;

  // milestones
  const milestones = (await db.query(`SELECT m.id, m.code, m.name, m.due_date, m.baseline_date, m.status, m.is_gate, p.code AS project_code, p.name AS project_name, p.id AS project_id FROM milestones m JOIN projects p ON p.id=m.project_id
     WHERE m.org_id=$1 AND m.deleted_at IS NULL AND p.status='active' AND m.status <> 'achieved' AND m.due_date <= current_date + 120 ORDER BY m.due_date LIMIT 25`, [org])).rows;

  // strategy
  const objectives = (await db.query(`SELECT o.id, o.code, o.name, o.level, json_agg(json_build_object('id',k.id,'name',k.name,'baseline',k.baseline_value,'target',k.target_value,'current',k.current_value,'unit',k.unit)) FILTER (WHERE k.id IS NOT NULL) krs
     FROM objectives o LEFT JOIN key_results k ON k.objective_id=o.id AND k.deleted_at IS NULL WHERE o.org_id=$1 AND o.deleted_at IS NULL AND o.status='active' GROUP BY o.id ORDER BY o.code`, [org])).rows
    .map((o) => {
      const prog = (o.krs ?? []).map((k: any) => keyResultProgress(k.baseline, k.target, k.current)).filter((x: any) => x !== null);
      const linked = health.filter((h) => projects.find((p) => p.id === h.id)?.objective_id === o.id).length;
      return { id: o.id, code: o.code, name: o.name, level: o.level, key_results: o.krs ?? [], progress_pct: prog.length ? Math.round(prog.reduce((a: number, b: number) => a + b, 0) / prog.length) : null, linked_projects: linked };
    });

  // benefits
  const benefits = (await db.query(`SELECT * FROM benefits WHERE org_id=$1 AND deleted_at IS NULL`, [org])).rows;
  const fin = benefits.filter((b) => b.benefit_type === 'financial');
  const benefitSummary = {
    count: benefits.length,
    financial_target: fin.length ? fin.reduce((a, b) => a + Number(b.target_value ?? 0) - Number(b.baseline_value ?? 0), 0) : null,
    financial_actual: fin.length ? fin.reduce((a, b) => a + (b.actual_value === null ? 0 : Number(b.actual_value) - Number(b.baseline_value ?? 0)), 0) : null,
    measured: benefits.filter((b) => b.actual_value !== null).length,
    at_risk: benefits.filter((b) => b.status === 'at_risk').length,
    items: benefits.slice(0, 12).map((b) => ({ id: b.id, code: b.code, name: b.name, type: b.benefit_type, realisation_pct: benefitRealisationPct(b.baseline_value, b.target_value, b.actual_value), status: b.status, unit: b.unit })),
  };

  // products
  const products = (await db.query(`SELECT p.id, p.code, p.name, p.lifecycle_stage, p.health_score, p.criticality, p.active_users, p.nps, p.tech_debt_score,
      (SELECT count(*)::int FROM project_products pp JOIN projects pj ON pj.id=pp.project_id WHERE pp.product_id=p.id AND pj.status='active') active_projects
      FROM products p WHERE p.org_id=$1 AND p.deleted_at IS NULL ORDER BY p.code`, [org])).rows;

  // resources (this week)
  let utilisation = null as null | { average_pct: number | null; overallocated_people: number; people: number };
  if (can(ctx, 'resource_allocations:read')) {
    const cap = await capacity(db, ctx, { weeks: 1 });
    const vals = cap.users.map((u) => u.load[0].utilisation).filter((x): x is number => x !== null);
    utilisation = { average_pct: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, overallocated_people: cap.conflicts.length, people: cap.users.length };
  }

  // BIA & resilience
  const bia = (await db.query(`SELECT criticality_tier, status, next_review_date FROM bia_assessments WHERE org_id=$1 AND deleted_at IS NULL`, [org])).rows;
  const biaSummary = { total: bia.length, approved: bia.filter((b) => b.status === 'approved').length, review_overdue: bia.filter((b) => b.next_review_date && b.next_review_date < new Date().toISOString().slice(0, 10)).length,
    tiers: [1, 2, 3, 4].map((t) => ({ tier: t, count: bia.filter((b) => b.criticality_tier === t).length })), unknown_tier: bia.filter((b) => b.criticality_tier === null).length };

  const approvals = (await db.query(`SELECT count(*)::int n FROM approvals WHERE org_id=$1 AND status='pending'`, [org])).rows[0].n;
  const decisions = (await db.query(`SELECT id, code, name, forum, due_date, context_type, context_id FROM decisions WHERE org_id=$1 AND deleted_at IS NULL AND status='pending' AND needs_attention ORDER BY due_date NULLS LAST LIMIT 8`, [org])).rows;
  const counts = (await db.query(`SELECT (SELECT count(*)::int FROM portfolios WHERE org_id=$1 AND deleted_at IS NULL) portfolios,
      (SELECT count(*)::int FROM programmes WHERE org_id=$1 AND deleted_at IS NULL AND status='active') programmes,
      (SELECT count(*)::int FROM products WHERE org_id=$1 AND deleted_at IS NULL AND status='active') products,
      (SELECT count(*)::int FROM ideas WHERE org_id=$1 AND deleted_at IS NULL AND status='open') ideas,
      (SELECT count(*)::int FROM work_items WHERE org_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled') AND (context_type IS NULL OR context_type IN ('service','none','product'))) operational_work`, [org])).rows[0];

  const totalBudget = investment.reduce((a, i) => a + (i.approved_budget ?? 0), 0);
  const totalActual = investment.reduce((a, i) => a + i.actual, 0);
  return {
    generated_at: new Date().toISOString(), currency: base,
    kpis: {
      active_projects: active.length, ...counts,
      approved_budget: investment.some((i) => i.approved_budget !== null) ? totalBudget : null, actual_spend: totalActual,
      budget_utilisation_pct: totalBudget > 0 ? Math.round(totalActual / totalBudget * 1000) / 10 : null,
      open_risks: risks.length, high_risks: risks.filter((r) => r.likelihood * r.impact >= 12).length, critical_issues: issues.filter((i) => i.severity === 'critical').length,
      pending_approvals: approvals,
    },
    health_distribution: dist, projects: health, investment, spend_trend: Object.values(months),
    risk_heatmap: heat, top_risks: topRisks, critical_issues: issues, milestones, objectives, benefits: benefitSummary,
    products, utilisation, bia: biaSummary, decisions,
    metric_keys: ['project_health', 'spi', 'cpi', 'budget_utilisation', 'risk_exposure', 'benefit_realisation', 'okr_progress', 'resource_utilisation', 'bia_tier'],
  };
}
