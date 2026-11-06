/**
 * Configurable workflow & approval engine.
 * - Workflow definitions (stages, entry/exit criteria, deliverables, approvals) are DATA (workflow_definitions),
 *   never hard-coded per organisation. Seeded templates are only starting points.
 * - Approvals support parallel approvers, conditional approval, delegation, rejection & resubmission (rounds),
 *   delegated authority limits (approval_matrix) and segregation of duties.
 * - AI actors can never approve (enforced here, not only in the UI).
 */
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { notify, usersWithRole } from '../core/notify.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { getResource } from '../resources/registry.js';
import { createBaseline } from './frs.js';

export interface StageDef {
  key: string; name: string; entry?: string[]; exit?: string[]; deliverables?: string[];
  approvals?: { role: string; type?: string }[]; sets?: Record<string, string>; description?: string;
}

// ------------------------------------------------------------------ criteria
export async function evaluateCriterion(db: Db, ctx: Ctx, entityType: string, entity: any, criterion: string): Promise<{ criterion: string; met: boolean; detail: string }> {
  const [kind, arg] = criterion.split(':');
  const ctxType = entityType.replace(/s$/, '');
  const id = entity.id;
  const res = (met: boolean, detail: string) => ({ criterion, met, detail });
  switch (kind) {
    case 'field': {
      const v = entity[arg];
      return res(v !== null && v !== undefined && v !== '', v ? `${arg} provided` : `${arg} is missing`);
    }
    case 'bia_screened':
      return res(entity.bia_required !== null && entity.bia_required !== undefined, entity.bia_required === null ? 'BIA screening not completed' : `BIA screening done (required: ${entity.bia_required})`);
    case 'bia_approved_if_required': {
      if (entity.bia_required === false) return res(true, 'BIA not required by screening');
      if (entity.bia_required === null || entity.bia_required === undefined) return res(false, 'BIA screening not completed');
      const r = await db.query(`SELECT count(*) FILTER (WHERE status='approved')::int a, count(*)::int n FROM bia_assessments WHERE project_id=$1 AND deleted_at IS NULL`, [id]);
      return res(r.rows[0].a > 0, r.rows[0].a > 0 ? 'Approved BIA exists' : r.rows[0].n ? 'BIA exists but is not approved' : 'Required BIA has not been created');
    }
    case 'document_approved':
    case 'document_exists': {
      const r = await db.query(`SELECT status FROM documents WHERE context_type=$1 AND context_id=$2 AND doc_type=$3 AND deleted_at IS NULL`, [ctxType, id, arg]);
      const ok = kind === 'document_exists' ? r.rowCount! > 0 : r.rows.some((x) => x.status === 'approved');
      return res(ok, ok ? `${arg} ${kind === 'document_exists' ? 'exists' : 'approved'}` : `${arg} ${kind === 'document_exists' ? 'missing' : 'not approved'}`);
    }
    case 'budget_approved': {
      const r = await db.query(`SELECT count(*)::int n FROM budgets WHERE context_type=$1 AND context_id=$2 AND status='approved' AND deleted_at IS NULL`, [ctxType, id]);
      return res(r.rows[0].n > 0, r.rows[0].n > 0 ? 'Approved budget exists' : 'No approved budget');
    }
    case 'benefits_defined': {
      const r = await db.query(`SELECT count(*)::int n FROM benefits WHERE context_type=$1 AND context_id=$2 AND deleted_at IS NULL AND target_value IS NOT NULL`, [ctxType, id]);
      return res(r.rows[0].n > 0, r.rows[0].n ? `${r.rows[0].n} benefit(s) with targets` : 'No benefits with targets defined');
    }
    case 'risks_reviewed': {
      const r = await db.query(`SELECT count(*)::int n FROM risks WHERE context_type=$1 AND context_id=$2 AND status='open' AND deleted_at IS NULL AND likelihood*impact >= 12 AND (mitigation_plan IS NULL OR mitigation_plan='')`, [ctxType, id]);
      return res(r.rows[0].n === 0, r.rows[0].n ? `${r.rows[0].n} high risk(s) without mitigation plan` : 'All high risks have mitigation plans');
    }
    case 'no_open_critical_defects': {
      const r = await db.query(`SELECT count(*)::int n FROM defects WHERE context_type=$1 AND context_id=$2 AND severity IN ('critical','high') AND status NOT IN ('closed','deferred') AND deleted_at IS NULL`, [ctxType, id]);
      return res(r.rows[0].n === 0, r.rows[0].n ? `${r.rows[0].n} open critical/high defect(s)` : 'No open critical/high defects');
    }
    case 'test_pass_rate': {
      const min = Number(arg ?? 95);
      const r = await db.query(`WITH latest AS (SELECT DISTINCT ON (te.test_case_id) te.result FROM test_executions te JOIN test_cases tc ON tc.id=te.test_case_id JOIN test_plans tp ON tp.id=tc.test_plan_id
          WHERE tp.context_type=$1 AND tp.context_id=$2 AND te.deleted_at IS NULL ORDER BY te.test_case_id, te.executed_at DESC)
        SELECT count(*)::int n, count(*) FILTER (WHERE result='passed')::int p FROM latest`, [ctxType, id]);
      const { n, p } = r.rows[0];
      if (!n) return res(false, 'No test executions recorded');
      const rate = (p / n) * 100;
      return res(rate >= min, `Pass rate ${rate.toFixed(1)}% (threshold ${min}%)`);
    }
    case 'all_milestones_achieved': {
      const r = await db.query(`SELECT count(*) FILTER (WHERE status <> 'achieved')::int n FROM milestones WHERE project_id=$1 AND deleted_at IS NULL`, [id]);
      return res(r.rows[0].n === 0, r.rows[0].n ? `${r.rows[0].n} milestone(s) not achieved` : 'All milestones achieved');
    }
    case 'operational_handover': {
      const r = await db.query(`SELECT count(*) FILTER (WHERE operational_acceptance AND knowledge_transfer_done)::int ok, count(*)::int n FROM releases WHERE project_id=$1 AND deleted_at IS NULL`, [id]);
      return res(r.rows[0].n > 0 && r.rows[0].ok === r.rows[0].n, r.rows[0].n ? `${r.rows[0].ok}/${r.rows[0].n} releases handed over to operations` : 'No releases recorded');
    }
    case 'impact_assessments_complete': {
      const r = await db.query(`SELECT count(*) FILTER (WHERE status='pending')::int n FROM impact_assessments WHERE change_request_id=$1 AND deleted_at IS NULL`, [id]);
      return res(r.rows[0].n === 0, r.rows[0].n ? `${r.rows[0].n} impact assessment(s) pending` : 'All impact assessments complete');
    }
    default:
      return res(false, `Unknown criterion "${criterion}" (configuration error)`);
  }
}

