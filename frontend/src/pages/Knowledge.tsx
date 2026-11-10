import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bot, CheckCircle2, FileText, Play, RefreshCw, Send, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtDateTime, fmtMoney, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, Note, PageHead, Status, Tabs, useToast, errMsg } from '../components/ui';
import { DataTable, RecordDrawer, RefSelect, AuditList } from '../components/resource';
import { ApprovalCard } from '../components/workflow';
import { BarsChart, ChartFrame } from '../components/charts';
import { AiIntake, OrgSettings } from './Frs';

/** Minimal, XSS-safe markdown renderer (escape first, then a small subset of syntax). */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>').replace(/⚠ MISSING([^|<]*)/g, '<span class="missing">⚠ MISSING$1</span>');
    const lines = text.split('\n'); const out: string[] = []; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith('|')) { const rows: string[] = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]); const cells = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim()); out.push('<table><thead><tr>' + cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' + rows.slice(2).map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>'); continue; }
      if (l.startsWith('- ')) { const items: string[] = []; while (i < lines.length && lines[i].startsWith('- ')) items.push(`<li>${inline(lines[i++].slice(2))}</li>`); out.push(`<ul>${items.join('')}</ul>`); continue; }
      if (/^\d+\. /.test(l)) { const items: string[] = []; while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\d+\. /, ''))}</li>`); out.push(`<ol>${items.join('')}</ol>`); continue; }
      if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`); else if (l.startsWith('# ')) out.push(`<h1>${inline(l.slice(2))}</h1>`); else if (l.startsWith('---')) out.push('<hr/>'); else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
      i++;
    }
    return out.join('');
  }, [text]);
  return <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />;
}

function DocViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: versions } = useApi<any[]>(`/api/documents/${id}/versions`);
  const [v, setV] = useState<number | null>(null);
  useEffect(() => { if (versions?.length && v === null) setV(versions[0].version); }, [versions, v]);
  const { data: ver } = useApi<any>(v ? `/api/documents/${id}/versions/${v}` : null, [v]);
  return <RecordDrawer resource="documents" id={id} onClose={onClose} extra={() => (
    <div style={{ marginBottom: 16 }}>
      {!versions ? <LoadingBlock /> : !versions.length ? <Empty title="No content yet" /> : (<>
        <div className="row wrap" style={{ marginBottom: 10 }}>{versions.map((x) => <button key={x.version} className={`btn sm ${x.version === v ? 'primary' : ''}`} onClick={() => setV(x.version)}>v{x.version}{x.generated ? ' · generated' : ''}</button>)}</div>
        {ver && (<>
          {ver.missing_fields?.length > 0 && <Note warn>{ver.missing_fields.length} item(s) are missing in the source records: {ver.missing_fields.join('; ')}. The document does not invent them.</Note>}
          <div className="card pad" style={{ marginTop: 10, maxHeight: '55vh', overflow: 'auto' }}><Markdown text={ver.content} /></div>
          <div className="tiny muted" style={{ marginTop: 6 }}>Version {ver.version} · {fmtDateTime(ver.created_at)} · sources: {(ver.source_refs ?? []).map((s: any) => s.code).slice(0, 20).join(', ')}</div>
        </>)}
      </>)}
    </div>
  )} />;
}

