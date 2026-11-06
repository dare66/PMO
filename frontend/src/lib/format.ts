export const fmtMoney = (v: number | null | undefined, cur = 'MYR', compact = true) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: cur, notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0 }).format(v);
};
export const fmtNum = (v: number | null | undefined, dp = 0) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('en-MY', { maximumFractionDigits: dp }).format(v));
export const fmtPct = (v: number | null | undefined, dp = 0) => (v === null || v === undefined ? '—' : `${fmtNum(v, dp)}%`);
export const fmtDate = (v: string | null | undefined) => (!v ? '—' : new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
export const fmtDateTime = (v: string | null | undefined) => (!v ? '—' : new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
export const label = (s: string | null | undefined) => (!s ? '—' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
export const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const daysFromNow = (d: string) => Math.round((Date.parse(d) - Date.now()) / 86400000);
