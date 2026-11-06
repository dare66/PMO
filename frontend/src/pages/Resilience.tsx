import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileText, Info, Plus, Save, Trash2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, Note, PageHead, Status, Tabs, useToast, errMsg } from '../components/ui';
import { DataTable, RefSelect } from '../components/resource';
import { BarsChart, ChartFrame, Heatmap, RelGraph } from '../components/charts';
import { WorkflowPanel } from '../components/workflow';

const CATS = ['financial', 'operational', 'regulatory', 'customer', 'reputational'];
const HORIZONS = [1, 4, 24, 72, 168];
export const sevColor = (v: number | null, threshold = 4) => v === null ? 'repeating-linear-gradient(135deg, var(--surface-2) 0 4px, var(--surface-3) 4px 8px)'
  : v >= threshold ? 'color-mix(in srgb, var(--crit) ' + (40 + (v - threshold) * 15) + '%, var(--surface))' : v >= 3 ? 'color-mix(in srgb, var(--serious) 40%, var(--surface))' : v >= 2 ? 'color-mix(in srgb, var(--warn) 38%, var(--surface))' : v >= 1 ? 'color-mix(in srgb, var(--good) 22%, var(--surface))' : 'var(--surface-2)';

export function ResiliencePage() {
  const nav = useNavigate();
  const { data: bias } = useApi<any>('/api/r/bia_assessments?pageSize=200');
  const { data: tr, error } = useApi<any>('/api/bia/traceability');
  const [tab, setTab] = useState('overview');
  const rows = bias?.data ?? [];
  const tiers = [1, 2, 3, 4].map((t) => ({ name: `Tier ${t}`, n: rows.filter((b: any) => b.criticality_tier === t).length }));
  const today = new Date().toISOString().slice(0, 10);
  return (<>
    <PageHead title="Business impact analysis & operational resilience" sub="BIA is embedded in intake, design and readiness – not written at the end. Traceability runs from business process to recovery strategy. Aligned to ISO 22301 / ISO/TS 22317 concepts; no certification is implied." />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <Kpi label="BIAs" value={rows.length} foot={`${rows.filter((b: any) => b.status === 'approved').length} approved · ${rows.filter((b: any) => b.status === 'draft').length} draft`} />
      <Kpi label="Tier 1 (MTPD ≤ 4h)" value={tiers[0].n} foot="Most time-critical activities" tone="crit" icon={<AlertTriangle size={16} />} />
      <Kpi label="Reviews overdue" value={rows.filter((b: any) => b.next_review_date && b.next_review_date < today).length} foot="Periodic review cycle" />
      <Kpi label="Traceability gaps" value={tr ? tr.chains.filter((c: any) => c.gaps.length).length : '…'} foot="Processes missing a link in the chain" />
    </div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'trace', label: 'Traceability map' }, { key: 'register', label: 'BIA register' }, { key: 'services', label: 'Services' }, { key: 'strategies', label: 'Recovery strategies' }]} />
    {tab === 'overview' && <div className="grid g-12">
      <div className="span-5"><ChartFrame title="Criticality tiers" sub="Derived from MTPD" height={220} table={{ headers: ['Tier', 'BIAs'], rows: tiers.map((t) => [t.name, t.n]) }}><BarsChart data={tiers} x="name" series={[{ key: 'n', name: 'BIAs', color: 'var(--s1)' }]} /></ChartFrame></div>
      <div className="span-7"><Card title="Recovery objectives vs tolerance" sub="RTO must sit inside MTPD · bar = MTPD, marker = RTO">
        <div className="col" style={{ gap: 10 }}>{rows.map((b: any) => { const max = 168; const m = b.mtpd_hours, r = b.rto_hours; const bad = m !== null && r !== null && r > m; return (
          <div key={b.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/resilience/bia/${b.id}`)}>
            <div className="row between small"><span><b>{b.code}</b> {b.name}</span><span className={bad ? '' : 'muted'} style={bad ? { color: 'var(--crit-ink)', fontWeight: 600 } : undefined}>MTPD {m ?? '—'}h · RTO {r ?? '—'}h · RPO {b.rpo_hours ?? '—'}h {bad && '· RTO exceeds MTPD'}</span></div>
            <div style={{ position: 'relative', height: 12, background: 'var(--surface-3)', borderRadius: 6, marginTop: 4 }} role="img" aria-label={`MTPD ${m ?? 'unknown'} hours, RTO ${r ?? 'unknown'} hours`}>
              {m !== null && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (Math.log(m + 1) / Math.log(max + 1)) * 100)}%`, background: 'var(--q300)', borderRadius: 6 }} />}
              {r !== null && <div style={{ position: 'absolute', top: -3, width: 4, height: 18, borderRadius: 2, left: `calc(${Math.min(100, (Math.log(r + 1) / Math.log(max + 1)) * 100)}% - 2px)`, background: bad ? 'var(--crit)' : 'var(--text)' }} />}
            </div></div>); })}
          <div className="tiny muted">Log scale 0–168h. Hatched / missing values are shown as “—”, never assumed.</div>
        </div></Card></div>
    </div>}
    {tab === 'trace' && (error ? <ErrorBox error={error} /> : !tr ? <LoadingBlock /> : <div className="col" style={{ gap: 14 }}>
      {tr.chains.map((c: any) => {
        const cols = [
          { title: 'Process', nodes: [{ id: c.process.id, label: c.process.name, sub: `${c.process.code} · ${c.process.department ?? ''}`, tone: c.process.criticality === 'critical' ? 'crit' : undefined }] },
          { title: 'Service', nodes: c.service ? [{ id: c.service.id, label: c.service.name, sub: `${c.service.code} · ${c.service.criticality}` }] : [] },
          { title: 'Product / application', nodes: [...(c.product ? [{ id: c.product.id, label: c.product.name, sub: c.product.code }] : []), ...c.applications.map((a: any) => ({ id: a.id, label: a.name, sub: `${a.hosting} · ${a.data_classification}` }))] },
          { title: 'Infrastructure & data', nodes: [...c.infrastructure.map((i: any) => ({ id: i.id, label: i.name, sub: i.env_type ?? i.dependency_type })), ...c.data.map((d: any) => ({ id: d.id, label: d.name, sub: 'data' }))] },
          { title: 'Vendors', nodes: c.vendors.map((v: any) => ({ id: v.id, label: v.name, sub: `risk ${v.risk_rating}`, tone: v.risk_rating === 'critical' ? 'serious' : undefined })) },
          { title: 'Recovery', nodes: c.recovery.map((r: any) => ({ id: r.id, label: r.name, sub: `RTO ${r.achievable_rto_hours ?? '—'}h · ${r.test_result ?? 'untested'}`, tone: r.test_result === 'passed' ? 'good' : r.test_result === 'failed' ? 'crit' : 'warn' })) },
        ];
        const edges: any[] = [];
        // connect each non-empty layer to the next non-empty layer, so a missing layer shows as a visible gap
        const filled = cols.filter((x) => x.nodes.length);
        for (let i = 0; i < filled.length - 1; i++) for (const a of filled[i].nodes) for (const b of filled[i + 1].nodes) edges.push({ from: a.id, to: b.id });
        return <Card key={c.process.id} title={`${c.process.code} ${c.process.name}`} sub={c.bia ? `BIA ${c.bia.code} · MTPD ${c.bia.mtpd_hours ?? '—'}h · RTO ${c.bia.rto_hours ?? '—'}h · Tier ${c.bia.criticality_tier ?? '—'}` : 'No BIA'} actions={c.gaps.length ? <span className="badge warn"><AlertTriangle size={12} />{c.gaps.join(' · ')}</span> : <span className="badge good"><CheckCircle2 size={12} />Complete chain</span>}>
          <RelGraph columns={cols} edges={edges} onNode={(id) => c.bia && id === c.process.id && nav(`/resilience/bia/${c.bia.id}`)} />
        </Card>;
      })}</div>)}
    {tab === 'register' && <DataTable resource="bia_assessments" onOpen={(r) => nav(`/resilience/bia/${r.id}`)} />}
    {tab === 'services' && <DataTable resource="services" />}
    {tab === 'strategies' && <DataTable resource="recovery_strategies" />}
  </>);
}