export function DocumentsPage() {
  const [sp, setSp] = useSearchParams();
  const toast = useToast(); const { can } = useSession();
  const open = sp.get('open');
  const [g, setG] = useState<{ doc_type: string; context_type: string; context_id: string | null; record_id: string | null }>({ doc_type: 'status_report', context_type: 'project', context_id: null, record_id: null });
  const [k, setK] = useState(0);
  const needsRecord: Record<string, string> = { bia_report: 'bia_assessments', business_case: 'business_cases', release_readiness: 'releases' };
  const generate = async () => {
    try { const r = await api.post('/api/documents/generate', { doc_type: g.doc_type, ...(g.context_id ? { context_type: g.context_type, context_id: g.context_id } : {}), ...(g.record_id ? { record_id: g.record_id } : {}) }); toast(`${r.title} v${r.version} generated – ${r.missing_fields.length} gap(s) flagged`); setK(k + 1); setSp({ open: r.document_id }); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (<>
    <PageHead title="Documents & knowledge" sub="Documents are generated from structured records with source citations; missing information is flagged, never invented. Versioned, classified and approved through workflow." />
    {can('documents:write') && <Card title={<span className="row"><FileText size={16} />Generate from platform data</span>}>
      <div className="row wrap">
        <select className="input" style={{ width: 200 }} value={g.doc_type} onChange={(e) => setG({ ...g, doc_type: e.target.value, record_id: null })} aria-label="Document type">{['project_charter', 'status_report', 'raid_report', 'closure_report', 'bia_report', 'business_case', 'release_readiness'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        {needsRecord[g.doc_type] ? <div style={{ width: 320 }}><RefSelect resource={needsRecord[g.doc_type]} value={g.record_id} onChange={(v) => setG({ ...g, record_id: v })} placeholder="Select source record…" /></div>
          : <><select className="input" style={{ width: 140 }} value={g.context_type} onChange={(e) => setG({ ...g, context_type: e.target.value, context_id: null })} aria-label="Context type" disabled={g.doc_type !== 'raid_report'}>{['project', 'product', 'programme', 'portfolio'].map((t) => <option key={t}>{t}</option>)}</select>
            <div style={{ width: 320 }}><RefSelect resource={`${g.context_type}s`} value={g.context_id} onChange={(v) => setG({ ...g, context_id: v })} placeholder={`Select ${g.context_type}…`} /></div></>}
        <button className="btn primary" disabled={!(g.context_id || g.record_id)} onClick={generate}><Sparkles size={14} />Generate draft</button>
      </div>
    </Card>}
    <div style={{ height: 14 }} />
    <DataTable resource="documents" refreshKey={k} onOpen={(r) => setSp({ open: r.id })} />
    {open && <DocViewer id={open} onClose={() => setSp({})} />}
  </>);
}

export function GovernancePage() {
  const { can } = useSession();
  const [tab, setTab] = useState('inbox');
  const mine = useApi<any[]>('/api/approvals?scope=mine');
  const all = useApi<any[]>(can('approvals:read') ? '/api/approvals?status=pending' : null);
  const verify = useApi<any>(can('audit:read') && tab === 'audit' ? '/api/audit/verify' : null, [tab]);
  const metrics = useApi<any[]>('/api/meta/metrics');
  return (<>
    <PageHead title="Governance, compliance & audit" sub="Approvals with delegated authority, decision register, controls, obligations and findings, and a tamper-evident audit trail." />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'inbox', label: `My approvals${mine.data ? ` (${mine.data.length})` : ''}` }, { key: 'pending', label: 'All pending' }, { key: 'decisions', label: 'Decision register' }, { key: 'controls', label: 'Controls' }, { key: 'obligations', label: 'Obligations' }, { key: 'findings', label: 'Audit findings' }, { key: 'metrics', label: 'Metric definitions' }, { key: 'audit', label: 'Audit trail' }]} />
    {tab === 'inbox' && (mine.loading ? <LoadingBlock /> : mine.error ? <ErrorBox error={mine.error} /> : mine.data!.length ? <div className="grid g2">{mine.data!.map((a) => <ApprovalCard key={a.id} a={a} onDone={() => { mine.reload(); all.reload(); }} />)}</div> : <Empty title="No approvals waiting for you" art="search">Approvals are routed to your roles by the delegated-authority matrix.</Empty>)}
    {tab === 'pending' && (!can('approvals:read') ? <Empty title="Not permitted" /> : all.loading ? <LoadingBlock /> : <div className="grid g2">{(all.data ?? []).map((a) => <ApprovalCard key={a.id} a={a} onDone={all.reload} />)}</div>)}
    {tab === 'decisions' && <DataTable resource="decisions" />}
    {tab === 'controls' && <div className="col" style={{ gap: 14 }}><Note>Mapping a control to a framework reference (e.g. ISO/IEC 27001 Annex A) records intent only – it is not a claim of certification or compliance.</Note><DataTable resource="controls" /></div>}
    {tab === 'obligations' && <DataTable resource="obligations" />}
    {tab === 'findings' && <DataTable resource="audit_findings" />}
    {tab === 'metrics' && <Card title="Metric definitions" sub="Every dashboard metric: formula, source data, refresh frequency and owner" bodyClass=""><div className="table-wrap"><table className="data"><thead><tr><th>Metric</th><th>Formula</th><th>Source</th><th>Refresh</th><th>Owner</th></tr></thead><tbody>{(metrics.data ?? []).map((m) => <tr key={m.key}><td><b>{m.name}</b><div className="mono tiny muted">{m.key}</div></td><td className="small">{m.formula}</td><td className="small">{m.source_data}</td><td className="small">{m.refresh}</td><td>{label(m.owner_role)}</td></tr>)}</tbody></table></div></Card>}
    {tab === 'audit' && (!can('audit:read') ? <Empty title="Audit trail requires the auditor or administrator role" /> : <div className="col" style={{ gap: 14 }}>
      {verify.data && <div className={`note ${verify.data.intact ? '' : 'warn'}`}><div className="row">{verify.data.intact ? <ShieldCheck size={16} color="var(--good)" /> : <XCircle size={16} />}<b>{verify.data.intact ? 'Hash chain intact' : `Chain broken at event ${verify.data.first_broken_event}`}</b><span>· {verify.data.events} events verified · audit table is append-only at database level</span><button className="btn sm" onClick={verify.reload}><RefreshCw size={14} />Re-verify</button></div></div>}
      <Card title="Latest events"><AuditList limit={200} /></Card></div>)}
  </>);
}

export function AiPage() {
  const toast = useToast();
  const { data: status } = useApi<any>('/api/ai/status');
  const { data: log, reload } = useApi<any[]>('/api/ai/interactions');
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<{ role: 'user' | 'ai'; text: string; a?: any }[]>([]);
  const [cap, setCap] = useState('portfolio_insights'); const [capId, setCapId] = useState<string | null>(null); const [notes, setNotes] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  const ask = async (text: string) => {
    if (!text.trim()) return; setBusy(true); setMsgs((m) => [...m, { role: 'user', text }]); setQ('');
    try { const a = await api.post('/api/ai/ask', { question: text }); setMsgs((m) => [...m, { role: 'ai', text: a.answer, a }]); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const runCap = async () => {
    setBusy(true);
    try { const a = await api.post(`/api/ai/analyse/${cap}`, { id: capId ?? undefined, text: cap === 'meeting_actions' ? notes : undefined }); setMsgs((m) => [...m, { role: 'user', text: `Run analysis: ${label(cap)}` }, { role: 'ai', text: a.answer, a }]); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const capRes: Record<string, string> = { project_insight: 'projects', risk_identification: 'projects', requirement_quality: 'requirements', release_readiness: 'releases' };
  const res = (c: any) => ({ projects: `/projects/${c.id}`, products: `/products/${c.id}`, bia_assessments: `/resilience/bia/${c.id}` } as any)[c.resource] ?? `/r/${c.resource}?open=${c.id}`;
  return (<>
    <PageHead title="AI intelligence centre" sub="A controlled assistant: permission-trimmed retrieval, cited answers, confidence indicators and full audit. It cannot approve, accept risk, change budgets or deploy." />
    <div className="grid g-12">
      <div className="span-8"><Card title={<span className="row"><Bot size={16} />Assistant</span>} sub={status ? `Provider: ${status.active} (${status.model})${status.external_transmission ? ' · external model – confidential records excluded' : ' · no data leaves the platform'}` : ''}>
        {status?.note && <Note>{status.note}</Note>}
        <div className="chat" style={{ minHeight: 320, maxHeight: '58vh', overflowY: 'auto', padding: '12px 0' }} aria-live="polite">
          {!msgs.length && <div className="chip-row">{['What are the top risks on the payments migration?', 'Which projects are off track?', 'Show BIA for card payment authorisation', 'PRJ-0005'].map((s) => <button key={s} className="btn sm" onClick={() => ask(s)}>{s}</button>)}</div>}
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}
            {m.a && <div style={{ marginTop: 8 }}>{m.a.citations.map((c: any) => <button key={c.id} className="cite" style={{ border: 'none', cursor: 'pointer' }} onClick={() => nav(res(c))}>{c.code}</button>)}
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}><span className={`badge ${m.a.confidence === 'high' ? 'good' : m.a.confidence === 'medium' ? 'warn' : 'unknown'}`}>Confidence {m.a.confidence}</span><span className="badge">{m.a.provider} · {m.a.model}</span>{m.a.injection_flags?.length > 0 && <span className="badge crit">Prompt-injection pattern flagged</span>}</div>
              {m.a.suggestions?.length > 0 && <div className="small" style={{ marginTop: 6 }}>{m.a.suggestions.map((s: any, k: number) => <div key={k}>• {s.name}{s.owner_hint ? ` (owner: ${s.owner_hint})` : ''}{s.due_date ? ` – due ${s.due_date}` : ''}</div>)}<div className="tiny muted">Suggestions are not saved until a person accepts them in the relevant workspace.</div></div>}
              <div className="tiny muted" style={{ marginTop: 6 }}>{m.a.disclaimer}</div></div>}
          </div>)}
          {busy && <div className="msg ai"><span className="skeleton" style={{ display: 'inline-block', width: 160, height: 12 }} /></div>}
          <div ref={end} />
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input className="input" placeholder="Ask about projects, products, risks, BIA, finance… (answers cite records you can access)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" /><button className="btn primary" disabled={busy || !q.trim()}><Send size={14} />Ask</button></form>
      </Card></div>
      <div className="span-4 col" style={{ gap: 14 }}>
        <Card title="Guided analyses" sub="Deterministic, cited, no LLM required">
          <div className="col">
            <select className="input" value={cap} onChange={(e) => { setCap(e.target.value); setCapId(null); }} aria-label="Analysis">{['portfolio_insights', 'project_insight', 'risk_identification', 'requirement_quality', 'release_readiness', 'meeting_actions'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
            {capRes[cap] && <RefSelect resource={capRes[cap]} value={capId} onChange={setCapId} placeholder="Select record…" />}
            {cap === 'meeting_actions' && <textarea className="input" placeholder={'Paste minutes, e.g.\nAction: Ravi to confirm vendor fix by 2026-11-20'} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Meeting notes" />}
            <button className="btn primary" disabled={busy || (!!capRes[cap] && !capId) || (cap === 'meeting_actions' && !notes.trim())} onClick={runCap}><Play size={14} />Run analysis</button>
          </div>
        </Card>
        <Card title="Controls in force">
          <div className="col small">{['Human approval for every consequential action', 'No automatic financial approval, risk acceptance or deployment (server-enforced)', 'Retrieval uses your permissions; restricted records excluded', 'Confidential records never sent to external models', 'Citations + confidence on every answer', 'Prompt-injection detection on question and retrieved content', 'Token usage & cost logged per interaction', `Monthly token budget: ${status?.monthly_token_budget?.toLocaleString() ?? '—'}`].map((t) => <div key={t} className="row" style={{ alignItems: 'flex-start' }}><CheckCircle2 size={14} color="var(--good)" style={{ marginTop: 2, flex: 'none' }} />{t}</div>)}</div>
        </Card>
      </div>
      <div className="span-12"><Card title="Interaction log" sub="Audited AI usage" bodyClass=""><div className="table-wrap"><table className="data"><thead><tr><th>When</th><th>User</th><th>Capability</th><th>Prompt</th><th>Provider</th><th>Confidence</th><th className="num">Tokens</th><th>External</th><th>Flags</th></tr></thead>
        <tbody>{(log ?? []).slice(0, 25).map((l) => <tr key={l.id}><td className="small">{fmtDateTime(l.created_at)}</td><td>{l.user_name}</td><td>{label(l.capability)}</td><td className="small" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.prompt}</td><td className="small">{l.provider}/{l.model}</td><td><Status v={l.confidence === 'high' ? 'approved' : l.confidence === 'medium' ? 'pending' : 'draft'} /></td><td className="num">{l.tokens_in + l.tokens_out}</td><td>{l.external_transmission ? 'Yes' : 'No'}</td><td>{l.injection_flags.length ? <span className="badge crit">{l.injection_flags.length}</span> : '—'}</td></tr>)}</tbody></table></div></Card></div>
      <div className="span-12"><AiIntake /></div>
    </div>
  </>);
}

export function VendorsPage() {
  const { data } = useApi<any>('/api/r/contracts?pageSize=200');
  const rows = (data?.data ?? []).filter((c: any) => c.days_to_expiry !== null).sort((a: any, b: any) => a.days_to_expiry - b.days_to_expiry);
  const [tab, setTab] = useState('contracts');
  return (<>
    <PageHead title="Vendors, procurement & contracts" sub="Due diligence, contract register with renewal alerts, SLAs, vendor risk and performance, purchase approvals and exit plans." />
    <div className="grid g-12" style={{ marginBottom: 14 }}>
      <div className="span-7"><ChartFrame title="Contract expiry runway" sub="Days to contract end · negative = expired" height={240} empty={!rows.length} table={{ headers: ['Contract', 'Vendor', 'End', 'Days'], rows: rows.map((c: any) => [c.name, c._refs.vendor_id?.name ?? '', c.end_date, c.days_to_expiry]) }}>
        <BarsChart horizontal data={rows.map((c: any) => ({ name: c.name, d: c.days_to_expiry }))} x="name" series={[{ key: 'd', name: 'Days to expiry' }]} />
      </ChartFrame></div>
      <div className="span-5"><Card title="Renewal attention">{rows.filter((c: any) => c.days_to_expiry < c.renewal_notice_days).map((c: any) => <div key={c.id} className="list-row"><span className={`badge ${c.days_to_expiry < 0 ? 'crit' : 'warn'}`}>{c.days_to_expiry < 0 ? 'Expired' : `${c.days_to_expiry}d`}</span><span style={{ flex: 1 }}>{c.name}</span><span className="small muted">{c._refs.vendor_id?.name}</span><span className="num small">{fmtMoney(c.contract_value, c.currency)}</span></div>)}</Card></div>
    </div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'contracts', label: 'Contracts' }, { key: 'vendors', label: 'Vendors' }, { key: 'pr', label: 'Purchase requests' }, { key: 'inv', label: 'Invoices' }, { key: 'tenders', label: 'Tenders & bids' }, { key: 'cms', label: 'Contract milestones' }, { key: 'reviews', label: 'Vendor reviews' }]} />
    {tab === 'tenders' && <div className="col" style={{ gap: 14 }}><DataTable resource="tenders" /><DataTable resource="tender_bids" /></div>}{tab === 'cms' && <DataTable resource="contract_milestones" />}{tab === 'reviews' && <DataTable resource="vendor_reviews" />}
    {tab === 'contracts' && <DataTable resource="contracts" />}{tab === 'vendors' && <DataTable resource="vendors" />}{tab === 'pr' && <DataTable resource="purchase_requests" />}{tab === 'inv' && <DataTable resource="invoices" />}
  </>);
}

