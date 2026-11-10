import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { fmtDate, fmtMoney, fmtNum, fmtPct, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, PageHead, Progress, Rag, Seg, Tabs } from '../components/ui';
import { DataTable } from '../components/resource';
import { BarsChart, Bubble, ChartFrame, Donut, Heatmap, RAG_COLOR, Ring, SERIES, seqColor, seqText } from '../components/charts';
import { FinanceTab } from './Projects';
import { FinancePeriods } from './Frs';

export function StrategyPage() {
  const { data, error } = useApi<any>('/api/dashboard/executive');
  const [tab, setTab] = useState('map');
  return (<>
    <PageHead title="Strategy & OKRs" sub="Corporate objectives cascade to portfolios, products and projects. Progress is measured from key results – unmeasured key results are shown as no data." />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'map', label: 'Strategy map' }, { key: 'objectives', label: 'Objectives' }, { key: 'krs', label: 'Key results' }, { key: 'caps', label: 'Business capabilities' }]} />
    {tab === 'map' && (error ? <ErrorBox error={error} /> : !data ? <LoadingBlock /> : (
      <div className="grid g3">{data.objectives.map((o: any, i: number) => (
        <Card key={o.id} title={o.name} sub={`${o.code} · ${label(o.level)} · ${o.linked_projects} linked active projects`}>
          <div className="row" style={{ gap: 16, marginBottom: 12 }}><Ring size={88} value={o.progress_pct} color={SERIES[i % 8]} label={o.name} /><div className="small muted">Mean progress across {o.key_results.filter((k: any) => k.current !== null).length} measured key results.</div></div>
          {o.key_results.map((k: any) => { const p = k.target === k.baseline ? null : Math.max(0, Math.min(100, ((k.current - k.baseline) / (k.target - k.baseline)) * 100)); return (
            <div key={k.id} style={{ marginBottom: 10 }}><div className="row between small"><span>{k.name}</span><span className="num">{fmtNum(k.current, 2)} / {fmtNum(k.target, 2)} {k.unit}</span></div><Progress value={k.current === null ? null : p} tone="brand" label={k.name} /></div>); })}
        </Card>))}</div>))}
    {tab === 'objectives' && <DataTable resource="objectives" />}
    {tab === 'krs' && <DataTable resource="key_results" />}
    {tab === 'caps' && <DataTable resource="business_capabilities" />}
  </>);
}

