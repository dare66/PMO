import crypto from 'node:crypto';
import type { Db } from '../db.js';
import { tx } from '../db.js';
import type { Ctx } from './context.js';

const REDACT = new Set(['password_hash', 'password', 'secret', 'token']);
function redact(o: any) {
  if (!o || typeof o !== 'object') return o;
  const c: any = {};
  for (const [k, v] of Object.entries(o)) c[k] = REDACT.has(k) ? '[REDACTED]' : v;
  return c;
}

/**
 * Append a tamper-evident audit event. Each event stores sha256(prev_hash + canonical payload),
 * forming a hash chain per organisation; /api/audit/verify recomputes the chain.
 * The table itself rejects UPDATE/DELETE via trigger.
 */
export async function audit(db: Db, ctx: Pick<Ctx, 'orgId' | 'userId' | 'actorType' | 'ip'>, action: string,
  entity: { type?: string; id?: string; code?: string } = {}, before?: unknown, after?: unknown, meta?: unknown): Promise<void> {
  // a bare pool would release the advisory lock per statement; always run inside a transaction
  if ('totalCount' in db) return tx((c) => audit(c, ctx, action, entity, before, after, meta));
  // serialise chain per org to keep hashes linear
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ctx.orgId]);
  const prev = await db.query('SELECT hash FROM audit_events WHERE org_id=$1 ORDER BY id DESC LIMIT 1', [ctx.orgId]);
  const prevHash: string | null = prev.rows[0]?.hash ?? null;
  const occurredAt = new Date().toISOString();
  const payload = JSON.parse(JSON.stringify({
    org_id: ctx.orgId, actor_id: ctx.userId ?? null, actor_type: ctx.actorType, action,
    entity_type: entity.type ?? null, entity_id: entity.id ?? null, entity_code: entity.code ?? null,
    before: redact(before) ?? null, after: redact(after) ?? null, meta: meta ?? null, occurred_at: occurredAt,
  })); // normalise (Dates -> ISO strings) exactly as JSONB will store it
  const hash = auditHash(prevHash, payload);
  await db.query(
    `INSERT INTO audit_events (org_id, actor_id, actor_type, action, entity_type, entity_id, entity_code, before, after, meta, ip, occurred_at, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [payload.org_id, payload.actor_id, payload.actor_type, action, payload.entity_type, payload.entity_id, payload.entity_code,
      payload.before === null ? null : JSON.stringify(payload.before), payload.after === null ? null : JSON.stringify(payload.after),
      payload.meta === null ? null : JSON.stringify(payload.meta), ctx.ip ?? null, occurredAt, prevHash, hash]);
}

export function auditHash(prevHash: string | null, payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update((prevHash ?? 'GENESIS') + '|' + stableStringify(payload)).digest('hex');
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ':' + stableStringify((v as any)[k])).join(',') + '}';
}
