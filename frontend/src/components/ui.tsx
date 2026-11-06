import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Info, OctagonAlert, X, XCircle } from 'lucide-react';
import { label } from '../lib/format';

// ------------------------------------------------------------------ toasts
interface Toast { id: number; msg: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.kind === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}<span>{t.msg}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export function errMsg(e: any): string {
  if (!e) return 'Unknown error';
  const d = e.details;
  if (Array.isArray(d) && d.length) return `${e.message}: ${d.map((x: any) => x.message ?? x.detail ?? x.criterion ?? JSON.stringify(x)).join('; ')}`;
  return e.message ?? String(e);
}

// ------------------------------------------------------------------ status
export type RagT = 'green' | 'amber' | 'red' | 'unknown';
const RAG: Record<RagT, { cls: string; text: string; Icon: any }> = {
  green: { cls: 'good', text: 'On track', Icon: CheckCircle2 }, amber: { cls: 'warn', text: 'At risk', Icon: AlertTriangle },
  red: { cls: 'crit', text: 'Off track', Icon: OctagonAlert }, unknown: { cls: 'unknown', text: 'No data', Icon: CircleHelp },
};
export function Rag({ v, compact, title }: { v: RagT | null | undefined; compact?: boolean; title?: string }) {
  const r = RAG[(v ?? 'unknown') as RagT] ?? RAG.unknown;
  return <span className={`badge ${r.cls}`} title={title ?? r.text}><r.Icon size={12} aria-hidden />{compact ? <span className="sr-only">{r.text}</span> : r.text}</span>;
}
const STATUS_TONE: Record<string, string> = {
  active: 'good', approved: 'good', achieved: 'good', done: 'good', passed: 'good', delivered: 'good', closed: '', completed: 'good', live: 'good', signed_off: 'good', validated: 'good', realised: 'good', met: 'good', deployed: 'good', effective: 'good', compliant: 'good', accepted: 'good', ready: 'good',
  pending: 'warn', submitted: 'warn', in_review: 'warn', at_risk: 'warn', assessing: 'warn', pending_approval: 'warn', in_progress: 'brand', review: 'brand', in_test: 'brand', in_execution: 'brand', tracking: 'brand', monitoring: 'brand', planned: '', draft: '', todo: '', open: 'serious', blocked: 'crit',
  rejected: 'crit', failed: 'crit', missed: 'crit', broken: 'crit', expired: 'crit', non_compliant: 'crit', ineffective: 'crit', dead_letter: 'crit', critical: 'crit', high: 'serious', medium: 'warn', low: '', partially: 'warn', partially_effective: 'warn',
};
export function Status({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="muted">—</span>;
  return <span className={`badge ${STATUS_TONE[v] ?? ''}`}>{label(v)}</span>;
}

// ------------------------------------------------------------------ layout
export function PageHead({ title, sub, crumbs, actions, icon }: { title: ReactNode; sub?: ReactNode; crumbs?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <div className="row">{icon}<h1>{title}</h1></div>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Card({ title, sub, actions, children, className = '', bodyClass = 'card-body', id }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && <div className="card-head"><div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>{actions && <div className="actions">{actions}</div>}</div>}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
export function Kpi({ label: l, value, foot, icon, tone }: { label: ReactNode; value: ReactNode; foot?: ReactNode; icon?: ReactNode; tone?: string }) {
  return (
    <div className="card kpi">
      {icon && <div className="icon" style={tone ? { background: `var(--${tone}-bg)`, color: `var(--${tone}-ink)` } : undefined}>{icon}</div>}
      <div className="label">{l}</div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}
export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: ReactNode }[]; value: string; onChange: (k: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}
export function Seg<T extends string>({ options, value, onChange, ariaLabel }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return <div className="seg" role="group" aria-label={ariaLabel}>{options.map((o) => <button key={o.key} className={value === o.key ? 'on' : ''} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>{o.label}</button>)}</div>;
}
export function Progress({ value, tone, label: l }: { value: number | null | undefined; tone?: string; label?: string }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  return <div className="bar" role="progressbar" aria-label={l} aria-valuenow={v ?? undefined} aria-valuemin={0} aria-valuemax={100}>{v !== null && <span style={{ width: `${v}%`, background: tone ? `var(--${tone})` : undefined }} />}</div>;
}

// ------------------------------------------------------------------ overlays
export function useEscape(fn: () => void) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && fn(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [fn]);
}
export function Drawer({ title, sub, onClose, children, footer, wide }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (<>
    <div className="scrim" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" style={wide ? { width: 'min(960px, 100vw)' } : undefined}>
      <div className="drawer-head"><div><h2>{title}</h2>{sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </aside>
  </>);
}
export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  return (<>
    <div className="scrim" onClick={onClose} />
    <div className="modal" role="dialog" aria-modal="true">
      <div className="drawer-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="drawer-foot">{footer}</div>}
    </div>
  </>);
}

// ------------------------------------------------------------------ states
export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) { return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden />; }
export function LoadingBlock({ rows = 4 }: { rows?: number }) { return <div className="col" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={18} w={`${90 - i * 9}%`} />)}</div>; }
export function ErrorBox({ error, retry }: { error: any; retry?: () => void }) {
  return <div className="error-box" role="alert"><div className="row between"><div className="row"><XCircle size={16} /><span>{errMsg(error)}</span></div>{retry && <button className="btn sm" onClick={retry}>Retry</button>}</div></div>;
}
export function Empty({ title, children, action, art = 'boxes' }: { title: string; children?: ReactNode; action?: ReactNode; art?: 'boxes' | 'chart' | 'search' }) {
  return <div className="empty"><EmptyArt kind={art} /><h3>{title}</h3>{children && <div className="small" style={{ maxWidth: 420 }}>{children}</div>}{action}</div>;
}
export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) { return <div className={`note ${warn ? 'warn' : ''}`}><div className="row" style={{ alignItems: 'flex-start' }}>{warn ? <AlertTriangle size={14} style={{ marginTop: 2, flex: 'none' }} /> : <Info size={14} style={{ marginTop: 2, flex: 'none' }} />}<div>{children}</div></div></div>; }