export function ArchitecturePage() {
  const [tab, setTab] = useState('apps');
  const { data } = useApi<any>('/api/r/applications?pageSize=200');
  const byHost = Object.entries((data?.data ?? []).reduce((a: any, x: any) => { a[x.hosting ?? 'unknown'] = (a[x.hosting ?? 'unknown'] ?? 0) + 1; return a; }, {})).map(([k, v]) => ({ name: label(k), n: v as number }));
  return (<>
    <PageHead title="Enterprise architecture & technology governance" sub="Application portfolio, hosting inventory, end-of-life tracking and architecture decision records." />
    <div className="grid g-12" style={{ marginBottom: 14 }}><div className="span-5"><ChartFrame title="Hosting mix" height={180} empty={!byHost.length} table={{ headers: ['Hosting', 'Applications'], rows: byHost.map((h: any) => [h.name, h.n]) }}><BarsChart data={byHost} x="name" series={[{ key: 'n', name: 'Applications' }]} /></ChartFrame></div>
      <div className="span-7"><Card title="End-of-life watch">{(data?.data ?? []).filter((a: any) => a.end_of_life_date).map((a: any) => <div key={a.id} className="list-row"><span className="badge warn">EOL {fmtDate(a.end_of_life_date)}</span><b>{a.name}</b><span className="small muted">{a._refs.product_id?.name}</span></div>)}{!(data?.data ?? []).some((a: any) => a.end_of_life_date) && <Empty title="No end-of-life dates recorded" />}</Card></div></div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'apps', label: 'Applications' }, { key: 'adr', label: 'Architecture decisions' }, { key: 'env', label: 'Environments' }]} />
    {tab === 'apps' && <DataTable resource="applications" />}{tab === 'adr' && <DataTable resource="architecture_decisions" />}{tab === 'env' && <DataTable resource="environments" />}
  </>);
}