export function BiaDetail() {
  const { id } = useParams();
  const { can } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const { data: a, error, loading, reload } = useApi<any>(`/api/bia/${id}/analysis`);
  const [grid, setGrid] = useState<Record<string, number | null>>({});
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('impact');
  const [dep, setDep] = useState<any>({ dependency_type: 'application', name: '', recovery_capability_hours: null, data_loss_capability_hours: null, single_point_of_failure: false, vendor_id: null });
  useEffect(() => { if (a) { const g: Record<string, number | null> = {}; for (const c of CATS) for (const h of HORIZONS) g[`${c}|${h}`] = a.impacts.find((i: any) => i.category === c && Number(i.horizon_hours) === h)?.severity ?? null; setGrid(g); setDirty(false); } }, [a]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading || !a) return <LoadingBlock rows={8} />;
  const b = a.bia;
  const canEdit = can('bia_assessments:write');
  const save = async () => {
    const impacts = Object.entries(grid).filter(([, v]) => v !== null).map(([k, v]) => { const [category, h] = k.split('|'); return { category, horizon_hours: Number(h), severity: v }; });
    try { await api.put(`/api/bia/${id}/impacts`, { impacts }); toast('Impact assessment saved – MTPD and tier recalculated'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (<>
    <PageHead crumbs={<><Link to="/resilience">Resilience</Link><span>/</span><span>{b.code}</span></>} title={b.name}
      sub={<span className="row wrap" style={{ gap: 8 }}><Status v={b.status} /><span className="badge">{label(b.assessment_level)} assessment</span><span className="small">Next review {fmtDate(b.next_review_date)}</span></span>}
      actions={can('documents:write') && <button className="btn" onClick={async () => { try { const r = await api.post('/api/documents/generate', { doc_type: 'bia_report', record_id: b.id, ...(b.product_id ? { context_type: 'product', context_id: b.product_id } : {}) }); toast(`BIA report v${r.version} generated`); nav(`/documents?open=${r.document_id}`); } catch (e) { toast(errMsg(e), 'error'); } }}><FileText size={14} />Generate BIA report</button>} />
    <div className="grid g4" style={{ marginBottom: 14 }}>
      <Kpi label="MTPD (derived)" value={a.derived.mtpd_hours === null ? '—' : `${a.derived.mtpd_hours} h`} foot={a.derived.overridden ? 'Manually overridden (justified)' : `First horizon with severity ≥ ${b.tolerance_threshold}`} />
      <Kpi label="RTO / RPO" value={`${b.rto_hours ?? '—'}h / ${b.rpo_hours ?? '—'}h`} foot={`MBCO ${b.mbco_pct ?? '—'}%`} tone={b.rto_hours !== null && b.mtpd_hours !== null && b.rto_hours > b.mtpd_hours ? 'crit' : undefined} />
      <Kpi label="Criticality tier" value={b.criticality_tier ?? '—'} foot="1 = most time-critical" />
      <Kpi label="Validation" value={a.ready_for_approval ? 'Ready' : `${a.findings.filter((f: any) => f.severity === 'error').length} blocking`} foot={`${a.findings.length} finding(s)`} tone={a.ready_for_approval ? 'good' : 'crit'} />
    </div>
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'impact', label: 'Impact over time' }, { key: 'deps', label: `Dependencies (${a.dependencies.length})` }, { key: 'recovery', label: `Recovery (${a.strategies.length})` }, { key: 'findings', label: `Findings (${a.findings.length})` }, { key: 'details', label: 'Details & approval' }]} />
    {tab === 'impact' && <Card title="Impact severity matrix" sub="0 none · 1 minor · 2 moderate · 3 significant · 4 major · 5 severe. Cells at or above the tolerance threshold are intolerable." actions={canEdit && <button className="btn primary sm" disabled={!dirty} onClick={save}><Save size={14} />Save & recalculate</button>}>
      <Heatmap rows={CATS.map(label)} cols={HORIZONS.map((h) => (h < 24 ? `${h}h` : `${h / 24}d`))} yTitle="Impact" xTitle="Disruption"
        value={(r, c) => grid[`${CATS[r]}|${HORIZONS[c]}`] ?? null} color={(v) => sevColor(v, b.tolerance_threshold)}
        cellText={(v) => v ?? '–'} onCell={canEdit ? (r, c) => { const k = `${CATS[r]}|${HORIZONS[c]}`; const v = grid[k]; setGrid({ ...grid, [k]: v === null ? 0 : v >= 5 ? null : v + 1 }); setDirty(true); } : undefined} />
      <div className="row wrap small muted" style={{ marginTop: 10, gap: 12 }}><Info size={14} />{canEdit ? 'Click a cell, or focus it and press Enter, to cycle severity (– → 0 … 5 → –).' : 'Read-only.'}</div>
    </Card>}
    {tab === 'deps' && <Card title="Dependencies" sub="People, applications, infrastructure, data and third parties the activity needs">
      <div className="table-wrap"><table className="data"><thead><tr><th>Type</th><th>Dependency</th><th className="num">Recovery capability (h)</th><th className="num">Data-loss capability (h)</th><th>SPOF</th><th>Linked</th><th /></tr></thead>
        <tbody>{a.dependencies.map((d: any) => { const gap = b.rto_hours !== null && d.recovery_capability_hours !== null && d.recovery_capability_hours > b.rto_hours; return <tr key={d.id}><td>{label(d.dependency_type)}</td><td>{d.name}</td><td className="num" style={gap ? { color: 'var(--crit-ink)', fontWeight: 700 } : undefined}>{d.recovery_capability_hours ?? '—'}{gap && ' ⚠'}</td><td className="num">{d.data_loss_capability_hours ?? '—'}</td><td>{d.single_point_of_failure ? <span className="badge crit">SPOF</span> : '—'}</td><td className="small">{d.vendor_name ?? d.product_name ?? d.service_name ?? '—'}</td><td>{canEdit && <button className="icon-btn" aria-label={`Remove ${d.name}`} onClick={async () => { await api.del(`/api/bia/${id}/dependencies/${d.id}`); reload(); }}><Trash2 size={14} /></button>}</td></tr>; })}</tbody></table></div>
      {canEdit && <div className="form-grid" style={{ marginTop: 14 }}>
        <div className="field"><label htmlFor="dt">Type</label><select id="dt" className="input" value={dep.dependency_type} onChange={(e) => setDep({ ...dep, dependency_type: e.target.value })}>{['people', 'application', 'infrastructure', 'data', 'third_party', 'facility'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></div>
        <div className="field"><label htmlFor="dn">Name</label><input id="dn" className="input" value={dep.name} onChange={(e) => setDep({ ...dep, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="dr">Recovery capability (h)</label><input id="dr" type="number" className="input" value={dep.recovery_capability_hours ?? ''} onChange={(e) => setDep({ ...dep, recovery_capability_hours: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="dl">Data-loss capability (h)</label><input id="dl" type="number" className="input" value={dep.data_loss_capability_hours ?? ''} onChange={(e) => setDep({ ...dep, data_loss_capability_hours: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="dv">Vendor (optional)</label><RefSelect id="dv" resource="vendors" value={dep.vendor_id} onChange={(v) => setDep({ ...dep, vendor_id: v })} /></div>
        <div className="field" style={{ justifyContent: 'flex-end' }}><label className="check"><input type="checkbox" checked={dep.single_point_of_failure} onChange={(e) => setDep({ ...dep, single_point_of_failure: e.target.checked })} />Single point of failure</label></div>
        <div className="wide"><button className="btn" disabled={!dep.name} onClick={async () => { try { await api.post(`/api/bia/${id}/dependencies`, dep); setDep({ ...dep, name: '' }); reload(); toast('Dependency added'); } catch (e) { toast(errMsg(e), 'error'); } }}><Plus size={14} />Add dependency</button></div>
      </div>}
    </Card>}
    {tab === 'recovery' && <div className="col" style={{ gap: 14 }}>
      <ChartFrame title="Recovery timeline" sub="Achievable recovery time per strategy vs RTO (dashed) and MTPD (solid)" height={200} empty={!a.strategies.length}>
        <BarsChart horizontal data={a.strategies.map((s: any) => ({ name: s.name, h: s.achievable_rto_hours }))} x="name" series={[{ key: 'h', name: 'Achievable recovery (h)', color: 'var(--s3)' }]} />
      </ChartFrame>
      <DataTable resource="recovery_strategies" filters={{ bia_id: b.id }} title="Recovery strategies & tests" />
    </div>}
    {tab === 'findings' && <Card title="Validation findings" sub="Errors block approval">{a.findings.length ? a.findings.map((f: any, i: number) => <div key={i} className="list-row">{f.severity === 'error' ? <XCircle size={16} color="var(--crit)" /> : <AlertTriangle size={16} color="var(--warn)" />}<span className="badge">{f.code}</span><span>{f.message}</span></div>) : <Empty title="No findings">This BIA is internally consistent.</Empty>}</Card>}
    {tab === 'details' && <div className="grid g2"><Card title="Context"><dl className="kv"><dt>Process</dt><dd>{b.process_id ?? '—'}</dd><dt>Peak periods</dt><dd>{b.peak_periods ?? '—'}</dd><dt>Manual workarounds</dt><dd>{b.manual_workarounds ?? '—'}</dd><dt>BC requirements</dt><dd>{b.bc_requirements ?? '—'}</dd><dt>DR requirements</dt><dd>{b.dr_requirements ?? '—'}</dd><dt>Approved</dt><dd>{b.approved_at ? fmtDate(b.approved_at) : '—'}</dd></dl><Note>Editing impacts or dependencies of an approved BIA returns it to draft for re-approval.</Note></Card><WorkflowPanel entityType="bia_assessments" entityId={b.id} onChanged={reload} /></div>}
  </>);
}

export function ProcessesPage() {
  const { data } = useApi<any>('/api/r/business_processes?pageSize=200');
  const [sel, setSel] = useState<string | null>(null);
  const steps = useApi<any>(sel ? `/api/r/process_steps?process_id=${sel}&pageSize=200&sort=seq:asc` : null, [sel]);
  useEffect(() => { if (!sel && data?.data?.length) setSel(data.data[0].id); }, [data, sel]);
  const s = steps.data?.data ?? [];
  const lanes = [...new Set(s.map((x: any) => x.lane ?? 'Unassigned'))] as string[];
  const W = Math.max(700, (Math.max(0, ...s.map((x: any) => x.seq)) + 1) * 150), laneH = 86;
  const pos = (x: any) => ({ x: 120 + (x.seq - 1) * 150, y: lanes.indexOf(x.lane ?? 'Unassigned') * laneH + laneH / 2 });
  return (<>
    <PageHead title="Business process repository" sub="As-is / to-be processes with owners, versions and swimlane maps; linked to services, BIA, requirements and SOPs." />
    <div className="grid g-12">
      <div className="span-4"><Card title="Processes" bodyClass="">{(data?.data ?? []).map((p: any) => <button key={p.id} className="list-row" style={{ width: '100%', border: 'none', padding: '10px 16px', background: sel === p.id ? 'var(--brand-50)' : 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(p.id)}><div style={{ flex: 1 }}><b>{p.name}</b><div className="tiny muted">{p.code} · v{p.version_label} · {label(p.process_state)} · {p._refs.department_id?.name ?? ''}</div></div><Status v={p.criticality} /></button>)}</Card></div>
      <div className="span-8"><Card title="Swimlane process map" sub="Generated from process steps (BPMN-style: start ○, task ▭, decision ◇, end ◉)">
        {!s.length ? <Empty title="No steps modelled" art="chart">Add process steps (sequence, lane, type, next steps) to render the map.</Empty> : (
          <div style={{ overflowX: 'auto' }}><svg width={W} height={lanes.length * laneH} role="img" aria-label="Process swimlane diagram">
            <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-3)" /></marker></defs>
            {lanes.map((l, i) => <g key={l}><rect x={0} y={i * laneH} width={W} height={laneH} fill={i % 2 ? 'var(--surface-2)' : 'var(--surface)'} stroke="var(--border)" /><rect x={0} y={i * laneH} width={100} height={laneH} fill="var(--brand-50)" stroke="var(--border)" /><text x={50} y={i * laneH + laneH / 2} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="var(--brand)">{l}</text></g>)}
            {s.flatMap((x: any) => (x.next_step_seq ?? []).map((n: number) => { const t = s.find((y: any) => y.seq === n); if (!t) return null; const a = pos(x), b2 = pos(t); return <path key={`${x.id}-${n}`} d={`M${a.x + 50},${a.y} C${a.x + 90},${a.y} ${b2.x - 90},${b2.y} ${b2.x - 52},${b2.y}`} fill="none" stroke="var(--text-3)" strokeWidth={1.5} markerEnd="url(#arr)" />; }))}
            {s.map((x: any) => { const p = pos(x); return <g key={x.id} transform={`translate(${p.x},${p.y})`}>
              {x.step_type === 'decision' ? <rect x={-28} y={-28} width={56} height={56} transform="rotate(45)" rx={6} fill="var(--warn-bg)" stroke="var(--warn)" /> : x.step_type === 'start' || x.step_type === 'end' ? <circle r={20} fill={x.step_type === 'start' ? 'var(--good-bg)' : 'var(--crit-bg)'} stroke={x.step_type === 'start' ? 'var(--good)' : 'var(--crit)'} strokeWidth={x.step_type === 'end' ? 4 : 2} /> : <rect x={-50} y={-24} width={100} height={48} rx={10} fill="var(--surface)" stroke="var(--brand)" />}
              <text y={x.step_type === 'task' ? 0 : 36} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--text)">{x.name.length > 18 ? x.name.slice(0, 17) + '…' : x.name}<title>{x.name}</title></text></g>; })}
          </svg></div>)}
      </Card></div>
      <div className="span-12"><DataTable resource="business_processes" title="All processes" /></div>
      {sel && <div className="span-12"><DataTable resource="process_steps" filters={{ process_id: sel }} title="Steps of selected process" refreshKey={sel} /></div>}
    </div>
  </>);
}
