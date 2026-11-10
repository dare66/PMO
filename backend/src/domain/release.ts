import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { requestApproval, resolveApproverRole } from './workflow.js';

export async function releaseReadiness(db: Db, ctx: Ctx, releaseId: string) {
  const rel = (await db.query(`SELECT * FROM releases WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [releaseId, ctx.orgId])).rows[0];
  if (!rel) throw notFound('Release');
  const plans = (await db.query(`SELECT id, code, name, test_level, pass_threshold_pct, business_owner_id, status FROM test_plans WHERE release_id=$1 AND deleted_at IS NULL`, [releaseId])).rows;
  const exec = (await db.query(`WITH latest AS (SELECT DISTINCT ON (tc.id) tc.id, tc.test_plan_id, te.result FROM test_cases tc
        LEFT JOIN test_executions te ON te.test_case_id=tc.id AND te.deleted_at IS NULL
        JOIN test_plans tp ON tp.id=tc.test_plan_id WHERE tp.release_id=$1 AND tc.deleted_at IS NULL ORDER BY tc.id, te.executed_at DESC NULLS LAST)
     SELECT test_plan_id, count(*)::int total, count(*) FILTER (WHERE result='passed')::int passed, count(*) FILTER (WHERE result='failed')::int failed,
            count(*) FILTER (WHERE result IS NULL OR result='not_run')::int not_run FROM latest GROUP BY test_plan_id`, [releaseId])).rows;
  const defects = (await db.query(`SELECT severity, count(*)::int n FROM defects WHERE release_id=$1 AND status NOT IN ('closed','deferred') AND deleted_at IS NULL GROUP BY severity`, [releaseId])).rows;
  const openBy = Object.fromEntries(defects.map((d) => [d.severity, d.n]));
  const planResults = plans.map((p) => {
    const e = exec.find((x) => x.test_plan_id === p.id) ?? { total: 0, passed: 0, failed: 0, not_run: 0 };
    const rate = e.total ? e.passed / e.total * 100 : null;
    return { ...p, ...e, pass_rate: rate === null ? null : Math.round(rate * 10) / 10, meets_threshold: rate !== null && rate >= Number(p.pass_threshold_pct) };
  });
  const uat = planResults.filter((p) => p.test_level === 'uat');
  const checks = [
    { key: 'tests_defined', label: 'Test plans linked to release', mandatory: true, passed: plans.length > 0, detail: `${plans.length} plan(s)` },
    { key: 'test_thresholds', label: 'All test plans meet pass threshold', mandatory: true, passed: planResults.length > 0 && planResults.every((p) => p.meets_threshold), detail: planResults.map((p) => `${p.code}: ${p.pass_rate ?? 'no runs'}%`).join(', ') || 'No plans' },
    { key: 'uat_signoff', label: 'UAT signed off by business owner', mandatory: true, passed: uat.length > 0 && uat.every((p) => p.status === 'signed_off'), detail: uat.length ? uat.map((p) => `${p.code}: ${p.status}`).join(', ') : 'No UAT plan linked' },
    { key: 'no_critical_defects', label: 'No open critical/high defects', mandatory: true, passed: !openBy.critical && !openBy.high, detail: `critical ${openBy.critical ?? 0}, high ${openBy.high ?? 0}, medium ${openBy.medium ?? 0}` },
    { key: 'rollback_plan', label: 'Rollback plan documented', mandatory: true, passed: !!rel.rollback_plan?.trim(), detail: rel.rollback_plan ? 'Present' : 'Missing' },
    { key: 'deployment_plan', label: 'Deployment plan documented', mandatory: true, passed: !!rel.deployment_plan?.trim(), detail: rel.deployment_plan ? 'Present' : 'Missing' },
    { key: 'cab', label: 'CAB approval', mandatory: true, passed: rel.cab_status === 'approved', detail: rel.cab_status },
    { key: 'business_validation', label: 'Business validation complete', mandatory: true, passed: rel.business_validation, detail: String(rel.business_validation) },
    { key: 'operational_acceptance', label: 'Operational acceptance (OAT/support ready)', mandatory: true, passed: rel.operational_acceptance, detail: String(rel.operational_acceptance) },
    { key: 'support_model', label: 'Support model & hypercare defined', mandatory: false, passed: !!rel.support_model?.trim(), detail: `${rel.hypercare_days} hypercare days` },
    { key: 'knowledge_transfer', label: 'Knowledge transfer complete', mandatory: false, passed: rel.knowledge_transfer_done, detail: String(rel.knowledge_transfer_done) },
  ];
  const ready = checks.filter((c) => c.mandatory).every((c) => c.passed);
  return { release: rel, ready, checks, test_plans: planResults, open_defects: openBy };
}

export async function submitToCab(db: Db, ctx: Ctx, releaseId: string) {
  const rel = (await db.query(`SELECT * FROM releases WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [releaseId, ctx.orgId])).rows[0];
  if (!rel) throw notFound('Release');
  if (rel.cab_status === 'pending') throw conflict('Release is already pending CAB approval');
  if (!rel.rollback_plan?.trim() || !rel.deployment_plan?.trim()) throw unprocessable('A deployment plan and rollback plan are required before CAB submission');
  await db.query(`UPDATE releases SET cab_status='pending' WHERE id=$1`, [releaseId]);
  const role = await resolveApproverRole(db, ctx.orgId, 'cab', null);
  const prev = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE entity_type='releases' AND entity_id=$1 AND approval_type='cab'`, [releaseId])).rows[0].r;
  return requestApproval(db, ctx, { entity_type: 'releases', entity_id: releaseId, entity_code: rel.code, approval_type: 'cab', roles: [role, 'operations'], round: prev + 1 });
}

/** Records a production deployment. Humans only; blocked unless readiness passes. AI can never trigger this. */
export async function deployRelease(db: Db, ctx: Ctx, releaseId: string, environmentId: string | null) {
  if (ctx.actorType !== 'user') throw forbidden('Production deployment can only be authorised by a human user');
  const r = await releaseReadiness(db, ctx, releaseId);
  if (!r.ready) throw unprocessable('Release is not ready for deployment', r.checks.filter((c) => c.mandatory && !c.passed));
  await db.query(`UPDATE releases SET status='deployed', actual_date=current_date WHERE id=$1`, [releaseId]);
  await audit(db, ctx, 'deploy', { type: 'releases', id: releaseId, code: r.release.code }, { status: r.release.status }, { status: 'deployed', environment_id: environmentId });
  return { ok: true };
}
