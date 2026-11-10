import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Rocket, X } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtPct, initials, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, PageHead, Progress, Seg, Status, Tabs, useToast, errMsg } from '../components/ui';
import { DataTable, RecordDrawer } from '../components/resource';
import { BarsChart, ChartFrame, Donut, Heatmap, SERIES } from '../components/charts';
import { riskColor } from './CommandCentre';

const LANES = ['todo', 'in_progress', 'blocked', 'review', 'done'];
/** Kanban with drag-and-drop AND single-pointer/keyboard alternatives (WCAG 2.5.7). */
export function Board({ filters }: { filters: Record<string, string> }) {
  const toast = useToast(); const { meta } = useSession();
  const { data, error, loading, reload, setData } = useApi<any>(`/api/r/work_items?${qs({ ...filters, pageSize: 300, sort: 'board_rank:asc' })}`);
  const [over, setOver] = useState<string | null>(null); const [open, setOpen] = useState<string | null>(null);
  const canWrite = meta.get('work_items')?.canWrite;
  const move = async (item: any, status: string) => {
    if (item.status === status) return;
    const prev = data;
    setData({ ...data, data: data.data.map((w: any) => (w.id === item.id ? { ...w, status } : w)) });
    try { await api.patch(`/api/r/work_items/${item.id}`, { status, row_version: item.row_version }); reload(); } catch (e) { setData(prev); toast(errMsg(e), 'error'); }
  };
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <LoadingBlock />;
  return (<>
    <div className="board" role="list" aria-label="Work board" tabIndex={0}>
      {LANES.map((lane) => { const items = (data?.data ?? []).filter((w: any) => w.status === lane); return (
        <div key={lane} className={`lane ${over === lane ? 'over' : ''}`} role="listitem" aria-label={`${label(lane)} (${items.length})`}
          onDragOver={(e) => { e.preventDefault(); setOver(lane); }} onDragLeave={() => setOver(null)} onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData('text/plain'); const it = data.data.find((w: any) => w.id === id); if (it) move(it, lane); }}>
          <div className="lane-head"><span>{label(lane)}</span><span className="badge">{items.length}</span></div>
          {items.map((w: any) => { const i = LANES.indexOf(w.status); return (
            <div key={w.id} className="ticket" draggable={canWrite} onDragStart={(e) => e.dataTransfer.setData('text/plain', w.id)} onClick={() => setOpen(w.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(w.id)}>
              <div className="row between"><span className="mono tiny muted">{w.code}</span><Status v={w.priority} /></div>
              <div className="t-title">{w.name}</div>
              <div className="row between small muted"><span>{label(w.work_type)}{w.due_date ? ` · ${fmtDate(w.due_date)}` : ''}</span>{w._refs.assignee_id && <span className="avatar sm" title={w._refs.assignee_id.name}>{initials(w._refs.assignee_id.name)}</span>}</div>
              {canWrite && <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" style={{ width: 26, height: 26 }} disabled={i <= 0} onClick={() => move(w, LANES[i - 1])} aria-label={`Move ${w.code} to ${LANES[i - 1] ?? ''}`}><ArrowLeft size={13} /></button>
                <button className="icon-btn" style={{ width: 26, height: 26 }} disabled={i >= LANES.length - 1} onClick={() => move(w, LANES[i + 1])} aria-label={`Move ${w.code} to ${LANES[i + 1] ?? ''}`}><ArrowRight size={13} /></button></div>}
            </div>); })}
          {!items.length && <div className="tiny muted" style={{ textAlign: 'center', padding: 12 }}>Drop items here</div>}
        </div>); })}
    </div>
    {open && <RecordDrawer resource="work_items" id={open} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}

export function RaidPage() {
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState('risks');
  const { data } = useApi<any>('/api/r/risks?pageSize=500&status=open,monitoring');
  const filters: Record<string, string> = {};
  if (sp.get('likelihood')) filters.likelihood = sp.get('likelihood')!;
  if (sp.get('impact')) filters.impact = sp.get('impact')!;
  const risks = data?.data ?? [];
  const grid = (l: number, i: number) => risks.filter((r: any) => r.likelihood === l && r.impact === i).length;
  const byCat = Object.entries(risks.reduce((a: any, r: any) => { a[r.category] = (a[r.category] ?? 0) + 1; return a; }, {})).map(([k, v]) => ({ name: label(k), value: v as number }));
  return (<>
    <PageHead title="Risks, assumptions, issues & dependencies" sub="Enterprise, portfolio, project, product and service RAID in one register. Risk acceptance always requires human approval." />
    <div className="grid g-12" style={{ marginBottom: 14 }}>
      <div className="span-5"><Card title="Inherent risk heatmap" sub="Click a cell to filter the register">
        <Heatmap rows={['5', '4', '3', '2', '1']} cols={['1', '2', '3', '4', '5']} yTitle="Likelihood" xTitle="Impact" value={(r, c) => grid(5 - r, c + 1)} color={(v, r, c) => riskColor(5 - r, c + 1, v ?? 0)} cellText={(v) => v || ''}
          onCell={(r, c) => setSp({ likelihood: String(5 - r), impact: String(c + 1) })} />
        {(filters.likelihood) && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setSp({})}><X size={14} />Clear cell filter (L{filters.likelihood} × I{filters.impact})</button>}
      </Card></div>
      <div className="span-7"><ChartFrame title="Open risks by category" height={230} table={{ headers: ['Category', 'Open risks'], rows: byCat.map((c) => [c.name, c.value]) }}><BarsChart data={byCat} x="name" series={[{ key: 'value', name: 'Open risks' }]} /></ChartFrame></div>
    </div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'risks', label: 'Risks' }, { key: 'issues', label: 'Issues' }, { key: 'assumptions', label: 'Assumptions' }, { key: 'dependencies', label: 'Dependencies' }]} />
    {tab === 'risks' && <DataTable resource="risks" filters={filters} columns={[
      { key: 'code', label: 'ID', render: (r) => <span className="mono">{r.code}</span> }, { key: 'name', label: 'Risk', sortable: true }, { key: 'category', label: 'Category', render: (r) => label(r.category) },
      { key: 'score', label: 'Score', num: true, render: (r) => <span className="badge" style={{ background: riskColor(r.likelihood, r.impact, 1), color: 'var(--text)' }}>{r.score} · {label(r.rating)}</span> },
      { key: 'residual_score', label: 'Residual', num: true, render: (r) => r.residual_score ?? '—' }, { key: '_context', label: 'Belongs to', render: (r) => r._context?.code ? `${r._context.code} ${r._context.name}` : label(r.context_type) },
      { key: 'treatment', label: 'Treatment', render: (r) => <>{label(r.treatment)}{r.acceptance_status && <span className="badge" style={{ marginLeft: 4 }}>acceptance {r.acceptance_status}</span>}</> }, { key: 'owner_id', label: 'Owner', render: (r) => r._refs.owner_id?.name ?? '—' }, { key: 'status', label: 'Status', sortable: true },
    ]} />}
    {tab === 'issues' && <DataTable resource="issues" />}
    {tab === 'assumptions' && <DataTable resource="assumptions" />}
    {tab === 'dependencies' && <DataTable resource="dependencies" />}
  </>);
}

