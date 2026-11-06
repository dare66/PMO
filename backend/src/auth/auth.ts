import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool, type Db } from '../db.js';
import type { Ctx } from '../core/context.js';
import { AppError } from '../core/errors.js';
import { audit } from '../core/audit.js';

export const SESSION_COOKIE = 'pmo_session';
const MAX_FAILED = 5, LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12); // constant-time-ish response for unknown users

export async function hashPassword(p: string) { return bcrypt.hash(p, 12); }

export function validatePasswordPolicy(p: string): string | null {
  if (typeof p !== 'string' || p.length < 12) return 'Password must be at least 12 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Password must contain letters and digits';
  return null;
}

export async function loadCtx(userId: string, ip?: string, db: Db = pool): Promise<Ctx | null> {
  const u = (await db.query(`SELECT id, org_id, name, email, status, access_end_date < current_date AS expired FROM users WHERE id=$1 AND deleted_at IS NULL`, [userId])).rows[0];
  if (!u || u.status !== 'active' || u.expired) return null; // FR-RES-011: contractor/temporary access ends automatically
  const roles = (await db.query(`SELECT r.key, r.permissions FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1`, [userId])).rows;
  const perms = new Set<string>(roles.flatMap((r) => r.permissions));
  return { userId: u.id, orgId: u.org_id, name: u.name, email: u.email, roles: roles.map((r) => r.key), perms, actorType: 'user', ip };
}

export async function login(email: string, password: string, ip?: string) {
  const u = (await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL`, [email ?? ''])).rows[0];
  const generic = new AppError(401, 'invalid_credentials', 'Invalid email or password');
  if (!u || !u.password_hash || u.is_service_account) { await bcrypt.compare(password ?? '', DUMMY_HASH); throw generic; }
  if (u.access_end_date && String(u.access_end_date instanceof Date ? u.access_end_date.toISOString() : u.access_end_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) { await bcrypt.compare(password ?? '', DUMMY_HASH); throw generic; }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new AppError(423, 'account_locked', 'Account temporarily locked after repeated failed sign-ins. Try again later.');
  const ok = await bcrypt.compare(password ?? '', u.password_hash);
  const sys = { orgId: u.org_id, userId: u.id, actorType: 'user' as const, ip };
  if (!ok) {
    const failed = u.failed_logins + 1;
    await pool.query(`UPDATE users SET failed_logins=$2::int, locked_until = CASE WHEN $2::int >= $3::int THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id=$1`, [u.id, failed, MAX_FAILED, String(LOCK_MINUTES)]);
    await audit(pool, sys, 'login_failed', { type: 'users', id: u.id, code: u.code }, null, { failed });
    throw generic;
  }
  if (u.status !== 'active') throw generic;
  await pool.query(`UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1`, [u.id]);
  await audit(pool, sys, 'login', { type: 'users', id: u.id, code: u.code });
  return u;
}

declare module 'fastify' {
  interface FastifyRequest { ctx: Ctx }
}

/** Authentication + CSRF guard. Bearer tokens (API clients) or httpOnly SameSite=Strict cookie (browser). */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  let token: string | undefined;
  let viaCookie = false;
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) token = h.slice(7);
  else if (req.cookies?.[SESSION_COOKIE]) { token = req.cookies[SESSION_COOKIE]; viaCookie = true; }
  if (!token) throw new AppError(401, 'unauthenticated', 'Authentication required');
  let payload: { sub: string };
  try { payload = req.server.jwt.verify(token); } catch { throw new AppError(401, 'unauthenticated', 'Session expired or invalid'); }
  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'pmo')
    throw new AppError(403, 'csrf', 'Missing anti-CSRF header');
  const ctx = await loadCtx(payload.sub, req.ip);
  if (!ctx) throw new AppError(401, 'unauthenticated', 'User is not active');
  req.ctx = ctx;
}
