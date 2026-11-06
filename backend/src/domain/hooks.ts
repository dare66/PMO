import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { unprocessable } from '../core/errors.js';
import { nextCode } from '../core/codes.js';
import { notify, usersWithRole } from '../core/notify.js';
import { audit } from '../core/audit.js';
import { benefitRealisationPct, keyResultProgress, requirementQuality, rice, riskRating, riskScore, wsjf } from './calc.js';
import { recomputeBia } from './bia.js';

interface Hook {
  beforeWrite?: (db: Db, ctx: Ctx, data: Record<string, any>, before: any | null) => Promise<void>;
  afterWrite?: (db: Db, ctx: Ctx, row: any, before: any | null) => Promise<void>;
}

/** Which impact areas a change request must be assessed against, and by whom. Configurable rule set. */
export async function impactAreasFor(db: Db, cr: any): Promise<{ area: string; role: string }[]> {
  const areas = [
    { area: 'schedule', role: 'project_manager' }, { area: 'cost', role: 'finance_controller' },
    { area: 'scope', role: 'business_analyst' }, { area: 'risk', role: 'pmo_manager' },
  ];
  // BIA impact when the change touches a product/service/project that is high/critical or has an approved BIA.
  let critical = false;
  if (cr.context_type === 'product') {
    const r = await db.query(`SELECT 1 FROM products WHERE id=$1 AND criticality IN ('high','critical')
      UNION SELECT 1 FROM bia_assessments WHERE product_id=$1 AND deleted_at IS NULL`, [cr.context_id]);
    critical = !!r.rowCount;
  } else if (cr.context_type === 'project') {
    const r = await db.query(`SELECT 1 FROM projects WHERE id=$1 AND (criticality IN ('high','critical') OR bia_required IS TRUE)
      UNION SELECT 1 FROM project_products pp JOIN products p ON p.id=pp.product_id WHERE pp.project_id=$1 AND p.criticality IN ('high','critical')`, [cr.context_id]);
    critical = !!r.rowCount;
  } else if (cr.context_type === 'service') {
    const r = await db.query(`SELECT 1 FROM services WHERE id=$1 AND criticality IN ('high','critical')`, [cr.context_id]);
    critical = !!r.rowCount;
  }
  if (critical || ['it_change', 'infrastructure_change', 'business_change'].includes(cr.change_type)) areas.push({ area: 'bia', role: 'bc_manager' });
  if (['it_change', 'infrastructure_change'].includes(cr.change_type)) {
    areas.push({ area: 'security', role: 'security_officer' }, { area: 'operations', role: 'operations' });
  }
  if (cr.impact_cost && Number(cr.impact_cost) > 0 && cr.context_type === 'project') {
    const v = await db.query(`SELECT 1 FROM contracts WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL`, [cr.context_id]);
    if (v.rowCount) areas.push({ area: 'vendor', role: 'procurement' });
  }
  return areas;
}

