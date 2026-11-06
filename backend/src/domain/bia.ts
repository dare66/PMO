import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { notFound } from '../core/errors.js';
import { criticalityTier, deriveMtpd, validateBia } from './calc.js';

/** Recompute derived BIA fields (MTPD unless overridden, criticality tier). */
export async function recomputeBia(db: Db, ctx: Ctx, biaId: string) {
  const b = (await db.query(`SELECT * FROM bia_assessments WHERE id=$1 AND org_id=$2`, [biaId, ctx.orgId])).rows[0];
  if (!b) return;
  const impacts = (await db.query(`SELECT category, horizon_hours, severity FROM bia_impacts WHERE bia_id=$1`, [biaId])).rows;
  const derived = deriveMtpd(impacts, b.tolerance_threshold);
  const mtpd = b.mtpd_override_reason ? b.mtpd_hours : derived;
  const tier = criticalityTier(mtpd ?? null);
  if (mtpd !== b.mtpd_hours || tier !== b.criticality_tier) {
    // direct update of derived columns (trigger bumps row_version)
    await db.query(`UPDATE bia_assessments SET mtpd_hours=$2, criticality_tier=$3 WHERE id=$1`, [biaId, mtpd, tier]);
  }
}

export async function biaAnalysis(db: Db, ctx: Ctx, biaId: string) {
  const b = (await db.query(`SELECT * FROM bia_assessments WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [biaId, ctx.orgId])).rows[0];
  if (!b) throw notFound('BIA');
  const impacts = (await db.query(`SELECT * FROM bia_impacts WHERE bia_id=$1 ORDER BY category, horizon_hours`, [biaId])).rows;
  const deps = (await db.query(`SELECT d.*, p.name AS product_name, v.name AS vendor_name, s.name AS service_name FROM bia_dependencies d
     LEFT JOIN products p ON p.id=d.product_id LEFT JOIN vendors v ON v.id=d.vendor_id LEFT JOIN services s ON s.id=d.service_id WHERE d.bia_id=$1 ORDER BY d.dependency_type, d.name`, [biaId])).rows;
  const strategies = (await db.query(`SELECT * FROM recovery_strategies WHERE bia_id=$1 AND deleted_at IS NULL`, [biaId])).rows;
  const derivedMtpd = deriveMtpd(impacts, b.tolerance_threshold);
  const findings = validateBia(b, deps, strategies);
  const horizons = [...new Set(impacts.map((i: any) => Number(i.horizon_hours)))].sort((a, z) => a - z);
  const categories = ['financial', 'operational', 'regulatory', 'customer', 'reputational'];
  const matrix = categories.map((c) => ({ category: c, cells: horizons.map((h) => impacts.find((i: any) => i.category === c && Number(i.horizon_hours) === h) ?? null) }));
  return {
    bia: b, impacts, matrix, horizons, dependencies: deps, strategies,
    derived: { mtpd_hours: derivedMtpd, criticality_tier: criticalityTier(b.mtpd_hours ?? derivedMtpd), overridden: !!b.mtpd_override_reason },
    findings, ready_for_approval: !findings.some((f) => f.severity === 'error'),
  };
}

export async function upsertImpacts(db: Db, ctx: Ctx, biaId: string, impacts: { category: string; horizon_hours: number; severity: number; financial_amount?: number | null; rationale?: string | null }[]) {
  const b = (await db.query(`SELECT id, code, status FROM bia_assessments WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [biaId, ctx.orgId])).rows[0];
  if (!b) throw notFound('BIA');
  const before = (await db.query(`SELECT category, horizon_hours, severity FROM bia_impacts WHERE bia_id=$1`, [biaId])).rows;
  for (const i of impacts) {
    await db.query(`INSERT INTO bia_impacts (org_id, bia_id, category, horizon_hours, severity, financial_amount, rationale) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (bia_id, category, horizon_hours) DO UPDATE SET severity=EXCLUDED.severity, financial_amount=EXCLUDED.financial_amount, rationale=EXCLUDED.rationale`,
    [ctx.orgId, biaId, i.category, i.horizon_hours, i.severity, i.financial_amount ?? null, i.rationale ?? null]);
  }
  // editing an approved BIA returns it to draft for re-approval
  if (b.status === 'approved') await db.query(`UPDATE bia_assessments SET status='draft' WHERE id=$1`, [biaId]);
  await audit(db, ctx, 'bia_impacts_updated', { type: 'bia_assessments', id: biaId, code: b.code }, before, impacts);
  await recomputeBia(db, ctx, biaId);
}