export function PortfolioPage() {
  const nav = useNavigate();
  const { data: d, error } = useApi<any>('/api/dashboard/executive');
  const [tab, setTab] = useState('overview');
  if (error) return <ErrorBox error={error} />;
  if (!d) return <LoadingBlock rows={8} />;
  const cur = d.currency;
  const portfolios = [...new Set(d.projects.map((p: any) => p.portfolio))] as string[];
  const dims = ['schedule', 'cost', 'risk', 'milestones', 'overall'];
  const alloc = d.investment.map((i: any, k: number) => ({ name: i.name, value: i.approved_budget ?? 0, color: SERIES[k] }));
  return (<>
    <PageHead title="Enterprise portfolio" sub="Investment, alignment and health across portfolios. Scenario planning compares funding envelopes with approved and forecast demand." />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'health', label: 'Health heatmap' }, { key: 'portfolios', label: 'Portfolios' }]} />
    {tab === 'overview' && <div className="grid g-12">
      {d.investment.map((i: any, k: number) => { const used = i.approved_budget ? (i.actual / i.approved_budget) * 100 : null; const demand = (i.actual ?? 0) + (i.commitment ?? 0) + (i.forecast ?? 0); return (
        <div key={i.id} className="span-4"><Card title={i.name} sub={`${i.code} · ${i.theme ?? '—'} theme`} actions={<span className="badge outline"><i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: SERIES[k], display: 'inline-block', marginRight: 6 }} />{fmtMoney(i.envelope, cur)} envelope</span>}>
          <div className="row" style={{ gap: 14 }}><Ring value={used} color={SERIES[k]} label="Budget consumed" /><div className="small"><div>Approved <b>{fmtMoney(i.approved_budget, cur)}</b></div><div>Actual <b>{fmtMoney(i.actual, cur)}</b></div><div>Forecast demand <b>{fmtMoney(demand, cur)}</b></div><div className="muted">Capex {fmtMoney(i.capex, cur)} · Opex {fmtMoney(i.opex, cur)}</div></div></div>
          {i.envelope && <div style={{ marginTop: 10 }}><div className="row between tiny muted"><span>Demand vs envelope</span><span>{fmtPct((demand / i.envelope) * 100)}</span></div><Progress value={(demand / i.envelope) * 100} tone={demand > i.envelope ? 'crit' : 'brand'} label="Demand vs envelope" /></div>}
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => nav(`/finance?pf=${i.id}`)}>Finance detail</button>
        </Card></div>); })}
      <div className="span-5"><ChartFrame title="Investment allocation" sub="Approved budget by portfolio" height={220} table={{ headers: ['Portfolio', 'Approved'], rows: alloc.map((a: any) => [a.name, a.value]) }}><Donut data={alloc} center={fmtMoney(alloc.reduce((a: number, b: any) => a + b.value, 0), cur)} sub="approved" fmt={(v) => fmtMoney(v, cur)} /></ChartFrame></div>
      <div className="span-7"><ChartFrame title="Portfolio quadrant" sub="Alignment vs risk · size = BAC · colour = health" height={260} table={{ headers: ['Project', 'Strategic alignment', 'Delivery risk', 'BAC', 'Health'], rows: d.projects.filter((p: any) => p.strategic_score !== null).map((p: any) => [`${p.code} ${p.name}`, p.strategic_score, p.risk_score, p.bac === null ? null : fmtMoney(Number(p.bac), cur), label(p.overall)]) }} legend={['green', 'amber', 'red', 'unknown'].map((r) => ({ key: r, name: label(r), color: RAG_COLOR[r] }))}>
        <Bubble data={d.projects.filter((p: any) => p.strategic_score !== null).map((p: any) => ({ ...p, bac: Number(p.bac ?? 1) }))} x="strategic_score" y="risk_score" z="bac" xLabel="Strategic alignment" yLabel="Delivery risk" colorBy={(p) => RAG_COLOR[p.overall]} onClick={(p) => nav(`/projects/${p.id}`)} fmtZ={(v) => fmtMoney(v, cur)} />
      </ChartFrame></div>
    </div>}
    {tab === 'health' && <Card title="Project health heatmap" sub="Dimensions × projects, grouped by portfolio · click to open">
      {portfolios.map((pf) => { const ps = d.projects.filter((p: any) => p.portfolio === pf); return (
        <div key={pf} style={{ marginBottom: 18 }}><h3 style={{ marginBottom: 6 }}>{pf}</h3>
          <Heatmap rows={ps.map((p: any) => `${p.code} ${p.name}`)} cols={dims.map(label)} value={() => 1} color={(_, r, c) => `color-mix(in srgb, ${RAG_COLOR[ps[r][dims[c]]]} ${ps[r][dims[c]] === 'unknown' ? 30 : 45}%, var(--surface))`} cellText={() => null}
            onCell={(r) => nav(`/projects/${ps[r].id}`)} rowLabel={(r) => <span className="small" style={{ textAlign: 'right' }}>{r}</span>} />
        </div>); })}
      <div className="legend">{['green', 'amber', 'red', 'unknown'].map((r) => <span key={r}><Rag v={r as any} /></span>)}</div>
    </Card>}
    {tab === 'portfolios' && <DataTable resource="portfolios" />}
  </>);
}

