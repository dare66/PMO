export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}
async function request<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'x-requested-with': 'pmo', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/')) window.dispatchEvent(new Event('pmo:unauthenticated'));
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? res.statusText, data?.details);
  }
  return data as T;
}
export const api = {
  get: <T = any>(u: string) => request<T>('GET', u),
  post: <T = any>(u: string, b?: unknown) => request<T>('POST', u, b ?? {}),
  patch: <T = any>(u: string, b: unknown) => request<T>('PATCH', u, b),
  put: <T = any>(u: string, b: unknown) => request<T>('PUT', u, b),
  del: <T = any>(u: string) => request<T>('DELETE', u),
};
export function qs(o: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
}
