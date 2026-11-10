import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Briefcase, FileText, FlagTriangleRight, Link2, Lock, Plus, Shield, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtMoney, fmtPct, label } from '../lib/format';
import { Card, Drawer, Empty, ErrorBox, Kpi, LoadingBlock, Modal, Note, PageHead, Progress, Rag, Seg, Status, Tabs, useToast, errMsg } from '../components/ui';
import { DataTable, RecordDrawer, RecordForm, RefSelect, AuditList } from '../components/resource';
import { BarsChart, ChartFrame, Gantt, TrendChart, Waterfall } from '../components/charts';
import { WorkflowPanel } from '../components/workflow';
import { Board } from './Delivery';
import { ExportProjectButton, OcmPanel, QualityGate, RaciPanel, ScheduleTab, SprintsPanel } from './Frs';
import { CommentsPanel } from '../components/panels';

export function ProjectsList() {
  const nav = useNavigate();
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const { data } = useApi<any>(view === 'timeline' ? '/api/r/projects?pageSize=200&sort=start_date:asc' : null, [view]);
  return (<>
    <PageHead title="Projects" sub="Predictive, agile, hybrid and custom delivery under one governance model. Products are linked, never replaced, by projects." actions={<Seg ariaLabel="View" value={view} onChange={setView} options={[{ key: 'table', label: 'Table' }, { key: 'timeline', label: 'Timeline' }]} />} />
    {view === 'table' ? <DataTable resource="projects" onOpen={(r) => nav(`/projects/${r.id}`)} columns={[
      { key: 'code', label: 'ID', render: (r) => <span className="mono">{r.code}</span> }, { key: 'name', label: 'Project', sortable: true, render: (r) => <b>{r.name}</b> },
      { key: 'portfolio_id', label: 'Portfolio', render: (r) => r._refs.portfolio_id?.name ?? '—' }, { key: 'delivery_approach', label: 'Approach', render: (r) => label(r.delivery_approach) },
      { key: 'lifecycle_stage', label: 'Stage', render: (r) => label(r.lifecycle_stage) }, { key: 'owner_id', label: 'Manager', render: (r) => r._refs.owner_id?.name ?? '—' },
      { key: 'percent_complete', label: '% complete', num: true, sortable: true, render: (r) => <div className="row" style={{ justifyContent: 'flex-end' }}><span className="num">{fmtPct(r.percent_complete)}</span><div style={{ width: 60 }}><Progress value={r.percent_complete} label="complete" /></div></div> },
      { key: 'budget_at_completion', label: 'BAC', num: true, sortable: true, render: (r) => fmtMoney(r.budget_at_completion, r.currency) }, { key: 'end_date', label: 'Finish', sortable: true, render: (r) => fmtDate(r.end_date) }, { key: 'status', label: 'Status', sortable: true },
    ]} /> : (
      <Card title="Portfolio timeline" sub="Bars show planned start → finish with progress fill · dashed line = baseline finish">
        {!data ? <LoadingBlock /> : <Gantt rows={data.data.map((p: any) => ({ id: p.id, label: p.name, sub: `${p.code} · ${label(p.lifecycle_stage)}`, start: p.start_date, end: p.end_date, baselineEnd: p.baseline_end, progress: p.percent_complete, color: p.status === 'closed' ? 'var(--unknown)' : undefined, onClick: () => nav(`/projects/${p.id}`) }))} />}
      </Card>)}
  </>);
}