export function ChangesPage() {
  const { data } = useApi<any>('/api/r/impact_assessments?pageSize=500');
  const pending = (data?.data ?? []).filter((i: any) => i.status === 'pending');
  const byArea = Object.entries(pending.reduce((a: any, i: any) => { a[i.area] = (a[i.area] ?? 0) + 1; return a; }, {})).map(([k, v]) => ({ name: label(k), value: v as number }));
  return (<>
    <PageHead title="Change control" sub="Every change request automatically triggers the impact assessments it needs (schedule, cost, scope, risk, BIA, security, operations, vendor) before it can be decided." />
    <div className="grid g-12" style={{ marginBottom: 14 }}>
      <div className="span-4"><Kpi label="Impact assessments pending" value={pending.length} foot="Across all open change requests" /></div>
      <div className="span-8"><ChartFrame title="Pending assessments by area" height={160} empty={!byArea.length} table={{ headers: ['Area', 'Pending'], rows: byArea.map((b: any) => [b.name, b.value]) }}><BarsChart data={byArea} x="name" series={[{ key: 'value', name: 'Pending' }]} /></ChartFrame></div>
    </div>
    <DataTable resource="change_requests" />
    <div style={{ height: 14 }} />
    <DataTable resource="impact_assessments" title="Impact assessments" filters={{ status: 'pending' }} hideCreate />
  </>);
}

