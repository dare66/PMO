/**
 * Shared panels for capabilities added against FRS v1.1: comments & mentions, evidence files,
 * and governed record actions (transitions, approvals requests, locks, reversals …).
 * Every action posts to a server endpoint that enforces the rule; the UI only offers it.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Bell, BellOff, Download, FileUp, MessageSquare, Play } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtDateTime, fmtNum, label } from '../lib/format';
import { Empty, ErrorBox, LoadingBlock, Modal, Note, Status, errMsg, useToast } from './ui';

// ------------------------------------------------------------------ generic action form
export interface ActionField { n: string; l: string; t?: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'bool' | 'month'; opts?: string[]; req?: boolean; def?: unknown; help?: string }
export interface ActionDef { key: string; label: string; icon?: ReactNode; perm?: string; when?: (row: any) => boolean; fields?: ActionField[]; method?: 'post' | 'put'; url: (row: any, v: any) => string; body?: (v: any, row: any) => unknown; confirm?: string; done?: (res: any) => string; tone?: 'primary' | 'danger'; result?: (res: any) => ReactNode }

export function ActionButton({ a, row, onDone }: { a: ActionDef; row: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const toast = useToast();
  const run = async () => {
    const missing = (a.fields ?? []).filter((f) => f.req && (v[f.n] === undefined || v[f.n] === ''));
    if (missing.length) { setErr(`Required: ${missing.map((m) => m.l).join(', ')}`); return; }
    setBusy(true); setErr(null);
    try {
      const vals = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined).map(([k, x]) => [k, (a.fields ?? []).find((f) => f.n === k)?.t === 'number' ? Number(x) : x]));
      const body = a.body ? a.body(vals, row) : vals;
      const r = a.method === 'put' ? await api.put(a.url(row, vals), body) : await api.post(a.url(row, vals), body);
      toast(a.done?.(r) ?? `${a.label}: done`);
      if (a.result) setRes(r); else { setOpen(false); setV({}); }
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const start = () => {
    if (!a.fields?.length && !a.result) { if (a.confirm && !confirm(a.confirm)) return; run(); return; }
    setV(Object.fromEntries((a.fields ?? []).filter((f) => f.def !== undefined).map((f) => [f.n, f.def]))); setRes(null); setErr(null); setOpen(true);
  };
  return (<>
    <button className={`btn sm ${a.tone ?? ''}`} onClick={start} disabled={busy}>{a.icon ?? <Play size={13} />}{a.label}</button>
    {open && <Modal title={a.label} onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>{res ? 'Close' : 'Cancel'}</button>{!res && <button className={`btn ${a.tone ?? 'primary'}`} onClick={run} disabled={busy}>{busy ? 'Working…' : a.label}</button>}</>}>
      {a.confirm && <Note warn>{a.confirm}</Note>}
      {res ? a.result!(res) : <div className="col" style={{ gap: 10 }}>
        {(a.fields ?? []).map((f) => {
          const id = `af-${a.key}-${f.n}`;
          const set = (x: any) => setV((o) => ({ ...o, [f.n]: x }));
          return <div key={f.n} className="field"><label htmlFor={id}>{f.l}{f.req && <span aria-hidden="true"> *</span>}</label>
            {f.t === 'textarea' ? <textarea id={id} className="input" rows={4} value={v[f.n] ?? ''} onChange={(e) => set(e.target.value)} />
              : f.t === 'select' ? <select id={id} className="input" value={v[f.n] ?? ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{f.opts!.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
              : f.t === 'bool' ? <input id={id} type="checkbox" checked={!!v[f.n]} onChange={(e) => set(e.target.checked)} />
              : <input id={id} className="input" type={f.t === 'date' ? 'date' : f.t === 'number' ? 'number' : f.t === 'month' ? 'month' : 'text'} value={v[f.n] ?? ''} onChange={(e) => set(e.target.value)} />}
            {f.help && <div className="tiny muted">{f.help}</div>}</div>;
        })}
        {!a.fields?.length && <p className="small">Run “{a.label}” for {row.code}?</p>}
      </div>}
      {err && <div className="note warn" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>}
  </>);
}

const today = () => new Date().toISOString().slice(0, 10);
const PIPELINE_NEXT: Record<string, string[]> = { submitted: ['screening', 'rejected', 'deferred'], screening: ['discovery', 'proposed', 'rejected', 'deferred'], discovery: ['proposed', 'rejected', 'deferred'], proposed: ['approved', 'rejected', 'deferred'], deferred: ['screening', 'rejected'], approved: ['deferred'], active: ['suspended', 'closed'], suspended: ['active', 'closed'] };

function Diff({ res }: { res: any }) {
  return <div><div className="small" style={{ marginBottom: 6 }}>+{res.added} / −{res.removed} lines</div><pre className="diff" style={{ maxHeight: 360, overflow: 'auto', fontSize: 12 }}>{res.lines.map((l: any, i: number) => <div key={i} style={{ background: l.op === '+' ? 'var(--diff-add)' : l.op === '-' ? 'var(--diff-del)' : undefined }}>{l.op} {l.text}</div>)}</pre></div>;
}

/** Governed actions per resource. Server endpoints enforce every rule. */
export const RECORD_ACTIONS: Record<string, ActionDef[]> = {
  requests: [
    { key: 'transition', label: 'Move stage', perm: 'requests:write', when: (r) => !!PIPELINE_NEXT[r.pipeline_stage], fields: [{ n: 'to', l: 'New stage', t: 'select', opts: [...new Set(Object.values(PIPELINE_NEXT).flat())], req: true }, { n: 'reason', l: 'Reason (required for reject/defer/suspend)', t: 'textarea' }, { n: 'deferral_date', l: 'Deferral review date', t: 'date' }], url: (r) => `/api/requests/${r.id}/transition`, done: (x) => `Moved to ${label(x.to)}` },
    { key: 'convert', label: 'Convert to project', perm: 'projects:write', when: (r) => r.pipeline_stage === 'approved' && !r.converted_project_id, fields: [{ n: 'template_project_id', l: 'Template project ID (optional)' }], url: (r) => `/api/requests/${r.id}/convert`, done: (x) => `Project ${x.code} created` },
  ],
  time_entries: [{ key: 'decide', label: 'Approve / reject', perm: 'time_entries:approve', when: (r) => r.status === 'submitted', fields: [{ n: 'decision', l: 'Decision', t: 'select', opts: ['approved', 'rejected'], req: true }, { n: 'note', l: 'Note (required when rejecting)', t: 'textarea' }], url: (r) => `/api/time-entries/${r.id}/decide` }],
  resource_allocations: [{ key: 'req', label: 'Request approval', perm: 'resource_allocations:write', when: (r) => r.status === 'requested', url: (r) => `/api/resource-allocations/${r.id}/request-approval`, done: (x) => x.over_allocated ? `Requested – person would be ${x.resulting_allocation_pct}% allocated` : 'Sent to resource manager' }],
  defects: [{ key: 'waiver', label: 'Request waiver / known error', perm: 'defects:write', when: (r) => !['closed', 'waived', 'known_error'].includes(r.status), fields: [{ n: 'disposition', l: 'Disposition', t: 'select', opts: ['waived', 'known_error'], req: true }, { n: 'reason', l: 'Justification (min 10 characters)', t: 'textarea', req: true }], url: (r) => `/api/defects/${r.id}/request-waiver`, done: () => 'Waiver sent for approval' }],
  issues: [{ key: 'convert', label: 'Convert to action', perm: 'work_items:write', when: (r) => !r.converted_work_item_id, url: (r) => `/api/issues/${r.id}/convert-to-work`, done: (x) => `Action ${x.code} created` }],
  announcements: [
    { key: 'publish', label: 'Publish', perm: 'announcements:write', when: (r) => r.status === 'draft', fields: [{ n: 'roles', l: 'Audience roles (comma-separated, blank = everyone)', help: 'e.g. member, project_manager' }], url: (r) => `/api/announcements/${r.id}/publish`, body: (v) => ({ audience_roles: String(v.roles ?? '').split(',').map((s) => s.trim()).filter(Boolean) }), done: (x) => `Published to ${x.recipients} people` },
    { key: 'ack', label: 'Acknowledge', when: (r) => r.status === 'published', url: (r) => `/api/announcements/${r.id}/ack`, done: () => 'Acknowledged' },
  ],
  cost_entries: [{ key: 'reverse', label: 'Reverse entry', perm: 'cost_entries:write', when: (r) => !r.reversed && !r.reversal_of, fields: [{ n: 'reason', l: 'Reason', t: 'textarea', req: true }, { n: 'post_date', l: 'Post in period (date)', t: 'date', req: true, def: today() }], url: (r) => `/api/cost-entries/${r.id}/reverse`, done: (x) => `Reversal ${x.code} posted` }],
  documents: [
    { key: 'checkout', label: 'Check out', perm: 'documents:write', when: (r) => !r.checked_out_by, url: (r) => `/api/documents/${r.id}/checkout`, done: () => 'Checked out – others cannot edit until check-in' },
    { key: 'checkin', label: 'Check in', perm: 'documents:write', when: (r) => !!r.checked_out_by, fields: [{ n: 'content', l: 'New version content (Markdown, optional)', t: 'textarea' }, { n: 'change_note', l: 'Change note' }, { n: 'discard', l: 'Discard (release lock without new version)', t: 'bool' }], url: (r) => `/api/documents/${r.id}/checkin`, done: (x) => `Checked in (v${x.version})` },
    { key: 'retention', label: 'Retention & legal hold', perm: 'documents:admin', method: 'put', fields: [{ n: 'retention_category', l: 'Retention category' }, { n: 'retention_until', l: 'Retain until', t: 'date' }, { n: 'legal_hold', l: 'Legal hold', t: 'bool' }, { n: 'reason', l: 'Reason', req: true }], url: (r) => `/api/documents/${r.id}/retention` },
    { key: 'ack', label: 'Acknowledge', when: (r) => r.status === 'approved', url: (r) => `/api/documents/${r.id}/ack`, done: (x) => `Acknowledged v${x.version}` },
  ],
  releases: [
    { key: 'gonogo', label: 'Record go / no-go', perm: 'releases:approve', fields: [{ n: 'decision', l: 'Decision', t: 'select', opts: ['go', 'go_with_conditions', 'no_go'], req: true }, { n: 'conditions', l: 'Conditions', t: 'textarea' }, { n: 'exception_justification', l: 'Exception justification (required when mandatory readiness evidence is missing)', t: 'textarea' }], url: (r) => `/api/releases/${r.id}/go-no-go`, done: (x) => `Decision recorded (${x.decision_record})` },
    { key: 'hc', label: 'Start hypercare', perm: 'releases:write', when: (r) => r.status === 'deployed', url: (r) => `/api/releases/${r.id}/hypercare`, body: () => ({ action: 'start' }) },
    { key: 'sa', label: 'Service acceptance', perm: 'releases:approve', when: (r) => ['deployed', 'hypercare'].includes(r.status) && !r.service_accepted_by, fields: [{ n: 'residual_risks', l: 'Residual risks accepted', t: 'textarea' }], url: (r) => `/api/releases/${r.id}/service-acceptance`, body: (v) => ({ ...v, accept: true }) },
    { key: 'hcx', label: 'Exit hypercare', perm: 'releases:write', when: (r) => r.status === 'hypercare', fields: [{ n: 'note', l: 'Evidence that exit criteria are met', t: 'textarea', req: true }], url: (r) => `/api/releases/${r.id}/hypercare`, body: (v) => ({ action: 'exit', note: v.note }) },
  ],
  contract_milestones: [{ key: 'accept', label: 'Accept / reject deliverable', perm: 'contract_milestones:approve', when: (r) => ['planned', 'delivered'].includes(r.status), fields: [{ n: 'decision', l: 'Decision', t: 'select', opts: ['accepted', 'rejected'], req: true }, { n: 'note', l: 'Note (required when rejecting)', t: 'textarea' }], url: (r) => `/api/contract-milestones/${r.id}/accept` }],
  tenders: [{ key: 'coi', label: 'Declare conflict of interest', fields: [{ n: 'has_conflict', l: 'I have a conflict of interest', t: 'bool' }, { n: 'details', l: 'Details (required if conflicted)', t: 'textarea' }], url: (r) => `/api/tenders/${r.id}/coi`, body: (v) => ({ has_conflict: !!v.has_conflict, details: v.details }) }],
  product_metrics: [{ key: 'val', label: 'Record value', perm: 'product_metrics:write', fields: [{ n: 'period_date', l: 'Period date', t: 'date', req: true, def: today() }, { n: 'value', l: 'Value', t: 'number', req: true }, { n: 'segment', l: 'Segment', def: 'all' }], url: (r) => `/api/product-metrics/${r.id}/values`, body: (v) => ({ values: [{ period_date: v.period_date, value: Number(v.value), segment: v.segment || 'all' }] }) }],
  requirements: [{ key: 'submit', label: 'Submit for approval', perm: 'requirements:write', when: (r) => !['approved', 'reviewed'].includes(r.status), url: (r) => `/api/requirements/${r.id}/submit`, done: () => 'Sent for approval' }],
  policies: [{ key: 'attest', label: 'Attest', when: (r) => r.status === 'published' && r.requires_attestation, url: (r) => `/api/policies/${r.id}/attest`, done: () => 'Attestation recorded' }],
  business_processes: [
    { key: 'sop', label: 'Generate SOP', perm: 'documents:write', url: () => '/api/documents/generate', body: (_v, r) => ({ doc_type: 'sop', record_id: r.id }), done: (x) => `${x.code} v${x.version} generated (${x.missing_fields.length} gaps) – draft until approved` },
    { key: 'flow', label: 'Generate process flow', perm: 'documents:write', url: () => '/api/documents/generate', body: (_v, r) => ({ doc_type: 'process_flow', record_id: r.id }), done: (x) => `${x.code} v${x.version} generated` },
    { key: 'guide', label: 'Generate user guide', perm: 'documents:write', url: () => '/api/documents/generate', body: (_v, r) => ({ doc_type: 'user_guide', record_id: r.id }), done: (x) => `${x.code} v${x.version} generated (${x.missing_fields.length} gaps)` },
  ],
  test_plans: [{ key: 'uat', label: 'Generate test report', perm: 'documents:write', url: () => '/api/documents/generate', body: (_v, r) => ({ doc_type: 'uat_report', record_id: r.id }), done: (x) => `${x.code} v${x.version} generated` }],
  meetings: [{ key: 'min', label: 'Generate minutes', perm: 'documents:write', url: () => '/api/documents/generate', body: (_v, r) => ({ doc_type: 'meeting_minutes', record_id: r.id }), done: (x) => `${x.code} v${x.version} generated` }],
};