async function evaluateAll(db: Db, ctx: Ctx, entityType: string, entity: any, list: string[] = []) {
  const out = [];
  for (const c of list) out.push(await evaluateCriterion(db, ctx, entityType, entity, c));
  return out;
}

async function loadEntity(db: Db, ctx: Ctx, entityType: string, entityId: string) {
  const def = getResource(entityType);
  if (!def) throw badRequest('Unknown entity type');
  const r = await db.query(`SELECT * FROM ${def.table} WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [entityId, ctx.orgId]);
  if (!r.rowCount) throw notFound(def.label);
  return { def, entity: r.rows[0] };
}

// ------------------------------------------------------------------ approvals
export async function resolveApproverRole(db: Db, orgId: string, approvalType: string, amount: number | null): Promise<string> {
  const rows = (await db.query(`SELECT role_key, max_amount FROM approval_matrix WHERE org_id=$1 AND approval_type=$2 ORDER BY max_amount ASC NULLS LAST`, [orgId, approvalType])).rows;
  if (!rows.length) return 'pmo_manager';
  if (amount === null) return rows[0].role_key;
  const hit = rows.find((r) => r.max_amount === null || Number(r.max_amount) >= amount);
  return (hit ?? rows[rows.length - 1]).role_key;
}

export async function requestApproval(db: Db, ctx: Ctx, a: { entity_type: string; entity_id: string; entity_code?: string; approval_type: string; roles: string[]; amount?: number | null; workflow_instance_id?: string | null; stage_key?: string | null; round?: number; due_days?: number }) {
  const created = [];
  const round = a.round ?? 1;
  for (const role of [...new Set(a.roles)]) {
    const code = await nextCode(db, ctx.orgId, 'APR');
    const r = await db.query(`INSERT INTO approvals (org_id, code, entity_type, entity_id, workflow_instance_id, stage_key, approval_type, approver_role, amount, requested_by, round, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + ($12 || ' days')::interval) RETURNING *`,
    [ctx.orgId, code, a.entity_type, a.entity_id, a.workflow_instance_id ?? null, a.stage_key ?? null, a.approval_type, role, a.amount ?? null, ctx.userId, round, String(a.due_days ?? 5)]);
    created.push(r.rows[0]);
    await notify(db, ctx.orgId, await usersWithRole(db, ctx.orgId, role), { kind: 'approval_request', title: `Approval requested: ${a.entity_code ?? a.entity_type} (${a.approval_type})`, link: `/governance/approvals`, dedupe: `apr:${r.rows[0].id}` });
  }
  await audit(db, ctx, 'approval_requested', { type: a.entity_type, id: a.entity_id, code: a.entity_code }, null, { approval_type: a.approval_type, roles: a.roles, amount: a.amount ?? null, round });
  return created;
}

async function userRoleKeys(db: Db, userId: string): Promise<string[]> {
  return (await db.query(`SELECT r.key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1`, [userId])).rows.map((r) => r.key);
}

const SOD_TYPES = new Set(['financial', 'procurement', 'risk_acceptance', 'change', 'bia', 'requirement', 'waiver', 'resource']);

export async function decideApproval(db: Db, ctx: Ctx, approvalId: string, decision: 'approved' | 'approved_with_conditions' | 'rejected', note?: string, conditions?: string) {
  if (ctx.actorType !== 'user') throw forbidden('Only a human user can decide approvals. AI and automated actors cannot approve.');
  const ap = (await db.query(`SELECT * FROM approvals WHERE id=$1 AND org_id=$2 FOR UPDATE`, [approvalId, ctx.orgId])).rows[0];
  if (!ap) throw notFound('Approval');
  if (ap.status !== 'pending') throw conflict(`Approval is already ${ap.status}`);
  if (decision === 'rejected' && !note) throw badRequest('A reason is required when rejecting');
  if (decision === 'approved_with_conditions' && !conditions) throw badRequest('Conditions must be stated for a conditional approval');

  const roles = await userRoleKeys(db, ctx.userId);
  const isAssignee = ap.approver_id ? ap.approver_id === ctx.userId : roles.includes(ap.approver_role);
  if (!isAssignee) throw forbidden(`This approval is assigned to ${ap.approver_id ? 'a specific delegate' : `role "${ap.approver_role}"`}`);
  if (SOD_TYPES.has(ap.approval_type) && ap.requested_by === ctx.userId)
    throw forbidden('Segregation of duties: you cannot approve a request you raised');
  if (ap.amount !== null && decision !== 'rejected') {
    const lim = (await db.query(`SELECT max(COALESCE(max_amount, 1e18)) AS lim FROM approval_matrix WHERE org_id=$1 AND approval_type=$2 AND role_key = ANY($3::text[])`, [ctx.orgId, ap.approval_type, roles])).rows[0].lim;
    if (lim === null || Number(ap.amount) > Number(lim))
      throw forbidden(`Amount ${ap.amount} exceeds your delegated authority${lim !== null ? ` (${lim})` : ''} for ${ap.approval_type} approvals`);
  }

  const upd = (await db.query(`UPDATE approvals SET status=$2, decision_note=$3, conditions=$4, decided_at=now(), decided_by=$5 WHERE id=$1 RETURNING *`,
    [approvalId, decision, note ?? null, conditions ?? null, ctx.userId])).rows[0];
  await audit(db, ctx, decision === 'rejected' ? 'reject' : 'approve', { type: ap.entity_type, id: ap.entity_id }, { approval: ap.code, status: 'pending' }, { approval: ap.code, status: decision, note, conditions });

  const siblings = (await db.query(`SELECT status FROM approvals WHERE entity_type=$1 AND entity_id=$2 AND round=$3 AND COALESCE(stage_key,'')=COALESCE($4,'') AND approval_type=$5 AND status <> 'cancelled'`,
    [ap.entity_type, ap.entity_id, ap.round, ap.stage_key, ap.approval_type])).rows;

  if (decision === 'rejected') {
    await db.query(`UPDATE approvals SET status='cancelled', decision_note='Cancelled: another approver rejected' WHERE entity_type=$1 AND entity_id=$2 AND round=$3 AND COALESCE(stage_key,'')=COALESCE($4,'') AND status='pending'`,
      [ap.entity_type, ap.entity_id, ap.round, ap.stage_key]);
    await onRejected(db, ctx, ap, note!);
  } else if (siblings.every((s) => s.status === 'approved' || s.status === 'approved_with_conditions')) {
    await onAllApproved(db, ctx, ap);
  }
  if (ap.requested_by) await notify(db, ctx.orgId, [ap.requested_by], { kind: 'approval_decision', title: `${ap.code} ${decision.replace(/_/g, ' ')}`, body: note ?? conditions, link: '/governance/approvals' });
  return upd;
}

export async function delegateApproval(db: Db, ctx: Ctx, approvalId: string, toUserId: string, reason: string) {
  if (ctx.actorType !== 'user') throw forbidden('AI and automated actors cannot delegate approvals');
  const ap = (await db.query(`SELECT * FROM approvals WHERE id=$1 AND org_id=$2 FOR UPDATE`, [approvalId, ctx.orgId])).rows[0];
  if (!ap) throw notFound('Approval');
  if (ap.status !== 'pending') throw conflict('Only pending approvals can be delegated');
  const myRoles = await userRoleKeys(db, ctx.userId);
  const allowed = (ap.approver_id ? ap.approver_id === ctx.userId : myRoles.includes(ap.approver_role)) || can(ctx, 'approvals:admin');
  if (!allowed) throw forbidden('Only the assigned approver or an approvals administrator can delegate or change the approver');
  const target = (await db.query(`SELECT id FROM users WHERE id=$1 AND org_id=$2 AND status='active' AND deleted_at IS NULL`, [toUserId, ctx.orgId])).rows[0];
  if (!target) throw badRequest('Delegate must be an active user in the organisation');
  if (toUserId === ap.requested_by && SOD_TYPES.has(ap.approval_type)) throw forbidden('Cannot delegate an approval to the requester (segregation of duties)');
  if (ap.amount !== null) {
    const tRoles = await userRoleKeys(db, toUserId);
    const lim = (await db.query(`SELECT max(COALESCE(max_amount, 1e18)) AS lim FROM approval_matrix WHERE org_id=$1 AND approval_type=$2 AND role_key = ANY($3::text[])`, [ctx.orgId, ap.approval_type, tRoles])).rows[0].lim;
    if (lim === null || Number(ap.amount) > Number(lim)) throw forbidden('Delegate does not hold sufficient delegated authority for this amount');
  }
  const r = (await db.query(`UPDATE approvals SET approver_id=$2, delegated_from=$3, decision_note=$4 WHERE id=$1 RETURNING *`, [approvalId, toUserId, ctx.userId, `Delegated: ${reason}`])).rows[0];
  await audit(db, ctx, 'approval_delegated', { type: ap.entity_type, id: ap.entity_id }, { approver_id: ap.approver_id, approver_role: ap.approver_role }, { approver_id: toUserId, reason });
  await notify(db, ctx.orgId, [toUserId], { kind: 'approval_request', title: `Approval delegated to you: ${ap.code}`, link: '/governance/approvals' });
  return r;
}

/** Effects applied when all approvers in a round approve. */
async function onAllApproved(db: Db, ctx: Ctx, ap: any) {
  if (ap.workflow_instance_id) return moveToNextStage(db, ctx, ap.workflow_instance_id, 'approved');
  const set = async (table: string, sql: string, params: unknown[] = []) => {
    const before = (await db.query(`SELECT status FROM ${table} WHERE id=$1`, [ap.entity_id])).rows[0];
    await db.query(`UPDATE ${table} SET ${sql} WHERE id=$1`, [ap.entity_id, ...params]);
    await audit(db, ctx, 'transition', { type: ap.entity_type, id: ap.entity_id }, before, { via: ap.code, effect: sql });
  };
  switch (`${ap.entity_type}:${ap.approval_type}`) {
    case 'budgets:financial': return set('budgets', `status='approved', approved_by=$2, approved_at=now()`, [ctx.userId]);
    case 'purchase_requests:procurement': return set('purchase_requests', `status='approved'`);
    case 'business_cases:financial': return set('business_cases', `status='approved'`);
    case 'documents:document': return set('documents', `status='approved'`);
    case 'releases:cab': return set('releases', `cab_status='approved'`);
    case 'requirements:requirement': return set('requirements', `status='approved'`);
    case 'risks:risk_acceptance': return set('risks', `acceptance_status='approved', treatment='accept', status='monitoring'`);
    case 'bia_assessments:bia': {
      await set('bia_assessments', `status='approved', approved_by=$2, approved_at=now(), next_review_date=(now() + (review_frequency_months || ' months')::interval)::date, review_trigger=NULL`, [ctx.userId]);
      // FR-BIA-010 / §8.2: immutable approved version history
      const b = (await db.query(`SELECT * FROM bia_assessments WHERE id=$1`, [ap.entity_id])).rows[0];
      const impacts = (await db.query(`SELECT category, horizon_hours, severity, financial_amount, rationale FROM bia_impacts WHERE bia_id=$1 ORDER BY category, horizon_hours`, [b.id])).rows;
      const deps = (await db.query(`SELECT * FROM bia_dependencies WHERE bia_id=$1`, [b.id])).rows;
      const exists = (await db.query(`SELECT 1 FROM bia_versions WHERE bia_id=$1 AND version=$2`, [b.id, b.version])).rowCount;
      const v = exists ? (await db.query(`SELECT max(version)+1 AS v FROM bia_versions WHERE bia_id=$1`, [b.id])).rows[0].v : b.version;
      await db.query(`INSERT INTO bia_versions (org_id, bia_id, version, snapshot, approved_by, approved_at) VALUES ($1,$2,$3,$4,$5,now())`, [ctx.orgId, b.id, v, JSON.stringify({ assessment: b, impacts, dependencies: deps }), ctx.userId]);
      await db.query(`UPDATE bia_assessments SET version=$2 WHERE id=$1`, [b.id, v]);
      return;
    }
    case 'defects:waiver': {
      const d = (await db.query(`SELECT waiver_reason FROM defects WHERE id=$1`, [ap.entity_id])).rows[0];
      const disp = String(d?.waiver_reason ?? '').startsWith('[known_error]') ? 'known_error' : 'waived';
      return set('defects', `status=$2, waived_by=$3`, [disp, ctx.userId]);
    }
    case 'resource_allocations:resource': return set('resource_allocations', `status='active'`);
    case 'change_requests:change': {
      const cr = (await db.query(`SELECT * FROM change_requests WHERE id=$1`, [ap.entity_id])).rows[0];
      await set('change_requests', `status='approved', decision='Approved', decided_at=now()`);
      // Apply approved schedule impact to the project plan (audited) – the baseline is preserved.
      if (cr.context_type === 'project' && cr.impact_schedule_days) {
        const p = (await db.query(`UPDATE projects SET end_date = end_date + $2::int WHERE id=$1 AND end_date IS NOT NULL RETURNING id, code, end_date`, [cr.context_id, cr.impact_schedule_days])).rows[0];
        if (p) await audit(db, ctx, 'update', { type: 'projects', id: p.id, code: p.code }, null, { end_date: p.end_date, reason: `Approved ${cr.code}` });
      }
      // FR-SCP-005 / FR-CHG-006: an approved change on a baselined project creates a new baseline version.
      if (cr.context_type === 'project' && (cr.impact_schedule_days || (cr.impact_cost && Number(cr.impact_cost) !== 0))) {
        const p = (await db.query(`SELECT baseline_version, start_date, end_date, budget_at_completion FROM projects WHERE id=$1`, [cr.context_id])).rows[0];
        if (p?.baseline_version > 0) {
          if (cr.impact_cost && Number(cr.impact_cost) !== 0 && p.budget_at_completion !== null) await db.query(`UPDATE projects SET budget_at_completion = budget_at_completion + $2 WHERE id=$1`, [cr.context_id, cr.impact_cost]);
          await createBaseline(db, ctx, cr.context_id, `Re-baselined by approved ${cr.code}`, cr.id);
        }
      }
      if (cr.context_type === 'project' && cr.impact_cost && Number(cr.impact_cost) !== 0) {
        const code = await nextCode(db, ctx.orgId, 'CST');
        await db.query(`INSERT INTO cost_entries (org_id, code, name, context_type, context_id, entry_kind, amount, entry_date, created_by, updated_by, owner_id)
          VALUES ($1,$2,$3,'project',$4,'forecast',$5,current_date,$6,$6,$6)`, [ctx.orgId, code, `Forecast from approved ${cr.code}`, cr.context_id, cr.impact_cost, ctx.userId]);
      }
      return;
    }
    default: return;
  }
}

async function onRejected(db: Db, ctx: Ctx, ap: any, note: string) {
  if (ap.workflow_instance_id) {
    const wi = (await db.query(`SELECT * FROM workflow_instances WHERE id=$1 FOR UPDATE`, [ap.workflow_instance_id])).rows[0];
    const history = [...wi.history, { at: new Date().toISOString(), stage: wi.current_stage, event: 'rejected', by: ctx.userId, note }];
    await db.query(`UPDATE workflow_instances SET state='returned', history=$2 WHERE id=$1`, [wi.id, JSON.stringify(history)]);
    return;
  }
  const map: Record<string, string> = { budgets: `status='rejected'`, purchase_requests: `status='rejected'`, business_cases: `status='rejected'`, change_requests: `status='rejected', decision=$2, decided_at=now()`, risks: `acceptance_status='rejected'`, releases: `cab_status='rejected'`, requirements: `status='draft'`, bia_assessments: `status='draft'`, documents: `status='draft'`, defects: `waiver_reason=NULL`, resource_allocations: `status='requested'` };
  const sql = map[ap.entity_type];
  if (sql) await db.query(`UPDATE ${ap.entity_type} SET ${sql} WHERE id=$1`, sql.includes('$2') ? [ap.entity_id, `Rejected: ${note}`] : [ap.entity_id]);
}

// ------------------------------------------------------------------ workflow instances
export async function startWorkflow(db: Db, ctx: Ctx, definitionKey: string, entityType: string, entityId: string) {
  const defn = (await db.query(`SELECT * FROM workflow_definitions WHERE org_id=$1 AND key=$2 AND is_active ORDER BY version DESC LIMIT 1`, [ctx.orgId, definitionKey])).rows[0];
  if (!defn) throw notFound('Workflow definition');
  if (defn.entity_type !== entityType) throw badRequest(`Workflow ${definitionKey} applies to ${defn.entity_type}, not ${entityType}`);
  const { entity } = await loadEntity(db, ctx, entityType, entityId);
  const existing = (await db.query(`SELECT id FROM workflow_instances WHERE entity_type=$1 AND entity_id=$2 AND state NOT IN ('completed','cancelled')`, [entityType, entityId])).rows[0];
  if (existing) throw conflict('An active workflow already exists for this record');
  const first: StageDef = defn.stages[0];
  const history = [{ at: new Date().toISOString(), stage: first.key, event: 'started', by: ctx.userId }];
  const wi = (await db.query(`INSERT INTO workflow_instances (org_id, definition_id, entity_type, entity_id, current_stage, requested_by, history) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [ctx.orgId, defn.id, entityType, entityId, first.key, ctx.userId, JSON.stringify(history)])).rows[0];
  await applyStageSets(db, entityType, entityId, first);
  await audit(db, ctx, 'workflow_started', { type: entityType, id: entityId, code: entity.code }, null, { workflow: definitionKey, stage: first.key });
  return wi;
}

