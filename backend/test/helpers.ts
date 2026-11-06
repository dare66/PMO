import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { bootstrap } from '../src/seed/bootstrap.js';

let appP: Promise<FastifyInstance> | null = null;
export function getApp() {
  appP ??= (async () => { await migrate(); await bootstrap(); return buildApp(); })();
  return appP;
}
export const PASSWORD = 'TestPass-2026x';
const tokens = new Map<string, string>();
export async function token(user: string) {
  if (tokens.has(user)) return tokens.get(user)!;
  const app = await getApp();
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${user}@demo.example`, password: PASSWORD } });
  if (r.statusCode !== 200) throw new Error(`login ${user} failed: ${r.body}`);
  tokens.set(user, r.json().token);
  return r.json().token as string;
}
export async function api(user: string, method: string, url: string, payload?: unknown) {
  const app = await getApp();
  const r = await app.inject({ method: method as any, url, payload: payload as any, headers: { authorization: `Bearer ${await token(user)}` } });
  let body: any; try { body = r.json(); } catch { body = r.body; }
  return { status: r.statusCode, body };
}
export async function find(user: string, key: string, q: Record<string, string>) {
  const qs = new URLSearchParams({ pageSize: '200', ...q }).toString();
  const r = await api(user, 'GET', `/api/r/${key}?${qs}`);
  return r.body.data as any[];
}
