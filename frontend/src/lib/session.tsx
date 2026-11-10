import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface FieldDef { n: string; l?: string; t: string; req?: boolean; opts?: string[]; ref?: string; list?: boolean; ro?: boolean; min?: number; max?: number; help?: string; def?: unknown }
export interface ResourceMeta { key: string; label: string; plural: string; module: string; prefix: string; description?: string; contexts?: string[]; contextRequired?: boolean; statusOptions?: string[]; guardedStatuses: string[]; fields: FieldDef[]; canWrite: boolean; canDelete: boolean }
export interface Me { id: string; name: string; email: string; roles: string[]; permissions: string[]; organisation: { id: string; code: string; name: string; base_currency: string; is_synthetic: boolean } }
interface Session { me: Me | null; meta: Map<string, ResourceMeta>; users: { id: string; name: string; code: string; title: string }[]; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; can: (p: string) => boolean }

const Ctx = createContext<Session>(null as any);
export const useSession = () => useContext(Ctx);
const EXPLICIT = new Set(['restricted:read', 'audit:read', 'releases:deploy', 'workflow:override']);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState(new Map<string, ResourceMeta>());
  const [users, setUsers] = useState<Session['users']>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>('/api/auth/me');
      const [r, u] = await Promise.all([api.get<ResourceMeta[]>('/api/meta/resources'), api.get('/api/meta/users')]);
      setMe(m); setMeta(new Map(r.map((x) => [x.key, x]))); setUsers(u);
    } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); const h = () => setMe(null); window.addEventListener('pmo:unauthenticated', h); return () => window.removeEventListener('pmo:unauthenticated', h); }, [refresh]);
  const logout = async () => { await api.post('/api/auth/logout'); setMe(null); };
  const can = (p: string) => {
    if (!me) return false; const s = new Set(me.permissions);
    if (s.has('*') || s.has(p)) return true; if (EXPLICIT.has(p)) return false;
    const [r, a] = p.split(':'); return s.has(`${r}:*`) || s.has(`*:${a}`);
  };
  return <Ctx.Provider value={{ me, meta, users, loading, refresh, logout, can }}>{children}</Ctx.Provider>;
}