export function ProgrammesPage() {
  const { data } = useApi<any>('/api/r/programmes?pageSize=100');
  const { data: projects } = useApi<any>('/api/r/projects?pageSize=300');
  return (<>
    <PageHead title="Programmes" sub="Coordinated groups of projects delivering shared capabilities and benefits." />
    <div className="grid g3" style={{ marginBottom: 14 }}>{(data?.data ?? []).map((g: any) => { const ps = (projects?.data ?? []).filter((p: any) => p.programme_id === g.id); const bac = ps.reduce((a: number, p: any) => a + Number(p.budget_at_completion ?? 0), 0); const prog = ps.length ? ps.reduce((a: number, p: any) => a + Number(p.percent_complete ?? 0), 0) / ps.length : null; return (
      <Card key={g.id} title={g.name} sub={`${g.code} · ${g._refs.portfolio_id?.name ?? '—'} · ${fmtDate(g.start_date)} → ${fmtDate(g.end_date)}`}>
        <div className="row" style={{ gap: 14 }}><Ring value={prog} label="Average progress" /><div className="small"><div><b>{ps.length}</b> projects</div><div>BAC <b>{fmtMoney(bac)}</b></div><div className="muted">Owner {g._refs.owner_id?.name ?? '—'}</div></div></div>
        <div className="sep" />{ps.map((p: any) => <div key={p.id} className="row between small" style={{ padding: '3px 0' }}><span>{p.code} {p.name}</span><span className="num">{fmtPct(p.percent_complete)}</span></div>)}
      </Card>); })}</div>
    <DataTable resource="programmes" />
  </>);
}

export function FinancePage() {
  const [sp, setSp] = useSearchParams();
  const { data: pfs } = useApi<any>('/api/r/portfolios?pageSize=50&sort=code:asc');
  const pf = sp.get('pf') ?? pfs?.data?.[0]?.id;
  const [tab, setTab] = useState('portfolio');
  return (<>
    <PageHead title="Finance, investment & benefits" sub="Budgets (capex/opex), actuals, commitments and forecasts reconcile to approved funding. Multi-currency with recorded FX. Financial approvals follow delegated authority – never automatic." actions={pfs && <select className="input" style={{ width: 260 }} value={pf ?? ''} onChange={(e) => setSp({ pf: e.target.value })} aria-label="Portfolio">{pfs.data.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'portfolio', label: 'Portfolio roll-up' }, { key: 'budgets', label: 'Budget lines' }, { key: 'costs', label: 'Cost ledger' }, { key: 'benefits', label: 'Benefits register' }, { key: 'cases', label: 'Business cases' }, { key: 'periods', label: 'Periods & close' }, { key: 'procure', label: 'Purchase requests & invoices' }]} />
    {tab === 'portfolio' && (pf ? <FinanceTab key={pf} ctxType="portfolio" id={pf} /> : <LoadingBlock />)}
    {tab === 'budgets' && <DataTable resource="budgets" />}
    {tab === 'costs' && <DataTable resource="cost_entries" />}
    {tab === 'benefits' && <DataTable resource="benefits" />}
    {tab === 'cases' && <BusinessCases />}
    {tab === 'periods' && <FinancePeriods />}
    {tab === 'procure' && <div className="col" style={{ gap: 14 }}><DataTable resource="purchase_requests" /><DataTable resource="invoices" /></div>}
  </>);
}

function BusinessCases() {
  const { data } = useApi<any>('/api/r/business_cases?pageSize=50');
  const [sel, setSel] = useState<string | null>(null);
  const ev = useApi<any>(sel ? `/api/business-cases/${sel}/evaluate` : null, [sel]);
  return (<div className="grid g-12">
    <div className="span-12"><DataTable resource="business_cases" onOpen={(r) => setSel(r.id)} /></div>
    {sel && <div className="span-12">{!ev.data ? <LoadingBlock /> : (<div className="grid g4">
      <Kpi label="NPV" value={fmtMoney(ev.data.npv)} foot={`at ${(ev.data.business_case.discount_rate * 100).toFixed(1)}% discount rate`} />
      <Kpi label="IRR" value={ev.data.irr === null ? 'Undefined' : fmtPct(ev.data.irr * 100, 1)} />
      <Kpi label="Payback" value={ev.data.payback_years === null ? 'Not within horizon' : `${ev.data.payback_years} yrs`} />
      <Kpi label="ROI" value={fmtPct(ev.data.roi_pct, 1)} foot={`TCO ${fmtMoney(ev.data.business_case.total_cost_of_ownership)}`} />
      <div className="span-12" style={{ gridColumn: '1 / -1' }}><ChartFrame title="Cash flows by year" height={200} table={{ headers: ['Year', 'Net cash flow'], rows: (ev.data.business_case.cash_flows ?? []).map((v: number, i: number) => [`Y${i}`, fmtMoney(v)]) }}><BarsChart data={(ev.data.business_case.cash_flows ?? []).map((v: number, i: number) => ({ year: `Y${i}`, v }))} x="year" series={[{ key: 'v', name: 'Net cash flow' }]} fmt={(v) => fmtMoney(v)} refLine={0} /></ChartFrame></div>
    </div>)}</div>}
  </div>);
}

