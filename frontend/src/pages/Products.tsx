import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Boxes, Users2 } from 'lucide-react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell, LabelList } from 'recharts';
import { useApi } from '../lib/hooks';
import { fmtDate, fmtNum, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, PageHead, Progress, Seg, Status, Tabs } from '../components/ui';
import { DataTable, RecordDrawer } from '../components/resource';
import { BarsChart, ChartFrame, Gantt, Ring } from '../components/charts';
import { FinanceTab } from './Projects';
import { IdeaClusters, ProductHealthPanel } from './Frs';
import { CommentsPanel } from '../components/panels';

const STAGES = ['concept', 'discovery', 'development', 'launch', 'growth', 'mature', 'decline', 'retired'];

export function ProductsList() {
  const nav = useNavigate();
  const { data, error, loading } = useApi<any>('/api/r/products?pageSize=200&sort=name:asc');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  return (<>
    <PageHead title="Product portfolio" sub="Products live across their whole lifecycle – independently of the projects that change them." actions={<Seg ariaLabel="View" value={view} onChange={setView} options={[{ key: 'cards', label: 'Cards' }, { key: 'table', label: 'Table' }]} />} />
    {view === 'table' ? <DataTable resource="products" onOpen={(r) => nav(`/products/${r.id}`)} /> : error ? <ErrorBox error={error} /> : loading || !data ? <LoadingBlock /> : (<>
      <Card title="Lifecycle distribution" sub="Products by lifecycle stage"><div className="row wrap" style={{ gap: 6 }}>{STAGES.map((s, i) => { const n = data.data.filter((p: any) => p.lifecycle_stage === s).length; return <div key={s} className="card pad" style={{ flex: '1 1 100px', boxShadow: 'none', borderTop: `3px solid ${i < 3 ? 'var(--s7)' : i < 6 ? 'var(--s1)' : 'var(--unknown)'}` }}><div className="tiny muted">{label(s)}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{n}</div></div>; })}</div></Card>
      <div className="grid g3" style={{ marginTop: 14 }}>{data.data.map((p: any) => (
        <div key={p.id} className="card pad" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={() => nav(`/products/${p.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/products/${p.id}`)}>
          <div className="row between"><div className="row"><div className="kpi" style={{ padding: 0 }}><div className="icon" style={{ position: 'static' }}><Boxes size={16} /></div></div><div><b>{p.name}</b><div className="tiny muted">{p.code} · {p.product_line}</div></div></div><Ring value={p.health_score} size={52} stroke={6} label="Health" color={p.health_score >= 75 ? 'var(--good)' : p.health_score >= 60 ? 'var(--warn)' : 'var(--crit)'} /></div>
          <div className="row wrap" style={{ gap: 6 }}><span className="badge brand">{label(p.lifecycle_stage)}</span><Status v={p.criticality} /><span className="badge">Owner: {p._refs.owner_id?.name ?? '—'}</span></div>
          <div className="small muted" style={{ minHeight: 36 }}>{p.vision ?? 'No vision recorded'}</div>
          <div className="row small" style={{ gap: 16 }}><span><Users2 size={13} /> {fmtNum(p.active_users)} users</span><span>NPS {p.nps ?? '—'}</span><span>Tech debt {p.tech_debt_score ?? '—'}</span></div>
        </div>))}</div>
    </>)}
  </>);
}

