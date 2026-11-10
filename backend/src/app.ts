import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { pool, tx } from './db.js';
import { authenticate, hashPassword, login, SESSION_COOKIE, validatePasswordPolicy } from './auth/auth.js';
import { AppError, badRequest, conflict, forbidden, notFound, unprocessable } from './core/errors.js';
import { can, type Ctx } from './core/context.js';
import { audit, auditHash } from './core/audit.js';
import { notify, usersWithRole } from './core/notify.js';
import { createRow, deleteRow, getRow, listRows, publicMeta, requirePerm, updateRow } from './resources/crud.js';
import { getResource, RESOURCES } from './resources/registry.js';
import { advanceWorkflow, cancelWorkflow, decideApproval, delegateApproval, requestApproval, resolveApproverRole, startWorkflow, workflowState } from './domain/workflow.js';
import { biaAnalysis, traceability, upsertImpacts, recomputeBia } from './domain/bia.js';
import { evaluateBusinessCase, financeSummary, projectEvm } from './domain/finance.js';
import { capacity } from './domain/resources.js';
import { deployRelease, releaseReadiness, submitToCab } from './domain/release.js';
import { executiveDashboard, projectHealth, thresholds } from './domain/dashboard.js';
import { DOC_GENERATORS, generateDocument } from './domain/documents.js';
import { globalSearch } from './domain/search.js';
import { biaScreening } from './domain/calc.js';
import { analyse, ask } from './ai/assistant.js';
import { providerStatus } from './ai/providers.js';
import { CONNECTORS, enqueue, inbound, processQueue, retryDeadLetter } from './integrations/framework.js';
import { runDailyChecks } from './jobs.js';
import { buildOpenApi } from './openapi.js';
import multipart from '@fastify/multipart';
import { registerExtendedRoutes } from './routes/extended.js';
import { registerFrsRoutes } from './routes/frs.js';
import { completeLogin, oidcConfig, startLogin } from './auth/oidc.js';