function BiaScreening({ project, onDone }: { project: any; onDone: () => void }) {
  const toast = useToast();
  const Q = [['affects_critical_service', 'Affects a critical or high-criticality service?'], ['changes_business_process', 'Changes how a business process operates?'], ['handles_personal_data', 'Processes personal data (PDPA)?'], ['customer_facing', 'Customer-facing change?'], ['regulatory', 'Driven by or subject to regulation?'], ['third_party_dependency', 'Introduces or changes a third-party dependency?']] as const;
  const [a, setA] = useState<Record<string, boolean>>(Object.fromEntries(Q.map(([k]) => [k, false])));
  const [res, setRes] = useState<any>(null);
  return (
    <Modal title="BIA & impact screening" onClose={onDone} footer={res ? <button className="btn primary" onClick={onDone}>Done</button> : <button className="btn primary" onClick={async () => { try { setRes(await api.post(`/api/projects/${project.id}/bia-screening`, a)); toast('Screening recorded'); } catch (e) { toast(errMsg(e), 'error'); } }}>Record screening</button>}>
      {!res ? <div className="col">{Q.map(([k, t]) => <label key={k} className="check"><input type="checkbox" checked={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.checked })} />{t}</label>)}<Note>The BIA depth (none / light / full) is proportionate to the screening score, so small changes are not burdened with a full BIA.</Note></div>
        : <div className="col"><div>Score <b>{res.score}</b> → <b>{label(res.level)} BIA</b> {res.bia_required ? 'required' : 'not required'}.</div>{res.created_bia && <div>Draft BIA <b>{res.created_bia.code}</b> created and assigned to the BC function. <Link to={`/resilience/bia/${res.created_bia.id}`}>Open BIA</Link></div>}{res.note && <Note warn>{res.note}</Note>}</div>}
    </Modal>
  );
}

function CloseProject({ project, onDone }: { project: any; onDone: () => void }) {
  const toast = useToast();
  const [s, setS] = useState(project.closure_summary ?? ''); const [l, setL] = useState(project.lessons_learned ?? ''); const [j, setJ] = useState(''); const [err, setErr] = useState<any>(null);
  return (
    <Modal title={`Close ${project.code}`} onClose={onDone} footer={<><button className="btn" onClick={onDone}>Cancel</button><button className="btn primary" disabled={s.trim().length < 10} onClick={async () => { try { await api.post(`/api/projects/${project.id}/close`, { closure_summary: s, lessons_learned: l || undefined, accept_open_items_justification: j || undefined }); toast('Project closed – linked products remain active'); onDone(); } catch (e) { setErr(e); } }}><Lock size={14} />Close project</button></>}>
      <div className="col">
        <Note>Closing a project never closes the products it supported. Planned benefits move to “tracking” for post-implementation measurement.</Note>
        <div className="field"><label htmlFor="cs">Closure summary</label><textarea id="cs" className="input" value={s} onChange={(e) => setS(e.target.value)} /></div>
        <div className="field"><label htmlFor="ll">Lessons learned</label><textarea id="ll" className="input" value={l} onChange={(e) => setL(e.target.value)} /></div>
        <div className="field"><label htmlFor="jj">Justification for open items (if any)</label><textarea id="jj" className="input" value={j} onChange={(e) => setJ(e.target.value)} /></div>
        {err && <ErrorBox error={err} />}
      </div>
    </Modal>
  );
}