export function ResourcesPage() {
  const [weeks, setWeeks] = useState<'8' | '12' | '16'>('12');
  const { data, error, loading } = useApi<any>(`/api/resources/capacity?weeks=${weeks}`, [weeks]);
  const [tab, setTab] = useState('heat');
  if (error) return <ErrorBox error={error} />;
  const users = (data?.users ?? []).filter((u: any) => u.allocations.length);
  const demand = data ? Object.entries(data.demand_by_context).map(([k, v]) => ({ name: k, value: v as number })).sort((a, b) => b.value - a.value).slice(0, 10) : [];
  return (<>
    <PageHead title="Resource & capacity management" sub="Allocations across projects, products, programmes and BAU against capacity and leave. Over-allocation is detected per person per week." actions={<Seg ariaLabel="Horizon" value={weeks} onChange={setWeeks} options={[{ key: '8', label: '8 wks' }, { key: '12', label: '12 wks' }, { key: '16', label: '16 wks' }]} />} />
    {loading || !data ? <LoadingBlock rows={8} /> : (<>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="People allocated" value={users.length} foot={`of ${data.users.length} active people`} />
        <Kpi label="Over-allocations" value={data.conflicts.length} foot="person-weeks above available capacity" tone={data.conflicts.length ? 'crit' : undefined} />
        <Kpi label="Avg utilisation (wk 1)" value={fmtPct(users.length ? users.reduce((a: number, u: any) => a + (u.load[0].utilisation ?? 0), 0) / users.length : null)} />
        <Kpi label="Soft (requested) demand" value={users.reduce((a: number, u: any) => a + u.allocations.filter((x: any) => x.allocation_type === 'soft').length, 0)} foot="unconfirmed allocations" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'heat', label: 'Capacity heatmap' }, { key: 'demand', label: 'Demand' }, { key: 'alloc', label: 'Allocations' }, { key: 'leave', label: 'Leave & availability' }]} />
      {tab === 'heat' && <Card title="Utilisation by person and week" sub="Allocated ÷ available capacity · red outline = over-allocated · hatched = no capacity (full leave)">
        <Heatmap rows={users.map((u: any) => u.name)} cols={data.weeks.map((w: string) => w.slice(5))} xTitle="Week" yTitle="Person"
          value={(r, c) => users[r].load[c].utilisation} color={(v) => (v === null ? seqColor(null, 1) : v > 100 ? 'color-mix(in srgb, var(--crit) 55%, var(--surface))' : seqColor(v, 100))}
          textColor={(v) => (v !== null && v > 100 ? 'var(--text)' : seqText(v, 100))} cellText={(v) => (v === null ? '' : `${Math.round(v)}`)} rowLabel={(r) => <span className="small">{r}</span>} />
        <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: 'var(--q200)' }} />Low</span><span><i style={{ background: 'var(--q400)' }} />Medium</span><span><i style={{ background: 'var(--q600)' }} />Full</span><span><i style={{ background: 'color-mix(in srgb, var(--crit) 55%, var(--surface))' }} />Over 100%</span></div>
        {data.conflicts.length > 0 && <><div className="sep" /><h3>Conflicts</h3><div className="chip-row" style={{ marginTop: 6 }}>{data.conflicts.slice(0, 20).map((c: any, i: number) => <span key={i} className="badge crit">{c.user} · wk {c.week.slice(5)} · {c.allocated}% / {c.available}%</span>)}</div></>}
      </Card>}
      {tab === 'demand' && <ChartFrame title="Demand by context" sub="Sum of allocation % by project / product / BAU" height={300} table={{ headers: ['Context', 'Allocation %'], rows: demand.map((d) => [d.name, d.value]) }}><BarsChart horizontal data={demand} x="name" series={[{ key: 'value', name: 'Allocation %' }]} /></ChartFrame>}
      {tab === 'alloc' && <DataTable resource="resource_allocations" />}
      {tab === 'leave' && <DataTable resource="availability" />}
    </>)}
    {!users.length && data && <Empty title="No allocations" />}
  </>);
}
