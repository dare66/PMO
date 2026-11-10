import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, Boxes, Briefcase, Building2, CalendarRange, CheckCheck, ClipboardCheck, Compass, FileText, Gauge, GitPullRequestArrow, Handshake, Landmark, Layers3,
  LayoutDashboard, Lightbulb, LogOut, Menu, Moon, Network, PanelLeftClose, PanelLeftOpen, Plus, Rocket, Scale, Search, Settings, ShieldAlert, Sparkles, Sun, Target, Users, Wallet, Workflow, Wrench, Inbox } from 'lucide-react';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { useApi, useLocal } from '../lib/hooks';
import { fmtDateTime, initials } from '../lib/format';
import { Drawer, useEscape } from './ui';
import { RecordForm } from './resource';

export const NAV: { group: string; items: { to: string; label: string; icon: any; perm?: string }[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Command centre', icon: LayoutDashboard, perm: 'dashboard:read' }, { to: '/my-work', label: 'My work', icon: CheckCheck }] },
  { group: 'Strategy & portfolio', items: [{ to: '/strategy', label: 'Strategy & OKRs', icon: Target, perm: 'objectives:read' }, { to: '/portfolio', label: 'Portfolio', icon: Layers3, perm: 'portfolios:read' }, { to: '/demand', label: 'Demand & intake', icon: Inbox, perm: 'requests:read' }, { to: '/programmes', label: 'Programmes', icon: Network, perm: 'programmes:read' }] },
  { group: 'Delivery', items: [{ to: '/projects', label: 'Projects', icon: Briefcase, perm: 'projects:read' }, { to: '/raid', label: 'RAID', icon: ShieldAlert, perm: 'risks:read' }, { to: '/changes', label: 'Change control', icon: GitPullRequestArrow, perm: 'change_requests:read' }, { to: '/quality', label: 'Quality & release', icon: Rocket, perm: 'releases:read' }] },
  { group: 'Product', items: [{ to: '/products', label: 'Products', icon: Boxes, perm: 'products:read' }, { to: '/discovery', label: 'Discovery & ideas', icon: Lightbulb, perm: 'ideas:read' }] },
  { group: 'Operations', items: [{ to: '/operations', label: 'Operational work', icon: Wrench, perm: 'work_items:read' }, { to: '/resilience', label: 'BIA & resilience', icon: Activity, perm: 'bia_assessments:read' }, { to: '/processes', label: 'Processes', icon: Workflow, perm: 'business_processes:read' }] },
  { group: 'Enablers', items: [{ to: '/finance', label: 'Finance & benefits', icon: Wallet, perm: 'budgets:read' }, { to: '/resources', label: 'Resources', icon: Users, perm: 'resource_allocations:read' }, { to: '/vendors', label: 'Vendors & contracts', icon: Handshake, perm: 'vendors:read' }, { to: '/documents', label: 'Documents', icon: FileText, perm: 'documents:read' }] },
  { group: 'Governance', items: [{ to: '/governance', label: 'Governance & audit', icon: Scale }, { to: '/architecture', label: 'Architecture', icon: Building2, perm: 'applications:read' }, { to: '/ai', label: 'AI intelligence', icon: Sparkles, perm: 'ai:use' }, { to: '/admin', label: 'Administration', icon: Settings }] },
];

export function BrandMark({ size = 30 }: { size?: number }) {
  return <div className="brand-mark" style={{ width: size, height: size }} aria-hidden><svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none"><path d="M3 18 L9 6 L12 12 L15 6 L21 18" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="1.8" fill="#fff" /></svg></div>;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const { can } = useSession();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<any[]>([]); const [i, setI] = useState(0);
  useEscape(onClose);
  const pages = useMemo(() => NAV.flatMap((g) => g.items).filter((it) => !it.perm || can(it.perm)), [can]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api.get(`/api/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])), 180);
    return () => clearTimeout(t);
  }, [q]);
  const pageHits = pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).map((p) => ({ kind: 'page', ...p }));
  const all = [...pageHits, ...hits.map((h) => ({ kind: 'record', ...h }))];
  const go = (x: any) => { onClose(); x.kind === 'page' ? nav(x.to) : nav(recordPath(x.resource, x.id)); };
  return (<>
    <div className="scrim" onClick={onClose} />
    <div className="modal" role="dialog" aria-modal="true" aria-label="Search and navigate" style={{ top: '10vh' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }} className="row"><Search size={16} color="var(--text-3)" />
        <input autoFocus className="input" style={{ border: 'none', boxShadow: 'none' }} placeholder="Search records, codes (e.g. PRJ-0002) or jump to a page…" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(all.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); } if (e.key === 'Enter' && all[i]) go(all[i]); }} aria-label="Search" /></div>
      <div className="palette-list" role="listbox">
        {all.length === 0 && <div className="small muted" style={{ padding: 12 }}>{q.length < 2 ? 'Type at least 2 characters. Results respect your permissions.' : 'No matches.'}</div>}
        {all.map((x: any, k) => (
          <div key={x.kind + (x.id ?? x.to)} role="option" aria-selected={k === i} className={`palette-item ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => go(x)}>
            {x.kind === 'page' ? <><x.icon size={16} /><span>{x.label}</span><span className="badge" style={{ marginLeft: 'auto' }}>Page</span></> : <><span className="mono muted" style={{ minWidth: 84 }}>{x.code}</span><span>{x.name}</span><span className="badge" style={{ marginLeft: 'auto' }}>{x.label}</span></>}
          </div>))}
      </div>
    </div>
  </>);
}