export function ResourcePage() {
  const { key } = useParams(); const [sp, setSp] = useSearchParams(); const { meta } = useSession();
  const m = meta.get(key!);
  if (!m) return <Empty title="Not found or not permitted" />;
  return (<>
    <PageHead title={m.plural} sub={m.description ?? `${m.module} module`} />
    <DataTable resource={key!} />
    {sp.get('open') && <RecordDrawer resource={key!} id={sp.get('open')!} onClose={() => setSp({})} />}
  </>);
}

export function AdminPage() {
  const { can, meta } = useSession(); const toast = useToast();
  const [tab, setTab] = useState('users');
  const roles = useApi<any[]>(can('admin:users') ? '/api/admin/roles' : null);
  const wfs = useApi<any[]>('/api/workflows/definitions');
  const rag = useApi<any[]>('/api/admin/rag-thresholds');
  const doa = useApi<any[]>('/api/admin/approval-matrix');
  const integ = useApi<any>(can('integrations:read') ? '/api/integrations' : null);
  const [user, setUser] = useState<string | null>(null);
  const userRoles = useApi<any[]>(user && can('admin:users') ? `/api/admin/users/${user}/roles` : null, [user]);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (userRoles.data) setSel(userRoles.data.map((r) => r.key)); }, [userRoles.data]);
  const [browse, setBrowse] = useState('departments');
  return (<>
    <PageHead title="Administration & configuration" sub="Organisation, users, roles and permissions, workflow templates, RAG thresholds, delegated authority, integrations and reference data – configuration, not code." />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Users & roles' }, { key: 'workflows', label: 'Workflows' }, { key: 'config', label: 'Thresholds & authority' }, { key: 'integrations', label: 'Integrations' }, { key: 'org', label: 'Locale & calendar' }, { key: 'data', label: 'Data browser' }]} />
    {tab === 'org' && <OrgSettings />}
    {tab === 'users' && <div className="grid g-12">
      <div className="span-7"><DataTable resource="users" /></div>
      <div className="span-5 col" style={{ gap: 14 }}>
        {can('admin:users') ? <Card title="Assign roles"><RefSelect resource="users" value={user} onChange={setUser} placeholder="Select user…" />
          {user && <div className="col" style={{ marginTop: 10 }}>{(roles.data ?? []).map((r) => <label key={r.id} className="check"><input type="checkbox" checked={sel.includes(r.key)} onChange={(e) => setSel(e.target.checked ? [...sel, r.key] : sel.filter((x) => x !== r.key))} /><b>{r.name}</b><span className="tiny muted">{r.description}</span></label>)}
            <button className="btn primary" onClick={async () => { try { await api.put(`/api/admin/users/${user}/roles`, { role_keys: sel }); toast('Roles updated'); } catch (e) { toast(errMsg(e), 'error'); } }}>Save roles</button></div>}</Card> : <Empty title="Role administration requires admin:users" />}
        <Card title="Roles" bodyClass=""><div className="table-wrap"><table className="data"><thead><tr><th>Role</th><th className="num">Members</th><th>Permissions</th></tr></thead><tbody>{(roles.data ?? []).map((r) => <tr key={r.id}><td><b>{r.name}</b></td><td className="num">{r.members}</td><td className="tiny mono" style={{ maxWidth: 260 }}>{r.permissions.slice(0, 6).join(' ')}{r.permissions.length > 6 ? ` +${r.permissions.length - 6}` : ''}</td></tr>)}</tbody></table></div></Card>
      </div></div>}
    {tab === 'workflows' && <div className="col" style={{ gap: 14 }}><Note>Workflow templates are versioned data. Saving a new version (POST /api/workflows/definitions) never changes in-flight instances. Criteria vocabulary: field:&lt;name&gt;, bia_screened, bia_approved_if_required, document_exists/approved:&lt;type&gt;, budget_approved, benefits_defined, risks_reviewed, no_open_critical_defects, test_pass_rate:&lt;pct&gt;, all_milestones_achieved, operational_handover, impact_assessments_complete.</Note>
      {(wfs.data ?? []).map((w) => <Card key={w.id} title={`${w.name} · v${w.version}`} sub={`${w.key} · applies to ${w.entity_type}`}><div className="row wrap" style={{ gap: 6 }}>{w.stages.map((s: any, i: number) => <span key={s.key} className="badge outline" title={[s.exit?.length ? `Exit: ${s.exit.join(', ')}` : '', s.approvals?.length ? `Approvals: ${s.approvals.map((a: any) => a.role).join(', ')}` : ''].filter(Boolean).join(' | ')}>{i + 1}. {s.name}{s.approvals?.length ? ' ✓' : ''}{s.exit?.length ? ` (${s.exit.length})` : ''}</span>)}</div></Card>)}</div>}
    {tab === 'config' && <div className="grid g2">
      <Card title="RAG thresholds" sub="Green must be stricter than amber" bodyClass=""><div className="table-wrap"><table className="data"><thead><tr><th>Metric</th><th>Direction</th><th className="num">Green at</th><th className="num">Amber at</th></tr></thead><tbody>{(rag.data ?? []).map((t) => <tr key={t.metric_key}><td className="mono">{t.metric_key}</td><td>{label(t.direction)}</td><td className="num">{t.green_at}</td><td className="num">{t.amber_at}</td></tr>)}</tbody></table></div></Card>
      <Card title="Delegated authority matrix" sub="Maximum amount a role may approve (blank = unlimited)" bodyClass=""><div className="table-wrap"><table className="data"><thead><tr><th>Approval type</th><th>Role</th><th className="num">Max amount</th></tr></thead><tbody>{(doa.data ?? []).map((d) => <tr key={d.id}><td>{label(d.approval_type)}</td><td>{label(d.role_key)}</td><td className="num">{d.max_amount === null ? 'Unlimited' : fmtMoney(d.max_amount, d.currency, false)}</td></tr>)}</tbody></table></div></Card>
    </div>}
    {tab === 'integrations' && (!integ.data ? <LoadingBlock /> : <div className="grid g2">{integ.data.integrations.map((i: any) => <Card key={i.id} title={i.name} sub={i.connector_info?.description} actions={<span className={`badge ${i.mode === 'live' ? 'good' : 'warn'}`}>{i.mode === 'live' ? 'LIVE' : 'MOCK'}</span>}>
      <div className="small muted">Secret reference: <span className="mono">{i.secret_ref}</span> (value never stored in the database) · last sync {fmtDateTime(i.last_sync_at)} · {i.last_status ?? 'never run'}</div>
      <div className="row" style={{ marginTop: 8 }}><span className="badge">{i.queued} queued</span><span className={`badge ${i.dead_letters ? 'crit' : ''}`}>{i.dead_letters} dead-letter</span><div style={{ flex: 1 }} />{can('integrations:write') && <button className="btn sm" onClick={async () => { try { const r = await api.post(`/api/integrations/${i.key}/test`, {}); toast(`Test: ${r.result.delivered} delivered (${i.mode})`); integ.reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>Send test event</button>}</div>
    </Card>)}</div>)}
    {tab === 'data' && <div className="col" style={{ gap: 14 }}><select className="input" style={{ maxWidth: 320 }} value={browse} onChange={(e) => setBrowse(e.target.value)} aria-label="Resource">{[...meta.values()].sort((a, b) => a.module.localeCompare(b.module)).map((m) => <option key={m.key} value={m.key}>{m.module} · {m.plural}</option>)}</select><DataTable key={browse} resource={browse} /></div>}
  </>);
}
export const _unused = { Kpi, Status, CheckCircle2 };