export function RecordActions({ resource, row, onDone }: { resource: string; row: any; onDone: () => void }) {
  const { can } = useSession();
  const acts = (RECORD_ACTIONS[resource] ?? []).filter((a) => (!a.perm || can(a.perm)) && (!a.when || a.when(row)));
  const compare = resource === 'documents' && row.current_version > 1;
  return (<>
    {(acts.length > 0 || compare) && <div className="row wrap" style={{ gap: 6, marginBottom: 12 }} role="group" aria-label="Record actions">
      {acts.map((a) => <ActionButton key={a.key} a={a} row={row} onDone={onDone} />)}
      {compare && <CompareButton row={row} />}
    </div>}
    {resource === 'requests' && <Duplicates id={row.id} />}
    {resource === 'releases' && <Cutover id={row.id} />}
    {resource === 'product_metrics' && <MetricSeries id={row.id} />}
  </>);
}

function CompareButton({ row }: { row: any }) {
  const [open, setOpen] = useState(false); const [from, setFrom] = useState(1); const [to, setTo] = useState<number>(row.current_version);
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const run = async () => { try { setErr(null); setRes(await api.get(`/api/documents/${row.id}/compare?from=${from}&to=${to}`)); } catch (e) { setErr(errMsg(e)); } };
  return (<><button className="btn sm" onClick={() => { setOpen(true); setRes(null); }}>Compare versions</button>
    {open && <Modal title={`Compare ${row.code}`} onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Close</button><button className="btn primary" onClick={run}>Compare</button></>}>
      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <div className="field"><label htmlFor="cmp-from">From</label><input id="cmp-from" className="input" type="number" min={1} max={row.current_version} value={from} onChange={(e) => setFrom(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="cmp-to">To</label><input id="cmp-to" className="input" type="number" min={1} max={row.current_version} value={to} onChange={(e) => setTo(Number(e.target.value))} /></div>
      </div>
      {err && <div className="note warn" role="alert">{err}</div>}{res && <Diff res={res} />}
    </Modal>}</>);
}

function Duplicates({ id }: { id: string }) {
  const { data, error, loading } = useApi<any[]>(`/api/requests/${id}/duplicates`);
  if (loading) return null; if (error) return <ErrorBox error={error} />;
  if (!data?.length) return <div className="small muted" style={{ marginBottom: 10 }}>No likely duplicates found.</div>;
  return <Note warn><b>Possible duplicates:</b> {data.map((d) => <span key={d.id} className="cite" title={`${label(d.resource)} · similarity ${d.similarity}`}>{d.code} {d.name} ({Math.round(d.similarity * 100)}%)</span>)}</Note>;
}

function Cutover({ id }: { id: string }) {
  const { data, error, loading } = useApi<any>(`/api/releases/${id}/cutover`);
  if (loading) return <LoadingBlock rows={2} />; if (error) return <ErrorBox error={error} />;
  return <div style={{ marginBottom: 12 }}><h3 className="small">Cutover checklist · {data.done}/{data.total} done{data.failed ? ` · ${data.failed} failed` : ''}</h3>
    {data.steps.length ? <table className="data compact"><thead><tr><th scope="col">#</th><th scope="col">Step</th><th scope="col">Owner</th><th scope="col">Planned</th><th scope="col">Status</th></tr></thead><tbody>{data.steps.map((s: any) => <tr key={s.id}><td>{s.seq}</td><td>{s.name}</td><td>{s.step_owner ?? '—'}</td><td>{fmtDateTime(s.planned_at)}</td><td><Status v={s.status} /></td></tr>)}</tbody></table> : <div className="small muted">No cutover steps defined.</div>}</div>;
}

function MetricSeries({ id }: { id: string }) {
  const { data, error, loading } = useApi<any>(`/api/product-metrics/${id}/series`);
  if (loading) return <LoadingBlock rows={2} />; if (error) return <ErrorBox error={error} />;
  return <div style={{ marginBottom: 12 }}>
    <div className="small">Latest: <b>{data.latest ? fmtNum(data.latest.value) : '—'}</b> · Target: {data.target ?? '—'} · {data.on_track === null ? <span className="badge">Status unknown – no data</span> : data.on_track ? <span className="badge good">On track</span> : <span className="badge crit">Off track</span>}</div>
    {data.series.length > 0 && <table className="data compact" style={{ marginTop: 6 }}><caption className="sr-only">Metric values</caption><thead><tr><th scope="col">Period</th><th scope="col">Segment</th><th scope="col" className="num">Value</th></tr></thead><tbody>{data.series.slice(-12).map((s: any, i: number) => <tr key={i}><td>{fmtDate(s.period_date)}</td><td>{s.segment}</td><td className="num">{fmtNum(s.value)}</td></tr>)}</tbody></table>}
  </div>;
}

// ------------------------------------------------------------------ comments & mentions
export function CommentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/comments?entity_type=${entityType}&entity_id=${entityId}`);
  const [body, setBody] = useState(''); const [watch, setWatch] = useState<boolean | null>(null);
  const toast = useToast(); const { me } = useSession();
  const post = async () => { if (!body.trim()) return; try { await api.post('/api/comments', { entity_type: entityType, entity_id: entityId, body }); setBody(''); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const toggle = async () => { try { const r = await api.post('/api/watch', { entity_type: entityType, entity_id: entityId, watch: !watch }); setWatch(r.watching); toast(r.watching ? 'You will be notified of new comments' : 'Stopped watching'); } catch (e) { toast(errMsg(e), 'error'); } };
  return (<div className="col" style={{ gap: 10 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted">Mention people with @email – they are notified.</span><button className="btn sm ghost" onClick={toggle}>{watch ? <BellOff size={13} /> : <Bell size={13} />}{watch ? 'Unwatch' : 'Watch'}</button></div>
    {error ? <ErrorBox error={error} retry={reload} /> : loading ? <LoadingBlock rows={3} /> : !data?.length ? <Empty title="No comments yet" art="boxes" /> :
      <ul className="col" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>{data.map((c) => <li key={c.id} className="card" style={{ padding: 10 }}>
        <div className="row small" style={{ justifyContent: 'space-between' }}><b>{c.author}</b><span className="muted">{fmtDateTime(c.created_at)}</span></div>
        <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{c.body}</div>
        {c.created_by === me?.id && <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={async () => { try { await api.del(`/api/comments/${c.id}`); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>Remove</button>}
      </li>)}</ul>}
    <div className="field"><label htmlFor={`cm-${entityId}`}>Add a comment</label><textarea id={`cm-${entityId}`} className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); }} /></div>
    <div><button className="btn primary sm" onClick={post} disabled={!body.trim()}><MessageSquare size={13} />Post (Ctrl+Enter)</button></div>
  </div>);
}

// ------------------------------------------------------------------ evidence files (scanned)
export function FilesPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/files?entity_type=${entityType}&entity_id=${entityId}`);
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const toast = useToast();
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('entity_type', entityType); fd.append('entity_id', entityId); fd.append('file', f);
      const res = await fetch('/api/files', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-requested-with': 'pmo' } });
      const j = await res.json(); if (!res.ok) throw new Error(j.message ?? 'Upload failed');
      toast(j.scan_status === 'clean' ? `${f.name} uploaded and scanned clean` : `${f.name} was quarantined: ${j.scan_detail ?? 'threat detected'}`, j.scan_status === 'clean' ? undefined : 'error'); reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return (<div className="col" style={{ gap: 10 }}>
    <div className="row" style={{ gap: 8 }}><input ref={input} type="file" id={`up-${entityId}`} className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <label htmlFor={`up-${entityId}`} className="btn sm" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}><FileUp size={13} />{busy ? 'Uploading…' : 'Upload evidence'}</label>
      <span className="tiny muted">Max 10 MB. PDF, Office, CSV, images, text, BPMN. Every file is malware-scanned; infected files are quarantined.</span></div>
    {error ? <ErrorBox error={error} retry={reload} /> : loading ? <LoadingBlock rows={2} /> : !data?.length ? <Empty title="No files attached" art="boxes" /> :
      <table className="data compact"><thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">Scan</th><th scope="col">Uploaded</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{data.map((f) => <tr key={f.id}><td>{f.filename}<div className="tiny muted mono" title="SHA-256">{f.sha256.slice(0, 16)}…</div></td><td>{fmtNum(f.size_bytes / 1024, 1)} KB</td><td><Status v={f.scan_status} /> <span className="tiny muted">{f.scan_engine}</span></td><td className="small">{f.uploaded_by}<br />{fmtDateTime(f.created_at)}</td>
          <td>{f.scan_status === 'clean' ? <a className="btn sm ghost" href={`/api/files/${f.id}/download`} aria-label={`Download ${f.filename}`}><Download size={13} /></a> : <span className="badge crit">Quarantined</span>}</td></tr>)}</tbody></table>}
  </div>);
}