async function applyStageSets(db: Db, entityType: string, entityId: string, stage: StageDef) {
  if (!stage.sets) return;
  const def = getResource(entityType)!;
  const allowed = new Set(def.fields.map((f) => f.n).concat(['status', 'lifecycle_stage']));
  for (const [k, v] of Object.entries(stage.sets)) if (allowed.has(k)) await db.query(`UPDATE ${def.table} SET ${k}=$2 WHERE id=$1`, [entityId, v]);
}

export async function workflowState(db: Db, ctx: Ctx, instanceId: string) {
  const wi = (await db.query(`SELECT wi.*, wd.key AS definition_key, wd.name AS definition_name, wd.stages FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id=wi.definition_id WHERE wi.id=$1 AND wi.org_id=$2`, [instanceId, ctx.orgId])).rows[0];
  if (!wi) throw notFound('Workflow instance');
  const { entity } = await loadEntity(db, ctx, wi.entity_type, wi.entity_id);
  const stages: StageDef[] = wi.stages;
  const idx = stages.findIndex((s) => s.key === wi.current_stage);
  const cur = stages[idx];
  const next = stages[idx + 1];
  const exit = await evaluateAll(db, ctx, wi.entity_type, entity, cur?.exit);
  const nextEntry = next ? await evaluateAll(db, ctx, wi.entity_type, entity, next.entry) : [];
  const approvals = (await db.query(`SELECT a.*, u.name AS approver_name FROM approvals a LEFT JOIN users u ON u.id=a.approver_id WHERE a.workflow_instance_id=$1 ORDER BY a.round DESC, a.created_at`, [wi.id])).rows;
  return { instance: wi, stages, current_index: idx, current: cur, next: next ?? null, exit_criteria: exit, next_entry_criteria: nextEntry, approvals };
}

