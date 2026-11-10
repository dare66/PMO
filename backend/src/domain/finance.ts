import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { badRequest, notFound } from '../core/errors.js';
import { evm, irr, npv, paybackYears, roi, toBase } from './calc.js';

export async function fxContext(db: Db, orgId: string) {
  const org = (await db.query(`SELECT base_currency FROM organisations WHERE id=$1`, [orgId])).rows[0];
  const rates: Record<string, number> = {};
  for (const r of (await db.query(`SELECT DISTINCT ON (currency) currency, rate_to_base FROM fx_rates WHERE org_id=$1 ORDER BY currency, effective_date DESC`, [orgId])).rows) rates[r.currency] = Number(r.rate_to_base);
  return { base: org.base_currency as string, rates };
}

/** The set of (context_type, context_id) pairs that roll up into a context (portfolio > programme > project/product). */
export async function rollupContexts(db: Db, orgId: string, type: string, id: string): Promise<[string, string][]> {
  const out: [string, string][] = [[type, id]];
  if (type === 'portfolio') {
    for (const r of (await db.query(`SELECT id FROM programmes WHERE portfolio_id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows) out.push(['programme', r.id]);
    for (const r of (await db.query(`SELECT id FROM projects WHERE portfolio_id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows) out.push(['project', r.id]);
    for (const r of (await db.query(`SELECT id FROM products WHERE portfolio_id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows) out.push(['product', r.id]);
  } else if (type === 'programme') {
    for (const r of (await db.query(`SELECT id FROM projects WHERE programme_id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, orgId])).rows) out.push(['project', r.id]);
  }
  return out;
}

export async function financeSummary(db: Db, ctx: Ctx, type: string, id: string) {
  if (!['portfolio', 'programme', 'project', 'product'].includes(type)) throw badRequest('Unsupported finance context');
  const { base, rates } = await fxContext(db, ctx.orgId);
  const contexts = await rollupContexts(db, ctx.orgId, type, id);
  const types = contexts.map((c) => c[0]), ids = contexts.map((c) => c[1]);
  const budgets = (await db.query(`SELECT b.* FROM budgets b JOIN unnest($2::text[], $3::uuid[]) AS x(t, i) ON b.context_type=x.t AND b.context_id=x.i WHERE b.org_id=$1 AND b.deleted_at IS NULL`, [ctx.orgId, types, ids])).rows;
  const costs = (await db.query(`SELECT c.* FROM cost_entries c JOIN unnest($2::text[], $3::uuid[]) AS x(t, i) ON c.context_type=x.t AND c.context_id=x.i WHERE c.org_id=$1 AND c.deleted_at IS NULL AND c.status='posted'`, [ctx.orgId, types, ids])).rows;
  let unconverted = 0;
  const conv = (amount: number, cur: string) => { const v = toBase(Number(amount), cur, base, rates); if (v === null) { unconverted++; return 0; } return v; };
  const sum = (xs: any[]) => xs.reduce((a, x) => a + conv(x.amount, x.currency), 0);
  const approved = budgets.filter((b) => b.status === 'approved');
  const actual = costs.filter((c) => c.entry_kind === 'actual');
  const commitment = costs.filter((c) => c.entry_kind === 'commitment');
  const forecast = costs.filter((c) => c.entry_kind === 'forecast');
  const approvedTotal = sum(approved), actualTotal = sum(actual), commitTotal = sum(commitment), forecastTotal = sum(forecast);
  const eac = actualTotal + commitTotal + forecastTotal;
  const months = new Map<string, { month: string; actual: number; forecast: number; commitment: number }>();
  for (const c of costs) {
    const m = String(c.entry_date).slice(0, 7);
    if (!months.has(m)) months.set(m, { month: m, actual: 0, forecast: 0, commitment: 0 });
    (months.get(m) as any)[c.entry_kind] += conv(c.amount, c.currency);
  }
  let cum = 0;
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => { cum += m.actual; return { ...m, cumulative_actual: cum }; });
  const byCategory: Record<string, number> = {};
  for (const c of actual) byCategory[c.cost_category] = (byCategory[c.cost_category] ?? 0) + conv(c.amount, c.currency);
  const capex = { budget: sum(approved.filter((b) => b.expenditure_type === 'capex')), actual: sum(actual.filter((c) => c.expenditure_type === 'capex')) };
  const opex = { budget: sum(approved.filter((b) => b.expenditure_type === 'opex')), actual: sum(actual.filter((c) => c.expenditure_type === 'opex')) };
  const hasBudget = approved.length > 0;
  return {
    currency: base, contexts_included: contexts.length,
    approved_budget: hasBudget ? approvedTotal : null, pending_budget: sum(budgets.filter((b) => ['draft', 'submitted'].includes(b.status))),
    actual: actualTotal, commitments: commitTotal, forecast_remaining: forecastTotal,
    estimate_at_completion: eac,
    variance_at_completion: hasBudget ? approvedTotal - eac : null,
    budget_utilisation_pct: hasBudget && approvedTotal > 0 ? Math.round(actualTotal / approvedTotal * 1000) / 10 : null,
    reconciliation: {
      // funding check: approved budget lines vs envelope / BAC
      status: !hasBudget ? 'no_approved_budget' : eac > approvedTotal ? 'over_committed' : 'within_budget',
    },
    capex, opex, by_category: byCategory, monthly, unconverted_entries: unconverted,
    budgets: budgets.map((b) => ({ id: b.id, code: b.code, name: b.name, fiscal_year: b.fiscal_year, expenditure_type: b.expenditure_type, amount: b.amount, currency: b.currency, status: b.status, context_type: b.context_type })),
  };
}

export async function projectEvm(db: Db, ctx: Ctx, projectId: string) {
  const p = (await db.query(`SELECT * FROM projects WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [projectId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Project');
  const { base, rates } = await fxContext(db, ctx.orgId);
  const costs = (await db.query(`SELECT amount, currency FROM cost_entries WHERE context_type='project' AND context_id=$1 AND entry_kind='actual' AND status='posted' AND deleted_at IS NULL`, [projectId])).rows;
  const ac = costs.length ? costs.reduce((a, c) => a + (toBase(Number(c.amount), c.currency, base, rates) ?? 0), 0) : null;
  const bac = p.budget_at_completion === null ? null : (toBase(Number(p.budget_at_completion), p.currency, base, rates));
  return { currency: base, ...evm({ bac, percentComplete: p.percent_complete, actualCost: ac, start: p.baseline_start ?? p.start_date, finish: p.baseline_end ?? p.end_date }) };
}

export async function evaluateBusinessCase(db: Db, ctx: Ctx, id: string) {
  const bc = (await db.query(`SELECT * FROM business_cases WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, ctx.orgId])).rows[0];
  if (!bc) throw notFound('Business case');
  const cf: number[] = (bc.cash_flows ?? []).map(Number);
  const costs = cf.filter((x) => x < 0).reduce((a, x) => a - x, 0);
  const gains = cf.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  return {
    business_case: bc,
    npv: cf.length ? npv(Number(bc.discount_rate), cf) : null,
    irr: irr(cf), payback_years: cf.length ? paybackYears(cf) : null,
    roi_pct: roi(gains, costs),
    missing: cf.length ? [] : ['cash_flows'],
  };
}