function FinanceTab({ ctxType, id, evm }: { ctxType: string; id: string; evm?: any }) {
  const { data: f, error } = useApi<any>(`/api/finance/summary?context_type=${ctxType}&context_id=${id}`);
  if (error) return <ErrorBox error={error} />;
  if (!f) return <LoadingBlock />;
  const c = f.currency;
  return (<div className="col" style={{ gap: 14 }}>
    <div className="grid g4">
      <Kpi label="Approved budget" value={fmtMoney(f.approved_budget, c)} foot={f.approved_budget === null ? 'No approved budget lines' : `${fmtMoney(f.pending_budget, c)} pending approval`} />
      <Kpi label="Actual to date" value={fmtMoney(f.actual, c)} foot={`Utilisation ${fmtPct(f.budget_utilisation_pct, 1)}`} />
      <Kpi label="Estimate at completion" value={fmtMoney(f.estimate_at_completion, c)} foot="Actual + committed + forecast" />
      <Kpi label="Variance at completion" value={<span style={{ color: (f.variance_at_completion ?? 0) < 0 ? 'var(--crit-ink)' : undefined }}>{fmtMoney(f.variance_at_completion, c)}</span>} foot={<Status v={f.reconciliation.status} />} />
    </div>
    {evm && <div className="grid g4"><Kpi label="Planned value (PV)" value={fmtMoney(evm.pv, c)} foot={`${fmtPct(evm.plannedPct)} planned`} /><Kpi label="Earned value (EV)" value={fmtMoney(evm.ev, c)} /><Kpi label="SPI / CPI" value={`${evm.spi ?? '—'} / ${evm.cpi ?? '—'}`} foot={evm.missing.length ? `Missing: ${evm.missing.join(', ')}` : 'EV ÷ PV, EV ÷ AC'} /><Kpi label="EAC (BAC ÷ CPI)" value={fmtMoney(evm.eac, c)} foot={`VAC ${fmtMoney(evm.vac, c)}`} /></div>}
    <div className="grid g2">
      <ChartFrame title="Budget waterfall" sub="Approved → actual → committed → forecast → variance" empty={f.approved_budget === null} height={240} table={{ headers: ['Step', 'Amount'], rows: [['Approved budget', fmtMoney(f.approved_budget, c)], ['Actual', fmtMoney(f.actual, c)], ['Committed', fmtMoney(f.commitments, c)], ['Forecast to complete', fmtMoney(f.forecast_remaining, c)], ['Headroom (variance at completion)', fmtMoney(f.variance_at_completion, c)]] }}>
        <Waterfall fmt={(v) => fmtMoney(v, c)} steps={[{ name: 'Approved', value: f.approved_budget ?? 0, total: true }, { name: 'Actual', value: -f.actual }, { name: 'Committed', value: -f.commitments }, { name: 'Forecast', value: -f.forecast_remaining }, { name: 'Headroom', value: f.variance_at_completion ?? 0, total: true }]} />
      </ChartFrame>
      <ChartFrame title="Monthly spend" sub="Actual vs committed and forecast by month" empty={!f.monthly.length} height={240} legend={[{ key: 'actual', name: 'Actual' }, { key: 'commitment', name: 'Committed' }, { key: 'forecast', name: 'Forecast' }]} table={{ headers: ['Month', 'Actual', 'Committed', 'Forecast', 'Cumulative actual'], rows: f.monthly.map((m: any) => [m.month, m.actual, m.commitment, m.forecast, m.cumulative_actual]) }}>
        <BarsChart stacked data={f.monthly} x="month" fmt={(v) => fmtMoney(v, c)} series={[{ key: 'actual', name: 'Actual' }, { key: 'commitment', name: 'Committed' }, { key: 'forecast', name: 'Forecast' }]} />
      </ChartFrame>
    </div>
    <div className="grid g2">
      <DataTable resource="budgets" filters={{ context_type: ctxType, context_id: id }} pageSize={10} title="Budget lines" />
      <DataTable resource="cost_entries" filters={{ context_type: ctxType, context_id: id }} pageSize={10} title="Cost entries" />
    </div>
    <DataTable resource="benefits" filters={{ context_type: ctxType, context_id: id }} pageSize={10} title="Benefits" />
  </div>);
}
export { FinanceTab };