const uuid = z.string().uuid();
const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v);
  if (!r.success) throw badRequest('Validation failed', r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  return r.data;
};

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] }, bodyLimit: 2 * 1024 * 1024, trustProxy: true });

  await app.register(helmet, { contentSecurityPolicy: false });
  if (config.corsOrigin) await app.register(cors, { origin: config.corsOrigin.split(','), credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: `${config.sessionHours}h` } });
  await app.register(rateLimit, { global: true, max: Number(process.env.API_RATE_LIMIT ?? 600), timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1 } });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    if (err.statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests' });
    if (err.validation) return reply.status(400).send({ error: 'validation_error', message: err.message });
    if (err.code === '23505') return reply.status(409).send({ error: 'conflict', message: 'A record with these unique values already exists' });
    if (err.code === '23503') return reply.status(400).send({ error: 'validation_error', message: 'Referenced record does not exist or is still in use' });
    if (err.code === '23514') return reply.status(400).send({ error: 'validation_error', message: 'A data constraint was violated', details: err.constraint });
    if (err.code === '22P02') return reply.status(400).send({ error: 'validation_error', message: 'Invalid identifier or value format' });
    req.log.error(err);
    return reply.status(500).send({ error: 'internal_error', message: 'An unexpected error occurred' });
  });

  // ------------------------------------------------------------------ public
  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', time: new Date().toISOString() };
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: Number(process.env.LOGIN_RATE_LIMIT ?? 10), timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), req.body);
    const u = await login(b.email, b.password, req.ip);
    const token = app.jwt.sign({ sub: u.id });
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', maxAge: config.sessionHours * 3600 });
    return { token, user: { id: u.id, name: u.name, email: u.email } };
  });
  // ---- OIDC single sign-on (enabled only when OIDC_* environment variables are set)
  app.get('/api/auth/sso', async () => { const c = oidcConfig(); return { enabled: !!c, issuer: c?.issuer ?? null }; });
  app.get('/api/auth/sso/start', async (req, reply) => reply.redirect(await startLogin(String((req.query as any).return_to ?? '/'))));
  app.get('/api/auth/sso/callback', async (req, reply) => {
    const q = req.query as any;
    if (q.error) return reply.redirect(`/?sso_error=${encodeURIComponent(String(q.error))}`);
    const { user, returnTo } = await completeLogin(String(q.code ?? ''), String(q.state ?? ''), req.ip);
    reply.setCookie(SESSION_COOKIE, app.jwt.sign({ sub: user.id }), { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/', maxAge: config.sessionHours * 3600 });
    return reply.redirect(returnTo);
  });
  app.post('/api/auth/logout', async (_req, reply) => { reply.clearCookie(SESSION_COOKIE, { path: '/' }); return { ok: true }; });

  // signed inbound webhooks (integration framework)
  app.register(async (hooks) => {
    hooks.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, body, done) => done(null, body));
    hooks.post('/api/hooks/:orgCode/:key', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
      const { orgCode, key } = req.params as any;
      const org = (await pool.query(`SELECT id FROM organisations WHERE code=$1`, [orgCode])).rows[0];
      if (!org) throw notFound('Organisation');
      const svc = (await pool.query(`SELECT id FROM users WHERE org_id=$1 AND is_service_account ORDER BY created_at LIMIT 1`, [org.id])).rows[0];
      if (!svc) throw forbidden('No integration service account configured');
      return tx((db) => inbound(db, org.id, key, String(req.body ?? ''), req.headers['x-signature'] as string | undefined, svc.id));
    });
  });

  // ------------------------------------------------------------------ authenticated
  app.register(async (r) => {
    r.addHook('preHandler', authenticate);
    const C = (req: FastifyRequest): Ctx => req.ctx;

    r.get('/api/auth/me', async (req) => {
      const c = C(req);
      const org = (await pool.query(`SELECT id, code, name, base_currency, is_synthetic FROM organisations WHERE id=$1`, [c.orgId])).rows[0];
      return { id: c.userId, name: c.name, email: c.email, roles: c.roles, permissions: [...c.perms], organisation: org };
    });
    r.post('/api/auth/password', async (req) => {
      const b = parse(z.object({ current_password: z.string(), new_password: z.string() }), req.body);
      const policy = validatePasswordPolicy(b.new_password); if (policy) throw badRequest(policy);
      const c = C(req);
      await login(c.email, b.current_password, req.ip);
      await pool.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [c.userId, await hashPassword(b.new_password)]);
      await audit(pool, c, 'password_changed', { type: 'users', id: c.userId });
      return { ok: true };
    });

    // ---------------- metadata
    r.get('/api/meta/resources', async (req) => publicMeta(C(req)));
    r.get('/api/meta/doc-generators', async () => DOC_GENERATORS);
    r.get('/api/meta/metrics', async (req) => (await pool.query(`SELECT * FROM metric_definitions WHERE org_id=$1 ORDER BY key`, [C(req).orgId])).rows);
    r.get('/api/meta/users', async (req) => (await pool.query(`SELECT id, code, name, title, email FROM users WHERE org_id=$1 AND deleted_at IS NULL AND status='active' AND NOT is_service_account ORDER BY name`, [C(req).orgId])).rows);
    r.get('/api/openapi.json', async () => buildOpenApi());

    // ---------------- generic resources
    r.get('/api/r/:key', async (req) => listRows(C(req), (req.params as any).key, req.query as any));
    r.get('/api/r/:key/:id', async (req) => getRow(C(req), (req.params as any).key, (req.params as any).id));
    r.post('/api/r/:key', async (req, reply) => { reply.status(201); return createRow(C(req), (req.params as any).key, req.body); });
    r.patch('/api/r/:key/:id', async (req) => updateRow(C(req), (req.params as any).key, (req.params as any).id, req.body));
    r.delete('/api/r/:key/:id', async (req) => deleteRow(C(req), (req.params as any).key, (req.params as any).id));

    // ---------------- projects & products
    r.get('/api/projects/:id/summary', async (req) => {
      const c = C(req); const id = (req.params as any).id;
      const project = await getRow(c, 'projects', id);
      const health = await projectHealth(pool, c, project, await thresholds(pool, c.orgId));
      const products = (await pool.query(`SELECT pr.id, pr.code, pr.name, pr.lifecycle_stage, pr.status, pp.relationship FROM project_products pp JOIN products pr ON pr.id=pp.product_id WHERE pp.project_id=$1 AND pr.deleted_at IS NULL`, [id])).rows;
      const counts = (await pool.query(`SELECT (SELECT count(*)::int FROM risks WHERE context_type='project' AND context_id=$1 AND status<>'closed' AND deleted_at IS NULL) risks,
        (SELECT count(*)::int FROM issues WHERE context_type='project' AND context_id=$1 AND status IN ('open','in_progress') AND deleted_at IS NULL) issues,
        (SELECT count(*)::int FROM change_requests WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL AND status NOT IN ('approved','rejected','implemented','withdrawn')) open_changes,
        (SELECT count(*)::int FROM work_items WHERE context_type='project' AND context_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled')) open_work,
        (SELECT count(*)::int FROM bia_assessments WHERE project_id=$1 AND deleted_at IS NULL) bias`, [id])).rows[0];
      const wf = (await pool.query(`SELECT id FROM workflow_instances WHERE entity_type='projects' AND entity_id=$1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];
      return { project, health, products, counts, workflow_instance_id: wf?.id ?? null };
    });
    r.post('/api/projects/:id/products', async (req) => {
      const c = C(req); requirePerm(c, 'projects:write');
      const b = parse(z.object({ product_id: uuid, relationship: z.enum(['delivers', 'enhances', 'retires', 'supports']).default('delivers') }), req.body);
      const p = await getRow(c, 'projects', (req.params as any).id); const pr = await getRow(c, 'products', b.product_id);
      await tx(async (db) => {
        await db.query(`INSERT INTO project_products (project_id, product_id, relationship) VALUES ($1,$2,$3) ON CONFLICT (project_id, product_id) DO UPDATE SET relationship=EXCLUDED.relationship`, [p.id, pr.id, b.relationship]);
        await audit(db, c, 'link', { type: 'projects', id: p.id, code: p.code }, null, { product: pr.code, relationship: b.relationship });
      });
      return { ok: true };
    });
    r.delete('/api/projects/:id/products/:productId', async (req) => {
      const c = C(req); requirePerm(c, 'projects:write');
      const { id, productId } = req.params as any;
      const p = await getRow(c, 'projects', id);
      await tx(async (db) => {
        const d = await db.query(`DELETE FROM project_products WHERE project_id=$1 AND product_id=$2`, [id, productId]);
        if (!d.rowCount) throw notFound('Link');
        await audit(db, c, 'unlink', { type: 'projects', id, code: p.code }, { product_id: productId }, null);
      });
      return { ok: true };
    });
    r.post('/api/projects/:id/bia-screening', async (req) => {
      const c = C(req); requirePerm(c, 'projects:write');
      const b = parse(z.object({ affects_critical_service: z.boolean(), changes_business_process: z.boolean(), handles_personal_data: z.boolean(), customer_facing: z.boolean(), regulatory: z.boolean(), third_party_dependency: z.boolean() }), req.body);
      const p = await getRow(c, 'projects', (req.params as any).id);
      const s = biaScreening(b);
      return tx(async (db) => {
        await db.query(`UPDATE projects SET bia_required=$2 WHERE id=$1`, [p.id, s.level !== 'none']);
        let bia = null;
        if (s.level !== 'none') {
          const existing = (await db.query(`SELECT id FROM bia_assessments WHERE project_id=$1 AND deleted_at IS NULL LIMIT 1`, [p.id])).rows[0];
          const prod = (await db.query(`SELECT product_id FROM project_products WHERE project_id=$1 LIMIT 1`, [p.id])).rows[0];
          // The screening outcome itself authorises creation of the draft BIA (owned by the BC function to complete).
          const screeningCtx = { ...c, perms: new Set([...c.perms, 'bia_assessments:write']) };
          if (!existing && prod) bia = await createRow(screeningCtx, 'bia_assessments', { name: `BIA for ${p.name}`, product_id: prod.product_id, project_id: p.id, assessment_level: s.level }, { db });
          if (bia) await notify(db, c.orgId, await usersWithRole(db, c.orgId, 'bc_manager'), { kind: 'bia_required', title: `BIA required for ${p.code}`, link: `/resilience/bia/${bia.id}` });
        }
        await audit(db, c, 'bia_screening', { type: 'projects', id: p.id, code: p.code }, null, { answers: b, ...s });
        return { ...s, bia_required: s.level !== 'none', created_bia: bia, note: s.level !== 'none' && !bia ? 'Link a product to the project (or create a BIA manually) to start the BIA.' : undefined };
      });
    });
    r.post('/api/projects/:id/close', async (req) => {
      const c = C(req); requirePerm(c, 'projects:write');
      const b = parse(z.object({ closure_summary: z.string().min(10), lessons_learned: z.string().optional(), accept_open_items_justification: z.string().optional() }), req.body);
      const p = await getRow(c, 'projects', (req.params as any).id);
      if (p.status === 'closed') throw conflict('Project is already closed');
      return tx(async (db) => {
        const open = (await db.query(`SELECT (SELECT count(*)::int FROM issues WHERE context_type='project' AND context_id=$1 AND severity IN ('high','critical') AND status IN ('open','in_progress') AND deleted_at IS NULL) issues,
            (SELECT count(*)::int FROM work_items WHERE context_type='project' AND context_id=$1 AND status NOT IN ('done','cancelled') AND deleted_at IS NULL) work`, [p.id])).rows[0];
        if ((open.issues || open.work) && !b.accept_open_items_justification)
          throw unprocessable('Project has open items. Resolve them or provide accept_open_items_justification.', open);
        await db.query(`UPDATE projects SET status='closed', lifecycle_stage='closed', actual_end=current_date, closure_summary=$2, lessons_learned=COALESCE($3, lessons_learned) WHERE id=$1`, [p.id, b.closure_summary, b.lessons_learned ?? null]);
        await db.query(`UPDATE benefits SET status='tracking' WHERE context_type='project' AND context_id=$1 AND status='planned'`, [p.id]);
        await audit(db, c, 'project_closed', { type: 'projects', id: p.id, code: p.code }, { status: p.status }, { status: 'closed', open_items: open, justification: b.accept_open_items_justification ?? null });
        // NOTE: products linked to this project are deliberately NOT modified – products outlive projects.
        return { ok: true, open_items: open };
      });
    });
    r.get('/api/projects/:id/evm', async (req) => { const c = C(req); await getRow(c, 'projects', (req.params as any).id); return projectEvm(pool, c, (req.params as any).id); });
    r.get('/api/products/:id/summary', async (req) => {
      const c = C(req); const id = (req.params as any).id;
      const product = await getRow(c, 'products', id);
      const projects = (await pool.query(`SELECT p.id, p.code, p.name, p.status, p.lifecycle_stage, p.end_date, p.percent_complete, pp.relationship FROM project_products pp JOIN projects p ON p.id=pp.project_id WHERE pp.product_id=$1 AND p.deleted_at IS NULL ORDER BY p.code`, [id])).rows;
      const releases = (await pool.query(`SELECT id, code, name, version_label, planned_date, status FROM releases WHERE product_id=$1 AND deleted_at IS NULL ORDER BY planned_date`, [id])).rows;
      const roadmap = (await pool.query(`SELECT id, code, name, lane, start_date, end_date, status, confidence FROM roadmap_items WHERE product_id=$1 AND deleted_at IS NULL ORDER BY start_date NULLS LAST`, [id])).rows;
      const ideas = (await listRows(c, 'ideas', { product_id: id, pageSize: '200' })).data;
      const services = (await pool.query(`SELECT id, code, name, criticality FROM services WHERE product_id=$1 AND deleted_at IS NULL`, [id])).rows;
      const bias = (await pool.query(`SELECT id, code, name, status, mtpd_hours, rto_hours, rpo_hours, criticality_tier FROM bia_assessments WHERE product_id=$1 AND deleted_at IS NULL`, [id])).rows;
      const ops = (await pool.query(`SELECT work_type, count(*)::int n FROM work_items WHERE context_type='product' AND context_id=$1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled') GROUP BY work_type`, [id])).rows;
      return { product, projects, releases, roadmap, ideas, services, bias, operational_work: ops };
    });

    // ---------------- workflows & approvals
    r.get('/api/workflows/definitions', async (req) => (await pool.query(`SELECT DISTINCT ON (key) * FROM workflow_definitions WHERE org_id=$1 ORDER BY key, version DESC`, [C(req).orgId])).rows);
    r.post('/api/workflows/definitions', async (req) => {
      const c = C(req); requirePerm(c, 'admin:workflows');
      const stage = z.object({ key: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), description: z.string().optional(), entry: z.array(z.string()).optional(), exit: z.array(z.string()).optional(), deliverables: z.array(z.string()).optional(), approvals: z.array(z.object({ role: z.string(), type: z.string().optional() })).optional(), sets: z.record(z.string(), z.string()).optional() });
      const b = parse(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), description: z.string().optional(), entity_type: z.string(), stages: z.array(stage).min(1) }), req.body);
      if (!getResource(b.entity_type)) throw badRequest('Unknown entity_type');
      return tx(async (db) => {
        const v = (await db.query(`SELECT COALESCE(max(version),0)::int v FROM workflow_definitions WHERE org_id=$1 AND key=$2`, [c.orgId, b.key])).rows[0].v;
        await db.query(`UPDATE workflow_definitions SET is_active=false WHERE org_id=$1 AND key=$2`, [c.orgId, b.key]);
        const row = (await db.query(`INSERT INTO workflow_definitions (org_id, key, name, description, entity_type, stages, version, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
          [c.orgId, b.key, b.name, b.description ?? null, b.entity_type, JSON.stringify(b.stages), v + 1, c.userId])).rows[0];
        await audit(db, c, 'workflow_definition_saved', { type: 'workflow_definitions', id: row.id }, null, { key: b.key, version: v + 1 });
        return row;
      });
    });
    r.post('/api/workflows/start', async (req) => {
      const c = C(req);
      const b = parse(z.object({ definition_key: z.string(), entity_type: z.string(), entity_id: uuid }), req.body);
      requirePerm(c, `${b.entity_type}:write`);
      return tx(async (db) => workflowState(db, c, (await startWorkflow(db, c, b.definition_key, b.entity_type, b.entity_id)).id));
    });
    r.get('/api/workflows/for/:type/:id', async (req) => {
      const c = C(req); const { type, id } = req.params as any;
      await getRow(c, type, id);
      const wi = (await pool.query(`SELECT id FROM workflow_instances WHERE entity_type=$1 AND entity_id=$2 AND org_id=$3 ORDER BY created_at DESC LIMIT 1`, [type, id, c.orgId])).rows[0];
      return wi ? workflowState(pool, c, wi.id) : null;
    });
    r.get('/api/workflows/instances/:id', async (req) => workflowState(pool, C(req), (req.params as any).id));
    r.post('/api/workflows/instances/:id/advance', async (req) => {
      const b = parse(z.object({ exception_justification: z.string().min(10).optional() }), req.body ?? {});
      return tx((db) => advanceWorkflow(db, C(req), (req.params as any).id, { exceptionJustification: b.exception_justification }));
    });
    r.post('/api/workflows/instances/:id/cancel', async (req) => {
      const b = parse(z.object({ reason: z.string().min(3) }), req.body);
      return tx((db) => cancelWorkflow(db, C(req), (req.params as any).id, b.reason));
    });

    r.get('/api/approvals', async (req) => {
      const c = C(req); const q = req.query as any;
      const params: unknown[] = [c.orgId]; let where = 'a.org_id=$1';
      if (q.scope === 'mine') { params.push(c.roles, c.userId); where += ` AND a.status='pending' AND ((a.approver_id IS NULL AND a.approver_role = ANY($2::text[])) OR a.approver_id=$3)`; }
      else if (!can(c, 'approvals:read')) throw forbidden();
      if (q.entity_type) { params.push(q.entity_type); where += ` AND a.entity_type=$${params.length}`; }
      if (q.entity_id) { params.push(q.entity_id); where += ` AND a.entity_id=$${params.length}`; }
      if (q.status) { params.push(q.status); where += ` AND a.status=$${params.length}`; }
      const rows = (await pool.query(`SELECT a.*, ru.name AS requested_by_name, au.name AS approver_name, du.name AS decided_by_name FROM approvals a LEFT JOIN users ru ON ru.id=a.requested_by LEFT JOIN users au ON au.id=a.approver_id LEFT JOIN users du ON du.id=a.decided_by WHERE ${where} ORDER BY a.created_at DESC LIMIT 300`, params)).rows;
      // attach entity labels
      for (const a of rows) {
        const def = getResource(a.entity_type);
        if (def) a.entity = (await pool.query(`SELECT id, code, name FROM ${def.table} WHERE id=$1`, [a.entity_id])).rows[0] ?? null;
      }
      return rows;
    });
    r.post('/api/approvals/:id/decide', async (req) => {
      const c = C(req); requirePerm(c, 'approvals:decide');
      const b = parse(z.object({ decision: z.enum(['approved', 'approved_with_conditions', 'rejected']), note: z.string().max(4000).optional(), conditions: z.string().max(4000).optional() }), req.body);
      return tx((db) => decideApproval(db, c, (req.params as any).id, b.decision, b.note, b.conditions));
    });
    r.post('/api/approvals/:id/delegate', async (req) => {
      const c = C(req); requirePerm(c, 'approvals:decide');
      const b = parse(z.object({ to_user_id: uuid, reason: z.string().min(3) }), req.body);
      return tx((db) => delegateApproval(db, c, (req.params as any).id, b.to_user_id, b.reason));
    });

    // standalone governed submissions
    const submit = (key: string, approvalType: string, amountField: string | null, extra?: (db: any, c: Ctx, row: any) => Promise<string[] | void>) =>
      async (req: FastifyRequest) => {
        const c = C(req); requirePerm(c, `${key}:write`);
        const row = await getRow(c, key, (req.params as any).id);
        return tx(async (db) => {
          const pending = (await db.query(`SELECT 1 FROM approvals WHERE entity_type=$1 AND entity_id=$2 AND status='pending'`, [key, row.id])).rowCount;
          if (pending) throw conflict('An approval is already pending for this record');
          const amount = amountField ? Number(row[amountField] ?? 0) : null;
          const roles = (await extra?.(db, c, row)) ?? [await resolveApproverRole(db, c.orgId, approvalType, amount)];
          const prev = (await db.query(`SELECT COALESCE(max(round),0)::int r FROM approvals WHERE entity_type=$1 AND entity_id=$2 AND approval_type=$3`, [key, row.id, approvalType])).rows[0].r;
          if (['budgets', 'purchase_requests', 'business_cases'].includes(key)) await db.query(`UPDATE ${getResource(key)!.table} SET status='submitted' WHERE id=$1`, [row.id]);
          if (key === 'bia_assessments') await db.query(`UPDATE bia_assessments SET status='in_review' WHERE id=$1`, [row.id]);
          if (key === 'documents') await db.query(`UPDATE documents SET status='in_review' WHERE id=$1`, [row.id]);
          if (key === 'risks') await db.query(`UPDATE risks SET acceptance_status='pending' WHERE id=$1`, [row.id]);
          return requestApproval(db, c, { entity_type: key, entity_id: row.id, entity_code: row.code, approval_type: approvalType, roles, amount, round: prev + 1 });
        });
      };
    r.post('/api/budgets/:id/submit', submit('budgets', 'financial', 'amount'));
    r.post('/api/purchase-requests/:id/submit', submit('purchase_requests', 'procurement', 'amount'));
    r.post('/api/business-cases/:id/submit', submit('business_cases', 'financial', null));
    r.post('/api/documents/:id/submit', submit('documents', 'document', null));
    r.post('/api/risks/:id/request-acceptance', submit('risks', 'risk_acceptance', null, async (db, c, row) => {
      const score = row.likelihood * row.impact;
      // higher residual exposure requires more senior acceptance (risk appetite)
      return [score >= 15 ? 'executive' : await resolveApproverRole(db, c.orgId, 'risk_acceptance', null)];
    }));
    r.post('/api/bia/:id/submit', submit('bia_assessments', 'bia', null, async (db, c, row) => {
      const a = await biaAnalysis(db, c, row.id);
      if (!a.ready_for_approval) throw unprocessable('BIA has blocking validation findings', a.findings.filter((f) => f.severity === 'error'));
      return ['bc_manager'];
    }));
    r.post('/api/change-requests/:id/submit', submit('change_requests', 'change', 'impact_cost', async (db, c, row) => {
      const pending = (await db.query(`SELECT count(*)::int n FROM impact_assessments WHERE change_request_id=$1 AND status='pending' AND deleted_at IS NULL`, [row.id])).rows[0].n;
      if (pending) throw unprocessable(`${pending} impact assessment(s) are still pending`);
      const roles = [await resolveApproverRole(db, c.orgId, 'change', row.impact_cost === null ? null : Number(row.impact_cost))];
      if (row.impact_cost && Number(row.impact_cost) > 0) roles.push('finance_controller'); // parallel approval
      return roles;
    }));
    r.get('/api/business-cases/:id/evaluate', async (req) => { const c = C(req); await getRow(c, 'business_cases', (req.params as any).id); return evaluateBusinessCase(pool, c, (req.params as any).id); });

    // ---------------- BIA
    r.get('/api/bia/traceability', async (req) => { const c = C(req); requirePerm(c, 'bia_assessments:read'); return traceability(pool, c); });
    r.get('/api/bia/:id/analysis', async (req) => { const c = C(req); await getRow(c, 'bia_assessments', (req.params as any).id); return biaAnalysis(pool, c, (req.params as any).id); });
    r.put('/api/bia/:id/impacts', async (req) => {
      const c = C(req); requirePerm(c, 'bia_assessments:write');
      const item = z.object({ category: z.enum(['financial', 'operational', 'regulatory', 'customer', 'reputational', 'environmental', 'safety', 'data', 'strategic']), horizon_hours: z.number().positive().max(8760), severity: z.number().int().min(0).max(5), financial_amount: z.number().nullable().optional(), rationale: z.string().max(2000).nullable().optional() });
      const b = parse(z.object({ impacts: z.array(item).max(200) }), req.body);
      await getRow(c, 'bia_assessments', (req.params as any).id);
      await tx((db) => upsertImpacts(db, c, (req.params as any).id, b.impacts));
      return biaAnalysis(pool, c, (req.params as any).id);
    });
    r.post('/api/bia/:id/dependencies', async (req) => {
      const c = C(req); requirePerm(c, 'bia_assessments:write');
      const b = parse(z.object({ dependency_type: z.enum(['people', 'application', 'infrastructure', 'data', 'third_party', 'facility']), name: z.string().min(1).max(300), product_id: uuid.nullable().optional(), service_id: uuid.nullable().optional(), vendor_id: uuid.nullable().optional(), recovery_capability_hours: z.number().min(0).nullable().optional(), data_loss_capability_hours: z.number().min(0).nullable().optional(), single_point_of_failure: z.boolean().optional(), notes: z.string().max(2000).nullable().optional() }), req.body);
      const bia = await getRow(c, 'bia_assessments', (req.params as any).id);
      return tx(async (db) => {
        for (const [f, t] of [['product_id', 'products'], ['service_id', 'services'], ['vendor_id', 'vendors']] as const) if ((b as any)[f] && !(await db.query(`SELECT 1 FROM ${t} WHERE id=$1 AND org_id=$2`, [(b as any)[f], c.orgId])).rowCount) throw badRequest(`${f} not found`);
        const row = (await db.query(`INSERT INTO bia_dependencies (org_id, bia_id, dependency_type, name, product_id, service_id, vendor_id, recovery_capability_hours, data_loss_capability_hours, single_point_of_failure, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [c.orgId, bia.id, b.dependency_type, b.name, b.product_id ?? null, b.service_id ?? null, b.vendor_id ?? null, b.recovery_capability_hours ?? null, b.data_loss_capability_hours ?? null, b.single_point_of_failure ?? false, b.notes ?? null])).rows[0];
        if (bia.status === 'approved') await db.query(`UPDATE bia_assessments SET status='draft' WHERE id=$1`, [bia.id]);
        await audit(db, c, 'bia_dependency_added', { type: 'bia_assessments', id: bia.id, code: bia.code }, null, row);
        return row;
      });
    });
    r.delete('/api/bia/:id/dependencies/:depId', async (req) => {
      const c = C(req); requirePerm(c, 'bia_assessments:write');
      const { id, depId } = req.params as any; const bia = await getRow(c, 'bia_assessments', id);
      return tx(async (db) => {
        const d = (await db.query(`DELETE FROM bia_dependencies WHERE id=$1 AND bia_id=$2 RETURNING *`, [depId, id])).rows[0];
        if (!d) throw notFound('Dependency');
        await audit(db, c, 'bia_dependency_removed', { type: 'bia_assessments', id, code: bia.code }, d, null);
        await recomputeBia(db, c, id);
        return { ok: true };
      });
    });

    // ---------------- finance, resources, release
    r.get('/api/finance/summary', async (req) => {
      const c = C(req); requirePerm(c, 'budgets:read'); requirePerm(c, 'cost_entries:read');
      const q = parse(z.object({ context_type: z.enum(['portfolio', 'programme', 'project', 'product']), context_id: uuid }), req.query);
      const table = { portfolio: 'portfolios', programme: 'programmes', project: 'projects', product: 'products' }[q.context_type];
      await getRow(c, table, q.context_id);
      return financeSummary(pool, c, q.context_type, q.context_id);
    });
    r.get('/api/resources/capacity', async (req) => {
      const c = C(req); requirePerm(c, 'resource_allocations:read');
      const q = req.query as any;
      return capacity(pool, c, { from: q.from, weeks: q.weeks ? Number(q.weeks) : undefined, department_id: q.department_id, team_id: q.team_id });
    });
    r.get('/api/releases/:id/readiness', async (req) => { const c = C(req); await getRow(c, 'releases', (req.params as any).id); return releaseReadiness(pool, c, (req.params as any).id); });
    r.post('/api/releases/:id/submit-cab', async (req) => { const c = C(req); requirePerm(c, 'releases:write'); await getRow(c, 'releases', (req.params as any).id); return tx((db) => submitToCab(db, c, (req.params as any).id)); });
    r.post('/api/releases/:id/deploy', async (req) => {
      const c = C(req); requirePerm(c, 'releases:deploy');
      const b = parse(z.object({ environment_id: uuid.nullable().optional() }), req.body ?? {});
      await getRow(c, 'releases', (req.params as any).id);
      return tx((db) => deployRelease(db, c, (req.params as any).id, b.environment_id ?? null));
    });

    // ---------------- dashboards, documents, search, notifications, audit
    r.get('/api/dashboard/executive', async (req) => { const c = C(req); requirePerm(c, 'dashboard:read'); return executiveDashboard(pool, c); });
    r.post('/api/documents/generate', async (req) => {
      const c = C(req); requirePerm(c, 'documents:write');
      const b = parse(z.object({ doc_type: z.string(), context_type: z.string().optional(), context_id: uuid.optional(), record_id: uuid.optional() }), req.body);
      if (b.context_type && b.context_id) { const t = { project: 'projects', product: 'products', programme: 'programmes', portfolio: 'portfolios', service: 'services' }[b.context_type]; if (!t) throw badRequest('Unsupported context_type'); await getRow(c, t, b.context_id); }
      return tx((db) => generateDocument(db, c, b));
    });
    r.get('/api/documents/:id/versions', async (req) => {
      const c = C(req); const d = await getRow(c, 'documents', (req.params as any).id);
      return (await pool.query(`SELECT v.id, v.version, v.generated, v.missing_fields, v.source_refs, v.change_note, v.created_at, u.name AS created_by_name FROM document_versions v LEFT JOIN users u ON u.id=v.created_by WHERE document_id=$1 ORDER BY version DESC`, [d.id])).rows;
    });
    r.get('/api/documents/:id/versions/:v', async (req) => {
      const c = C(req); const d = await getRow(c, 'documents', (req.params as any).id);
      const v = (await pool.query(`SELECT * FROM document_versions WHERE document_id=$1 AND version=$2`, [d.id, Number((req.params as any).v)])).rows[0];
      if (!v) throw notFound('Version'); return v;
    });
    r.post('/api/documents/:id/versions', async (req) => {
      const c = C(req); requirePerm(c, 'documents:write');
      const b = parse(z.object({ content: z.string().min(1).max(500000), change_note: z.string().max(500).optional() }), req.body);
      const d = await getRow(c, 'documents', (req.params as any).id);
      return tx(async (db) => {
        const v = d.current_version + 1;
        await db.query(`INSERT INTO document_versions (org_id, document_id, version, content, generated, created_by, change_note) VALUES ($1,$2,$3,$4,false,$5,$6)`, [c.orgId, d.id, v, b.content, c.userId, b.change_note ?? null]);
        await db.query(`UPDATE documents SET current_version=$2, status='draft' WHERE id=$1`, [d.id, v]);
        await audit(db, c, 'document_version', { type: 'documents', id: d.id, code: d.code }, { version: d.current_version }, { version: v });
        return { version: v };
      });
    });
    r.get('/api/search', async (req) => globalSearch(pool, C(req), String((req.query as any).q ?? '')));
    r.get('/api/notifications', async (req) => (await pool.query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [C(req).userId])).rows);
    r.post('/api/notifications/:id/read', async (req) => { await pool.query(`UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, [(req.params as any).id, C(req).userId]); return { ok: true }; });
    r.post('/api/notifications/read-all', async (req) => { await pool.query(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [C(req).userId]); return { ok: true }; });
    r.get('/api/audit', async (req) => {
      const c = C(req); const q = req.query as any;
      const params: unknown[] = [c.orgId]; let where = 'a.org_id=$1';
      if (q.entity_type && q.entity_id) {
        // record history is visible to anyone who can read the record
        await getRow(c, q.entity_type, q.entity_id);
        params.push(q.entity_type, q.entity_id); where += ' AND a.entity_type=$2 AND a.entity_id=$3';
      } else requirePerm(c, 'audit:read');
      if (q.action) { params.push(q.action); where += ` AND a.action=$${params.length}`; }
      if (q.actor_type) { params.push(q.actor_type); where += ` AND a.actor_type=$${params.length}`; }
      return (await pool.query(`SELECT a.id, a.actor_type, a.action, a.entity_type, a.entity_id, a.entity_code, a.before, a.after, a.meta, a.occurred_at, a.hash, u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where} ORDER BY a.id DESC LIMIT ${Math.min(500, Number(q.limit ?? 200))}`, params)).rows;
    });
    r.get('/api/audit/verify', async (req) => {
      const c = C(req); requirePerm(c, 'audit:read');
      const rows = (await pool.query(`SELECT * FROM audit_events WHERE org_id=$1 ORDER BY id`, [c.orgId])).rows;
      let prev: string | null = null; let brokenAt: number | null = null;
      for (const e of rows) {
        const payload = { org_id: e.org_id, actor_id: e.actor_id, actor_type: e.actor_type, action: e.action, entity_type: e.entity_type, entity_id: e.entity_id, entity_code: e.entity_code, before: e.before, after: e.after, meta: e.meta, occurred_at: new Date(e.occurred_at).toISOString() };
        if (e.prev_hash !== prev || auditHash(prev, payload) !== e.hash) { brokenAt = e.id; break; }
        prev = e.hash;
      }
      return { events: rows.length, intact: brokenAt === null, first_broken_event: brokenAt };
    });

    // ---------------- AI
    r.get('/api/ai/status', async () => providerStatus());
    r.post('/api/ai/ask', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
      const b = parse(z.object({ question: z.string().min(1).max(4000) }), req.body);
      return ask(pool, C(req), b.question);
    });
    r.post('/api/ai/analyse/:capability', async (req) => {
      const b = parse(z.object({ id: uuid.optional(), text: z.string().max(50000).optional() }), req.body ?? {});
      return analyse(pool, C(req), (req.params as any).capability, b);
    });
    r.get('/api/ai/interactions', async (req) => {
      const c = C(req);
      const mineOnly = !can(c, 'audit:read');
      return (await pool.query(`SELECT i.id, i.capability, i.provider, i.model, i.prompt, i.confidence, i.tokens_in, i.tokens_out, i.cost_estimate, i.injection_flags, i.external_transmission, i.created_at, u.name AS user_name FROM ai_interactions i JOIN users u ON u.id=i.user_id WHERE i.org_id=$1 ${mineOnly ? 'AND i.user_id=$2' : ''} ORDER BY i.created_at DESC LIMIT 100`, mineOnly ? [c.orgId, c.userId] : [c.orgId])).rows;
    });
    /** A HUMAN accepts an AI suggestion: creates a DRAFT record through normal permission-checked CRUD. */
    r.post('/api/ai/accept-suggestion', async (req, reply) => {
      const c = C(req); reply.status(201);
      const b = parse(z.object({ interaction_id: uuid, suggestion: z.object({ type: z.enum(['risk', 'action']), name: z.string().min(3).max(300), category: z.string().optional(), likelihood: z.number().int().min(1).max(5).optional(), impact: z.number().int().min(1).max(5).optional(), rationale: z.string().optional(), due_date: z.string().nullable().optional() }), context_type: z.string(), context_id: uuid }), req.body);
      const ia = (await pool.query(`SELECT id FROM ai_interactions WHERE id=$1 AND org_id=$2 AND user_id=$3`, [b.interaction_id, c.orgId, c.userId])).rows[0];
      if (!ia) throw notFound('AI interaction');
      const s = b.suggestion;
      if (s.type === 'risk') return createRow(c, 'risks', { name: s.name, description: `AI-suggested (interaction ${b.interaction_id}). Rationale: ${s.rationale ?? 'n/a'}`, category: s.category ?? 'delivery', likelihood: s.likelihood ?? 3, impact: s.impact ?? 3, context_type: b.context_type, context_id: b.context_id, status: 'open' });
      return createRow(c, 'work_items', { name: s.name, work_type: 'action', context_type: b.context_type, context_id: b.context_id, due_date: s.due_date ?? null, description: `Created from AI-extracted action (interaction ${b.interaction_id}).` });
    });

    // ---------------- integrations
    r.get('/api/integrations', async (req) => {
      const c = C(req); requirePerm(c, 'integrations:read');
      const rows = (await pool.query(`SELECT i.*, (SELECT count(*)::int FROM integration_events e WHERE e.integration_id=i.id AND e.status='dead_letter') dead_letters,
        (SELECT count(*)::int FROM integration_events e WHERE e.integration_id=i.id AND e.status IN ('queued','failed')) queued FROM integrations i WHERE org_id=$1 ORDER BY key`, [c.orgId])).rows;
      return { integrations: rows.map((i) => ({ ...i, connector_info: CONNECTORS[i.connector] ? { name: CONNECTORS[i.connector].name, description: CONNECTORS[i.connector].description, supportsLive: CONNECTORS[i.connector].supportsLive } : null })), connectors: Object.values(CONNECTORS).map((x) => ({ key: x.key, name: x.name, description: x.description, supportsLive: x.supportsLive })) };
    });
    r.get('/api/integrations/:id/events', async (req) => { const c = C(req); requirePerm(c, 'integrations:read'); return (await pool.query(`SELECT * FROM integration_events WHERE integration_id=$1 AND org_id=$2 ORDER BY created_at DESC LIMIT 100`, [(req.params as any).id, c.orgId])).rows; });
    r.post('/api/integrations/:key/test', async (req) => {
      const c = C(req); requirePerm(c, 'integrations:write');
      const b = parse(z.object({ simulate_failure: z.boolean().optional() }), req.body ?? {});
      return tx(async (db) => {
        const e = await enqueue(db, c, (req.params as any).key, 'test.ping', { message: 'Connectivity test', at: new Date().toISOString(), simulate_failure: b.simulate_failure ?? false });
        const res = await processQueue(db);
        await audit(db, c, 'integration_test', { type: 'integrations' }, null, { key: (req.params as any).key, result: res });
        return { enqueued: e, result: res };
      });
    });
    r.post('/api/integrations/events/:id/retry', async (req) => { const c = C(req); requirePerm(c, 'integrations:write'); return tx((db) => retryDeadLetter(db, c, (req.params as any).id)); });

    registerExtendedRoutes(r);
    registerFrsRoutes(r);

    // ---------------- administration
    r.get('/api/admin/roles', async (req) => { const c = C(req); requirePerm(c, 'admin:users'); return (await pool.query(`SELECT r.*, (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id=r.id) members FROM roles r WHERE org_id=$1 ORDER BY name`, [c.orgId])).rows; });
    r.patch('/api/admin/roles/:id', async (req) => {
      const c = C(req); requirePerm(c, 'admin:roles');
      const b = parse(z.object({ permissions: z.array(z.string().regex(/^[a-z_*]+:[a-z_*]+$|^\*$/)).max(500) }), req.body);
      return tx(async (db) => {
        const before = (await db.query(`SELECT * FROM roles WHERE id=$1 AND org_id=$2 FOR UPDATE`, [(req.params as any).id, c.orgId])).rows[0];
        if (!before) throw notFound('Role');
        const row = (await db.query(`UPDATE roles SET permissions=$2 WHERE id=$1 RETURNING *`, [before.id, b.permissions])).rows[0];
        await audit(db, c, 'role_permissions_changed', { type: 'roles', id: before.id, code: before.key }, { permissions: before.permissions }, { permissions: b.permissions });
        return row;
      });
    });
    r.get('/api/admin/users/:id/roles', async (req) => { const c = C(req); requirePerm(c, 'admin:users'); return (await pool.query(`SELECT r.id, r.key, r.name, ur.scope_type, ur.scope_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE ur.user_id=$1 AND u.org_id=$2`, [(req.params as any).id, c.orgId])).rows; });
    r.put('/api/admin/users/:id/roles', async (req) => {
      const c = C(req); requirePerm(c, 'admin:users');
      const b = parse(z.object({ role_keys: z.array(z.string()).max(30) }), req.body);
      const uid = (req.params as any).id;
      if (uid === c.userId && !b.role_keys.includes('admin') && c.roles.includes('admin')) throw unprocessable('You cannot remove your own administrator role');
      return tx(async (db) => {
        const u = (await db.query(`SELECT id, code FROM users WHERE id=$1 AND org_id=$2`, [uid, c.orgId])).rows[0]; if (!u) throw notFound('User');
        const before = (await db.query(`SELECT r.key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1`, [uid])).rows.map((x) => x.key);
        const roles = (await db.query(`SELECT id, key FROM roles WHERE org_id=$1 AND key = ANY($2::text[])`, [c.orgId, b.role_keys])).rows;
        if (roles.length !== new Set(b.role_keys).size) throw badRequest('Unknown role key');
        await db.query(`DELETE FROM user_roles WHERE user_id=$1 AND scope_type='global'`, [uid]);
        for (const ro of roles) await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [uid, ro.id]);
        await audit(db, c, 'user_roles_changed', { type: 'users', id: uid, code: u.code }, { roles: before }, { roles: b.role_keys });
        return { ok: true };
      });
    });
    r.post('/api/admin/users/:id/password', async (req) => {
      const c = C(req); requirePerm(c, 'admin:users');
      const b = parse(z.object({ password: z.string() }), req.body);
      const policy = validatePasswordPolicy(b.password); if (policy) throw badRequest(policy);
      const uid = (req.params as any).id;
      const u = (await pool.query(`UPDATE users SET password_hash=$3, failed_logins=0, locked_until=NULL WHERE id=$1 AND org_id=$2 RETURNING id, code`, [uid, c.orgId, await hashPassword(b.password)])).rows[0];
      if (!u) throw notFound('User');
      await audit(pool, c, 'password_reset', { type: 'users', id: uid, code: u.code });
      return { ok: true };
    });
    r.get('/api/admin/rag-thresholds', async (req) => (await pool.query(`SELECT * FROM rag_thresholds WHERE org_id=$1 ORDER BY metric_key`, [C(req).orgId])).rows);
    r.put('/api/admin/rag-thresholds/:key', async (req) => {
      const c = C(req); requirePerm(c, 'admin:config');
      const b = parse(z.object({ direction: z.enum(['higher_is_better', 'lower_is_better']), green_at: z.number(), amber_at: z.number() }), req.body);
      if (b.direction === 'higher_is_better' ? b.green_at < b.amber_at : b.green_at > b.amber_at) throw badRequest('Green threshold must be stricter than amber');
      return tx(async (db) => {
        const before = (await db.query(`SELECT * FROM rag_thresholds WHERE org_id=$1 AND metric_key=$2`, [c.orgId, (req.params as any).key])).rows[0];
        const row = (await db.query(`INSERT INTO rag_thresholds (org_id, metric_key, direction, green_at, amber_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, metric_key) DO UPDATE SET direction=EXCLUDED.direction, green_at=EXCLUDED.green_at, amber_at=EXCLUDED.amber_at RETURNING *`,
          [c.orgId, (req.params as any).key, b.direction, b.green_at, b.amber_at])).rows[0];
        await audit(db, c, 'config_changed', { type: 'rag_thresholds', code: (req.params as any).key }, before ?? null, row);
        return row;
      });
    });
    r.get('/api/admin/approval-matrix', async (req) => (await pool.query(`SELECT * FROM approval_matrix WHERE org_id=$1 ORDER BY approval_type, max_amount NULLS LAST`, [C(req).orgId])).rows);
    r.put('/api/admin/approval-matrix', async (req) => {
      const c = C(req); requirePerm(c, 'admin:config');
      const b = parse(z.object({ role_key: z.string(), approval_type: z.string(), max_amount: z.number().min(0).nullable() }), req.body);
      return tx(async (db) => {
        const row = (await db.query(`INSERT INTO approval_matrix (org_id, role_key, approval_type, max_amount) VALUES ($1,$2,$3,$4) ON CONFLICT (org_id, role_key, approval_type) DO UPDATE SET max_amount=EXCLUDED.max_amount RETURNING *`, [c.orgId, b.role_key, b.approval_type, b.max_amount])).rows[0];
        await audit(db, c, 'config_changed', { type: 'approval_matrix', code: `${b.role_key}:${b.approval_type}` }, null, row);
        return row;
      });
    });
    r.post('/api/admin/jobs/run', async (req) => { const c = C(req); requirePerm(c, 'admin:config'); await runDailyChecks(); return { ok: true }; });
    r.get('/api/admin/jobs', async (req) => { const c = C(req); requirePerm(c, 'admin:config'); return (await pool.query(`SELECT * FROM job_runs ORDER BY id DESC LIMIT 50`)).rows; });
  });

  void RESOURCES;
  return app;
}
