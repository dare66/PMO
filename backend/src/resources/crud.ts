import { z } from 'zod';
import type { Db } from '../db.js';
import { pool, tx } from '../db.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import type { Ctx } from '../core/context.js';
import { can } from '../core/context.js';
import { AppError, badRequest, conflict, forbidden, notFound, unprocessable } from '../core/errors.js';
import { CONTEXT_TABLES, getResource, RESOURCE_MAP, type FieldDef, type ResourceDef } from './registry.js';
import { hooks, decorate } from '../domain/hooks.js';

const BASE_FILTERS = ['status', 'owner_id', 'context_type', 'context_id', 'code', 'classification'];
const SYSTEM_COLS = ['id', 'org_id', 'code', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at', 'row_version'];

/** Status values that may only be reached through governed workflows (approvals / dedicated endpoints). */
export const GUARDED_STATUS: Record<string, string[]> = {
  budgets: ['approved', 'rejected'],
  purchase_requests: ['approved', 'rejected'],
  bia_assessments: ['approved'],
  change_requests: ['approved', 'rejected'],
  business_cases: ['approved', 'rejected'],
  projects: ['closed'],
  documents: ['approved'],
};

function fieldSchema(fd: FieldDef): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  switch (fd.t) {
    case 'text': s = z.string().trim().max(500); break;
    case 'textarea': s = z.string().max(50000); break;
    case 'int': { let n = z.number().int(); if (fd.min !== undefined) n = n.min(fd.min); if (fd.max !== undefined) n = n.max(fd.max); s = n; break; }
    case 'number': { let n = z.number().finite(); if (fd.min !== undefined) n = n.min(fd.min); if (fd.max !== undefined) n = n.max(fd.max); s = n; break; }
    case 'money': s = z.number().finite().min(-1e13).max(1e13); break;
    case 'pct': s = z.number().min(0).max(100); break;
    case 'date': s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'); break;
    case 'datetime': s = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)); break;
    case 'bool': s = z.boolean(); break;
    case 'enum': s = z.enum(fd.opts as [string, ...string[]]); break;
    case 'ref': s = z.string().uuid(); break;
    case 'numarray': s = z.array(z.number().finite()).max(100); break;
    default: s = z.any();
  }
  return s.nullable();
}

function buildSchema(def: ResourceDef, mode: 'create' | 'update') {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const fd of def.fields) {
    if (fd.ro) continue;
    let s = fieldSchema(fd);
    if (mode === 'create' && fd.req) s = s.refine((v) => v !== null && v !== '' && v !== undefined, { message: `${fd.l ?? fd.n} is required` });
    shape[fd.n] = s.optional();
  }
  if (def.hasStatus) shape.status = (def.statusOptions ? z.enum(def.statusOptions as [string, ...string[]]) : z.string()).optional();
  if (def.contexts) { shape.context_type = z.enum(def.contexts as [string, ...string[]]).optional(); shape.context_id = z.string().uuid().nullable().optional(); }
  shape.row_version = z.number().int().optional();
  return z.object(shape).strict();
}

const schemaCache = new Map<string, z.ZodTypeAny>();
function schemaFor(def: ResourceDef, mode: 'create' | 'update') {
  const k = def.key + ':' + mode;
  if (!schemaCache.has(k)) schemaCache.set(k, buildSchema(def, mode));
  return schemaCache.get(k)!;
}

export function visibilityClause(ctx: Ctx, alias = 't', startIdx = 2): { sql: string; params: unknown[] } {
  if (can(ctx, 'restricted:read')) return { sql: '', params: [] };
  return { sql: ` AND (${alias}.classification IS DISTINCT FROM 'restricted' OR ${alias}.owner_id = $${startIdx} OR ${alias}.created_by = $${startIdx})`, params: [ctx.userId] };
}

export function requirePerm(ctx: Ctx, perm: string) {
  if (!can(ctx, perm)) throw forbidden(`Missing permission ${perm}`);
}