export const hooks: Record<string, Hook> = {
  risks: {
    async beforeWrite(_db, _ctx, data, before) {
      const treatment = data.treatment ?? before?.treatment;
      const acceptance = before?.acceptance_status;
      if (treatment === 'accept' && acceptance !== 'approved' && (data.treatment === 'accept'))
        throw unprocessable('Risk acceptance requires an approved risk-acceptance request (POST /api/risks/:id/request-acceptance). Risks cannot be accepted by direct edit.');
    },
  },
  work_items: {
    async beforeWrite(_db, _ctx, data) {
      if (data.context_type === 'none') data.context_id = null;
      if (data.status === 'done' && data.completed_at === undefined) data.completed_at = new Date().toISOString();
    },
    async afterWrite(db, ctx, row, before) {
      if (row.assignee_id && row.assignee_id !== before?.assignee_id && row.assignee_id !== ctx.userId)
        await notify(db, ctx.orgId, [row.assignee_id], { kind: 'assignment', title: `Assigned: ${row.code} ${row.name}`, link: `/work/${row.id}` });
    },
  },
  requirements: {
    async beforeWrite(_db, _ctx, data, before) {
      const merged = { ...(before ?? {}), ...data };
      data.quality_flags = JSON.stringify(requirementQuality(merged));
    },
  },
  change_requests: {
    async afterWrite(db, ctx, row, before) {
      if (before) return; // only on creation
      const areas = await impactAreasFor(db, row);
      for (const a of areas) {
        const code = await nextCode(db, ctx.orgId, 'IA');
        await db.query(`INSERT INTO impact_assessments (org_id, code, name, change_request_id, area, assessor_role, created_by, updated_by, owner_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)`, [ctx.orgId, code, `${a.area} impact of ${row.code}`, row.id, a.area, a.role, ctx.userId]);
        await notify(db, ctx.orgId, await usersWithRole(db, ctx.orgId, a.role), { kind: 'impact_assessment', title: `Impact assessment needed (${a.area}) for ${row.code}`, link: `/changes/${row.id}`, dedupe: `ia:${row.id}:${a.area}` });
      }
      await db.query(`UPDATE change_requests SET status='assessing' WHERE id=$1`, [row.id]);
      await audit(db, ctx, 'impact_assessments_generated', { type: 'change_requests', id: row.id, code: row.code }, null, { areas: areas.map((a) => a.area) });
    },
  },
  impact_assessments: {
    async afterWrite(db, ctx, row) {
      const r = await db.query(`SELECT count(*) FILTER (WHERE status='pending')::int AS pending FROM impact_assessments WHERE change_request_id=$1 AND deleted_at IS NULL`, [row.change_request_id]);
      if (r.rows[0].pending === 0) {
        const cr = (await db.query(`UPDATE change_requests SET status='pending_approval' WHERE id=$1 AND status='assessing' RETURNING *`, [row.change_request_id])).rows[0];
        if (cr) await audit(db, ctx, 'transition', { type: 'change_requests', id: cr.id, code: cr.code }, { status: 'assessing' }, { status: 'pending_approval' });
      }
    },
  },
  bia_assessments: {
    async afterWrite(db, ctx, row) { await recomputeBia(db, ctx, row.id); },
  },
  test_executions: {
    async afterWrite(db, ctx, row, before) {
      if (before || row.result !== 'failed') return;
      // A failed execution raises a defect in the context of the parent test plan.
      const p = (await db.query(`SELECT tp.context_type, tp.context_id, tp.release_id, tc.name FROM test_cases tc JOIN test_plans tp ON tp.id=tc.test_plan_id WHERE tc.id=$1`, [row.test_case_id])).rows[0];
      if (!p) return;
      const code = await nextCode(db, ctx.orgId, 'DEF');
      await db.query(`INSERT INTO defects (org_id, code, name, description, context_type, context_id, test_execution_id, release_id, severity, created_by, updated_by, owner_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'medium',$9,$9,$9)`, [ctx.orgId, code, `Failed: ${p.name}`, row.notes ?? 'Raised automatically from a failed test execution.', p.context_type, p.context_id, row.id, p.release_id, ctx.userId]);
    },
  },
  key_results: {},
};

/** Computed, read-only fields added to list/detail responses (never stored => cannot drift). */
export function decorate(key: string, rows: any[]): any[] {
  switch (key) {
    case 'risks': return rows.map((r) => {
      const s = riskScore(r.likelihood, r.impact), rs = riskScore(r.residual_likelihood, r.residual_impact);
      return { ...r, score: s, rating: riskRating(s), residual_score: rs, residual_rating: riskRating(rs) };
    });
    case 'ideas': return rows.map((r) => ({ ...r, rice_score: rice(r.reach, r.impact, r.confidence, r.effort), wsjf_score: wsjf(r.cost_of_delay, r.effort) }));
    case 'key_results': return rows.map((r) => ({ ...r, progress_pct: keyResultProgress(r.baseline_value, r.target_value, r.current_value) }));
    case 'benefits': return rows.map((r) => ({ ...r, realisation_pct: benefitRealisationPct(r.baseline_value, r.target_value, r.actual_value) }));
    case 'contracts': return rows.map((r) => ({ ...r, days_to_expiry: r.end_date ? Math.ceil((Date.parse(r.end_date) - Date.now()) / 86400000) : null }));
    default: return rows;
  }
}
