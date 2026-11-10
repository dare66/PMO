/**
 * Integration framework: outbound event queue with retries + exponential backoff + dead-letter,
 * idempotency/duplicate detection, field mapping, inbound signed webhooks, integration logs.
 * Connectors run in MOCK mode unless a live secret reference resolves in the environment.
 * Mock connectors are always labelled as such in the API/UI – they are never presented as live.
 */
import crypto from 'node:crypto';
import type { Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';

export interface Connector { key: string; name: string; supportsLive: boolean; description: string; deliver(event: any, integration: any): Promise<{ ok: boolean; external_id?: string; error?: string }> }

const mock = (key: string, name: string, description: string): Connector => ({
  key, name, supportsLive: false, description: `${description} (MOCK connector – simulates delivery, no external call)`,
  async deliver(event) {
    if (event.payload?.simulate_failure) return { ok: false, error: 'Simulated failure (mock)' };
    return { ok: true, external_id: `MOCK-${key.toUpperCase()}-${crypto.randomBytes(3).toString('hex')}` };
  },
});

/** Generic signed webhook – the one connector that can run live (URL + secret from environment). */
const webhook: Connector = {
  key: 'webhook', name: 'Generic outbound webhook', supportsLive: true,
  description: 'POSTs signed JSON (HMAC-SHA256, header X-Signature) to a URL configured via environment variable <SECRET_REF>_URL and secret <SECRET_REF>_SECRET.',
  async deliver(event, integration) {
    if (integration.mode !== 'live') return mock('webhook', '', '').deliver(event, integration);
    const url = process.env[`${integration.secret_ref}_URL`], secret = process.env[`${integration.secret_ref}_SECRET`];
    if (!url || !secret) return { ok: false, error: 'Live webhook not configured (missing environment variables)' };
    const body = JSON.stringify({ type: event.event_type, id: event.id, payload: event.payload });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig, 'idempotency-key': event.idempotency_key ?? event.id }, body, signal: AbortSignal.timeout(15000) });
      return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  },
};

export const CONNECTORS: Record<string, Connector> = {
  webhook,
  jira: mock('jira', 'Jira (issues sync)', 'Two-way issue sync for delivery teams'),
  azure_devops: mock('azure_devops', 'Azure DevOps Boards', 'Work item sync'),
  github: mock('github', 'GitHub', 'Issues, PRs and deployment status'),
  teams: mock('teams', 'Microsoft Teams', 'Channel notifications for approvals and alerts'),
  slack: mock('slack', 'Slack', 'Channel notifications'),
  servicenow: mock('servicenow', 'ServiceNow', 'Incident / change synchronisation'),
  erp: mock('erp', 'ERP / Finance', 'Actual cost and purchase order import'),
  hr: mock('hr', 'HR system', 'Leave and organisation structure import'),
  email: mock('email', 'Email gateway (SMTP)', 'Notification e-mail'),
};

export async function enqueue(db: Db, ctx: Ctx, integrationKey: string, eventType: string, payload: unknown, idempotencyKey?: string) {
  const integ = (await db.query(`SELECT * FROM integrations WHERE org_id=$1 AND key=$2`, [ctx.orgId, integrationKey])).rows[0];
  if (!integ) throw notFound('Integration');
  if (!integ.is_enabled) throw badRequest('Integration is disabled');
  const r = await db.query(`INSERT INTO integration_events (org_id, integration_id, direction, event_type, payload, idempotency_key) VALUES ($1,$2,'outbound',$3,$4,$5)
     ON CONFLICT (integration_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`, [ctx.orgId, integ.id, eventType, JSON.stringify(payload), idempotencyKey ?? null]);
  if (!r.rowCount) return { duplicate: true };
  return { duplicate: false, event: r.rows[0] };
}