export function QualityPage() {
  const nav = useNavigate();
  const rel = useApi<any>('/api/r/releases?pageSize=100');
  const [sel, setSel] = useState<string | null>(null);
  const rr = useApi<any>(sel ? `/api/releases/${sel}/readiness` : null, [sel]);
  const toast = useToast(); const { can } = useSession();
  const [tab, setTab] = useState('releases');
  return (<>
    <PageHead title="Quality, release & service transition" sub="Test strategy → execution → defects → readiness → CAB → deployment → hypercare and operational handover. Production deployment is always a human decision." />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'releases', label: 'Release readiness' }, { key: 'plans', label: 'Test plans' }, { key: 'cases', label: 'Test cases' }, { key: 'runs', label: 'Executions' }, { key: 'defects', label: 'Defects' }, { key: 'deploy', label: 'Deployments' }, { key: 'envs', label: 'Environments' }]} />
    {tab === 'releases' && <div className="grid g-12">
      <div className="span-5"><Card title="Release calendar" bodyClass="">{rel.loading ? <div style={{ padding: 16 }}><LoadingBlock /></div> : <div className="stack-list">{(rel.data?.data ?? []).map((r: any) => (
        <button key={r.id} className="list-row" style={{ width: '100%', border: 'none', background: sel === r.id ? 'var(--brand-50)' : 'transparent', padding: '10px 16px', font: 'inherit', textAlign: 'left', color: 'inherit', cursor: 'pointer' }} onClick={() => setSel(r.id)}>
          <Rocket size={16} color="var(--brand)" /><div style={{ flex: 1 }}><b>{r.name}</b><div className="tiny muted">{r.code} · {r._refs.product_id?.name ?? '—'} · {fmtDate(r.planned_date)}</div></div><Status v={r.status} /><span className="badge">CAB {r.cab_status}</span>
        </button>))}</div>}</Card></div>
      <div className="span-7">{!sel ? <Card title="Readiness"><Empty title="Select a release" art="search">Readiness is computed live from tests, defects, plans, CAB and operational acceptance.</Empty></Card> : rr.loading || !rr.data ? <Card title="Readiness"><LoadingBlock /></Card> : (
        <Card title={`Readiness – ${rr.data.release.name}`} sub={rr.data.ready ? 'All mandatory checks pass' : 'Not ready – mandatory checks failing'} actions={<>
          <button className="btn sm" onClick={async () => { try { await api.post(`/api/releases/${sel}/submit-cab`); toast('Submitted to CAB'); rr.reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>Submit to CAB</button>
          {can('releases:deploy') && <button className="btn primary sm" disabled={!rr.data.ready} onClick={async () => { if (!confirm('Record production deployment? This is an audited human authorisation.')) return; try { await api.post(`/api/releases/${sel}/deploy`, {}); toast('Deployment recorded'); rr.reload(); rel.reload(); } catch (e) { toast(errMsg(e), 'error'); } }}><Rocket size={14} />Authorise deployment</button>}</>}>
          <div className="stack-list">{rr.data.checks.map((c: any) => <div key={c.key} className="list-row">{c.passed ? <Check size={16} color="var(--good)" /> : <X size={16} color="var(--crit)" />}<span style={{ flex: 1 }}>{c.label}{!c.mandatory && <span className="badge" style={{ marginLeft: 6 }}>advisory</span>}</span><span className="small muted">{c.detail}</span></div>)}</div>
          <div className="sep" />
          <h3 style={{ marginBottom: 8 }}>Test plans</h3>
          {rr.data.test_plans.map((t: any) => <div key={t.id} style={{ marginBottom: 10 }}><div className="row between small"><span><b>{t.code}</b> {t.name} <span className="badge">{label(t.test_level)}</span></span><span className="num">{t.passed}/{t.total} passed · threshold {t.pass_threshold_pct}%</span></div><Progress value={t.pass_rate} tone={t.meets_threshold ? 'good' : 'warn'} label={t.name} /></div>)}
          <button className="btn sm ghost" onClick={() => nav(`/r/releases?open=${sel}`)}>Open release record</button>
        </Card>)}</div>
    </div>}
    {tab === 'plans' && <DataTable resource="test_plans" />}
    {tab === 'cases' && <DataTable resource="test_cases" />}
    {tab === 'runs' && <DataTable resource="test_executions" />}
    {tab === 'defects' && <DataTable resource="defects" />}
    {tab === 'deploy' && <DataTable resource="deployments" />}
    {tab === 'envs' && <DataTable resource="environments" />}
  </>);
}

const OPS_TYPES = ['incident', 'service_request', 'problem', 'maintenance', 'infrastructure_change', 'application_change', 'security_remediation', 'compliance_action', 'recurring', 'service_improvement', 'bau'];
export function OperationsPage() {
  const [view, setView] = useState<'table' | 'board'>('table');
  const [type, setType] = useState('');
  const { data } = useApi<any>(`/api/r/work_items?pageSize=500&work_type=${OPS_TYPES.join(',')}`);
  const rows = (data?.data ?? []).filter((w: any) => !['done', 'cancelled'].includes(w.status));
  const byType = OPS_TYPES.map((t) => ({ name: label(t), value: rows.filter((w: any) => w.work_type === t).length })).filter((x) => x.value);
  const filters = { work_type: type || OPS_TYPES.join(',') };
  return (<>
    <PageHead title="Operational & service work" sub="Incidents, service requests, problems, maintenance, remediation and BAU. Linked to services, products or nothing at all – never forced into a project." actions={<Seg ariaLabel="View" value={view} onChange={setView} options={[{ key: 'table', label: 'Table' }, { key: 'board', label: 'Board' }]} />} />
    <div className="grid g-12" style={{ marginBottom: 14 }}>
      <div className="span-4"><ChartFrame title="Open work by type" height={200} empty={!byType.length} table={{ headers: ['Type', 'Open items'], rows: byType.map((b: any) => [b.name, b.value]) }}><Donut data={byType.map((b, i) => ({ ...b, color: SERIES[i % 8] }))} sub="open items" /></ChartFrame></div>
      <div className="span-8"><Card title="Filter"><div className="chip-row"><button className={`btn sm ${!type ? 'primary' : ''}`} onClick={() => setType('')}>All operational</button>{OPS_TYPES.map((t) => <button key={t} className={`btn sm ${type === t ? 'primary' : ''}`} onClick={() => setType(t)}>{label(t)}</button>)}</div></Card></div>
    </div>
    {view === 'table' ? <DataTable resource="work_items" filters={filters} createPreset={{ work_type: type || 'incident', context_type: 'service' }} /> : <Board filters={filters} />}
  </>);
}

export function MyWork() {
  const { me } = useSession();
  const { data: ap } = useApi<any[]>('/api/approvals?scope=mine');
  const { data: w } = useApi<any>(me ? `/api/r/work_items?assignee_id=${me.id}&status=todo,in_progress,blocked,review&pageSize=100` : null);
  const nav = useNavigate();
  return (<>
    <PageHead title={`My work`} sub="Everything assigned to you or awaiting your decision – across projects, products and operations." />
    <div className="grid g3" style={{ marginBottom: 14 }}>
      <Kpi label="Approvals awaiting me" value={ap?.length ?? '…'} foot={<button className="btn sm" onClick={() => nav('/governance')}>Open inbox</button>} />
      <Kpi label="Open work items" value={w?.total ?? '…'} foot={`${(w?.data ?? []).filter((x: any) => x.status === 'blocked').length} blocked`} />
      <Kpi label="Due in 7 days" value={(w?.data ?? []).filter((x: any) => x.due_date && Date.parse(x.due_date) < Date.now() + 7 * 864e5).length} />
    </div>
    {me && <Board filters={{ assignee_id: me.id }} />}
    {void fmtPct}{void Progress}
  </>);
}