/**
 * Request to leave the current stage. Exit criteria (current) and entry criteria (next) must pass,
 * unless an authorised user records a justified gate exception. If the stage needs approvals,
 * approvals are raised and the instance waits; otherwise it moves on immediately.
 */
export async function advanceWorkflow(db: Db, ctx: Ctx, instanceId: string, opts: { exceptionJustification?: string } = {}) {
  const wi = (await db.query(`SELECT wi.*, wd.stages FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id=wi.definition_id WHERE wi.id=$1 AND wi.org_id=$2 FOR UPDATE OF wi`, [instanceId, ctx.orgId])).rows[0];
  if (!wi) throw notFound('Workflow instance');
  if (wi.state === 'awaiting_approval') throw conflict('Stage is awaiting approval');
  if (['completed', 'cancelled'].includes(wi.state)) throw conflict(`Workflow is ${wi.state}`);
  const { entity } = await loadEntity(db, ctx, wi.entity_type, wi.entity_id);
  if (!can(ctx, `${wi.entity_type}:write`)) throw forbidden();
  const stages: StageDef[] = wi.stages;
  const idx = stages.findIndex((s) => s.key === wi.current_stage);
  const cur = stages[idx], next = stages[idx + 1];
  const failed = [...await evaluateAll(db, ctx, wi.entity_type, entity, cur.exit), ...(next ? await evaluateAll(db, ctx, wi.entity_type, entity, next.entry) : [])].filter((c) => !c.met);
  if (failed.length) {
    if (!opts.exceptionJustification) throw unprocessable('Gate criteria not met', failed);
    if (!can(ctx, 'workflow:override')) throw forbidden('Recording a gate exception requires the workflow:override permission');
    await audit(db, ctx, 'gate_exception', { type: wi.entity_type, id: wi.entity_id, code: entity.code }, { stage: cur.key, failed }, { justification: opts.exceptionJustification });
  }
  if (cur.approvals?.length) {
    const prevRound = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE workflow_instance_id=$1 AND stage_key=$2`, [wi.id, cur.key])).rows[0].r;
    const history = [...wi.history, { at: new Date().toISOString(), stage: cur.key, event: prevRound ? 'resubmitted' : 'submitted_for_approval', by: ctx.userId }];
    await db.query(`UPDATE workflow_instances SET state='awaiting_approval', history=$2 WHERE id=$1`, [wi.id, JSON.stringify(history)]);
    await requestApproval(db, ctx, { entity_type: wi.entity_type, entity_id: wi.entity_id, entity_code: entity.code, approval_type: 'gate', roles: cur.approvals.map((a) => a.role), amount: null, workflow_instance_id: wi.id, stage_key: cur.key, round: prevRound + 1 });
    return workflowState(db, ctx, wi.id);
  }
  await moveToNextStage(db, ctx, wi.id, failed.length ? 'advanced_with_exception' : 'advanced');
  return workflowState(db, ctx, wi.id);
}

async function moveToNextStage(db: Db, ctx: Ctx, instanceId: string, event: string) {
  const wi = (await db.query(`SELECT wi.*, wd.stages FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id=wi.definition_id WHERE wi.id=$1`, [instanceId])).rows[0];
  const stages: StageDef[] = wi.stages;
  const idx = stages.findIndex((s) => s.key === wi.current_stage);
  const next = stages[idx + 1];
  const history = [...wi.history, { at: new Date().toISOString(), stage: wi.current_stage, event, by: ctx.userId }];
  if (!next) {
    await db.query(`UPDATE workflow_instances SET state='completed', history=$2 WHERE id=$1`, [wi.id, JSON.stringify(history)]);
  } else {
    history.push({ at: new Date().toISOString(), stage: next.key, event: 'entered', by: ctx.userId });
    await db.query(`UPDATE workflow_instances SET current_stage=$2, state='in_stage', history=$3 WHERE id=$1`, [wi.id, next.key, JSON.stringify(history)]);
    await applyStageSets(db, wi.entity_type, wi.entity_id, next);
  }
  await audit(db, ctx, 'transition', { type: wi.entity_type, id: wi.entity_id }, { stage: wi.current_stage }, { stage: next?.key ?? 'completed', event });
}

export async function cancelWorkflow(db: Db, ctx: Ctx, instanceId: string, reason: string) {
  const wi = (await db.query(`UPDATE workflow_instances SET state='cancelled', history = history || $3::jsonb WHERE id=$1 AND org_id=$2 AND state NOT IN ('completed','cancelled') RETURNING *`,
    [instanceId, ctx.orgId, JSON.stringify([{ at: new Date().toISOString(), event: 'cancelled', by: ctx.userId, note: reason }])])).rows[0];
  if (!wi) throw notFound('Active workflow instance');
  await db.query(`UPDATE approvals SET status='cancelled' WHERE workflow_instance_id=$1 AND status='pending'`, [instanceId]);
  await audit(db, ctx, 'workflow_cancelled', { type: wi.entity_type, id: wi.entity_id }, null, { reason });
  return wi;
}
