/** Routes for capabilities added in migrations 002/003. Registered inside the authenticated scope. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool, tx } from '../db.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { badRequest, notFound, forbidden } from '../core/errors.js';
import { audit } from '../core/audit.js';
import { getRow, listRows, requirePerm } from '../resources/crud.js';
import { getResource } from '../resources/registry.js';
import { attestationStatus, attestPolicy, awardTender, bpmnExport, bpmnImport, evaluateScenario, evaluateTender, exportStale, exportTraceability, skillMatch, skillsGap, toCsv, traceabilityMatrix } from '../domain/extended.js';
import { listFiles, readFileForDownload, storeFile } from '../domain/files.js';
import { acceptIntake, answerIntake, createIntake, generateIntake, getIntake } from '../ai/intake.js';
import { requestApproval } from '../domain/workflow.js';

const uuid = z.string().uuid();
const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v);
  if (!r.success) throw badRequest('Validation failed', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  return r.data;
};
const CTX_TABLE: Record<string, string> = { project: 'projects', product: 'products', programme: 'programmes', portfolio: 'portfolios', service: 'services' };

export function registerExtendedRoutes(r: FastifyInstance) {
  const C = (req: FastifyRequest): Ctx => req.ctx;

  // ---- scenarios
  r.get('/api/scenarios/:id/evaluate', async (req) => { const c = C(req); await getRow(c, 'investment_scenarios', (req.params as any).id); return evaluateScenario(pool, c, (req.params as any).id); });

  // ---- traceability matrix + snapshot exports
  r.get('/api/traceability/:type/:id', async (req) => {
    const c = C(req); const { type, id } = req.params as any;
    if (!CTX_TABLE[type]) throw badRequest('Unsupported context'); requirePerm(c, 'requirements:read'); await getRow(c, CTX_TABLE[type], id);
    return traceabilityMatrix(pool, c, type, id);
  });
  r.get('/api/traceability/:type/:id/export.csv', async (req, reply) => {
    const c = C(req); const { type, id } = req.params as any;
    if (!CTX_TABLE[type]) throw badRequest('Unsupported context'); requirePerm(c, 'requirements:read'); const ctxRow = await getRow(c, CTX_TABLE[type], id);
    const { csv, snapshot } = await tx((db) => exportTraceability(db, c, type, id));
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="RTM-${ctxRow.code}.csv"`).header('x-export-id', snapshot.id).header('x-export-sha256', snapshot.checksum);
    return csv;
  });
  r.get('/api/exports/:id/stale', async (req) => exportStale(pool, C(req), (req.params as any).id));

  // ---- generic CSV export of any list (respects permissions, ABAC and filters)
  r.get('/api/r/:key/export.csv', async (req, reply) => {
    const c = C(req); const key = (req.params as any).key; const def = getResource(key); if (!def) throw notFound('Resource');
    const q = { ...(req.query as any), pageSize: '500' };
    const rows: any[] = []; let page = 1;
    for (;;) { const res = await listRows(c, key, { ...q, page: String(page) }); rows.push(...res.data); if (rows.length >= res.total || page >= 40) break; page++; }
    const cols = ['code', ...def.fields.map((f) => f.n), ...(def.contexts ? ['context_type', 'context_code'] : []), 'status', 'created_at', 'updated_at'];
    const csv = toCsv(cols, rows.map((row) => cols.map((col) => col === 'context_code' ? row._context?.code ?? '' : def.fields.find((f) => f.n === col)?.t === 'ref' ? row._refs?.[col]?.code ?? row[col] ?? '' : Array.isArray(row[col]) ? row[col].join(' ') : row[col])));
    await audit(pool, c, 'export', { type: key }, null, { rows: rows.length, filters: req.query });
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${key}.csv"`);
    return csv;
  });

  // ---- saved views (shared or personal)
  r.get('/api/views', async (req) => { const c = C(req); const q = req.query as any; return (await pool.query(`SELECT v.*, u.name AS owner_name FROM saved_views v JOIN users u ON u.id=v.user_id WHERE v.org_id=$1 AND v.resource=$2 AND (v.user_id=$3 OR v.shared) ORDER BY v.name`, [c.orgId, q.resource ?? '', c.userId])).rows; });
  r.post('/api/views', async (req, reply) => {
    const c = C(req);
    const b = parse(z.object({ resource: z.string(), name: z.string().min(1).max(80), filters: z.record(z.string(), z.string().max(500)), shared: z.boolean().default(false) }), req.body);
    if (!getResource(b.resource)) throw badRequest('Unknown resource'); requirePerm(c, `${b.resource}:read`);
    reply.status(201);
    return (await pool.query(`INSERT INTO saved_views (org_id, user_id, resource, name, filters, shared) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, resource, name) DO UPDATE SET filters=EXCLUDED.filters, shared=EXCLUDED.shared RETURNING *`, [c.orgId, c.userId, b.resource, b.name, JSON.stringify(b.filters), b.shared])).rows[0];
  });
  r.delete('/api/views/:id', async (req) => { const c = C(req); const d = await pool.query(`DELETE FROM saved_views WHERE id=$1 AND user_id=$2`, [(req.params as any).id, c.userId]); if (!d.rowCount) throw notFound('View'); return { ok: true }; });

  // ---- BPMN 2.0
  r.get('/api/processes/:id/bpmn', async (req, reply) => {
    const c = C(req); await getRow(c, 'business_processes', (req.params as any).id);
    const { filename, xml } = await bpmnExport(pool, c, (req.params as any).id);
    reply.header('content-type', 'application/xml').header('content-disposition', `attachment; filename="${filename}"`); return xml;
  });
  r.post('/api/processes/:id/bpmn', async (req) => {
    const c = C(req); requirePerm(c, 'process_steps:write'); requirePerm(c, 'business_processes:write'); await getRow(c, 'business_processes', (req.params as any).id);
    const b = parse(z.object({ xml: z.string().min(20) }), req.body);
    return tx((db) => bpmnImport(db, c, (req.params as any).id, b.xml));
  });

  // ---- skills
  r.get('/api/skills/requirements/:id/match', async (req) => { const c = C(req); requirePerm(c, 'skill_requirements:read'); return skillMatch(pool, c, (req.params as any).id); });
  r.get('/api/skills/gap', async (req) => { const c = C(req); requirePerm(c, 'skill_requirements:read'); return skillsGap(pool, c); });
  r.put('/api/users/:id/skills', async (req) => {
    const c = C(req); requirePerm(c, 'skills:write');
    const b = parse(z.object({ skills: z.array(z.object({ skill_id: uuid, proficiency: z.number().int().min(1).max(5) })).max(100) }), req.body);
    const uid = (req.params as any).id; await getRow(c, 'users', uid);
    return tx(async (db) => {
      await db.query(`DELETE FROM user_skills WHERE user_id=$1`, [uid]);
      for (const s of b.skills) { await getRow(c, 'skills', s.skill_id, db); await db.query(`INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1,$2,$3)`, [uid, s.skill_id, s.proficiency]); }
      await audit(db, c, 'user_skills_changed', { type: 'users', id: uid }, null, b.skills);
      return { ok: true };
    });
  });
  r.get('/api/users/:id/skills', async (req) => { const c = C(req); await getRow(c, 'users', (req.params as any).id); return (await pool.query(`SELECT s.id AS skill_id, s.name, s.category, us.proficiency FROM user_skills us JOIN skills s ON s.id=us.skill_id WHERE us.user_id=$1 ORDER BY s.name`, [(req.params as any).id])).rows; });

  // ---- tenders
  r.put('/api/tenders/:id/criteria', async (req) => {
    const c = C(req); requirePerm(c, 'tenders:write');
    const b = parse(z.object({ criteria: z.array(z.object({ key: z.string().regex(/^[a-z_]+$/), name: z.string().min(1), weight: z.number().min(0).max(100) })).min(1).max(20) }), req.body);
    if (Math.abs(b.criteria.reduce((a, x) => a + x.weight, 0) - 100) > 0.01) throw badRequest('Criteria weights must sum to 100');
    const t = await getRow(c, 'tenders', (req.params as any).id);
    if (t.status === 'awarded') throw badRequest('Criteria cannot change after award');
    await tx(async (db) => { await db.query(`UPDATE tenders SET criteria=$2 WHERE id=$1`, [t.id, JSON.stringify(b.criteria)]); await audit(db, c, 'tender_criteria_set', { type: 'tenders', id: t.id, code: t.code }, { criteria: t.criteria }, { criteria: b.criteria }); });
    return evaluateTender(pool, c, t.id);
  });
  r.put('/api/tender-bids/:id/scores', async (req) => {
    const c = C(req); requirePerm(c, 'tender_bids:write');
    const b = parse(z.object({ scores: z.record(z.string(), z.number().min(0).max(10)) }), req.body);
    const bid = await getRow(c, 'tender_bids', (req.params as any).id);
    const conflictDecl = (await pool.query(`SELECT 1 FROM coi_declarations WHERE tender_id=$1 AND user_id=$2 AND has_conflict`, [bid.tender_id, c.userId])).rowCount;
    if (conflictDecl) throw forbidden('You declared a conflict of interest for this tender and cannot score bids');
    await tx(async (db) => { await db.query(`UPDATE tender_bids SET scores=$2 WHERE id=$1`, [bid.id, JSON.stringify(b.scores)]); await audit(db, c, 'bid_scored', { type: 'tender_bids', id: bid.id, code: bid.code }, { scores: bid.scores }, { scores: b.scores }); });
    return evaluateTender(pool, c, bid.tender_id);
  });
  r.get('/api/tenders/:id/evaluate', async (req) => { const c = C(req); await getRow(c, 'tenders', (req.params as any).id); return evaluateTender(pool, c, (req.params as any).id); });
  r.post('/api/tenders/:id/award', async (req) => {
    const c = C(req); requirePerm(c, 'tenders:write');
    const b = parse(z.object({ vendor_id: uuid, justification: z.string().max(2000).default('') }), req.body);
    await getRow(c, 'tenders', (req.params as any).id);
    return tx((db) => awardTender(db, c, (req.params as any).id, b.vendor_id, b.justification));
  });

  // ---- policies
  r.post('/api/policies/:id/attest', async (req) => {
    const c = C(req); await getRow(c, 'policies', (req.params as any).id);
    const b = parse(z.object({ statement: z.string().min(5).max(500).default('I have read, understood and will comply with this policy.') }), req.body ?? {});
    return tx((db) => attestPolicy(db, c, (req.params as any).id, b.statement));
  });
  r.get('/api/policies/:id/attestations', async (req) => { const c = C(req); requirePerm(c, 'policies:read'); return attestationStatus(pool, c, (req.params as any).id); });
  r.get('/api/policies/mine', async (req) => {
    const c = C(req);
    return (await pool.query(`SELECT p.id, p.code, p.name, p.version_label, p.effective_date, pa.attested_at FROM policies p LEFT JOIN policy_attestations pa ON pa.policy_id=p.id AND pa.user_id=$2 AND pa.policy_version=p.version_label
      WHERE p.org_id=$1 AND p.status='published' AND p.requires_attestation AND p.deleted_at IS NULL AND (cardinality(p.applies_to_roles)=0 OR p.applies_to_roles && $3::text[]) ORDER BY p.code`, [c.orgId, c.userId, c.roles])).rows;
  });
  r.put('/api/policies/:id/scope', async (req) => {
    const c = C(req); requirePerm(c, 'policies:write');
    const b = parse(z.object({ applies_to_roles: z.array(z.string()).max(30) }), req.body);
    const p = await getRow(c, 'policies', (req.params as any).id);
    await tx(async (db) => { await db.query(`UPDATE policies SET applies_to_roles=$2 WHERE id=$1`, [p.id, b.applies_to_roles]); await audit(db, c, 'policy_scope_set', { type: 'policies', id: p.id, code: p.code }, { roles: p.applies_to_roles }, { roles: b.applies_to_roles }); });
    return { ok: true };
  });

  // ---- requirement versions & approval
  r.get('/api/requirements/:id/versions', async (req) => {
    const c = C(req); const rq = await getRow(c, 'requirements', (req.params as any).id);
    return (await pool.query(`SELECT v.*, u.name AS created_by_name FROM requirement_versions v LEFT JOIN users u ON u.id=v.created_by WHERE requirement_id=$1 ORDER BY version DESC`, [rq.id])).rows;
  });
  r.post('/api/requirements/:id/submit', async (req) => {
    const c = C(req); requirePerm(c, 'requirements:write');
    const rq = await getRow(c, 'requirements', (req.params as any).id);
    if (!rq.acceptance_criteria?.trim()) throw badRequest('Acceptance criteria are required before approval');
    return tx(async (db) => {
      if ((await db.query(`SELECT 1 FROM approvals WHERE entity_type='requirements' AND entity_id=$1 AND status='pending'`, [rq.id])).rowCount) throw badRequest('Approval already pending');
      const role = rq.context_type === 'product' ? 'product_manager' : 'project_manager';
      const prev = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE entity_type='requirements' AND entity_id=$1`, [rq.id])).rows[0].r;
      await db.query(`UPDATE requirements SET status='reviewed' WHERE id=$1`, [rq.id]);
      return requestApproval(db, c, { entity_type: 'requirements', entity_id: rq.id, entity_code: `${rq.code} v${rq.version}`, approval_type: 'requirement', roles: [role], round: prev + 1 });
    });
  });

  // ---- files / evidence
  r.post('/api/files', async (req, reply) => {
    const c = C(req);
    const parts = req.parts({ limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1, fields: 5 } });
    const fields: Record<string, string> = {}; let file: { filename: string; buffer: Buffer } | null = null;
    for await (const p of parts) {
      if (p.type === 'file') { const buffer = await p.toBuffer(); if ((p.file as any).truncated) throw badRequest('File exceeds 10 MB limit'); file = { filename: p.filename, buffer }; }
      else fields[p.fieldname] = String(p.value);
    }
    if (!file) throw badRequest('No file supplied');
    const b = parse(z.object({ entity_type: z.string(), entity_id: uuid }), fields);
    if (!getResource(b.entity_type)) throw badRequest('Unknown entity type');
    reply.status(201);
    return tx((db) => storeFile(db, c, { entityType: b.entity_type, entityId: b.entity_id, filename: file!.filename, buffer: file!.buffer }));
  });
  r.get('/api/files', async (req) => { const q = parse(z.object({ entity_type: z.string(), entity_id: uuid }), req.query); return listFiles(pool, C(req), q.entity_type, q.entity_id); });
  r.get('/api/files/:id/download', async (req, reply) => {
    const { file, buffer } = await readFileForDownload(pool, C(req), (req.params as any).id);
    reply.header('content-type', file.mime_type).header('content-disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"`).header('x-content-type-options', 'nosniff');
    return buffer;
  });

  // ---- AI intake workspace
  r.post('/api/ai/intakes', async (req, reply) => {
    const c = C(req);
    const b = parse(z.object({ name: z.string().min(3).max(200), context_type: z.enum(['project', 'product']), context_id: uuid, source_text: z.string().min(20).max(100000) }), req.body);
    await getRow(c, CTX_TABLE[b.context_type], b.context_id);
    reply.status(201);
    return tx((db) => createIntake(db, c, b));
  });
  r.get('/api/ai/intakes/:id', async (req) => getIntake(pool, C(req), (req.params as any).id));
  r.post('/api/ai/intakes/:id/answers', async (req) => {
    const b = parse(z.object({ answers: z.array(z.object({ key: z.string(), answer: z.string().max(4000).nullable().optional(), skip: z.boolean().optional() })).max(20) }), req.body);
    return tx((db) => answerIntake(db, C(req), (req.params as any).id, b.answers));
  });
  r.post('/api/ai/intakes/:id/generate', async (req) => tx((db) => generateIntake(db, C(req), (req.params as any).id)));
  r.post('/api/ai/intakes/:id/accept', async (req) => {
    const b = parse(z.object({ requirements: z.array(z.string()).optional(), work_items: z.array(z.string()).optional(), risks: z.array(z.string()).optional(), assumptions: z.array(z.string()).optional() }), req.body ?? {});
    return tx((db) => acceptIntake(db, C(req), (req.params as any).id, b));
  });

  void can;
}
