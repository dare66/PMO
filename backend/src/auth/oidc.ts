/**
 * OpenID Connect single sign-on (FR-INT-004) – authorization-code flow with PKCE (S256), state & nonce.
 * Works with Microsoft Entra ID, Okta, Keycloak, Google Workspace, etc. Configured only via environment:
 *   OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET (optional for public clients), OIDC_REDIRECT_URI,
 *   OIDC_DEFAULT_ROLE (default 'member'), OIDC_ALLOWED_DOMAINS (optional comma list), OIDC_JIT (default true).
 * ID tokens are verified against the issuer's JWKS (signature, iss, aud, exp, nonce).
 */
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { pool, tx } from '../db.js';
import { audit } from '../core/audit.js';
import { nextCode } from '../core/codes.js';
import { AppError } from '../core/errors.js';

export interface OidcConfig { issuer: string; clientId: string; clientSecret?: string; redirectUri: string; defaultRole: string; allowedDomains: string[]; jit: boolean }
export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER, clientId = process.env.OIDC_CLIENT_ID, redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!issuer || !clientId || !redirectUri) return null;
  return { issuer: issuer.replace(/\/$/, ''), clientId, clientSecret: process.env.OIDC_CLIENT_SECRET || undefined, redirectUri, defaultRole: process.env.OIDC_DEFAULT_ROLE ?? 'member',
    allowedDomains: (process.env.OIDC_ALLOWED_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean), jit: (process.env.OIDC_JIT ?? 'true') !== 'false' };
}

let discoveryCache: { at: number; issuer: string; doc: any } | null = null;
async function discovery(cfg: OidcConfig) {
  if (discoveryCache && discoveryCache.issuer === cfg.issuer && Date.now() - discoveryCache.at < 3600_000) return discoveryCache.doc;
  const r = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new AppError(502, 'oidc_discovery', 'Identity provider discovery failed');
  const doc = await r.json();
  if (String(doc.issuer).replace(/\/$/, '') !== cfg.issuer) throw new AppError(502, 'oidc_discovery', 'Issuer mismatch in discovery document');
  discoveryCache = { at: Date.now(), issuer: cfg.issuer, doc };
  return doc;
}
const b64url = (b: Buffer) => b.toString('base64url');

export async function startLogin(returnTo?: string) {
  const cfg = oidcConfig(); if (!cfg) throw new AppError(404, 'sso_disabled', 'Single sign-on is not configured');
  const d = await discovery(cfg);
  const state = b64url(crypto.randomBytes(24)), nonce = b64url(crypto.randomBytes(24)), verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  await pool.query(`DELETE FROM oidc_login_states WHERE created_at < now() - interval '15 minutes'`);
  await pool.query(`INSERT INTO oidc_login_states (state, nonce, code_verifier, return_to) VALUES ($1,$2,$3,$4)`, [state, nonce, verifier, returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/']);
  const u = new URL(d.authorization_endpoint);
  u.search = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return u.toString();
}

export async function completeLogin(code: string, state: string, ip?: string) {
  const cfg = oidcConfig(); if (!cfg) throw new AppError(404, 'sso_disabled', 'Single sign-on is not configured');
  const st = (await pool.query(`DELETE FROM oidc_login_states WHERE state=$1 AND created_at > now() - interval '15 minutes' RETURNING *`, [state])).rows[0];
  if (!st) throw new AppError(400, 'oidc_state', 'Login session expired or invalid state');
  const d = await discovery(cfg);
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, code_verifier: st.code_verifier });
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret);
  const tr = await fetch(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) });
  if (!tr.ok) throw new AppError(401, 'oidc_token', 'Token exchange with the identity provider failed');
  const tokens = await tr.json();
  const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(d.jwks_uri)), { issuer: d.issuer, audience: cfg.clientId }).catch(() => { throw new AppError(401, 'oidc_token', 'ID token verification failed'); });
  if (payload.nonce !== st.nonce) throw new AppError(401, 'oidc_nonce', 'Nonce mismatch');
  const sub = `${d.issuer}|${payload.sub}`;
  const email = String(payload.email ?? payload.preferred_username ?? '').toLowerCase();
  if (!email.includes('@')) throw new AppError(401, 'oidc_claims', 'Identity provider did not supply an email address');
  if (payload.email_verified === false) throw new AppError(401, 'oidc_claims', 'Email address is not verified at the identity provider');
  if (cfg.allowedDomains.length && !cfg.allowedDomains.includes(email.split('@')[1])) throw new AppError(403, 'oidc_domain', 'Your email domain is not permitted');
  return tx(async (db) => {
    let u = (await db.query(`SELECT * FROM users WHERE (oidc_subject=$1 OR lower(email)=$2) AND deleted_at IS NULL ORDER BY (oidc_subject=$1) DESC LIMIT 1`, [sub, email])).rows[0];
    if (u && u.oidc_subject && u.oidc_subject !== sub) throw new AppError(403, 'oidc_conflict', 'This email is linked to a different identity');
    if (!u) {
      if (!cfg.jit) throw new AppError(403, 'oidc_not_provisioned', 'No account exists for this identity');
      const org = (await db.query(`SELECT id FROM organisations WHERE NOT is_synthetic ORDER BY created_at LIMIT 1`)).rows[0] ?? (await db.query(`SELECT id FROM organisations ORDER BY created_at LIMIT 1`)).rows[0];
      u = (await db.query(`INSERT INTO users (org_id, code, email, name, auth_provider, oidc_subject) VALUES ($1,$2,$3,$4,'oidc',$5) RETURNING *`,
        [org.id, await nextCode(db, org.id, 'USR'), email, String(payload.name ?? email), sub])).rows[0];
      const role = (await db.query(`SELECT id FROM roles WHERE org_id=$1 AND key=$2`, [org.id, cfg.defaultRole])).rows[0];
      if (role) await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [u.id, role.id]);
      await audit(db, { orgId: org.id, userId: u.id, actorType: 'system', ip }, 'user_provisioned_sso', { type: 'users', id: u.id, code: u.code }, null, { email, role: cfg.defaultRole });
    } else if (!u.oidc_subject) {
      await db.query(`UPDATE users SET oidc_subject=$2 WHERE id=$1`, [u.id, sub]);
    }
    if (u.status !== 'active') throw new AppError(403, 'inactive', 'Account is not active');
    await db.query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [u.id]);
    await audit(db, { orgId: u.org_id, userId: u.id, actorType: 'user', ip }, 'login_sso', { type: 'users', id: u.id, code: u.code }, null, { issuer: d.issuer });
    return { user: u, returnTo: st.return_to as string };
  });
}