/**
 * End-to-end resilience traceability:
 * Business Process -> Business Service -> Product/Application -> Infrastructure (environments) -> Data -> Vendor -> Recovery Strategy.
 */
export async function traceability(db: Db, ctx: Ctx) {
  const processes = (await db.query(`SELECT bp.id, bp.code, bp.name, bp.criticality, bp.service_id, d.name AS department FROM business_processes bp LEFT JOIN departments d ON d.id=bp.department_id
     WHERE bp.org_id=$1 AND bp.deleted_at IS NULL ORDER BY bp.code`, [ctx.orgId])).rows;
  const services = (await db.query(`SELECT id, code, name, criticality, product_id FROM services WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const products = (await db.query(`SELECT id, code, name, criticality FROM products WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const apps = (await db.query(`SELECT id, code, name, product_id, hosting, vendor_id, data_classification, lifecycle FROM applications WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const envs = (await db.query(`SELECT id, code, name, product_id, env_type, hosting FROM environments WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const vendors = (await db.query(`SELECT id, code, name, risk_rating FROM vendors WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const bias = (await db.query(`SELECT id, code, name, process_id, service_id, product_id, mtpd_hours, rto_hours, rpo_hours, criticality_tier, status FROM bia_assessments WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const deps = (await db.query(`SELECT d.* FROM bia_dependencies d JOIN bia_assessments b ON b.id=d.bia_id WHERE b.org_id=$1 AND b.deleted_at IS NULL`, [ctx.orgId])).rows;
  const strategies = (await db.query(`SELECT id, code, name, bia_id, strategy_type, achievable_rto_hours, test_result, last_tested_on FROM recovery_strategies WHERE org_id=$1 AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const S = byId(services), P = byId(products), V = byId(vendors);
  const chains = processes.map((bp: any) => {
    const svc = bp.service_id ? S.get(bp.service_id) : null;
    const prod = svc?.product_id ? P.get(svc.product_id) : null;
    const pApps = prod ? apps.filter((a: any) => a.product_id === prod.id) : [];
    const pEnvs = prod ? envs.filter((e: any) => e.product_id === prod.id) : [];
    const bia = bias.find((b: any) => b.process_id === bp.id) ?? (svc ? bias.find((b: any) => b.service_id === svc.id) : null) ?? null;
    const bDeps = bia ? deps.filter((d: any) => d.bia_id === bia.id) : [];
    const vendorIds = new Set<string>([...pApps.map((a: any) => a.vendor_id), ...bDeps.map((d: any) => d.vendor_id)].filter(Boolean));
    return {
      process: bp, service: svc ?? null, product: prod ?? null, applications: pApps,
      infrastructure: [...pEnvs, ...bDeps.filter((d: any) => d.dependency_type === 'infrastructure')],
      data: bDeps.filter((d: any) => d.dependency_type === 'data'),
      people: bDeps.filter((d: any) => d.dependency_type === 'people'),
      vendors: [...vendorIds].map((id) => V.get(id)).filter(Boolean),
      bia, recovery: bia ? strategies.filter((s: any) => s.bia_id === bia.id) : [],
      gaps: [!svc && 'No business service linked', !prod && 'No product/application linked', !bia && 'No BIA', bia && !strategies.some((s: any) => s.bia_id === bia.id) && 'No recovery strategy'].filter(Boolean),
    };
  });
  return { chains };
}
