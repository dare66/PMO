/**
 * Domain services added in migration 002:
 * investment scenarios, requirements traceability matrix + export snapshots, BPMN 2.0 import/export,
 * skills matching, tender evaluation & award, policy attestation, requirement versioning & change impact,
 * recurring work generation, CSV export.
 */
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { notify } from '../core/notify.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { fxContext } from './finance.js';
import { toBase } from './calc.js';

const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

// ------------------------------------------------------------------ scenarios (FR-STR-005)
/**
 * Evaluates a what-if portfolio scenario: included items are ranked (rank, then value/cost),
 * funded cumulatively until the funding limit and checked against FTE capacity.
 * Items with no cost data are reported as "unpriced" rather than assumed free.
 */
export async function evaluateScenario(db: Db, ctx: Ctx, id: string) {
  const s = (await db.query(`SELECT s.*, p.funding_envelope, p.name AS portfolio_name FROM investment_scenarios s LEFT JOIN portfolios p ON p.id=s.portfolio_id WHERE s.id=$1 AND s.org_id=$2 AND s.deleted_at IS NULL`, [id, ctx.orgId])).rows[0];
  if (!s) throw notFound('Scenario');
  const { base, rates } = await fxContext(db, ctx.orgId);
  const items = (await db.query(`SELECT i.*, pj.code AS project_code, pj.name AS project_name, pj.budget_at_completion, pj.currency, pj.strategic_score,
      id.code AS idea_code, id.name AS idea_name, id.cost_of_delay
    FROM scenario_items i LEFT JOIN projects pj ON pj.id=i.project_id LEFT JOIN ideas id ON id.id=i.idea_id
    WHERE i.scenario_id=$1 AND i.deleted_at IS NULL`, [id])).rows;
  const limit = s.funding_limit ?? s.funding_envelope ?? null;
  const capacity = s.capacity_limit_fte ?? Number((await db.query(`SELECT count(*)::int n FROM users WHERE org_id=$1 AND status='active' AND NOT is_service_account AND deleted_at IS NULL`, [ctx.orgId])).rows[0].n);
  const enriched = items.map((i) => {
    const cost = i.cost_override !== null ? Number(i.cost_override) : i.budget_at_completion !== null && i.budget_at_completion !== undefined ? toBase(Number(i.budget_at_completion), i.currency ?? base, base, rates) : null;
    const value = i.value_score ?? i.strategic_score ?? null;
    return { id: i.id, code: i.code, label: i.project_code ? `${i.project_code} ${i.project_name}` : `${i.idea_code} ${i.idea_name}`, kind: i.project_id ? 'project' : 'idea', included: i.included, rank: i.rank, cost, value, fte: i.fte_demand === null ? null : Number(i.fte_demand), value_per_million: cost && value !== null ? Math.round((value / (cost / 1e6)) * 10) / 10 : null };
  });
  const included = enriched.filter((i) => i.included).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || (b.value_per_million ?? -1) - (a.value_per_million ?? -1));
  let cum = 0, fte = 0;
  const funded = included.map((i) => {
    if (i.cost === null) return { ...i, cumulative_cost: null, within_funding: null, within_capacity: null, unpriced: true };
    cum += i.cost; fte += i.fte ?? 0;
    return { ...i, cumulative_cost: cum, within_funding: limit === null ? null : cum <= Number(limit), within_capacity: fte <= Number(capacity), unpriced: false };
  });
  const totalValue = funded.filter((i) => i.within_funding !== false).reduce((a, i) => a + (i.value ?? 0), 0);
  return {
    scenario: { id: s.id, code: s.code, name: s.name, portfolio: s.portfolio_name, fiscal_year: s.fiscal_year },
    currency: base, funding_limit: limit === null ? null : Number(limit), capacity_fte: capacity,
    total_cost: cum, total_fte: fte, headroom: limit === null ? null : Number(limit) - cum,
    over_funding: limit !== null && cum > Number(limit), over_capacity: fte > Number(capacity),
    value_funded: totalValue, unpriced_items: funded.filter((i) => i.unpriced).length,
    items: funded, excluded: enriched.filter((i) => !i.included),
  };
}