export function recordPath(resource: string, id: string) {
  const map: Record<string, string> = { projects: '/projects/', products: '/products/', bia_assessments: '/resilience/bia/', portfolios: '/portfolio?pf=' };
  return map[resource] ? `${map[resource]}${id}` : `/r/${resource}?open=${id}`;
}

function Notifications({ onClose }: { onClose: () => void }) {
  const { data, reload } = useApi<any[]>('/api/notifications');
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }; setTimeout(() => window.addEventListener('click', h)); return () => window.removeEventListener('click', h); }, [onClose]);
  return (
    <div className="popover" ref={ref} role="dialog" aria-label="Notifications">
      <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}><h3>Notifications</h3><button className="btn sm ghost" onClick={async () => { await api.post('/api/notifications/read-all'); reload(); }}>Mark all read</button></div>
      {!data?.length ? <div className="small muted" style={{ padding: 14 }}>You're all caught up.</div> : data.slice(0, 30).map((n) => (
        <button key={n.id} className="palette-item" style={{ width: '100%', border: 'none', background: n.read_at ? 'transparent' : 'var(--brand-50)', textAlign: 'left', borderRadius: 0, font: 'inherit', color: 'inherit' }}
          onClick={async () => { await api.post(`/api/notifications/${n.id}/read`); onClose(); if (n.link) nav(n.link); }}>
          <Bell size={14} /><div style={{ flex: 1 }}><div className="small strong">{n.title}</div>{n.body && <div className="tiny muted">{n.body}</div>}<div className="tiny muted">{fmtDateTime(n.created_at)}</div></div>
        </button>))}
    </div>
  );
}

const QUICK = ['work_items', 'risks', 'issues', 'ideas', 'change_requests', 'projects', 'products', 'decisions'];
function QuickCreate({ onClose }: { onClose: () => void }) {
  const { meta } = useSession();
  const [key, setKey] = useState<string | null>(null);
  const m = key ? meta.get(key) : null;
  return (
    <Drawer title={m ? `New ${m.label.toLowerCase()}` : 'Quick create'} onClose={onClose}>
      {!m ? <div className="grid g2">{QUICK.filter((k) => meta.get(k)?.canWrite).map((k) => <button key={k} className="btn" style={{ height: 52, justifyContent: 'flex-start' }} onClick={() => setKey(k)}><Plus size={14} />{meta.get(k)!.label}</button>)}</div>
        : <RecordForm meta={m} onCancel={() => setKey(null)} onSaved={onClose} />}
    </Drawer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, can, logout } = useSession();
  const [collapsed, setCollapsed] = useLocal('pmo.sidebar.collapsed', false);
  const [theme, setTheme] = useLocal<'light' | 'dark'>('pmo.theme', 'light');
  const [palette, setPalette] = useState(false); const [notif, setNotif] = useState(false); const [quick, setQuick] = useState(false); const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  const { data: notes, reload } = useApi<any[]>('/api/notifications', [loc.pathname]);
  const unread = (notes ?? []).filter((n) => !n.read_at).length;
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { setMobile(false); }, [loc.pathname]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <nav className="sidebar" aria-label="Main">
        <div className="brand"><BrandMark /><div className="brand-text">Meridian<small>Enterprise delivery platform</small></div></div>
        {NAV.map((g) => {
          const items = g.items.filter((it) => !it.perm || can(it.perm));
          if (!items.length) return null;
          return <div key={g.group} className="nav-group"><div className="nav-label">{g.group}</div>{items.map((it) => <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={it.label}><it.icon size={17} /><span className="nav-text">{it.label}</span></NavLink>)}</div>;
        })}
        <div style={{ flex: 1 }} />
        <button className="nav-item" style={{ border: 'none', background: 'none', cursor: 'pointer', font: 'inherit' }} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}<span className="nav-text">Collapse</span></button>
      </nav>
      <div className="main">
        {me?.organisation.is_synthetic && <div className="synthetic-banner" role="note">SYNTHETIC DEMONSTRATION DATA – {me.organisation.name}. Not for production decisions.</div>}
        <header className="topbar">
          <button className="icon-btn" style={{ display: 'none' }} id="mnav" onClick={() => setMobile(!mobile)} aria-label="Open navigation"><Menu size={18} /></button>
          <style>{`@media (max-width: 760px){#mnav{display:grid!important}}`}</style>
          <button className="search-btn" onClick={() => setPalette(true)} aria-label="Search (Ctrl+K)"><Search size={15} /><span className="hide-sm">Search projects, products, risks, people…</span><kbd className="hide-sm">Ctrl K</kbd></button>
          <div style={{ flex: 1 }} />
          <button className="btn primary sm" onClick={() => setQuick(true)}><Plus size={14} /><span className="hide-sm">Create</span></button>
          <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setNotif(!notif); }} aria-label={`Notifications (${unread} unread)`}><Bell size={17} />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}</button>
            {notif && <Notifications onClose={() => { setNotif(false); reload(); }} />}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="avatar" title={me?.name}>{initials(me?.name ?? '?')}</div>
            <div className="hide-sm" style={{ lineHeight: 1.2 }}><div className="small strong">{me?.name}</div><div className="tiny muted">{me?.roles.map((r) => r.replace(/_/g, ' ')).join(', ')}</div></div>
            <button className="icon-btn" onClick={logout} aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="content" key={loc.pathname} id="main">{children}</main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {quick && <QuickCreate onClose={() => setQuick(false)} />}
    </div>
  );
}

export const Icons = { Gauge, Compass, CalendarRange, ClipboardCheck, Landmark };