function ProductsTab({ project, products, reload }: { project: any; products: any[]; reload: () => void }) {
  const toast = useToast(); const { can } = useSession();
  const [add, setAdd] = useState<string | null>(null); const [rel, setRel] = useState('enhances');
  return (<Card title="Products supported" sub="Many-to-many: one project can support several products; each product has its own lifecycle">
    <div className="stack-list">{products.map((p) => <div key={p.id} className="list-row"><Link to={`/products/${p.id}`}><b>{p.code} · {p.name}</b></Link><span className="badge">{label(p.relationship)}</span><span className="small muted">Lifecycle: {label(p.lifecycle_stage)}</span><Status v={p.status} /><div style={{ flex: 1 }} />{can('projects:write') && <button className="btn sm ghost" onClick={async () => { await api.del(`/api/projects/${project.id}/products/${p.id}`); reload(); }}>Unlink</button>}</div>)}</div>
    {!products.length && <Empty title="No products linked">Link the products this project builds, enhances or retires.</Empty>}
    {can('projects:write') && <div className="row" style={{ marginTop: 10 }}><div style={{ width: 300 }}><RefSelect resource="products" value={add} onChange={setAdd} placeholder="Select product to link…" /></div><select className="input" style={{ width: 140 }} value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Relationship">{['delivers', 'enhances', 'retires', 'supports'].map((r) => <option key={r}>{r}</option>)}</select><button className="btn" disabled={!add} onClick={async () => { try { await api.post(`/api/projects/${project.id}/products`, { product_id: add, relationship: rel }); setAdd(null); reload(); toast('Product linked'); } catch (e) { toast(errMsg(e), 'error'); } }}><Link2 size={14} />Link</button></div>}
  </Card>);
}

export function ProjectWorkspace() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, meta } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/api/projects/${id}/summary`);
  const ms = useApi<any>(`/api/r/milestones?project_id=${id}&pageSize=100`);
  const work = useApi<any>(`/api/r/work_items?context_type=project&context_id=${id}&pageSize=300`);
  const evm = useApi<any>(`/api/projects/${id}/evm`);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState<null | 'bia' | 'close' | 'edit'>(null);
  const [ai, setAi] = useState<any>(null);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const p = data.project, h = data.health;
  const ctx = { context_type: 'project', context_id: p.id };
  const runAi = async () => { try { setAi(await api.post('/api/ai/analyse/project_insight', { id: p.id })); } catch (e) { toast(errMsg(e), 'error'); } };
  const ganttRows = [
    { id: 'p', label: p.name, sub: 'Project', start: p.start_date, end: p.end_date, baselineEnd: p.baseline_end, progress: p.percent_complete },
    ...(ms.data?.data ?? []).map((m: any) => ({ id: m.id, label: m.name, sub: `${m.code} · ${label(m.status)}${m.is_gate ? ' · gate' : ''}`, milestone: m.due_date, baselineEnd: m.baseline_date !== m.due_date ? m.baseline_date : null, color: m.status === 'achieved' ? 'var(--s3)' : m.status === 'at_risk' || (m.due_date < new Date().toISOString().slice(0, 10) && m.status !== 'achieved') ? 'var(--s8)' : 'var(--s7)' })),
    ...(work.data?.data ?? []).filter((w: any) => w.start_date && w.due_date).map((w: any) => ({ id: w.id, label: w.name, sub: `${w.code} · ${label(w.status)}`, start: w.start_date, end: w.due_date, progress: w.status === 'done' ? 100 : w.status === 'todo' ? 0 : 50, color: w.status === 'blocked' ? 'var(--s8)' : 'var(--s1)' })),
  ];
  return (<>
    <PageHead crumbs={<><Link to="/projects">Projects</Link><span>/</span><span>{p.code}</span></>} title={p.name}
      sub={<span className="row wrap" style={{ gap: 8 }}><Status v={p.status} /><span className="badge brand">{label(p.lifecycle_stage)}</span><span className="badge">{label(p.delivery_approach)}</span><span className="badge">{label(p.project_type)}</span>{p._refs.portfolio_id && <span className="small">Portfolio: {p._refs.portfolio_id.name}</span>}{p._refs.programme_id && <span className="small">· Programme: {p._refs.programme_id.name}</span>}</span>}
      actions={<>
        <button className="btn" onClick={runAi}><Sparkles size={14} />AI insight</button>
        <ExportProjectButton id={p.id} />
        {can('documents:write') && <button className="btn" onClick={async () => { try { const r = await api.post('/api/documents/generate', { doc_type: 'project_management_plan', ...ctx }); toast(`Project management plan v${r.version} generated (${r.missing_fields.length} gaps)`); nav(`/documents?open=${r.document_id}`); } catch (e) { toast(errMsg(e), 'error'); } }}><FileText size={14} />PM plan</button>}
        {can('documents:write') && <button className="btn" onClick={async () => { try { const r = await api.post('/api/documents/generate', { doc_type: 'status_report', ...ctx }); toast(`Status report v${r.version} generated (${r.missing_fields.length} gaps)`); nav(`/documents?open=${r.document_id}`); } catch (e) { toast(errMsg(e), 'error'); } }}><FileText size={14} />Status report</button>}
        {can('projects:write') && p.status !== 'closed' && <><button className="btn" onClick={() => setModal('bia')}><Shield size={14} />BIA screening</button><button className="btn" onClick={() => setModal('edit')}>Edit</button><button className="btn" onClick={() => setModal('close')}><Lock size={14} />Close</button></>}
      </>} />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <div className="card kpi"><div className="label">Overall health</div><div className="value"><Rag v={h.overall} /></div><div className="row wrap small" style={{ gap: 6 }}>Schedule <Rag v={h.schedule} compact /> Cost <Rag v={h.cost} compact /> Risk <Rag v={h.risk} compact /> Milestones <Rag v={h.milestones} compact /></div></div>
      <Kpi label="Progress" value={fmtPct(p.percent_complete)} foot={<Progress value={p.percent_complete} label="Progress" />} />
      <Kpi label="SPI · CPI" value={`${h.spi ?? '—'} · ${h.cpi ?? '—'}`} foot={h.data_gaps.length ? `Data gaps: ${h.data_gaps.join(', ')}` : `EAC ${fmtMoney(h.evm.eac)}`} />
      <Kpi label="Schedule" value={fmtDate(p.end_date)} foot={`Baseline ${fmtDate(p.baseline_end)} · ${data.counts.risks} risks · ${data.counts.issues} issues · ${data.counts.open_changes} open CRs`} />
    </div>
    {ai && <div style={{ marginBottom: 14 }}><Card title={<span className="row"><Sparkles size={16} />AI insight (rules-based, cited)</span>} actions={<button className="btn sm ghost" onClick={() => setAi(null)}>Dismiss</button>}>
      <div style={{ whiteSpace: 'pre-wrap' }}>{ai.answer}</div>
      <div style={{ marginTop: 8 }}>{ai.citations.map((c: any) => <span key={c.id} className="cite">{c.code}</span>)}<span className="badge">Confidence: {ai.confidence}</span></div>
      {ai.suggestions?.length > 0 && <div style={{ marginTop: 10 }}><h3>Suggested risks (not created until you accept)</h3>{ai.suggestions.map((s: any, i: number) => <div key={i} className="list-row"><span style={{ flex: 1 }}><b>{s.name}</b> <span className="small muted">{s.rationale}</span></span><button className="btn sm" onClick={async () => { try { await api.post('/api/ai/accept-suggestion', { interaction_id: ai.interaction_id, suggestion: s, ...ctx }); toast('Draft risk created'); } catch (e) { toast(errMsg(e), 'error'); } }}><Plus size={14} />Accept as draft</button></div>)}</div>}
      <div className="tiny muted" style={{ marginTop: 8 }}>{ai.disclaimer}</div>
    </Card></div>}
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'plan', label: 'Plan & timeline' }, { key: 'schedule', label: 'Schedule & baseline' }, { key: 'board', label: 'Board & sprints' }, { key: 'people', label: 'RACI' }, { key: 'ocm', label: 'People & change' }, { key: 'raid', label: 'RAID' }, { key: 'change', label: 'Change' }, { key: 'finance', label: 'Finance & benefits' }, { key: 'resources', label: 'Resources' }, { key: 'scope', label: 'Requirements & quality' }, { key: 'governance', label: 'Governance & gates' }, { key: 'docs', label: 'Documents' }, { key: 'discuss', label: 'Comments' }, { key: 'history', label: 'History' }]} />
    {tab === 'schedule' && <ScheduleTab project={p} onChanged={reload} />}
    {tab === 'people' && <RaciPanel type="project" id={p.id} />}
    {tab === 'ocm' && <OcmPanel type="project" id={p.id} />}
    {tab === 'discuss' && <Card title="Discussion"><CommentsPanel entityType="projects" entityId={p.id} /></Card>}
    {tab === 'overview' && <div className="grid g-12">
      <div className="span-7"><Card title="Charter summary"><dl className="kv">
        <dt>Manager</dt><dd>{p._refs.owner_id?.name ?? '—'}</dd><dt>Sponsor</dt><dd>{p._refs.sponsor_id?.name ?? <span className="badge warn">Missing</span>}</dd><dt>Objective</dt><dd>{p._refs.objective_id?.name ?? '—'}</dd>
        <dt>Purpose</dt><dd>{p.description ?? <span className="badge warn">Missing</span>}</dd><dt>Scope</dt><dd>{p.scope_statement ?? <span className="badge warn">Missing</span>}</dd><dt>Business case</dt><dd>{p.business_case ?? '—'}</dd><dt>Success criteria</dt><dd>{p.success_criteria ?? '—'}</dd>
        <dt>Budget at completion</dt><dd>{fmtMoney(p.budget_at_completion, p.currency)}</dd><dt>BIA</dt><dd>{p.bia_required === null ? <span className="badge warn">Screening not done</span> : p.bia_required ? `Required · ${data.counts.bias} BIA(s)` : 'Not required (screened)'}</dd>
      </dl></Card></div>
      <div className="span-5 col" style={{ gap: 14 }}><ProductsTab project={p} products={data.products} reload={reload} />
        <Card title="Upcoming milestones">{(ms.data?.data ?? []).filter((m: any) => m.status !== 'achieved').slice(0, 5).map((m: any) => <div key={m.id} className="list-row"><FlagTriangleRight size={14} color={m.is_gate ? 'var(--brand)' : 'var(--text-3)'} /><span style={{ flex: 1 }}>{m.name}</span><span className="small">{fmtDate(m.due_date)}</span><Status v={m.status} /></div>)}</Card></div>
    </div>}
    {tab === 'plan' && <div className="col" style={{ gap: 14 }}><Card title="Schedule" sub="Project bar, milestones (◆), dated work items · red line = today, dashed = baseline"><Gantt rows={ganttRows} /></Card><div className="grid g2"><DataTable resource="milestones" filters={{ project_id: p.id }} title="Milestones" pageSize={10} /><DataTable resource="deliverables" filters={{ project_id: p.id }} title="Deliverables" pageSize={10} /></div><DataTable resource="dependencies" title="Dependencies (all)" pageSize={10} /></div>}
    {tab === 'board' && <div className="col" style={{ gap: 14 }}><Board filters={{ context_type: 'project', context_id: p.id }} /><SprintsPanel ctx={ctx} /></div>}
    {tab === 'raid' && <div className="col" style={{ gap: 14 }}><DataTable resource="risks" filters={ctx} title="Risks" pageSize={10} /><DataTable resource="lessons" filters={ctx} createPreset={ctx} title="Lessons learned" pageSize={5} /><DataTable resource="issues" filters={ctx} title="Issues" pageSize={10} /><DataTable resource="assumptions" filters={ctx} title="Assumptions" pageSize={10} /></div>}
    {tab === 'change' && <DataTable resource="change_requests" filters={ctx} title="Change requests" />}
    {tab === 'finance' && <FinanceTab ctxType="project" id={p.id} evm={evm.data} />}
    {tab === 'resources' && <DataTable resource="resource_allocations" filters={ctx} title="Allocations" />}
    {tab === 'scope' && <div className="col" style={{ gap: 14 }}><QualityGate type="project" id={p.id} /><DataTable resource="requirements" filters={ctx} title="Requirements" /><div className="grid g2"><DataTable resource="quality_reviews" filters={ctx} createPreset={ctx} title="Quality reviews & audits" pageSize={5} /><DataTable resource="non_conformances" filters={ctx} createPreset={ctx} title="Non-conformances (CAPA)" pageSize={5} /></div><DataTable resource="test_plans" filters={ctx} title="Test plans" pageSize={10} /><DataTable resource="defects" filters={ctx} title="Defects" pageSize={10} /></div>}
    {tab === 'governance' && <div className="col" style={{ gap: 14 }}><WorkflowPanel entityType="projects" entityId={p.id} onChanged={reload} /><DataTable resource="decisions" filters={ctx} title="Decisions" pageSize={10} /><DataTable resource="meetings" filters={ctx} title="Meetings" pageSize={10} /></div>}
    {tab === 'docs' && <DataTable resource="documents" filters={ctx} title="Project documents" />}
    {tab === 'history' && <Card title="Audit history"><AuditList entityType="projects" entityId={p.id} /></Card>}
    {modal === 'bia' && <BiaScreening project={p} onDone={() => { setModal(null); reload(); }} />}
    {modal === 'close' && <CloseProject project={p} onDone={() => { setModal(null); reload(); }} />}
    {modal === 'edit' && meta.get('projects') && <Drawer title={`Edit ${p.code}`} onClose={() => setModal(null)} wide><RecordForm meta={meta.get('projects')!} initial={p} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} /></Drawer>}
  </>);
}