// ------------------------------------------------------------------ traceability matrix (FR-BA-004, prior spec 2.9/2.14)
export async function traceabilityMatrix(db: Db, ctx: Ctx, contextType: string, contextId: string) {
  const reqs = (await db.query(`SELECT r.id, r.code, r.name, r.priority, r.status, r.version, r.req_type, o.code AS objective_code
     FROM requirements r LEFT JOIN objectives o ON o.id=r.objective_id WHERE r.org_id=$1 AND r.context_type=$2 AND r.context_id=$3 AND r.deleted_at IS NULL ORDER BY r.code`, [ctx.orgId, contextType, contextId])).rows;
  const ids = reqs.map((r) => r.id);
  const work = (await db.query(`SELECT id, code, name, status, requirement_id FROM work_items WHERE requirement_id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids])).rows;
  const tests = (await db.query(`SELECT tc.id, tc.code, tc.name, tc.requirement_id,
      (SELECT te.result FROM test_executions te WHERE te.test_case_id=tc.id AND te.deleted_at IS NULL ORDER BY te.executed_at DESC LIMIT 1) AS last_result,
      (SELECT te.evidence_ref FROM test_executions te WHERE te.test_case_id=tc.id AND te.deleted_at IS NULL ORDER BY te.executed_at DESC LIMIT 1) AS evidence_ref
     FROM test_cases tc WHERE tc.requirement_id = ANY($1::uuid[]) AND tc.deleted_at IS NULL`, [ids])).rows;
  const unlinkedWork = (await db.query(`SELECT id, code, name, status FROM work_items WHERE org_id=$1 AND context_type=$2 AND context_id=$3 AND requirement_id IS NULL AND work_type IN ('task','story','epic','bug') AND deleted_at IS NULL`, [ctx.orgId, contextType, contextId])).rows;
  const rows = reqs.map((r) => {
    const w = work.filter((x) => x.requirement_id === r.id), t = tests.filter((x) => x.requirement_id === r.id);
    const gaps = [!w.length && 'no implementing work', !t.length && 'no test case', t.length && !t.some((x) => x.last_result === 'passed') && 'not yet verified (no passing run)', !r.objective_code && 'no objective link'].filter(Boolean) as string[];
    return { ...r, work_items: w, test_cases: t, verified: t.length > 0 && t.every((x) => x.last_result === 'passed'), gaps };
  });
  return {
    requirements: rows, unlinked_work: unlinkedWork,
    coverage: { requirements: rows.length, with_work: rows.filter((r) => r.work_items.length).length, with_tests: rows.filter((r) => r.test_cases.length).length, verified: rows.filter((r) => r.verified).length },
  };
}

/** CSV cell: neutralise spreadsheet formulas first (OWASP CSV injection: = + - @ tab CR), then quote when needed. */
const csvCell = (v: unknown) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export async function exportTraceability(db: Db, ctx: Ctx, contextType: string, contextId: string) {
  const m = await traceabilityMatrix(db, ctx, contextType, contextId);
  const rows = m.requirements.map((r) => [r.code, r.name, r.req_type, r.priority, r.status, r.version, r.objective_code ?? '', r.work_items.map((w: any) => w.code).join(' '), r.test_cases.map((t: any) => `${t.code}:${t.last_result ?? 'not_run'}`).join(' '), r.test_cases.map((t: any) => t.evidence_ref ?? '').filter(Boolean).join(' '), r.verified ? 'yes' : 'no', r.gaps.join('; ')]);
  const csv = toCsv(['Requirement', 'Title', 'Type', 'Priority', 'Status', 'Version', 'Objective', 'Work items', 'Test cases (last result)', 'Evidence', 'Verified', 'Gaps'], rows);
  const sourceHash = sha256(JSON.stringify(rows));
  const snap = (await db.query(`INSERT INTO export_snapshots (org_id, kind, context_type, context_id, checksum, source_hash, row_count, created_by) VALUES ($1,'traceability_csv',$2,$3,$4,$5,$6,$7) RETURNING *`,
    [ctx.orgId, contextType, contextId, sha256(csv), sourceHash, rows.length, ctx.userId])).rows[0];
  await audit(db, ctx, 'export', { type: 'export_snapshots', id: snap.id }, null, { kind: 'traceability_csv', checksum: snap.checksum, rows: rows.length });
  return { csv, snapshot: snap };
}

/** An export is stale when the source records have changed since the snapshot was taken. */
export async function exportStale(db: Db, ctx: Ctx, snapshotId: string) {
  const snap = (await db.query(`SELECT * FROM export_snapshots WHERE id=$1 AND org_id=$2`, [snapshotId, ctx.orgId])).rows[0];
  if (!snap) throw notFound('Export');
  const m = await traceabilityMatrix(db, ctx, snap.context_type, snap.context_id);
  const rows = m.requirements.map((r) => [r.code, r.name, r.req_type, r.priority, r.status, r.version, r.objective_code ?? '', r.work_items.map((w: any) => w.code).join(' '), r.test_cases.map((t: any) => `${t.code}:${t.last_result ?? 'not_run'}`).join(' '), r.test_cases.map((t: any) => t.evidence_ref ?? '').filter(Boolean).join(' '), r.verified ? 'yes' : 'no', r.gaps.join('; ')]);
  return { snapshot: snap, stale: sha256(JSON.stringify(rows)) !== snap.source_hash };
}

// ------------------------------------------------------------------ BPMN 2.0 (FR-BA-003)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function bpmnExport(db: Db, ctx: Ctx, processId: string) {
  const p = (await db.query(`SELECT * FROM business_processes WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [processId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Process');
  const steps = (await db.query(`SELECT * FROM process_steps WHERE process_id=$1 AND deleted_at IS NULL ORDER BY seq`, [processId])).rows;
  const el = (s: any) => ({ start: 'startEvent', end: 'endEvent', decision: 'exclusiveGateway', task: 'task' } as Record<string, string>)[s.step_type] ?? 'task';
  const lanes = [...new Set(steps.map((s) => s.lane ?? 'Unassigned'))];
  const flows: string[] = [];
  for (const s of steps) for (const n of s.next_step_seq ?? []) if (steps.some((t) => t.seq === n)) flows.push(`    <bpmn:sequenceFlow id="Flow_${s.seq}_${n}" sourceRef="Step_${s.seq}" targetRef="Step_${n}" />`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_${esc(p.code)}" targetNamespace="urn:meridian:${esc(p.code)}" exporter="Meridian" exporterVersion="0.2">
  <bpmn:process id="Process_${esc(p.code.replace(/-/g, '_'))}" name="${esc(p.name)}" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
${lanes.map((l, i) => `      <bpmn:lane id="Lane_${i + 1}" name="${esc(l)}">\n${steps.filter((s) => (s.lane ?? 'Unassigned') === l).map((s) => `        <bpmn:flowNodeRef>Step_${s.seq}</bpmn:flowNodeRef>`).join('\n')}\n      </bpmn:lane>`).join('\n')}
    </bpmn:laneSet>
${steps.map((s) => `    <bpmn:${el(s)} id="Step_${s.seq}" name="${esc(s.name)}" />`).join('\n')}
${flows.join('\n')}
  </bpmn:process>
</bpmn:definitions>
`;
  return { filename: `${p.code}-v${p.version_label}.bpmn`, xml };
}

export async function bpmnImport(db: Db, ctx: Ctx, processId: string, xml: string) {
  const p = (await db.query(`SELECT * FROM business_processes WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE`, [processId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Process');
  if (xml.length > 2_000_000) throw badRequest('BPMN file too large (max 2 MB)');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw badRequest('DTD/entity declarations are not allowed in BPMN imports'); // XXE / billion-laughs guard
  let doc: any;
  try { doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, processEntities: false }).parse(xml); } catch { throw badRequest('Invalid XML'); }
  const proc = [doc?.definitions?.process].flat()[0];
  if (!proc) throw badRequest('No <process> element found');
  const arr = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
  const kinds: [string, string][] = [['startEvent', 'start'], ['endEvent', 'end'], ['exclusiveGateway', 'decision'], ['parallelGateway', 'decision'], ['inclusiveGateway', 'decision'], ['task', 'task'], ['userTask', 'task'], ['serviceTask', 'task'], ['manualTask', 'task'], ['scriptTask', 'task'], ['businessRuleTask', 'task'], ['sendTask', 'task'], ['receiveTask', 'task'], ['subProcess', 'task'], ['callActivity', 'task'], ['intermediateCatchEvent', 'task'], ['intermediateThrowEvent', 'task']];
  const nodes: { id: string; name: string; type: string }[] = [];
  for (const [tag, type] of kinds) for (const n of arr(proc[tag])) nodes.push({ id: n.id, name: n.name ?? n.id, type });
  if (!nodes.length) throw badRequest('No flow nodes found');
  if (nodes.length > 500) throw badRequest('Too many flow nodes (max 500)');
  const laneOf = new Map<string, string>();
  for (const ls of arr(proc.laneSet)) for (const lane of arr(ls.lane)) for (const ref of arr(lane.flowNodeRef)) laneOf.set(typeof ref === 'string' ? ref : ref['#text'], lane.name ?? lane.id);
  const flows = arr(proc.sequenceFlow).map((f: any) => ({ from: f.sourceRef, to: f.targetRef }));
  // order: breadth-first from start events, then any remaining nodes
  const order: string[] = []; const seen = new Set<string>();
  const queue = nodes.filter((n) => n.type === 'start').map((n) => n.id);
  while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); order.push(id); for (const f of flows) if (f.from === id) queue.push(f.to); }
  for (const n of nodes) if (!seen.has(n.id)) order.push(n.id);
  const seqOf = new Map(order.map((id, i) => [id, i + 1]));
  await db.query(`UPDATE process_steps SET deleted_at=now(), updated_by=$2 WHERE process_id=$1 AND deleted_at IS NULL`, [processId, ctx.userId]);
  for (const id of order) {
    const n = nodes.find((x) => x.id === id)!;
    const next = flows.filter((f: any) => f.from === id).map((f: any) => seqOf.get(f.to)).filter(Boolean);
    await db.query(`INSERT INTO process_steps (org_id, code, name, process_id, seq, lane, step_type, next_step_seq, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [ctx.orgId, await nextCode(db, ctx.orgId, 'PS'), String(n.name).slice(0, 300), processId, seqOf.get(id), laneOf.get(id) ?? null, n.type, next.length ? next : null, ctx.userId]);
  }
  await db.query(`UPDATE business_processes SET bpmn_xml=$2 WHERE id=$1`, [processId, xml]);
  await audit(db, ctx, 'bpmn_import', { type: 'business_processes', id: processId, code: p.code }, null, { nodes: nodes.length, flows: flows.length, sha256: sha256(xml) });
  return { steps: order.length, flows: flows.length, lanes: new Set(laneOf.values()).size };
}

// ------------------------------------------------------------------ skills matching (FR-RES-003)
export async function skillMatch(db: Db, ctx: Ctx, requirementId: string) {
  const r = (await db.query(`SELECT sr.*, s.name AS skill_name FROM skill_requirements sr JOIN skills s ON s.id=sr.skill_id WHERE sr.id=$1 AND sr.org_id=$2 AND sr.deleted_at IS NULL`, [requirementId, ctx.orgId])).rows[0];
  if (!r) throw notFound('Skill requirement');
  const from = r.start_date ?? new Date().toISOString().slice(0, 10);
  const to = r.end_date ?? from;
  const cands = (await db.query(`SELECT u.id, u.code, u.name, u.title, us.proficiency,
      COALESCE((SELECT max(t.load) FROM (SELECT sum(a.allocation_pct) load FROM resource_allocations a, generate_series($3::date, $4::date, '7 days') wk
        WHERE a.user_id=u.id AND a.deleted_at IS NULL AND a.status <> 'released' AND a.start_date <= wk AND a.end_date >= wk GROUP BY wk) t), 0) AS peak_load
    FROM users u LEFT JOIN user_skills us ON us.user_id=u.id AND us.skill_id=$2
    WHERE u.org_id=$1 AND u.status='active' AND u.deleted_at IS NULL AND NOT u.is_service_account`, [ctx.orgId, r.skill_id, from, to])).rows;
  const ranked = cands.map((c) => {
    const free = Math.max(0, 100 - Number(c.peak_load));
    return { ...c, peak_load: Number(c.peak_load), free_capacity_pct: free, meets_skill: (c.proficiency ?? 0) >= r.min_proficiency, can_cover: free >= Number(r.fte_pct), score: (c.proficiency ?? 0) * 20 + free * 0.5 };
  }).filter((c) => c.proficiency !== null).sort((a, b) => Number(b.meets_skill && b.can_cover) - Number(a.meets_skill && a.can_cover) || b.score - a.score);
  return { requirement: { id: r.id, code: r.code, name: r.name, skill: r.skill_name, min_proficiency: r.min_proficiency, fte_pct: Number(r.fte_pct), start_date: r.start_date, end_date: r.end_date }, candidates: ranked, gap: !ranked.some((c) => c.meets_skill && c.can_cover) };
}

/** Organisation-wide skills gap: open demand vs people meeting proficiency with free capacity. */
export async function skillsGap(db: Db, ctx: Ctx) {
  const reqs = (await db.query(`SELECT id FROM skill_requirements WHERE org_id=$1 AND status='open' AND deleted_at IS NULL`, [ctx.orgId])).rows;
  const out = [];
  for (const r of reqs) { const m = await skillMatch(db, ctx, r.id); out.push({ ...m.requirement, qualified: m.candidates.filter((c) => c.meets_skill).length, available: m.candidates.filter((c) => c.meets_skill && c.can_cover).length, gap: m.gap }); }
  return out;
}

// ------------------------------------------------------------------ tenders (FR-VND-004)
export interface Criterion { key: string; name: string; weight: number }
export function scoreBids(criteria: Criterion[], bids: { id: string; price: number | null; scores: Record<string, number>; compliant: boolean }[]) {
  const prices = bids.filter((b) => b.compliant && b.price !== null && b.price > 0).map((b) => Number(b.price));
  const minPrice = prices.length ? Math.min(...prices) : null;
  return bids.map((b) => {
    if (!b.compliant) return { id: b.id, total: null, breakdown: {}, reason: 'non-compliant' };
    const breakdown: Record<string, number | null> = {};
    let total = 0, missing = false;
    for (const c of criteria) {
      let pts: number | null;
      if (c.key === 'price') pts = b.price && minPrice ? (minPrice / Number(b.price)) * 10 : null; // lowest price = 10
      else pts = b.scores?.[c.key] ?? null;
      breakdown[c.key] = pts === null ? null : Math.round(pts * 100) / 100;
      if (pts === null) missing = true; else total += (pts / 10) * c.weight;
    }
    return { id: b.id, total: missing ? null : Math.round(total * 100) / 100, breakdown, reason: missing ? 'incomplete scoring' : undefined };
  });
}

export async function evaluateTender(db: Db, ctx: Ctx, id: string) {
  const t = (await db.query(`SELECT * FROM tenders WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [id, ctx.orgId])).rows[0];
  if (!t) throw notFound('Tender');
  const bids = (await db.query(`SELECT b.*, v.code AS vendor_code, v.name AS vendor_name, v.risk_rating, v.due_diligence_status FROM tender_bids b JOIN vendors v ON v.id=b.vendor_id WHERE b.tender_id=$1 AND b.deleted_at IS NULL`, [id])).rows;
  const criteria: Criterion[] = t.criteria ?? [];
  const weightSum = criteria.reduce((a, c) => a + Number(c.weight), 0);
  const scored = scoreBids(criteria, bids.map((b) => ({ id: b.id, price: b.price === null ? null : Number(b.price), scores: b.scores, compliant: b.compliant })));
  const rows = bids.map((b) => ({ id: b.id, code: b.code, vendor_id: b.vendor_id, vendor: `${b.vendor_code} ${b.vendor_name}`, price: b.price, compliant: b.compliant, vendor_risk: b.risk_rating, due_diligence: b.due_diligence_status, ...scored.find((s) => s.id === b.id) }))
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  return { tender: t, criteria, weight_sum: weightSum, criteria_valid: Math.abs(weightSum - 100) < 0.01, bids: rows, recommended: rows[0]?.total !== null && rows[0]?.total !== undefined ? rows[0] : null };
}

export async function awardTender(db: Db, ctx: Ctx, id: string, vendorId: string, justification: string) {
  if (ctx.actorType !== 'user') throw forbidden('Only a human can award a tender');
  const ev = await evaluateTender(db, ctx, id);
  if (ev.tender.status === 'awarded') throw conflict('Tender already awarded');
  if (!ev.criteria_valid) throw unprocessable('Evaluation criteria weights must sum to 100');
  const bid = ev.bids.find((b) => b.vendor_id === vendorId);
  if (!bid) throw badRequest('Vendor did not bid');
  if (bid.total === null) throw unprocessable('Selected bid is not fully scored or is non-compliant');
  if (ev.recommended && ev.recommended.vendor_id !== vendorId && !justification?.trim()) throw unprocessable('Awarding to a non-top-ranked bid requires a justification');
  if (bid.due_diligence !== 'passed') throw unprocessable('Vendor due diligence must have passed before award');
  await db.query(`UPDATE tenders SET status='awarded', awarded_vendor_id=$2 WHERE id=$1`, [id, vendorId]);
  await audit(db, ctx, 'tender_awarded', { type: 'tenders', id, code: ev.tender.code }, { status: ev.tender.status }, { vendor_id: vendorId, score: bid.total, recommended: ev.recommended?.vendor_id === vendorId, justification });
  return { ok: true, vendor: bid.vendor, score: bid.total };
}

// ------------------------------------------------------------------ policies (FR-GOV-004)
export async function attestPolicy(db: Db, ctx: Ctx, policyId: string, statement: string) {
  if (ctx.actorType !== 'user') throw forbidden('Attestations must be made by the person themselves');
  const p = (await db.query(`SELECT * FROM policies WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [policyId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Policy');
  if (p.status !== 'published') throw unprocessable('Only published policies can be attested');
  if (!p.requires_attestation) throw unprocessable('This policy does not require attestation');
  const r = await db.query(`INSERT INTO policy_attestations (org_id, policy_id, user_id, policy_version, statement) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`, [ctx.orgId, policyId, ctx.userId, p.version_label, statement]);
  if (!r.rowCount) throw conflict('You have already attested this version');
  await audit(db, ctx, 'policy_attested', { type: 'policies', id: policyId, code: p.code }, null, { version: p.version_label });
  return r.rows[0];
}

export async function attestationStatus(db: Db, ctx: Ctx, policyId: string) {
  const p = (await db.query(`SELECT * FROM policies WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [policyId, ctx.orgId])).rows[0];
  if (!p) throw notFound('Policy');
  const users = (await db.query(`SELECT DISTINCT u.id, u.code, u.name FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
     WHERE u.org_id=$1 AND u.status='active' AND u.deleted_at IS NULL AND NOT u.is_service_account AND (cardinality($2::text[])=0 OR r.key = ANY($2::text[])) ORDER BY u.name`, [ctx.orgId, p.applies_to_roles])).rows;
  const att = (await db.query(`SELECT user_id, attested_at FROM policy_attestations WHERE policy_id=$1 AND policy_version=$2`, [policyId, p.version_label])).rows;
  const done = new Map(att.map((a) => [a.user_id, a.attested_at]));
  const rows = users.map((u) => ({ ...u, attested_at: done.get(u.id) ?? null }));
  return { policy: { id: p.id, code: p.code, name: p.name, version: p.version_label, status: p.status }, required: rows.length, attested: rows.filter((r) => r.attested_at).length, completion_pct: rows.length ? Math.round((rows.filter((r) => r.attested_at).length / rows.length) * 1000) / 10 : null, users: rows };
}

// ------------------------------------------------------------------ requirement versioning & change impact
const CONTENT_FIELDS = ['name', 'description', 'acceptance_criteria', 'priority', 'req_type', 'process_id', 'objective_id'];
/**
 * Called before an update. Editing the content of an APPROVED requirement snapshots the approved
 * version (immutable), increments the version, returns the requirement to 'reviewed' (re-approval needed)
 * and records an impact report listing linked work items and test cases.
 */
export async function versionRequirementIfApproved(db: Db, ctx: Ctx, data: Record<string, any>, before: any) {
  if (!before) return;
  const changed = CONTENT_FIELDS.filter((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify(before[k]));
  if (!changed.length) return;
  const impact = [
    ...(await db.query(`SELECT 'work_item' AS kind, id, code, name, status FROM work_items WHERE requirement_id=$1 AND deleted_at IS NULL`, [before.id])).rows,
    ...(await db.query(`SELECT 'test_case' AS kind, id, code, name, status FROM test_cases WHERE requirement_id=$1 AND deleted_at IS NULL`, [before.id])).rows,
  ];
  const snapshot = Object.fromEntries(['code', ...CONTENT_FIELDS, 'status', 'version'].map((k) => [k, before[k]]));
  await db.query(`INSERT INTO requirement_versions (org_id, requirement_id, version, snapshot, impact, change_note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ctx.orgId, before.id, before.version, JSON.stringify(snapshot), JSON.stringify(impact), `Changed: ${changed.join(', ')}`, ctx.userId]);
  data.version = before.version + 1;
  if (before.status === 'approved' || before.status === 'implemented' || before.status === 'verified') {
    data.status = 'reviewed';
    if (impact.length) {
      const owners = (await db.query(`SELECT DISTINCT COALESCE(assignee_id, owner_id) AS u FROM work_items WHERE requirement_id=$1 UNION SELECT owner_id FROM test_cases WHERE requirement_id=$1`, [before.id])).rows.map((r) => r.u);
      await notify(db, ctx.orgId, owners, { kind: 'change_impact', title: `Approved requirement ${before.code} changed – ${impact.length} linked item(s) affected`, link: `/r/requirements?open=${before.id}` });
    }
  }
}

// ------------------------------------------------------------------ recurring work (FR-WRK-003)
export function nextOccurrence(rule: string, from: string): string | null {
  const m = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;INTERVAL=(\d+))?/i.exec(rule);
  if (!m) return null;
  const n = Number(m[2] ?? 1);
  const d = new Date(from + 'T00:00:00Z');
  if (m[1].toUpperCase() === 'DAILY') d.setUTCDate(d.getUTCDate() + n);
  if (m[1].toUpperCase() === 'WEEKLY') d.setUTCDate(d.getUTCDate() + 7 * n);
  if (m[1].toUpperCase() === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + n);
  if (m[1].toUpperCase() === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export async function spawnRecurrence(db: Db, ctx: Ctx, row: any) {
  if (!row.recurrence_rule || row.status !== 'done') return null;
  const exists = (await db.query(`SELECT 1 FROM work_items WHERE recurrence_parent_id=$1 AND deleted_at IS NULL`, [row.id])).rowCount;
  if (exists) return null;
  const due = nextOccurrence(row.recurrence_rule, row.due_date ?? new Date().toISOString().slice(0, 10));
  if (!due) return null;
  const code = await nextCode(db, ctx.orgId, 'WI');
  const r = (await db.query(`INSERT INTO work_items (org_id, code, name, description, work_type, context_type, context_id, team_id, assignee_id, priority, due_date, estimate_hours, recurrence_rule, recurrence_parent_id, owner_id, classification, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17) RETURNING id, code`,
  [ctx.orgId, code, row.name, row.description, row.work_type, row.context_type, row.context_id, row.team_id, row.assignee_id, row.priority, due, row.estimate_hours, row.recurrence_rule, row.id, row.owner_id, row.classification, ctx.userId])).rows[0];
  await audit(db, ctx, 'recurrence_generated', { type: 'work_items', id: r.id, code: r.code }, null, { from: row.code, due_date: due });
  return r;
}