export async function processQueue(db: Db, limit = 20) {
  const events = (await db.query(`SELECT e.*, row_to_json(i) AS integ FROM integration_events e JOIN integrations i ON i.id=e.integration_id
     WHERE e.status IN ('queued','failed') AND e.next_attempt_at <= now() AND e.direction='outbound' ORDER BY e.next_attempt_at LIMIT $1 FOR UPDATE OF e SKIP LOCKED`, [limit])).rows;
  let delivered = 0, failed = 0, dead = 0;
  for (const e of events) {
    const conn = CONNECTORS[e.integ.connector];
    const res = conn ? await conn.deliver(e, e.integ) : { ok: false, error: `Unknown connector ${e.integ.connector}` };
    const attempts = e.attempts + 1;
    if (res.ok) {
      delivered++;
      await db.query(`UPDATE integration_events SET status='delivered', attempts=$2, external_id=COALESCE($3, external_id), last_error=NULL WHERE id=$1`, [e.id, attempts, res.external_id ?? null]);
    } else if (attempts >= e.max_attempts) {
      dead++;
      await db.query(`UPDATE integration_events SET status='dead_letter', attempts=$2, last_error=$3 WHERE id=$1`, [e.id, attempts, res.error]);
    } else {
      failed++;
      const backoffSec = Math.min(3600, 2 ** attempts * 15);
      await db.query(`UPDATE integration_events SET status='failed', attempts=$2, last_error=$3, next_attempt_at=now() + ($4 || ' seconds')::interval WHERE id=$1`, [e.id, attempts, res.error, String(backoffSec)]);
    }
    await db.query(`UPDATE integrations SET last_sync_at=now(), last_status=$2 WHERE id=$1`, [e.integration_id, res.ok ? 'ok' : 'error']);
  }
  return { processed: events.length, delivered, failed, dead_letter: dead };
}

export async function retryDeadLetter(db: Db, ctx: Ctx, eventId: string) {
  const r = await db.query(`UPDATE integration_events SET status='queued', attempts=0, next_attempt_at=now(), last_error=NULL WHERE id=$1 AND org_id=$2 AND status IN ('dead_letter','failed') RETURNING *`, [eventId, ctx.orgId]);
  if (!r.rowCount) throw notFound('Failed event');
  await audit(db, ctx, 'integration_retry', { type: 'integration_events', id: eventId }, null, null);
  return r.rows[0];
}

/** Map an external payload into platform fields using the integration's field_mapping {platformField: externalPath}. */
export function mapFields(mapping: Record<string, string>, payload: any) {
  const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const out: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(mapping)) { const v = get(payload, path); if (v !== undefined) out[field] = v; }
  return out;
}

/** Inbound webhook: verify signature, de-duplicate by external id, map fields and upsert a work item. */
export async function inbound(db: Db, orgId: string, integrationKey: string, rawBody: string, signature: string | undefined, systemUserId: string) {
  const integ = (await db.query(`SELECT * FROM integrations WHERE org_id=$1 AND key=$2 AND is_enabled`, [orgId, integrationKey])).rows[0];
  if (!integ) throw notFound('Integration');
  if (integ.mode === 'live') {
    const secret = process.env[`${integ.secret_ref}_SECRET`];
    if (!secret) throw forbidden('Inbound secret not configured');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw forbidden('Invalid signature');
  } else if (signature !== 'mock') throw forbidden('Mock integrations require header x-signature: mock');
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { throw badRequest('Body must be JSON'); }
  const externalId = String(payload.id ?? payload.key ?? '');
  if (!externalId) throw badRequest('Payload must contain id or key');
  const ev = await db.query(`INSERT INTO integration_events (org_id, integration_id, direction, event_type, external_id, payload, idempotency_key, status) VALUES ($1,$2,'inbound',$3,$4,$5,$6,'delivered')
    ON CONFLICT (integration_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`, [orgId, integ.id, payload.event ?? 'upsert', externalId, rawBody, `${externalId}:${payload.updated ?? ''}`]);
  if (!ev.rowCount) return { duplicate: true };
  const mapped = mapFields(integ.field_mapping ?? {}, payload);
  const name = String(mapped.name ?? payload.summary ?? `External ${externalId}`).slice(0, 500);
  const existing = (await db.query(`SELECT id FROM work_items WHERE org_id=$1 AND description LIKE $2 AND deleted_at IS NULL`, [orgId, `%[ext:${integrationKey}:${externalId}]%`])).rows[0];
  const sysCtx = { orgId, userId: systemUserId, actorType: 'integration' as const };
  if (existing) {
    await db.query(`UPDATE work_items SET name=$2, status=COALESCE($3, status) WHERE id=$1`, [existing.id, name, mapped.status ?? null]);
    await audit(db, sysCtx, 'update', { type: 'work_items', id: existing.id }, null, { name, via: integrationKey });
    return { duplicate: false, work_item_id: existing.id, action: 'updated' };
  }
  const code = await nextCode(db, orgId, 'WI');
  const wi = (await db.query(`INSERT INTO work_items (org_id, code, name, description, work_type, status, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id, code`,
    [orgId, code, name, `${mapped.description ?? ''}\n\n[ext:${integrationKey}:${externalId}]`, mapped.work_type ?? 'task', mapped.status ?? 'todo', systemUserId])).rows[0];
  await audit(db, sysCtx, 'create', { type: 'work_items', id: wi.id, code: wi.code }, null, { name, via: integrationKey, external_id: externalId });
  return { duplicate: false, work_item_id: wi.id, action: 'created' };
}