async function validateRefs(db: Db, ctx: Ctx, def: ResourceDef, data: Record<string, any>) {
  for (const fd of def.fields) {
    if (fd.t !== 'ref' || !data[fd.n]) continue;
    const target = getResource(fd.ref!)?.table ?? fd.ref!;
    const r = await db.query(`SELECT 1 FROM ${target} WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [data[fd.n], ctx.orgId]);
    if (!r.rowCount) throw badRequest(`${fd.l ?? fd.n} refers to a record that does not exist`, { field: fd.n });
  }
  if (def.contexts && data.context_type !== undefined) {
    const table = CONTEXT_TABLES[data.context_type];
    if (table === undefined) throw badRequest(`Invalid context_type ${data.context_type}`);
    if (table === null) data.context_id = null;
    else {
      if (!data.context_id) throw badRequest(`context_id is required for context_type ${data.context_type}`, { field: 'context_id' });
      const r = await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [data.context_id, ctx.orgId]);
      if (!r.rowCount) throw badRequest('Context record does not exist', { field: 'context_id' });
    }
  }
}

function formatZod(e: z.ZodError) {
  return e.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message }));
}

// ------------------------------------------------------------------ reads
export interface ListQuery { [k: string]: string | undefined }

export async function listRows(ctx: Ctx, key: string, qy: ListQuery, db: Db = pool) {
  const def = getResource(key); if (!def) throw notFound('Resource');
  requirePerm(ctx, `${key}:read`);
  const params: unknown[] = [ctx.orgId];
  let where = `t.org_id = $1 AND t.deleted_at IS NULL`;
  const vis = visibilityClause(ctx, 't', params.length + 1); if (vis.sql) { params.push(...vis.params); where += vis.sql; }
  const filterable = new Set([...BASE_FILTERS, ...def.fields.map((x) => x.n)]);
  for (const [k, v] of Object.entries(qy)) {
    if (v === undefined || v === '' || !filterable.has(k)) continue;
    if (v === 'null') { where += ` AND t.${k} IS NULL`; continue; }
    const vals = v.split(',');
    params.push(vals);
    where += ` AND t.${k}::text = ANY($${params.length}::text[])`;
  }
  if (qy.q) {
    params.push(`%${qy.q.replace(/[%_]/g, '\\$&')}%`);
    where += ` AND (t.name ILIKE $${params.length} OR t.code ILIKE $${params.length})`;
  }
  const page = Math.max(1, Number(qy.page ?? 1) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(qy.pageSize ?? 50) || 50));
  let order = def.defaultSort ?? 'created_at desc';
  if (qy.sort) {
    const [col, dir] = qy.sort.split(':');
    if (!filterable.has(col) && !['name', 'created_at', 'updated_at', 'code'].includes(col)) throw badRequest('Invalid sort column');
    order = `${col} ${dir === 'desc' ? 'desc' : 'asc'} NULLS LAST`;
  }
  const total = (await db.query(`SELECT count(*)::int AS n FROM ${def.table} t WHERE ${where}`, params)).rows[0].n;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = (await db.query(`SELECT t.* FROM ${def.table} t WHERE ${where} ORDER BY t.${order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
  const data = await attachRefs(db, ctx, def, decorate(key, rows));
  return { data, total, page, pageSize };
}

export async function getRow(ctx: Ctx, key: string, id: string, db: Db = pool) {
  const def = getResource(key); if (!def) throw notFound('Resource');
  requirePerm(ctx, `${key}:read`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound(def.label);
  const vis = visibilityClause(ctx, 't', 3);
  const r = await db.query(`SELECT t.* FROM ${def.table} t WHERE t.id=$1 AND t.org_id=$2 AND t.deleted_at IS NULL${vis.sql}`, [id, ctx.orgId, ...vis.params]);
  if (!r.rowCount) throw notFound(def.label);
  return (await attachRefs(db, ctx, def, decorate(key, r.rows)))[0];
}

/** Resolve ref ids and polymorphic contexts into {id, code, name} labels for display. */
async function attachRefs(db: Db, ctx: Ctx, def: ResourceDef, rows: any[]) {
  if (!rows.length) return rows;
  const wanted = new Map<string, Set<string>>();
  const add = (table: string, id: string | null) => { if (!id) return; if (!wanted.has(table)) wanted.set(table, new Set()); wanted.get(table)!.add(id); };
  for (const r of rows) {
    for (const fd of def.fields) if (fd.t === 'ref' && r[fd.n]) add(getResource(fd.ref!)?.table ?? fd.ref!, r[fd.n]);
    if (r.context_type && r.context_id && CONTEXT_TABLES[r.context_type]) add(CONTEXT_TABLES[r.context_type]!, r.context_id);
  }
  const labels = new Map<string, { id: string; code: string; name: string }>();
  for (const [table, ids] of wanted) {
    const res = await db.query(`SELECT id, code, name FROM ${table} WHERE org_id=$1 AND id = ANY($2::uuid[])`, [ctx.orgId, [...ids]]);
    for (const x of res.rows) labels.set(x.id, x);
  }
  return rows.map((r) => {
    const refs: Record<string, unknown> = {};
    for (const fd of def.fields) if (fd.t === 'ref' && r[fd.n]) refs[fd.n] = labels.get(r[fd.n]) ?? null;
    const out = { ...r, _refs: refs } as any;
    if (r.context_type && r.context_id) out._context = { type: r.context_type, ...(labels.get(r.context_id) ?? { id: r.context_id }) };
    delete out.password_hash;
    return out;
  });
}

// ------------------------------------------------------------------ writes
export async function createRow(ctx: Ctx, key: string, body: unknown, opts: { db?: Db; skipGuards?: boolean } = {}) {
  const def = getResource(key); if (!def) throw notFound('Resource');
  requirePerm(ctx, `${key}:write`);
  const parsed = schemaFor(def, 'create').safeParse(body ?? {});
  if (!parsed.success) throw badRequest('Validation failed', formatZod(parsed.error));
  const data: Record<string, any> = { ...parsed.data };
  delete data.row_version;
  for (const fd of def.fields) if (data[fd.n] === undefined && fd.def !== undefined && !fd.ro) data[fd.n] = fd.def;
  if (def.contexts && def.contextRequired && !data.context_type) throw badRequest('context_type is required', [{ field: 'context_type', message: 'Required' }]);
  if (!opts.skipGuards && data.status && GUARDED_STATUS[key]?.includes(data.status)) throw unprocessable(`Status "${data.status}" can only be set through the approval workflow`);

  const run = async (db: Db) => {
    await validateRefs(db, ctx, def, data);
    await hooks[key]?.beforeWrite?.(db, ctx, data, null);
    if (def.hasOwner && data.owner_id === undefined) data.owner_id = ctx.userId;
    const code = await nextCode(db, ctx.orgId, def.prefix);
    const cols = ['org_id', 'code', 'created_by', 'updated_by', ...Object.keys(data)];
    const vals = [ctx.orgId, code, ctx.userId, ctx.userId, ...Object.values(data)];
    const r = await db.query(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
    const row = r.rows[0];
    await audit(db, ctx, 'create', { type: key, id: row.id, code: row.code }, null, row);
    await hooks[key]?.afterWrite?.(db, ctx, row, null);
    return row;
  };
  const row = opts.db ? await run(opts.db) : await tx(run);
  return getRow(ctx, key, row.id, opts.db ?? pool);
}

export async function updateRow(ctx: Ctx, key: string, id: string, body: unknown, opts: { db?: Db; skipGuards?: boolean } = {}) {
  const def = getResource(key); if (!def) throw notFound('Resource');
  requirePerm(ctx, `${key}:write`);
  const parsed = schemaFor(def, 'update').safeParse(body ?? {});
  if (!parsed.success) throw badRequest('Validation failed', formatZod(parsed.error));
  const data: Record<string, any> = { ...parsed.data };
  const expected = data.row_version; delete data.row_version;
  if (!Object.keys(data).length) throw badRequest('No changes supplied');
  if (!opts.skipGuards && data.status && GUARDED_STATUS[key]?.includes(data.status)) throw unprocessable(`Status "${data.status}" can only be set through the approval workflow`);

  const run = async (db: Db) => {
    const vis = visibilityClause(ctx, 't', 3);
    const cur = await db.query(`SELECT t.* FROM ${def.table} t WHERE t.id=$1 AND t.org_id=$2 AND t.deleted_at IS NULL${vis.sql} FOR UPDATE`, [id, ctx.orgId, ...vis.params]);
    if (!cur.rowCount) throw notFound(def.label);
    const before = cur.rows[0];
    if (expected !== undefined && expected !== before.row_version) throw conflict('Record was changed by someone else. Reload and try again.', { current_version: before.row_version });
    if (def.contexts && (data.context_type !== undefined || data.context_id !== undefined)) {
      data.context_type = data.context_type ?? before.context_type;
      if (data.context_id === undefined) data.context_id = before.context_id;
    }
    await validateRefs(db, ctx, def, data);
    await hooks[key]?.beforeWrite?.(db, ctx, data, before);
    const sets = Object.keys(data).map((k, i) => `${k}=$${i + 3}`);
    const r = await db.query(`UPDATE ${def.table} SET ${sets.join(',')}, updated_by=$${sets.length + 3} WHERE id=$1 AND org_id=$2 RETURNING *`,
      [id, ctx.orgId, ...Object.values(data), ctx.userId]);
    const row = r.rows[0];
    const changed: Record<string, unknown> = {}; const prev: Record<string, unknown> = {};
    for (const k of Object.keys(data)) if (JSON.stringify(before[k]) !== JSON.stringify(row[k])) { changed[k] = row[k]; prev[k] = before[k]; }
    await audit(db, ctx, 'update', { type: key, id, code: row.code }, prev, changed);
    await hooks[key]?.afterWrite?.(db, ctx, row, before);
    return row;
  };
  const row = opts.db ? await run(opts.db) : await tx(run);
  return getRow(ctx, key, row.id, opts.db ?? pool);
}

export async function deleteRow(ctx: Ctx, key: string, id: string) {
  const def = getResource(key); if (!def) throw notFound('Resource');
  requirePerm(ctx, `${key}:delete`);
  return tx(async (db) => {
    const r = await db.query(`UPDATE ${def.table} SET deleted_at=now(), updated_by=$3 WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL RETURNING id, code`, [id, ctx.orgId, ctx.userId]);
    if (!r.rowCount) throw notFound(def.label);
    await audit(db, ctx, 'delete', { type: key, id, code: r.rows[0].code }, null, { deleted_at: new Date().toISOString() });
    return { ok: true };
  });
}

export function publicMeta(ctx: Ctx) {
  return [...RESOURCE_MAP.values()].filter((d) => can(ctx, `${d.key}:read`)).map((d) => ({
    key: d.key, label: d.label, plural: d.plural, module: d.module, prefix: d.prefix, description: d.description,
    contexts: d.contexts, contextRequired: d.contextRequired, statusOptions: d.statusOptions, guardedStatuses: GUARDED_STATUS[d.key] ?? [],
    fields: d.fields, canWrite: can(ctx, `${d.key}:write`), canDelete: can(ctx, `${d.key}:delete`),
  }));
}

export { SYSTEM_COLS, AppError };
