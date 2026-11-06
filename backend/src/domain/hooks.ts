import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { forbidden, unprocessable } from '../core/errors.js';
import { can } from '../core/context.js';
import { assertBaselineUnlocked, assertPeriodOpen, findDuplicates } from './frs.js';
import { nextCode } from '../core/codes.js';
import { notify, usersWithRole } from '../core/notify.js';
import { audit } from '../core/audit.js';
import { benefitRealisationPct, keyResultProgress, requirementQuality, rice, riskRating, riskScore, wsjf } from './calc.js';
import { recomputeBia } from './bia.js';
import { spawnRecurrence, versionRequirementIfApproved } from './extended.js';

interface Hook {
  beforeWrite?: (db: Db, ctx: Ctx, data: Record<string, any>, before: any | null) => Promise<void>;
  afterWrite?: (db: Db, ctx: Ctx, row: any, before: any | null) => Promise<void>;
  beforeDelete?: (db: Db, ctx: Ctx, row: any) => Promise<void>;
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
    async beforeWrite(db, _ctx, data, before) {
      if (data.context_type === 'none') data.context_id = null;
      if (data.status === 'done' && data.completed_at === undefined) data.completed_at = new Date().toISOString();
      // FR-WRK-008: items flagged as requiring evidence cannot be completed without it
      const m = { ...(before ?? {}), ...data };
      if (data.status === 'done' && before?.status !== 'done' && m.requires_evidence && !m.completion_evidence?.trim()) {
        const f = before ? (await db.query(`SELECT 1 FROM files WHERE entity_type='work_items' AND entity_id=$1 AND scan_status='clean' AND deleted_at IS NULL`, [before.id])).rowCount : 0;
        if (!f) throw unprocessable('Completion evidence is required: describe it in completion_evidence or attach a file');
      }
      if (data.status === 'blocked' && !m.blocked_reason?.trim()) throw unprocessable('State why the item is blocked (blocked_reason)');
    },
    async afterWrite(db, ctx, row, before) {
      if (row.status === 'done' && before?.status !== 'done') await spawnRecurrence(db, ctx, row);
      if (row.assignee_id && row.assignee_id !== before?.assignee_id && row.assignee_id !== ctx.userId)
        await notify(db, ctx.orgId, [row.assignee_id], { kind: 'assignment', title: `Assigned: ${row.code} ${row.name}`, link: `/work/${row.id}` });
    },
  },
  requirements: {
    async beforeWrite(db, ctx, data, before) {
      await versionRequirementIfApproved(db, ctx, data, before);
      const merged = { ...(before ?? {}), ...data };
      data.quality_flags = JSON.stringify(requirementQuality(merged));
    },
  },
  projects: {
    async beforeWrite(_db, _ctx, data, before) { assertBaselineUnlocked(data, before); },
  },
  cost_entries: {
    async beforeWrite(db, ctx, data, before) {
      // FR-FIN-006/014: locked periods and recorded actuals are immutable – corrections are reversals
      await assertPeriodOpen(db, ctx.orgId, data.entry_date ?? before?.entry_date);
      if (before && data.entry_date !== undefined && data.entry_date !== before.entry_date) await assertPeriodOpen(db, ctx.orgId, before.entry_date);
      if (before && (before.entry_kind === 'actual' || before.reversal_of || before.reversed)) {
        for (const k of ['amount', 'entry_date', 'entry_kind', 'currency', 'context_id', 'context_type']) if (k in data && JSON.stringify(data[k]) !== JSON.stringify(before[k] instanceof Date ? before[k].toISOString().slice(0, 10) : before[k])) throw unprocessable('Recorded actuals cannot be edited; post a reversal (POST /api/cost-entries/:id/reverse)');
      }
    },
    async beforeDelete(db, ctx, row) {
      if (row.entry_kind === 'actual' || row.reversal_of) throw unprocessable('Recorded actuals cannot be deleted; post a reversal');
      await assertPeriodOpen(db, ctx.orgId, row.entry_date);
    },
  },
  documents: {
    async beforeWrite(_db, ctx, _data, before) {
      if (before?.checked_out_by && before.checked_out_by !== ctx.userId) throw unprocessable('Document is checked out by another user');
    },
    async beforeDelete(_db, _ctx, row) {
      if (row.legal_hold) throw unprocessable('Document is under legal hold and cannot be deleted');
      if (row.retention_until && String(row.retention_until instanceof Date ? row.retention_until.toISOString() : row.retention_until).slice(0, 10) > new Date().toISOString().slice(0, 10)) throw unprocessable('Document is within its retention period and cannot be deleted');
    },
  },
  time_entries: {
    async beforeWrite(_db, ctx, data, before) {
      if (before && before.status !== 'submitted') throw unprocessable(`Time entry is ${before.status} and can no longer be edited`);
      const uid = data.user_id ?? before?.user_id;
      if (uid && uid !== ctx.userId && !can(ctx, 'time_entries:approve')) throw forbidden('You can only record your own time');
    },
  },
  raci_assignments: {
    async beforeWrite(db, ctx, data, before) {
      const m = { ...(before ?? {}), ...data };
      if (m.responsibility !== 'A' || m.status === 'inactive') return;
      const dup = await db.query(`SELECT code FROM raci_assignments WHERE org_id=$1 AND context_type=$2 AND context_id IS NOT DISTINCT FROM $3 AND COALESCE(NULLIF(item_ref,''), name)=COALESCE(NULLIF($4,''), $5) AND responsibility='A' AND status='active' AND deleted_at IS NULL AND id <> COALESCE($6::uuid, '00000000-0000-0000-0000-000000000000')`,
        [ctx.orgId, m.context_type, m.context_id, m.item_ref ?? '', m.name, before?.id ?? null]);
      if (dup.rowCount) throw unprocessable(`Only one person can be Accountable for an item (already ${dup.rows[0].code})`);
    },
  },
  requests: {
    async beforeWrite(_db, ctx, data, before) { if (!before && !data.requester_id) data.requester_id = ctx.userId; },
    async afterWrite(db, ctx, row, before) {
      if (before) return;
      const d = await findDuplicates(db, ctx, { name: row.name, description: `${row.description ?? ''} ${row.problem_statement ?? ''}`, related_system: row.related_system, business_process_id: row.business_process_id, exclude_id: row.id });
      if (d.length) await audit(db, ctx, 'possible_duplicates', { type: 'requests', id: row.id, code: row.code }, null, { candidates: d.map((x) => `${x.code} (${x.similarity})`) });
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
    async beforeWrite(_db, _ctx, data, before) {
      // §8.2: material change to an approved BIA re-opens it for review (approved history is kept in bia_versions)
      if (before?.status === 'approved' && !('status' in data)) {
        const material = Object.keys(data).filter((k) => !['next_review_date', 'review_trigger', 'deputy_owner_id', 'owner_id'].includes(k) && JSON.stringify(data[k]) !== JSON.stringify(before[k]));
        if (material.length) { data.status = 'draft'; data.review_trigger = `Changed after approval: ${material.join(', ')}`; }
      }
    },
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
      const emv = r.probability_pct === null || r.probability_pct === undefined || r.cost_impact === null || r.cost_impact === undefined ? null : Math.round((Number(r.probability_pct) / 100) * Number(r.cost_impact) * (r.risk_type === 'opportunity' ? -1 : 1) * 100) / 100;
      return { ...r, score: s, rating: riskRating(s), residual_score: rs, residual_rating: riskRating(rs), emv };
    });
    case 'ideas': return rows.map((r) => ({ ...r, rice_score: rice(r.reach, r.impact, r.confidence, r.effort), wsjf_score: wsjf(r.cost_of_delay, r.effort) }));
    case 'key_results': return rows.map((r) => ({ ...r, progress_pct: keyResultProgress(r.baseline_value, r.target_value, r.current_value) }));
    case 'benefits': return rows.map((r) => ({ ...r, realisation_pct: benefitRealisationPct(r.baseline_value, r.target_value, r.actual_value) }));
    case 'vendor_reviews': return rows.map((r) => { const xs = [r.quality_score, r.delivery_score, r.cost_score, r.relationship_score].filter((x) => x !== null); return { ...r, overall_score: xs.length === 4 ? Math.round((xs.reduce((a, b) => a + b, 0) / 4) * 100) / 100 : null }; });
    case 'stakeholders': return rows.map((r) => ({ ...r, quadrant: r.influence === null || r.interest === null ? null : r.influence >= 3 ? (r.interest >= 3 ? 'manage closely' : 'keep satisfied') : (r.interest >= 3 ? 'keep informed' : 'monitor') }));
    case 'readiness_assessments': return rows.map((r) => { const xs = [r.awareness, r.understanding, r.willingness, r.ability, r.reinforcement]; return { ...r, readiness_index: xs.every((x) => x !== null && x !== undefined) ? Math.round((xs.reduce((a, b) => a + b, 0) / 5) * 20) : null }; });
    case 'non_conformances': return rows.map((r) => ({ ...r, overdue: r.due_date && !['verified', 'closed'].includes(r.status) ? String(r.due_date instanceof Date ? r.due_date.toISOString() : r.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) : false }));
    case 'contracts': return rows.map((r) => ({ ...r, days_to_expiry: r.end_date ? Math.ceil((Date.parse(r.end_date) - Date.now()) / 86400000) : null }));
    default: return rows;
  }
}