/** Original, lightweight SVG illustrations for empty states (no external assets). */
export function EmptyArt({ kind }: { kind: 'boxes' | 'chart' | 'search' }) {
  return (
    <svg width="120" height="84" viewBox="0 0 120 84" role="img" aria-label="" aria-hidden>
      <defs><linearGradient id={`eg-${kind}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="var(--brand-100)" /><stop offset="1" stopColor="var(--accent-50)" /></linearGradient></defs>
      <ellipse cx="60" cy="76" rx="44" ry="5" fill="var(--surface-3)" />
      {kind === 'chart' ? (<><rect x="22" y="18" width="76" height="52" rx="8" fill={`url(#eg-${kind})`} /><rect x="32" y="44" width="8" height="18" rx="2" fill="var(--brand)" opacity=".5" /><rect x="46" y="34" width="8" height="28" rx="2" fill="var(--brand)" opacity=".7" /><rect x="60" y="40" width="8" height="22" rx="2" fill="var(--accent)" opacity=".7" /><rect x="74" y="28" width="8" height="34" rx="2" fill="var(--brand)" /></>)
        : kind === 'search' ? (<><circle cx="54" cy="38" r="20" fill={`url(#eg-${kind})`} stroke="var(--brand)" strokeWidth="4" /><line x1="69" y1="53" x2="84" y2="68" stroke="var(--brand)" strokeWidth="6" strokeLinecap="round" /></>)
          : (<><rect x="28" y="34" width="34" height="30" rx="6" fill={`url(#eg-${kind})`} stroke="var(--brand-100)" /><rect x="58" y="24" width="34" height="40" rx="6" fill="var(--surface)" stroke="var(--border-strong)" /><rect x="64" y="32" width="20" height="4" rx="2" fill="var(--brand)" opacity=".6" /><rect x="64" y="40" width="14" height="4" rx="2" fill="var(--accent)" opacity=".6" /></>)}
    </svg>
  );
}