export function RiceMatrix({ ideas, onOpen }: { ideas: any[]; onOpen?: (i: any) => void }) {
  const pts = ideas.filter((i) => i.impact !== null && i.effort !== null).map((i) => ({ ...i, z: i.reach ?? 1 }));
  const missing = ideas.length - pts.length;
  return (
    <ChartFrame title="Value vs effort" sub={`Impact × effort, bubble = reach · ${missing} idea(s) not yet scored (excluded, not zero)`} height={280} empty={!pts.length} table={{ headers: ['Idea', 'Impact', 'Effort', 'Reach', 'Confidence', 'RICE'], rows: ideas.map((i) => [`${i.code} ${i.name}`, i.impact, i.effort, i.reach, i.confidence, i.rice_score]) }}>
      <div className="legend" style={{ marginBottom: 6 }}><span><i style={{ background: 'var(--s7)' }} />In discovery</span><span><i style={{ background: 'var(--s1)' }} />Validated / approved</span><span><i style={{ background: 'var(--unknown)' }} />Parked / rejected</span></div>
      <ResponsiveContainer height="90%">
        <ScatterChart margin={{ top: 12, right: 18, bottom: 18 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="effort" name="Effort" tickLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} label={{ value: 'Effort (person-months) →', position: 'insideBottom', offset: -10, fill: 'var(--text-3)', fontSize: 11 }} />
          <YAxis type="number" dataKey="impact" name="Impact" tickLine={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} width={34} label={{ value: 'Impact', angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 11 }} />
          <ZAxis type="number" dataKey="z" range={[60, 700]} />
          <Tooltip cursor={false} content={({ active, payload }: any) => active && payload?.length ? <div className="chart-tip"><div className="t">{payload[0].payload.code} {payload[0].payload.name}</div><div className="r"><span>RICE</span><b>{payload[0].payload.rice_score ?? '—'}</b></div><div className="r"><span>Stage</span><b>{label(payload[0].payload.stage)}</b></div></div> : null} />
          <Scatter data={pts} onClick={onOpen ? (d: any) => onOpen(d.payload ?? d) : undefined} style={{ cursor: 'pointer' }}>
            {pts.map((p, i) => <Cell key={i} fill={['new', 'assessing', 'discovery'].includes(p.stage) ? 'var(--s7)' : ['validated', 'approved', 'in_delivery'].includes(p.stage) ? 'var(--s1)' : 'var(--unknown)'} fillOpacity={0.75} stroke="var(--surface)" strokeWidth={2} />)}
            <LabelList dataKey="code" position="top" style={{ fill: 'var(--text-2)', fontSize: 10 }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const FUNNEL = ['new', 'assessing', 'discovery', 'validated', 'approved', 'in_delivery'];
export function DiscoveryFunnel({ ideas }: { ideas: any[] }) {
  const max = Math.max(1, ...FUNNEL.map((s) => ideas.filter((i) => i.stage === s).length));
  return (<Card title="Discovery funnel" sub="Ideas by stage · parked/rejected excluded">
    <div className="col" style={{ gap: 6 }}>{FUNNEL.map((s, k) => { const n = ideas.filter((i) => i.stage === s).length; return (
      <div key={s} className="row" style={{ gap: 10 }}><span className="small" style={{ width: 90 }}>{label(s)}</span><div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><div style={{ width: `${Math.max(6, (n / max) * 100)}%`, height: 26, borderRadius: 6, background: ['var(--q200)', 'var(--q300)', 'var(--q400)', 'var(--q500)', 'var(--q600)', 'var(--q700)'][k], display: 'grid', placeItems: 'center', color: k > 1 ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 12, transition: 'width .6s' }}>{n}</div></div></div>); })}</div>
    <div className="tiny muted" style={{ marginTop: 8 }}>Parked: {ideas.filter((i) => i.stage === 'parked').length} · Rejected: {ideas.filter((i) => i.stage === 'rejected').length}</div>
  </Card>);
}

export function DiscoveryPage() {
  const { data } = useApi<any>('/api/r/ideas?pageSize=500');
  const [open, setOpen] = useState<string | null>(null);
  const ideas = data?.data ?? [];
  const top = [...ideas].filter((i) => i.rice_score !== null).sort((a, b) => b.rice_score - a.rice_score).slice(0, 8);
  return (<>
    <PageHead title="Product discovery & ideas" sub="Capture ideas and evidence, test hypotheses with experiments, prioritise with RICE / WSJF, and promote validated ideas to the roadmap." />
    <div className="grid g-12" style={{ marginBottom: 14 }}>
      <div className="span-4"><DiscoveryFunnel ideas={ideas} /></div>
      <div className="span-8"><RiceMatrix ideas={ideas} onOpen={(i) => setOpen(i.id)} /></div>
      <div className="span-12"><ChartFrame title="Top ideas by RICE score" sub="Reach × Impact × Confidence ÷ Effort" height={220} empty={!top.length} table={{ headers: ['Idea', 'RICE', 'WSJF'], rows: top.map((i) => [i.name, i.rice_score, i.wsjf_score]) }}><BarsChart horizontal data={top} x="name" series={[{ key: 'rice_score', name: 'RICE score' }]} onClick={(r) => setOpen(r.id)} /></ChartFrame></div>
    </div>
    <DataTable resource="ideas" columns={[{ key: 'code', label: 'ID', render: (r) => <span className="mono">{r.code}</span> }, { key: 'name', label: 'Idea', sortable: true }, { key: 'product_id', label: 'Product', render: (r) => r._refs.product_id?.name ?? '—' }, { key: 'source', label: 'Source', render: (r) => label(r.source) }, { key: 'stage', label: 'Stage', render: (r) => <Status v={r.stage} />, sortable: true }, { key: 'rice_score', label: 'RICE', num: true, render: (r) => r.rice_score ?? <span className="muted">not scored</span> }, { key: 'status', label: 'Status' }]} />
    <div style={{ marginTop: 14 }}><IdeaClusters /></div>
    <div className="grid g2" style={{ marginTop: 14 }}><DataTable resource="feedback" title="Customer feedback" pageSize={10} /><DataTable resource="experiments" title="Experiments" pageSize={10} /></div>
    {open && <RecordDrawer resource="ideas" id={open} onClose={() => setOpen(null)} />}
  </>);
}

export function ProductWorkspace() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/api/products/${id}/summary`);
  const [tab, setTab] = useState('overview');
  const [open, setOpen] = useState<{ r: string; id: string } | null>(null);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const p = data.product;
  const ctx = { context_type: 'product', context_id: p.id };
  const lanes = ['Now', 'Next', 'Later'];
  return (<>
    <PageHead crumbs={<><Link to="/products">Products</Link><span>/</span><span>{p.code}</span></>} title={p.name}
      sub={<span className="row wrap" style={{ gap: 8 }}><span className="badge brand">{label(p.lifecycle_stage)}</span><Status v={p.criticality} /><Status v={p.status} /><span className="small">Owner: {p._refs.owner_id?.name ?? '—'} · Line: {p.product_line ?? '—'}</span></span>}
      actions={<button className="btn" onClick={() => setOpen({ r: 'products', id: p.id })}>Product record & workflow</button>} />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <div className="card kpi"><div className="label">Product health</div><div className="row"><Ring value={p.health_score} label="Health" color={p.health_score >= 75 ? 'var(--good)' : p.health_score >= 60 ? 'var(--warn)' : 'var(--crit)'} /><div className="small muted">Tech debt {p.tech_debt_score ?? '—'}/100</div></div></div>
      <Kpi label="Adoption" value={fmtNum(p.active_users)} foot={`NPS ${p.nps ?? '—'} · active users`} />
      <Kpi label="Projects (lifetime)" value={data.projects.length} foot={`${data.projects.filter((x: any) => x.status === 'active').length} active · ${data.projects.filter((x: any) => x.status === 'closed').length} closed`} />
      <Kpi label="Resilience" value={data.bias.length ? `Tier ${data.bias[0].criticality_tier ?? '—'}` : '—'} foot={data.bias.length ? `${data.bias.length} BIA(s) · RTO ${data.bias[0].rto_hours ?? '—'}h` : 'No BIA recorded'} />
    </div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'roadmap', label: 'Roadmap' }, { key: 'discovery', label: 'Discovery' }, { key: 'delivery', label: 'Projects & releases' }, { key: 'ops', label: 'Operations' }, { key: 'reqs', label: 'Requirements' }, { key: 'finance', label: 'Financials' }, { key: 'risk', label: 'Risk & resilience' }, { key: 'health', label: 'Health, metrics & launch' }, { key: 'discuss', label: 'Comments' }]} />
    {tab === 'health' && <ProductHealthPanel product={p} />}
    {tab === 'discuss' && <Card title="Discussion"><CommentsPanel entityType="products" entityId={p.id} /></Card>}
    {tab === 'overview' && <div className="grid g2">
      <Card title="Vision & strategy"><dl className="kv"><dt>Vision</dt><dd>{p.vision ?? '—'}</dd><dt>Strategy</dt><dd>{p.strategy ?? '—'}</dd><dt>Target users</dt><dd>{p.target_users ?? '—'}</dd><dt>Pricing model</dt><dd>{p.pricing_model ?? '—'}</dd><dt>Objective</dt><dd>{p._refs.objective_id?.name ?? '—'}</dd><dt>Portfolio</dt><dd>{p._refs.portfolio_id?.name ?? '—'}</dd></dl></Card>
      <Card title="Lifecycle"><div className="row wrap" style={{ gap: 4 }}>{STAGES.map((s, i) => <span key={s} className={`badge ${s === p.lifecycle_stage ? 'brand' : STAGES.indexOf(p.lifecycle_stage) > i ? 'good' : ''}`}>{label(s)}</span>)}</div>
        <div className="sep" /><h3 style={{ marginBottom: 6 }}>Services provided</h3>{data.services.map((s: any) => <div key={s.id} className="list-row"><b>{s.code}</b>{s.name}<Status v={s.criticality} /></div>)}{!data.services.length && <div className="small muted">No services linked.</div>}</Card>
    </div>}
    {tab === 'roadmap' && <div className="col" style={{ gap: 14 }}>
      <div className="grid g3">{lanes.map((l) => <Card key={l} title={l} sub={`${data.roadmap.filter((r: any) => r.lane === l).length} items`}>{data.roadmap.filter((r: any) => r.lane === l).map((r: any) => <div key={r.id} className="ticket" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setOpen({ r: 'roadmap_items', id: r.id })}><div className="t-title">{r.name}</div><div className="row between small muted"><span>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</span><Status v={r.status} /></div><span className="badge">confidence {r.confidence}</span></div>)}</Card>)}</div>
      <Card title="Roadmap timeline"><Gantt rows={data.roadmap.map((r: any) => ({ id: r.id, label: r.name, sub: `${r.lane} · ${label(r.status)}`, start: r.start_date, end: r.end_date, progress: r.status === 'delivered' ? 100 : r.status === 'in_progress' ? 50 : 0, color: r.lane === 'Now' ? 'var(--s1)' : r.lane === 'Next' ? 'var(--s7)' : 'var(--s3)' }))} /></Card>
      <DataTable resource="roadmap_items" filters={{ product_id: p.id }} title="Roadmap items" pageSize={10} />
    </div>}
    {tab === 'discovery' && <div className="col" style={{ gap: 14 }}><div className="grid g2"><DiscoveryFunnel ideas={data.ideas} /><RiceMatrix ideas={data.ideas} onOpen={(i) => setOpen({ r: 'ideas', id: i.id })} /></div><DataTable resource="ideas" filters={{ product_id: p.id }} title="Ideas" /><div className="grid g2"><DataTable resource="feedback" filters={{ product_id: p.id }} title="Feedback" pageSize={8} /><DataTable resource="experiments" filters={{ product_id: p.id }} title="Experiments" pageSize={8} /></div></div>}
    {tab === 'delivery' && <div className="col" style={{ gap: 14 }}>
      <Card title="Projects changing this product" sub="Closing a project never closes the product">{data.projects.map((x: any) => <div key={x.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/projects/${x.id}`)}><span className="mono muted">{x.code}</span><b style={{ flex: 1 }}>{x.name}</b><span className="badge">{label(x.relationship)}</span><div style={{ width: 100 }}><Progress value={x.percent_complete} label="progress" /></div><Status v={x.status} /></div>)}{!data.projects.length && <Empty title="No projects linked" />}</Card>
      <DataTable resource="releases" filters={{ product_id: p.id }} title="Releases" /><DataTable resource="product_versions" filters={{ product_id: p.id }} title="Versions" pageSize={10} />
    </div>}
    {tab === 'ops' && <div className="col" style={{ gap: 14 }}><ChartFrame title="Open operational work" height={180} empty={!data.operational_work.length}><BarsChart data={data.operational_work.map((o: any) => ({ name: label(o.work_type), n: o.n }))} x="name" series={[{ key: 'n', name: 'Open items' }]} /></ChartFrame><DataTable resource="work_items" filters={ctx} title="Product work & BAU" /></div>}
    {tab === 'reqs' && <DataTable resource="requirements" filters={ctx} />}
    {tab === 'finance' && <FinanceTab ctxType="product" id={p.id} />}
    {tab === 'risk' && <div className="col" style={{ gap: 14 }}><Card title="Business impact analyses">{data.bias.map((b: any) => <div key={b.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/resilience/bia/${b.id}`)}><b>{b.code}</b><span style={{ flex: 1 }}>{b.name}</span><span className="small">MTPD {b.mtpd_hours ?? '—'}h · RTO {b.rto_hours ?? '—'}h · RPO {b.rpo_hours ?? '—'}h</span><span className="badge">Tier {b.criticality_tier ?? '—'}</span><Status v={b.status} /></div>)}{!data.bias.length && <Empty title="No BIA" />}</Card><DataTable resource="risks" filters={ctx} title="Product risks" /></div>}
    {open && <RecordDrawer resource={open.r} id={open.id} onClose={() => setOpen(null)} onChanged={reload} />}
  </>);
}
