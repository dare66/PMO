/**
 * Workspaces for capabilities added against FRS v1.1: demand pipeline & scoring, schedule/CPM & baselines,
 * sprints, RACI, OCM, quality gate, finance periods, product health, AI intake & idea clustering, org settings.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, GitBranch, Lock, Plus, Sparkles, Unlock } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtMoney, fmtNum, fmtPct, label } from '../lib/format';
import { Card, Drawer, Empty, ErrorBox, Kpi, LoadingBlock, Modal, Note, PageHead, Rag, Status, errMsg, useToast } from '../components/ui';
import { DataTable, RecordDrawer, RecordForm, RefSelect } from '../components/resource';
import { BarsChart, ChartFrame, TrendChart } from '../components/charts';

const STAGES = ['submitted', 'screening', 'discovery', 'proposed', 'approved', 'deferred', 'rejected', 'active'];

// ================================================================ demand & intake
export function DemandPage() {
  const { meta, can } = useSession();
  const { data, error, loading, reload } = useApi<any>('/api/r/requests?pageSize=500&sort=score:desc');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rows: any[] = data?.data ?? [];
  return (<>
    <PageHead title="Demand & intake" sub="One pipeline for new projects, enhancements, operational improvements, compliance, infrastructure, product and emergency requests. Duplicates are flagged; approval is segregated from the requester."
      actions={can('requests:write') && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={14} />New request</button>} />
    {error ? <ErrorBox error={error} retry={reload} /> : loading ? <LoadingBlock rows={6} /> : !rows.length ? <Empty title="No requests yet" action={can('requests:write') && <button className="btn primary" onClick={() => setCreating(true)}>Submit the first request</button>}>Requests enter here before they become projects or product work.</Empty> : (
      <div className="pipeline" aria-label="Request pipeline by stage">
        {STAGES.map((st) => { const lane = rows.filter((r) => r.pipeline_stage === st); return (
          <section key={st} className="lane" aria-label={`${label(st)}: ${lane.length}`}>
            <h3><span>{label(st)}</span><span>{lane.length}</span></h3>
            {lane.map((r) => <button key={r.id} className="tile" onClick={() => setOpen(r.id)}>
              <div className="tiny mono muted">{r.code} · {label(r.request_type)}</div><div className="small" style={{ fontWeight: 600 }}>{r.name}</div>
              <div className="row tiny" style={{ gap: 6, marginTop: 4 }}><Status v={r.urgency} />{r.score !== null ? <span className="badge">Score {fmtNum(Number(r.score), 1)}</span> : <span className="badge unknown">Not scored</span>}</div>
            </button>)}
            {!lane.length && <div className="tiny muted">None</div>}
          </section>); })}
      </div>)}
    <div style={{ marginTop: 14 }}><ScoringModels /></div>
    {open && <RecordDrawer resource="requests" id={open} onClose={() => setOpen(null)} onChanged={reload} extra={(row) => <ScorePanel entityType="requests" row={row} onDone={reload} />} />}
    {creating && meta.get('requests') && <Drawer title="New request" onClose={() => setCreating(false)} wide><RecordForm meta={meta.get('requests')!} onCancel={() => setCreating(false)} onSaved={(r) => { setCreating(false); reload(); setOpen(r.id); }} /></Drawer>}
  </>);
}

export function ScorePanel({ entityType, row, onDone }: { entityType: 'requests' | 'ideas' | 'projects'; row: any; onDone: () => void }) {
  const models = useApi<any>(`/api/r/scoring_models?applies_to=${entityType}&status=active`);
  const history = useApi<any[]>(`/api/scores/${entityType}/${row.id}`);
  const [model, setModel] = useState<any>(null); const [vals, setVals] = useState<Record<string, string>>({}); const [ov, setOv] = useState(''); const [reason, setReason] = useState('');
  const toast = useToast(); const { can } = useSession();
  const pick = async (id: string) => { if (!id) { setModel(null); return; } const crit = await api.get(`/api/scoring-models/${id}/criteria`); setModel({ id, criteria: crit }); setVals({}); };
  const submit = async () => {
    try {
      const r = await api.post('/api/scores', { model_id: model.id, entity_type: entityType, entity_id: row.id, values: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])), ...(ov ? { override_total: Number(ov), override_reason: reason } : {}) });
      toast(r.computed_total === null ? 'Saved – score incomplete until every criterion is scored' : `Scored ${r.override_total ?? r.computed_total}`); setModel(null); history.reload(); onDone();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  if (!can(`${entityType}:write`)) return null;
  return (<div className="card" style={{ padding: 10, marginBottom: 12 }}>
    <div className="row wrap" style={{ gap: 8 }}><label className="small" htmlFor={`sm-${row.id}`}>Score with model</label>
      <select id={`sm-${row.id}`} className="input" style={{ maxWidth: 260 }} value={model?.id ?? ''} onChange={(e) => pick(e.target.value)}><option value="">Select…</option>{(models.data?.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      {history.data?.[0] && <span className="small muted">Last: {history.data[0].override_total ?? history.data[0].computed_total ?? 'incomplete'} by {history.data[0].scored_by_name} ({fmtDate(history.data[0].scored_at)})</span>}</div>
    {model && <div className="col" style={{ gap: 8, marginTop: 8 }}>
      {model.criteria.map((c: any) => <div key={c.key} className="row" style={{ gap: 8 }}><label htmlFor={`sc-${c.key}`} className="small" style={{ flex: 1 }}>{c.name} <span className="muted">({c.weight}%{c.direction === 'lower' ? ', lower is better' : ''})</span></label><input id={`sc-${c.key}`} className="input" type="number" min={0} max={10} step={0.5} style={{ width: 90 }} value={vals[c.key] ?? ''} onChange={(e) => setVals({ ...vals, [c.key]: e.target.value })} aria-describedby="sc-hint" /></div>)}
      <div id="sc-hint" className="tiny muted">0–10 per criterion. The total stays empty until all criteria are scored.</div>
      <div className="row" style={{ gap: 8 }}><label htmlFor="sc-ov" className="small">Override total (optional)</label><input id="sc-ov" className="input" type="number" min={0} max={100} style={{ width: 90 }} value={ov} onChange={(e) => setOv(e.target.value)} />{ov && <input aria-label="Override reason" className="input" placeholder="Reason (audited)" value={reason} onChange={(e) => setReason(e.target.value)} />}</div>
      <div><button className="btn primary sm" onClick={submit}>Save score</button></div>
    </div>}
  </div>);
}

function ScoringModels() {
  const [open, setOpen] = useState<any>(null);
  return (<>
    <DataTable resource="scoring_models" title="Scoring models" pageSize={5} onOpen={(r) => setOpen(r)} />
    {open && <CriteriaEditor model={open} onClose={() => setOpen(null)} />}
  </>);
}
function CriteriaEditor({ model, onClose }: { model: any; onClose: () => void }) {
  const { data, error, loading } = useApi<any[]>(`/api/scoring-models/${model.id}/criteria`);
  const [rows, setRows] = useState<any[] | null>(null); const toast = useToast(); const { can } = useSession();
  const crit = rows ?? data ?? [];
  const sum = crit.reduce((a, c) => a + Number(c.weight || 0), 0);
  const set = (i: number, k: string, v: any) => setRows(crit.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const save = async () => { try { await api.put(`/api/scoring-models/${model.id}/criteria`, { criteria: crit.map((c) => ({ ...c, weight: Number(c.weight) })) }); toast('Criteria saved'); onClose(); } catch (e) { toast(errMsg(e), 'error'); } };
  return <Modal title={`${model.code} ${model.name} – criteria`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button>{can('scoring_models:write') && <button className="btn primary" onClick={save} disabled={Math.abs(sum - 100) > 0.01}>Save</button>}</>}>
    {error ? <ErrorBox error={error} /> : loading ? <LoadingBlock /> : <>
      <table className="data compact"><thead><tr><th scope="col">Key</th><th scope="col">Name</th><th scope="col">Weight %</th><th scope="col">Direction</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead><tbody>
        {crit.map((c, i) => <tr key={i}><td><input aria-label="Key" className="input" value={c.key} onChange={(e) => set(i, 'key', e.target.value)} /></td><td><input aria-label="Name" className="input" value={c.name} onChange={(e) => set(i, 'name', e.target.value)} /></td><td><input aria-label="Weight" className="input" type="number" value={c.weight} onChange={(e) => set(i, 'weight', e.target.value)} style={{ width: 80 }} /></td>
          <td><select aria-label="Direction" className="input" value={c.direction ?? 'higher'} onChange={(e) => set(i, 'direction', e.target.value)}><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></td><td><button className="btn sm ghost" onClick={() => setRows(crit.filter((_, j) => j !== i))}>Remove</button></td></tr>)}
      </tbody></table>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}><button className="btn sm" onClick={() => setRows([...crit, { key: `c${crit.length + 1}`, name: 'New criterion', weight: 0, direction: 'higher' }])}><Plus size={13} />Add criterion</button>
        <span className={`small ${Math.abs(sum - 100) > 0.01 ? 'badge warn' : 'muted'}`}>Weights total {sum}% (must be 100)</span></div>
    </>}
  </Modal>;
}

// ================================================================ project: schedule & baselines
export function ScheduleTab({ project, onChanged }: { project: any; onChanged: () => void }) {
  const s = useApi<any>(`/api/projects/${project.id}/schedule`);
  const bl = useApi<any[]>(`/api/projects/${project.id}/baselines`);
  const prog = useApi<any>(`/api/projects/${project.id}/progress`);
  const [baselining, setBaselining] = useState(false); const [reason, setReason] = useState(''); const [cr, setCr] = useState<string | null>(null);
  const [dep, setDep] = useState(false);
  const toast = useToast(); const { can } = useSession();
  const doBaseline = async () => { try { const r = await api.post(`/api/projects/${project.id}/baseline`, { reason, change_request_id: cr }); toast(`Baseline v${r.version} set`); setBaselining(false); bl.reload(); s.reload(); onChanged(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (<div className="col" style={{ gap: 14 }}>
    <div className="grid g4">
      <Kpi label="Forecast finish (CPM)" value={s.data ? fmtDate(s.data.forecast_finish) : '—'} foot={s.data ? `${s.data.project_duration_days} working days from ${fmtDate(s.data.anchor)}` : s.error ? 'Schedule unavailable' : 'Calculating…'} />
      <Kpi label="Slippage vs baseline" value={s.data?.slippage_days_vs_baseline === null || !s.data ? '—' : `${s.data.slippage_days_vs_baseline > 0 ? '+' : ''}${s.data.slippage_days_vs_baseline} days`} foot={project.baseline_end ? `Baseline finish ${fmtDate(project.baseline_end)}` : 'No baseline'} tone={s.data?.slippage_days_vs_baseline > 0 ? 'crit' : undefined} />
      <Kpi label="Weighted progress" value={fmtPct(prog.data?.weighted_effort_pct)} foot={`Milestones ${fmtPct(prog.data?.milestone_pct)} · manual ${fmtPct(prog.data?.manual_pct)}`} />
      <Kpi label="Baseline" value={project.baseline_version ? `v${project.baseline_version}` : 'Not set'} foot={<span className="row" style={{ gap: 6 }}>{project.baseline_version ? <Lock size={12} /> : <Unlock size={12} />}{project.baseline_version ? 'Changes need an approved CR' : 'Set before execution'}</span>} />
    </div>
    {prog.data?.note && <Note>{prog.data.note}</Note>}
    <Card title="Critical path schedule" sub="Working days (weekends and organisation holidays excluded) · FS/SS/FF/SF with lag · PERT where three-point estimates exist"
      actions={<>{can('work_items:write') && <button className="btn sm" onClick={() => setDep(true)}><GitBranch size={13} />Add dependency</button>}{can('projects:write') && <button className="btn sm" onClick={() => setBaselining(true)}><Lock size={13} />{project.baseline_version ? 'Re-baseline' : 'Set baseline'}</button>}</>}>
      {s.error ? <ErrorBox error={s.error} retry={s.reload} /> : s.loading ? <LoadingBlock rows={5} /> : !s.data.activities.length ? <Empty title="No scheduled work">Add work items to this project to compute a schedule.</Empty> : <>
        <div className="small" style={{ marginBottom: 8 }}>Critical path: {s.data.critical_path.length ? s.data.critical_path.map((c: string) => <span key={c} className="cite">{c}</span>) : '—'}</div>
        <div className="table-wrap"><table className="data compact"><caption className="sr-only">Critical path method results</caption><thead><tr><th scope="col">Item</th><th scope="col" className="num">Duration (d)</th><th scope="col">Early start</th><th scope="col">Early finish</th><th scope="col">Late finish</th><th scope="col" className="num">Float (d)</th><th scope="col">PERT</th></tr></thead>
          <tbody>{s.data.activities.map((a: any) => <tr key={a.id} className={a.critical ? 'crit-row' : ''}><td><span className="mono small">{a.code}</span> {a.name}{a.critical && <span className="badge crit" style={{ marginLeft: 6 }}>critical</span>}{a.done && <span className="badge good" style={{ marginLeft: 6 }}>done</span>}</td><td className="num">{a.done ? '—' : a.duration}</td><td>{a.done ? '—' : fmtDate(a.early_start)}</td><td>{a.done ? '—' : fmtDate(a.early_finish)}</td><td>{a.done ? '—' : fmtDate(a.late_finish)}</td><td className="num">{a.done ? '—' : a.total_float}</td><td>{a.pert_estimate ?? <span className="muted">—</span>}</td></tr>)}</tbody></table></div>
      </>}
    </Card>
    <Card title="Baseline history" sub="Immutable. A new version is created by an approved change request.">
      {bl.error ? <ErrorBox error={bl.error} /> : bl.loading ? <LoadingBlock rows={2} /> : !bl.data?.length ? <Empty title="No baseline yet" /> :
        <table className="data compact"><thead><tr><th scope="col">Version</th><th scope="col">Reason</th><th scope="col">Start → finish</th><th scope="col">BAC</th><th scope="col">Approved by</th><th scope="col">Date</th></tr></thead><tbody>{bl.data.map((b) => <tr key={b.id}><td>v{b.version}</td><td>{b.reason}</td><td>{fmtDate(b.snapshot.start)} → {fmtDate(b.snapshot.finish)}</td><td>{fmtMoney(b.snapshot.budget_at_completion)}</td><td>{b.approved_by_name ?? '—'}</td><td>{fmtDate(b.created_at)}</td></tr>)}</tbody></table>}
    </Card>
    {baselining && <Modal title={project.baseline_version ? 'Re-baseline project' : 'Set baseline'} onClose={() => setBaselining(false)} footer={<><button className="btn" onClick={() => setBaselining(false)}>Cancel</button><button className="btn primary" onClick={doBaseline} disabled={reason.trim().length < 3}>Save baseline</button></>}>
      <Note>Captures start, finish, BAC, milestones, approved budgets and deliverables. {project.baseline_version ? 'Re-baselining requires an approved change request on this project.' : ''}</Note>
      <div className="field"><label htmlFor="bl-r">Reason</label><input id="bl-r" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {project.baseline_version > 0 && <div className="field"><label htmlFor="bl-cr">Approved change request</label><RefSelect id="bl-cr" resource="change_requests" value={cr} onChange={setCr} /></div>}
    </Modal>}
    {dep && <DependencyModal projectId={project.id} onClose={() => setDep(false)} onSaved={() => { setDep(false); s.reload(); }} />}
  </div>);
}
function DependencyModal({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const items = useApi<any>(`/api/r/work_items?context_type=project&context_id=${projectId}&pageSize=300`);
  const [v, setV] = useState({ predecessor_id: '', successor_id: '', dep_type: 'FS', lag_days: 0 }); const toast = useToast();
  const save = async () => { try { await api.post('/api/work-dependencies', { ...v, lag_days: Number(v.lag_days) }); toast('Dependency saved'); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } };
  const opts = (items.data?.data ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.code} {w.name}</option>);
  return <Modal title="Add dependency" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!v.predecessor_id || !v.successor_id}>Save</button></>}>
    <div className="col" style={{ gap: 10 }}>
      <div className="field"><label htmlFor="dp-p">Predecessor</label><select id="dp-p" className="input" value={v.predecessor_id} onChange={(e) => setV({ ...v, predecessor_id: e.target.value })}><option value="">Select…</option>{opts}</select></div>
      <div className="field"><label htmlFor="dp-s">Successor</label><select id="dp-s" className="input" value={v.successor_id} onChange={(e) => setV({ ...v, successor_id: e.target.value })}><option value="">Select…</option>{opts}</select></div>
      <div className="row" style={{ gap: 10 }}><div className="field"><label htmlFor="dp-t">Type</label><select id="dp-t" className="input" value={v.dep_type} onChange={(e) => setV({ ...v, dep_type: e.target.value })}>{['FS', 'SS', 'FF', 'SF'].map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="dp-l">Lag (working days, negative = lead)</label><input id="dp-l" className="input" type="number" value={v.lag_days} onChange={(e) => setV({ ...v, lag_days: Number(e.target.value) })} /></div></div>
      <div className="tiny muted">Dependencies that would create a cycle are refused.</div>
    </div>
  </Modal>;
}

// ================================================================ sprints
export function SprintsPanel({ ctx }: { ctx: { context_type: string; context_id: string } }) {
  const sp = useApi<any>(`/api/r/sprints?context_type=${ctx.context_type}&context_id=${ctx.context_id}&pageSize=50`);
  const [sel, setSel] = useState<string | null>(null);
  const id = sel ?? sp.data?.data?.find((s: any) => s.status === 'active')?.id ?? sp.data?.data?.[0]?.id ?? null;
  const rep = useApi<any>(id ? `/api/sprints/${id}/report` : null);
  if (sp.error) return <ErrorBox error={sp.error} />;
  if (sp.loading) return <LoadingBlock rows={3} />;
  if (!sp.data.data.length) return <DataTable resource="sprints" filters={ctx} title="Sprints" createPreset={ctx} emptyText="No sprints – create one to plan iterations." />;
  return (<div className="col" style={{ gap: 14 }}>
    <div className="row" style={{ gap: 8 }}><label htmlFor="spr-sel" className="small">Sprint</label><select id="spr-sel" className="input" style={{ maxWidth: 280 }} value={id ?? ''} onChange={(e) => setSel(e.target.value)}>{sp.data.data.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({label(s.status)})</option>)}</select></div>
    {rep.error ? <ErrorBox error={rep.error} /> : rep.loading || !rep.data ? <LoadingBlock rows={3} /> : <div className="grid g2">
      <ChartFrame title="Burndown" sub={`${rep.data.completed_points}/${rep.data.committed_points} points done${rep.data.unestimated_items ? ` · ${rep.data.unestimated_items} unestimated item(s) excluded` : ''}`} legend={[{ key: 'remaining', name: 'Remaining' }, { key: 'ideal', name: 'Ideal' }]}
        table={{ headers: ['Date', 'Remaining', 'Ideal'], rows: rep.data.burndown.map((d: any) => [d.date, d.remaining ?? '—', d.ideal]) }}><TrendChart data={rep.data.burndown} x="date" series={[{ key: 'remaining', name: 'Remaining' }, { key: 'ideal', name: 'Ideal' }]} /></ChartFrame>
      <ChartFrame title="Velocity" sub={`Average of completed sprints: ${rep.data.average_velocity ?? '—'} points`} legend={[{ key: 'committed', name: 'Committed' }, { key: 'completed', name: 'Completed' }]}
        table={{ headers: ['Sprint', 'Committed', 'Completed'], rows: rep.data.velocity.map((v: any) => [v.name, v.committed, v.completed]) }}><BarsChart data={rep.data.velocity} x="name" series={[{ key: 'committed', name: 'Committed' }, { key: 'completed', name: 'Completed' }]} /></ChartFrame>
    </div>}
    <DataTable resource="sprints" filters={ctx} title="Sprints" createPreset={ctx} pageSize={5} />
  </div>);
}

// ================================================================ RACI
export function RaciPanel({ type, id }: { type: string; id: string }) {
  const { data, error, loading, reload } = useApi<any>(`/api/raci/${type}/${id}`);
  const [k, setK] = useState(0);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading) return <LoadingBlock rows={3} />;
  const items = [...new Set<string>(data.assignments.map((a: any) => a.item_ref || a.name))];
  const people = [...new Set<string>(data.assignments.map((a: any) => a.person))];
  return (<div className="col" style={{ gap: 14 }}>
    <Card title="Responsibility matrix" sub="Exactly one Accountable and at least one Responsible per item (enforced on save)">
      {!items.length ? <Empty title="No RACI assignments" /> : <div className="table-wrap"><table className="data compact"><caption className="sr-only">RACI matrix</caption><thead><tr><th scope="col">Item</th>{people.map((p) => <th key={p} scope="col">{p}</th>)}<th scope="col">Valid</th></tr></thead>
        <tbody>{items.map((it) => { const v = data.validation.find((x: any) => x.item === it); return <tr key={it}><th scope="row">{it}</th>{people.map((p) => <td key={p} style={{ textAlign: 'center' }}>{data.assignments.filter((a: any) => (a.item_ref || a.name) === it && a.person === p).map((a: any) => a.responsibility).join(', ') || <span className="muted" aria-label="none">·</span>}</td>)}<td>{v?.valid ? <span className="badge good">OK</span> : <span className="badge warn">{v?.issue}</span>}</td></tr>; })}</tbody></table></div>}
    </Card>
    <DataTable resource="raci_assignments" filters={{ context_type: type, context_id: id }} title="Assignments" createPreset={{ context_type: type, context_id: id }} pageSize={10} refreshKey={k} onOpen={undefined} />
    <button className="btn sm ghost" onClick={() => { setK(k + 1); reload(); }}>Refresh matrix</button>
  </div>);
}

// ================================================================ OCM & quality
export function OcmPanel({ type, id }: { type: string; id: string }) {
  const { data, error, loading, reload } = useApi<any>(`/api/ocm/${type}/${id}`);
  const ctx = { context_type: type, context_id: id };
  return (<div className="col" style={{ gap: 14 }}>
    {error ? <ErrorBox error={error} retry={reload} /> : loading ? <LoadingBlock rows={3} /> : <div className="grid g2">
      <ChartFrame title="Change readiness" sub={`Latest index: ${data.latest_readiness_index ?? 'unknown'} / 100 · awareness, understanding, willingness, ability, reinforcement`} empty={!data.readiness_trend.length} legend={[{ key: 'index', name: 'Readiness index' }]}
        table={{ headers: ['Date', 'Index', 'Awareness', 'Understanding', 'Willingness', 'Ability', 'Reinforcement'], rows: data.readiness_trend.map((r: any) => [r.date, r.index ?? '—', r.awareness, r.understanding, r.willingness, r.ability, r.reinforcement]) }}>
        <TrendChart data={data.readiness_trend} x="date" series={[{ key: 'index', name: 'Readiness index' }]} /></ChartFrame>
      <ChartFrame title="Impacts by dimension" sub={`Training attendance ${fmtPct(data.training.attendance_pct)} · assessment pass ${fmtPct(data.training.avg_pass_pct)}`} empty={!data.impacts.length} legend={[{ key: 'n', name: 'Impacts' }]}
        table={{ headers: ['Dimension', 'Impacts', 'Avg magnitude', 'People'], rows: data.impacts.map((i: any) => [label(i.dimension), i.n, i.avg_mag, i.people]) }}>
        <BarsChart data={data.impacts.map((i: any) => ({ ...i, dimension: label(i.dimension) }))} x="dimension" series={[{ key: 'n', name: 'Impacts' }]} /></ChartFrame>
    </div>}
    <Note>Organisational change management is separate from formal change requests (Change tab); link them by context when one triggers the other.</Note>
    <DataTable resource="ocm_impacts" filters={ctx} createPreset={ctx} title="Change impacts" pageSize={8} />
    <div className="grid g2"><DataTable resource="readiness_assessments" filters={ctx} createPreset={ctx} title="Readiness assessments" pageSize={5} /><DataTable resource="training_activities" filters={ctx} createPreset={ctx} title="Training & enablement" pageSize={5} /></div>
    <div className="grid g2"><DataTable resource="stakeholders" filters={ctx} createPreset={ctx} title="Stakeholders" pageSize={5} /><DataTable resource="communications" filters={ctx} createPreset={ctx} title="Communication plan" pageSize={5} /></div>
  </div>);
}
export function QualityGate({ type, id }: { type: string; id: string }) {
  const { data, error, loading } = useApi<any>(`/api/quality/${type}/${id}`);
  if (error) return <ErrorBox error={error} />; if (loading) return <LoadingBlock rows={2} />;
  return <div className="grid g4">
    <Kpi label="Quality gate" value={data.gate === 'pass' ? <span className="badge good">Pass</span> : <span className="badge warn">Exceptions</span>} foot={`${data.open_non_conformances} open NC · ${data.outstanding_high_defects} high defects`} />
    <Kpi label="Requirement coverage" value={fmtPct(data.requirement_coverage_pct, 1)} foot="Requirements with ≥1 test case" />
    <Kpi label="Pass rate" value={fmtPct(data.pass_rate_pct, 1)} foot="Latest execution per case" />
    <Kpi label="Defect leakage · reopen" value={`${fmtPct(data.defect_leakage_pct, 1)} · ${fmtPct(data.reopen_rate_pct, 1)}`} foot="Production-found ÷ all · reopened ÷ all" />
  </div>;
}

// ================================================================ finance periods
export function FinancePeriods() {
  const { data, error, loading, reload } = useApi<any[]>('/api/finance/periods');
  const { can } = useSession(); const toast = useToast();
  const [month, setMonth] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 7));
  const act = async (period: string, body: any) => { try { await api.post(`/api/finance/periods/${period}/lock`, body); toast('Period updated'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return <Card title="Finance periods" sub="Locked periods reject postings; signed-off periods cannot be reopened. Corrections are reversal entries in an open period.">
    {can('finance:lock') && <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}><label htmlFor="fp-m" className="small">Period</label><input id="fp-m" type="month" className="input" style={{ maxWidth: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
      <button className="btn sm" onClick={() => act(month, { locked: true })}><Lock size={13} />Lock</button><button className="btn sm primary" onClick={() => confirm(`Sign off ${month}? It can no longer be reopened.`) && act(month, { locked: true, sign_off: true })}>Lock & sign off</button></div>}
    {error ? <ErrorBox error={error} retry={reload} /> : loading ? <LoadingBlock rows={2} /> : !data?.length ? <Empty title="No periods locked yet" /> :
      <table className="data compact"><thead><tr><th scope="col">Period</th><th scope="col">State</th><th scope="col">Locked by</th><th scope="col">Signed off</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.map((p) => <tr key={p.period}><td className="mono">{p.period}</td><td>{p.locked ? <span className="badge warn">Locked</span> : <span className="badge">Open</span>}</td><td>{p.locked_by_name ?? '—'}</td><td>{p.signed_off_by_name ? `${p.signed_off_by_name} · ${fmtDate(p.signed_off_at)}` : '—'}</td>
        <td>{can('finance:lock') && p.locked && !p.signed_off_at && <button className="btn sm ghost" onClick={() => { const reason = prompt('Reason for reopening'); if (reason) act(p.period, { locked: false, reason }); }}><Unlock size={13} />Reopen</button>}</td></tr>)}</tbody></table>}
  </Card>;
}

// ================================================================ product health & roadmap versions
export function ProductHealthPanel({ product }: { product: any }) {
  const h = useApi<any>(`/api/products/${product.id}/health`);
  const rv = useApi<any[]>(`/api/products/${product.id}/roadmap-versions`);
  const { can } = useSession(); const toast = useToast();
  const [snap, setSnap] = useState(false); const [why, setWhy] = useState('');
  const ctxP = { product_id: product.id };
  return (<div className="col" style={{ gap: 14 }}>
    {h.error ? <ErrorBox error={h.error} /> : h.loading ? <LoadingBlock rows={2} /> : <div className="grid g4">
      <div className="card kpi"><div className="label">Metric-based health</div><div className="value"><Rag v={h.data.overall} /></div><div className="small">{h.data.metrics_on_track_pct === null ? 'No measurable metrics' : `${h.data.metrics_on_track_pct}% of defined metrics on target`} · separate from the composite health score above</div></div>
      <Kpi label="Open high defects" value={fmtNum(h.data.open_high_defects)} />
      <Kpi label="Technical debt" value={`${h.data.tech_debt.n} items`} foot={`${h.data.tech_debt.high} high/critical`} />
      <Kpi label="Data gaps" value={fmtNum(h.data.data_gaps.length)} foot={h.data.data_gaps.slice(0, 2).join('; ') || 'None'} />
    </div>}
    <DataTable resource="product_metrics" filters={ctxP} createPreset={ctxP} title="Metrics (open a metric to record values and see its trend)" pageSize={6} />
    <Card title="Roadmap versions" sub="Immutable snapshots with rationale" actions={can('roadmap_items:write') && <button className="btn sm" onClick={() => setSnap(true)}>Snapshot roadmap</button>}>
      {rv.error ? <ErrorBox error={rv.error} /> : rv.loading ? <LoadingBlock rows={2} /> : !rv.data?.length ? <Empty title="No roadmap versions yet" /> :
        <table className="data compact"><thead><tr><th scope="col">Version</th><th scope="col">Items</th><th scope="col">Rationale</th><th scope="col">By</th><th scope="col">Date</th></tr></thead><tbody>{rv.data.map((v) => <tr key={v.id}><td>v{v.version}</td><td>{v.snapshot.length}</td><td>{v.rationale}</td><td>{v.created_by_name}</td><td>{fmtDate(v.created_at)}</td></tr>)}</tbody></table>}
    </Card>
    <div className="grid g2"><DataTable resource="personas" filters={ctxP} createPreset={ctxP} title="Personas" pageSize={5} /><DataTable resource="hypotheses" filters={ctxP} createPreset={ctxP} title="Hypotheses" pageSize={5} /></div>
    <div className="grid g2"><DataTable resource="launch_plans" filters={ctxP} createPreset={ctxP} title="Launch plans" pageSize={5} /><DataTable resource="tech_debt_items" filters={ctxP} createPreset={ctxP} title="Technical debt" pageSize={5} /></div>
    <div className="grid g2"><DataTable resource="product_roles" filters={ctxP} createPreset={ctxP} title="Ownership" pageSize={5} /><DataTable resource="pricing_plans" filters={ctxP} createPreset={ctxP} title="Pricing (restricted)" pageSize={5} /></div>
    {snap && <Modal title="Snapshot roadmap" onClose={() => setSnap(false)} footer={<><button className="btn" onClick={() => setSnap(false)}>Cancel</button><button className="btn primary" disabled={why.trim().length < 5} onClick={async () => { try { await api.post(`/api/products/${product.id}/roadmap-versions`, { rationale: why }); toast('Roadmap version saved'); setSnap(false); rv.reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>Save version</button></>}>
      <div className="field"><label htmlFor="rv-w">Rationale for this version</label><textarea id="rv-w" className="input" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} /></div></Modal>}
  </div>);
}

// ================================================================ AI: intake workspace & idea clustering
export function AiIntake() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', context_type: 'project', context_id: null as string | null, source_text: '' });
  const [it, setIt] = useState<any>(null); const [ans, setAns] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, Set<string>>>({});
  const call = async (fn: () => Promise<any>) => { setBusy(true); try { const r = await fn(); if (r?.id) setIt(r); return r; } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  const refresh = async (id: string) => setIt(await api.get(`/api/ai/intakes/${id}`));
  const drafts = it?.generated ?? {};
  const toggle = (k: string, key: string) => setPick((p) => { const s = new Set(p[k] ?? []); s.has(key) ? s.delete(key) : s.add(key); return { ...p, [k]: s }; });
  return <Card title={<span className="row"><Sparkles size={16} />Intake assistant</span>} sub="Paste notes or a brief. The assistant classifies it, asks clarifying questions and drafts requirements, work, risks and assumptions. Nothing is created until you accept selected drafts.">
    {!it ? <div className="col" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 10 }}><div className="field" style={{ flex: 1 }}><label htmlFor="ai-n">Name</label><input id="ai-n" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="ai-t">For</label><select id="ai-t" className="input" value={form.context_type} onChange={(e) => setForm({ ...form, context_type: e.target.value, context_id: null })}><option value="project">Project</option><option value="product">Product</option></select></div>
        <div className="field" style={{ minWidth: 240 }}><label htmlFor="ai-c">{label(form.context_type)}</label><RefSelect id="ai-c" resource={form.context_type === 'project' ? 'projects' : 'products'} value={form.context_id} onChange={(v) => setForm({ ...form, context_id: v })} /></div></div>
      <div className="field"><label htmlFor="ai-s">Source text</label><textarea id="ai-s" className="input" rows={8} value={form.source_text} onChange={(e) => setForm({ ...form, source_text: e.target.value })} /></div>
      <div><button className="btn primary" disabled={busy || !form.context_id || form.name.length < 3 || form.source_text.length < 20} onClick={() => call(() => api.post('/api/ai/intakes', form))}>Analyse</button></div>
    </div> : <div className="col" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}><Status v={it.status} /><span className="small">Provider: {it.provider ?? 'local rules'}</span>{it.intake_classification?.type && <span className="badge">{label(it.intake_classification.type)}</span>}<button className="btn sm ghost" onClick={() => setIt(null)}>New intake</button></div>
      {it.status === 'clarifying' && <>{(it.questions ?? []).map((q: any) => <div key={q.key} className="field"><label htmlFor={`q-${q.key}`}>{q.question}{q.required && ' *'}</label><input id={`q-${q.key}`} className="input" value={ans[q.key] ?? ''} onChange={(e) => setAns({ ...ans, [q.key]: e.target.value })} /></div>)}
        <div><button className="btn primary sm" disabled={busy} onClick={async () => { await call(() => api.post(`/api/ai/intakes/${it.id}/answers`, { answers: (it.questions ?? []).map((q: any) => ans[q.key] ? { key: q.key, answer: ans[q.key] } : { key: q.key, skip: true }) })); await refresh(it.id); }}>Submit answers</button></div></>}
      {it.status === 'ready' && <div><button className="btn primary sm" disabled={busy} onClick={async () => { await call(() => api.post(`/api/ai/intakes/${it.id}/generate`)); await refresh(it.id); }}>Generate drafts</button></div>}
      {it.status === 'generated' && <>
        {['requirements', 'work_items', 'risks', 'assumptions'].map((k) => (drafts[k] ?? []).length > 0 && <fieldset key={k} className="card" style={{ padding: 10 }}><legend className="small" style={{ fontWeight: 600 }}>{label(k)} ({drafts[k].length})</legend>
          {drafts[k].map((d: any) => <label key={d.key} className="row small" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 4 }}><input type="checkbox" checked={pick[k]?.has(d.key) ?? false} onChange={() => toggle(k, d.key)} /><span><b>{d.name}</b>{d.source_quote && <span className="cite" title="Source text">“{String(d.source_quote).slice(0, 60)}”</span>}<br /><span className="muted">{d.description ?? d.acceptance_criteria ?? ''}</span></span></label>)}</fieldset>)}
        <div><button className="btn primary sm" disabled={busy} onClick={async () => { const r = await call(() => api.post(`/api/ai/intakes/${it.id}/accept`, Object.fromEntries(['requirements', 'work_items', 'risks', 'assumptions'].map((k) => [k, [...(pick[k] ?? [])]])))); if (r) { toast('Accepted drafts created as draft records'); await refresh(it.id); } }}>Accept selected as drafts</button></div></>}
      {it.status === 'accepted' && <Note>Accepted. Draft records were created with origin “AI” and must be reviewed by their owners.</Note>}
    </div>}
  </Card>;
}
export function IdeaClusters() {
  const [t, setT] = useState(0.2);
  const { data, error, loading } = useApi<any>(`/api/ai/idea-clusters?threshold=${t}`);
  return <Card title="Idea themes (AI-assisted, read-only)" sub={data?.disclaimer} actions={<label className="small row" style={{ gap: 6 }}>Similarity<input type="range" min={0.1} max={0.6} step={0.05} value={t} onChange={(e) => setT(Number(e.target.value))} aria-valuetext={`${t}`} /></label>}>
    {error ? <ErrorBox error={error} /> : loading ? <LoadingBlock rows={3} /> : !data.clusters.length ? <Empty title="No ideas to cluster" /> :
      <ul className="col" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>{data.clusters.slice(0, 12).map((c: any, i: number) => <li key={i} className="list-row"><span className="badge">{c.size}</span><b style={{ flex: 1 }}>{c.theme}</b><span className="small">{c.members.map((m: any) => <span key={m.id} className="cite">{m.code}</span>)}</span></li>)}</ul>}
  </Card>;
}

// ================================================================ admin: org settings & holidays
export function OrgSettings() {
  const { data, error, loading, reload } = useApi<any>('/api/org/settings');
  const hol = useApi<any[]>('/api/holidays');
  const [s, setS] = useState<any>(null); const [h, setH] = useState(''); const toast = useToast(); const { can } = useSession();
  if (error) return <ErrorBox error={error} retry={reload} />; if (loading) return <LoadingBlock rows={3} />;
  const cur = s ?? data.settings ?? {};
  const save = async () => { try { await api.put('/api/org/settings', Object.fromEntries(Object.entries(cur).filter(([k]) => ['locale', 'time_zone', 'currency', 'fiscal_year_start_month', 'date_format'].includes(k)))); toast('Settings saved'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const saveHol = async () => { try { const rows = h.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [date, ...n] = l.split(/[ ,;\t]+/); return { date, name: n.join(' ') || 'Holiday' }; }); await api.put('/api/holidays', { holidays: rows }); toast(`${rows.length} holidays saved`); hol.reload(); setH(''); } catch (e) { toast(errMsg(e), 'error'); } };
  const editable = can('admin:config');
  return <div className="grid g2">
    <Card title="Locale & time zone" sub="Used for dates, numbers, currency and scheduling">
      <div className="col" style={{ gap: 8 }}>
        {[['locale', 'Locale (e.g. en-MY)'], ['time_zone', 'Time zone (IANA, e.g. Asia/Kuala_Lumpur)'], ['currency', 'Reporting currency (ISO 4217)']].map(([k, l]) => <div key={k} className="field"><label htmlFor={`os-${k}`}>{l}</label><input id={`os-${k}`} className="input" disabled={!editable} value={cur[k] ?? ''} onChange={(e) => setS({ ...cur, [k]: e.target.value })} /></div>)}
        <div className="field"><label htmlFor="os-df">Date format</label><select id="os-df" className="input" disabled={!editable} value={cur.date_format ?? 'DD/MM/YYYY'} onChange={(e) => setS({ ...cur, date_format: e.target.value })}>{['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="os-fy">Fiscal year starts (month 1–12)</label><input id="os-fy" className="input" type="number" min={1} max={12} disabled={!editable} value={cur.fiscal_year_start_month ?? 1} onChange={(e) => setS({ ...cur, fiscal_year_start_month: Number(e.target.value) })} /></div>
        {editable && <div><button className="btn primary sm" onClick={save}>Save</button></div>}
      </div>
    </Card>
    <Card title="Working calendar" sub="Holidays are excluded from critical-path scheduling">
      {hol.loading ? <LoadingBlock rows={2} /> : !hol.data?.length ? <Empty title="No holidays configured" /> : <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{hol.data.map((x) => <li key={x.holiday_date}>{fmtDate(x.holiday_date)} – {x.name}</li>)}</ul>}
      {editable && <div className="field" style={{ marginTop: 10 }}><label htmlFor="os-h">Replace calendar (one per line: YYYY-MM-DD Name)</label><textarea id="os-h" className="input" rows={4} value={h} onChange={(e) => setH(e.target.value)} /><div><button className="btn sm" style={{ marginTop: 6 }} disabled={!h.trim()} onClick={saveHol}>Save holidays</button></div></div>}
    </Card>
  </div>;
}

export function ExportProjectButton({ id }: { id: string }) {
  return <a className="btn" href={`/api/projects/${id}/export`} download><Download size={14} />Export</a>;
}
export { Link };
