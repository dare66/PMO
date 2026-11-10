export interface Ctx {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  roles: string[];
  perms: Set<string>;
  actorType: 'user' | 'ai' | 'system' | 'integration';
  ip?: string;
}

/** Permission check supporting wildcards: '*', 'resource:*', '*:read'. */
/** Sensitive permissions that wildcards such as '*:read' never grant (must be explicit or full admin '*'). */
const EXPLICIT_ONLY = new Set(['restricted:read', 'audit:read', 'releases:deploy', 'workflow:override']);

export function can(ctx: Ctx, perm: string): boolean {
  if (ctx.perms.has('*') || ctx.perms.has(perm)) return true;
  if (EXPLICIT_ONLY.has(perm)) return false;
  const [res, act] = perm.split(':');
  return ctx.perms.has(`${res}:*`) || ctx.perms.has(`*:${act}`);
}

export function systemCtx(orgId: string, userId: string): Ctx {
  return { userId, orgId, name: 'System', email: 'system@local', roles: ['system'], perms: new Set(['*']), actorType: 'system' };
}
