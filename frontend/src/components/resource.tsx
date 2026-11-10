/**
 * Metadata-driven record components: every module uses the same table, form and detail drawer,
 * generated from the API resource registry so validation, permissions and fields stay consistent.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, History, Pencil, Plus, Save, Search, Trash2, GitBranch } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useApi, useLocal } from '../lib/hooks';
import { useSession, type FieldDef, type ResourceMeta } from '../lib/session';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, label } from '../lib/format';
import { Drawer, Empty, ErrorBox, LoadingBlock, Status, Tabs, useToast, errMsg, Note } from './ui';
import { WorkflowPanel } from './workflow';
import { CommentsPanel, FilesPanel, RecordActions } from './panels';

const CONTEXT_RES: Record<string, string> = { project: 'projects', product: 'products', programme: 'programmes', portfolio: 'portfolios', service: 'services', idea: 'ideas' };

export function cellValue(f: FieldDef | undefined, row: any, key: string): ReactNode {
  const v = row[key];
  if (key === 'status') return <Status v={v} />;
  if (!f) return v ?? '—';
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>;
  switch (f.t) {
    case 'ref': return row._refs?.[key] ? <span title={row._refs[key].code}>{row._refs[key].name}</span> : <span className="mono">{String(v).slice(0, 8)}</span>;
    case 'money': return <span className="num">{fmtMoney(v, row.currency ?? 'MYR')}</span>;
    case 'pct': return <span className="num">{fmtNum(v, 1)}%</span>;
    case 'date': return fmtDate(v);
    case 'datetime': return fmtDateTime(v);
    case 'bool': return v ? 'Yes' : 'No';
    case 'enum': return ['severity', 'priority', 'criticality', 'risk_rating'].includes(key) ? <Status v={v} /> : label(v);
    case 'numarray': return (v as number[]).join(', ');
    default: return String(v);
  }
}

// ------------------------------------------------------------------ inputs
export function RefSelect({ resource, value, onChange, id, placeholder, invalid }: { resource: string; value: string | null; onChange: (v: string | null) => void; id?: string; placeholder?: string; invalid?: boolean }) {
  const { users, meta } = useSession();
  const [opts, setOpts] = useState<{ id: string; code: string; name: string }[]>([]);
  useEffect(() => {
    if (resource === 'users') { setOpts(users.map((u) => ({ id: u.id, code: u.code, name: u.name }))); return; }
    if (!meta.has(resource)) { setOpts([]); return; }
    api.get(`/api/r/${resource}?pageSize=500&sort=name:asc`).then((r) => setOpts(r.data)).catch(() => setOpts([]));
  }, [resource, users, meta]);
  return (
    <select id={id} className="input" value={value ?? ''} aria-invalid={invalid} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder ?? '— none —'}</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
    </select>
  );
}

function FieldInput({ f, value, onChange, invalid }: { f: FieldDef; value: any; onChange: (v: any) => void; invalid?: boolean }) {
  const id = `f-${f.n}`;
  const common = { id, className: 'input', 'aria-invalid': invalid } as any;
  switch (f.t) {
    case 'textarea': return <textarea {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'int': case 'number': case 'money': case 'pct':
      return <input {...common} type="number" step={f.t === 'int' ? 1 : 'any'} min={f.min} max={f.max ?? (f.t === 'pct' ? 100 : undefined)} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date': return <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime': return <input {...common} type="datetime-local" value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case 'bool': return <label className="check"><input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.l ?? label(f.n)}</label>;
    case 'enum': return <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}><option value="">—</option>{f.opts!.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>;
    case 'ref': return <RefSelect id={id} resource={f.ref!} value={value ?? null} onChange={onChange} invalid={invalid} />;
    case 'numarray': return <input {...common} value={Array.isArray(value) ? value.join(', ') : value ?? ''} onChange={(e) => onChange(e.target.value.trim() === '' ? [] : e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)))} placeholder="e.g. -500000, 200000, 300000" />;
    default: return <input {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
  }
}

export function RecordForm({ meta, initial, onSaved, onCancel, preset, hidden = [] }: { meta: ResourceMeta; initial?: any; onSaved: (row: any) => void; onCancel?: () => void; preset?: Record<string, any>; hidden?: string[] }) {
  const toast = useToast();
  const editing = !!initial?.id;
  const [v, setV] = useState<Record<string, any>>(() => {
    const base: Record<string, any> = { ...(preset ?? {}) };
    if (initial) for (const f of meta.fields) base[f.n] = initial[f.n];
    else for (const f of meta.fields) if (base[f.n] === undefined && f.def !== undefined) base[f.n] = f.def;
    if (initial) { base.status = initial.status; base.context_type = initial.context_type; base.context_id = initial.context_id; }
    else if (meta.statusOptions && base.status === undefined) base.status = meta.statusOptions[0];
    return base;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<any>(null);
  const set = (k: string, x: any) => setV((s) => ({ ...s, [k]: x }));
  const fields = meta.fields.filter((f) => !f.ro && !hidden.includes(f.n));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) if (f.req && (v[f.n] === null || v[f.n] === undefined || v[f.n] === '')) errs[f.n] = `${f.l ?? label(f.n)} is required`;
    if (meta.contextRequired && !v.context_type) errs.context_type = 'Choose what this belongs to';
    setErrors(errs); if (Object.keys(errs).length) return;
    const body: Record<string, any> = {};
    const allowed = new Set([...fields.map((f) => f.n), 'status', 'context_type', 'context_id']);
    for (const [k, x] of Object.entries(v)) {
      if (!allowed.has(k)) continue;
      if (editing && JSON.stringify(x ?? null) === JSON.stringify(initial[k] ?? null)) continue;
      if (!editing && (x === undefined || x === null || x === '')) continue;
      body[k] = x;
    }
    if (editing) { if (!Object.keys(body).length) { onCancel?.(); return; } body.row_version = initial.row_version; }
    if (body.context_type && CONTEXT_RES[body.context_type] === undefined) body.context_id = null;
    setSaving(true); setFormErr(null);
    try {
      const row = editing ? await api.patch(`/api/r/${meta.key}/${initial.id}`, body) : await api.post(`/api/r/${meta.key}`, body);
      toast(`${meta.label} ${row.code} ${editing ? 'updated' : 'created'}`);
      onSaved(row);
    } catch (e: any) {
      if (Array.isArray(e.details)) { const fe: Record<string, string> = {}; for (const d of e.details) if (d.field) fe[d.field] = d.message; setErrors(fe); }
      setFormErr(e);
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      {meta.description && !editing && <div style={{ marginBottom: 12 }}><Note>{meta.description}</Note></div>}
      <div className="form-grid">
        {meta.contexts && !hidden.includes('context_type') && (<>
          <div className="field"><label htmlFor="f-ctx">Belongs to</label>
            <select id="f-ctx" className="input" value={v.context_type ?? ''} aria-invalid={!!errors.context_type} onChange={(e) => { set('context_type', e.target.value || null); set('context_id', null); }}>
              <option value="">—</option>{meta.contexts.map((c) => <option key={c} value={c}>{label(c === 'none' ? 'no parent (BAU / standalone)' : c)}</option>)}
            </select>{errors.context_type && <span className="err">{errors.context_type}</span>}</div>
          <div className="field"><label htmlFor="f-ctxid">Record</label>
            {v.context_type && CONTEXT_RES[v.context_type] ? <RefSelect id="f-ctxid" resource={CONTEXT_RES[v.context_type]} value={v.context_id ?? null} onChange={(x) => set('context_id', x)} invalid={!!errors.context_id} /> : <input className="input" disabled value={v.context_type ? 'Not applicable' : ''} />}
            {errors.context_id && <span className="err">{errors.context_id}</span>}</div>
        </>)}
        {fields.map((f) => (
          <div key={f.n} className={`field ${f.t === 'textarea' || f.n === 'name' ? 'wide' : ''}`}>
            {f.t !== 'bool' && <label htmlFor={`f-${f.n}`}>{f.l ?? label(f.n)}{f.req && <span aria-hidden style={{ color: 'var(--crit)' }}> *</span>}</label>}
            <FieldInput f={f} value={v[f.n]} onChange={(x) => set(f.n, x)} invalid={!!errors[f.n]} />
            {f.help && <span className="help">{f.help}</span>}
            {errors[f.n] && <span className="err">{errors[f.n]}</span>}
          </div>
        ))}
        {meta.statusOptions && (
          <div className="field"><label htmlFor="f-status">Status</label>
            <select id="f-status" className="input" value={v.status ?? ''} onChange={(e) => set('status', e.target.value)}>
              {meta.statusOptions.map((s) => <option key={s} value={s} disabled={meta.guardedStatuses.includes(s) && initial?.status !== s}>{label(s)}{meta.guardedStatuses.includes(s) ? ' (via approval)' : ''}</option>)}
            </select></div>
        )}
      </div>
      {formErr && <div style={{ marginTop: 12 }}><ErrorBox error={formErr} /></div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn primary" disabled={saving}><Save size={14} />{saving ? 'Saving…' : editing ? 'Save changes' : `Create ${meta.label.toLowerCase()}`}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ table
export interface Column { key: string; label?: string; render?: (row: any) => ReactNode; num?: boolean; sortable?: boolean }
export function DataTable({ resource, filters = {}, columns, onOpen, refreshKey, toolbar, pageSize = 25, title, createPreset, hideCreate, emptyText }: { resource: string; filters?: Record<string, string>; columns?: Column[]; onOpen?: (row: any) => void; refreshKey?: unknown; toolbar?: ReactNode; pageSize?: number; title?: string; createPreset?: Record<string, any>; hideCreate?: boolean; emptyText?: string }) {
  const { meta } = useSession();
  const m = meta.get(resource);
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [status, setStatus] = useLocal(`pmo.view.${resource}.status`, '');
  const [sort, setSort] = useLocal(`pmo.view.${resource}.sort`, '');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openRow, setOpenRow] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const url = m ? `/api/r/${resource}?${qs({ ...filters, q: dq, status, sort, page, pageSize })}` : null;
  const { data, error, loading, reload } = useApi<any>(url, [refreshKey]);
  const cols: Column[] = useMemo(() => columns ?? [
    { key: 'code', label: 'ID', render: (r) => <span className="mono">{r.code}</span> },
    ...(m?.fields.filter((f) => f.list && !(f.n in filters)).slice(0, 6).map((f) => ({ key: f.n, label: f.l ?? label(f.n), num: ['money', 'pct', 'number', 'int'].includes(f.t), sortable: true })) ?? []),
    ...(m?.contexts && !filters.context_id ? [{ key: '_context', label: 'Belongs to', render: (r: any) => r._context?.code ? <span title={r._context.type}>{r._context.code} · {r._context.name}</span> : <span className="muted">{r.context_type === 'none' || !r.context_type ? 'Standalone' : label(r.context_type)}</span> }] : []),
    ...(m?.statusOptions ? [{ key: 'status', label: 'Status', sortable: true }] : []),
  ], [columns, m, JSON.stringify(filters)]);
  if (!m) return <Empty title="Not available">You do not have access to {resource}.</Empty>;
  const open = (r: any) => (onOpen ? onOpen(r) : setOpenRow(r));
  const sortBy = (k: string) => { const [c, d] = sort.split(':'); setSort(c === k && d === 'asc' ? `${k}:desc` : `${k}:asc`); };
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  return (
    <div className="card">
      <div className="toolbar">
        {title && <h2 style={{ marginRight: 8 }}>{title}</h2>}
        <div className="row" style={{ flex: 1, minWidth: 200, maxWidth: 360, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-3)' }} aria-hidden />
          <input className="input" style={{ paddingLeft: 30 }} placeholder={`Search ${m.plural.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${m.plural}`} />
        </div>
        {m.statusOptions && <select className="input" style={{ width: 170 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status"><option value="">All statuses</option>{m.statusOptions.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}
        {toolbar}
        <div style={{ flex: 1 }} />
        {m.canWrite && !hideCreate && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={14} />New {m.label.toLowerCase()}</button>}
      </div>
      {error ? <div style={{ padding: 14 }}><ErrorBox error={error} retry={reload} /></div>
        : loading && !data ? <div style={{ padding: 16 }}><LoadingBlock rows={6} /></div>
          : data && data.data.length === 0 ? <Empty title={`No ${m.plural.toLowerCase()} found`} action={m.canWrite && !hideCreate ? <button className="btn primary" onClick={() => setCreating(true)}><Plus size={14} />Create the first one</button> : undefined}>{emptyText ?? (dq || status ? 'Try clearing the search or filters.' : m.description)}</Empty>
            : data && (
              <>
                <div className="table-wrap" aria-busy={loading}>
                  <table className="data">
                    <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort.startsWith(c.key + ':') ? (sort.endsWith('asc') ? 'ascending' : 'descending') : undefined}>{c.sortable ? <button onClick={() => sortBy(c.key)}>{c.label}{sort === `${c.key}:asc` ? <ArrowUp size={12} /> : sort === `${c.key}:desc` ? <ArrowDown size={12} /> : null}</button> : c.label}</th>)}</tr></thead>
                    <tbody>{data.data.map((r: any) => (
                      <tr key={r.id} className="click" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => e.key === 'Enter' && open(r)}>
                        {cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : cellValue(m.fields.find((f) => f.n === c.key), r, c.key)}</td>)}
                      </tr>))}</tbody>
                  </table>
                </div>
                <div className="pager"><span>{data.total} record{data.total === 1 ? '' : 's'}</span>
                  <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button><span>Page {page} of {pages}</span><button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button></div>
                </div>
              </>
            )}
      {creating && <Drawer title={`New ${m.label.toLowerCase()}`} onClose={() => setCreating(false)}><RecordForm meta={m} preset={{ ...filters, ...createPreset }} hidden={Object.keys(filters).filter((k) => k !== 'status')} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} /></Drawer>}
      {openRow && <RecordDrawer resource={resource} id={openRow.id} onClose={() => setOpenRow(null)} onChanged={reload} />}
    </div>
  );
}

// ------------------------------------------------------------------ detail drawer
export function RecordDrawer({ resource, id, onClose, onChanged, extra }: { resource: string; id: string; onClose: () => void; onChanged?: () => void; extra?: (row: any) => ReactNode }) {
  const { meta } = useSession();
  const m = meta.get(resource)!;
  const toast = useToast();
  const { data: row, error, loading, reload } = useApi<any>(`/api/r/${resource}/${id}`);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const del = async () => {
    if (!confirm(`Delete ${row.code}? It will be soft-deleted and remain in the audit trail.`)) return;
    try { await api.del(`/api/r/${resource}/${id}`); toast(`${row.code} deleted`); onChanged?.(); onClose(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <Drawer title={row ? <span className="row"><span className="mono muted">{row.code}</span>{row.name}</span> : m.label} sub={row && <span className="row">{m.label}{row.status && <Status v={row.status} />}{row.classification && row.classification !== 'internal' && <span className="badge outline">{label(row.classification)}</span>}</span>} onClose={onClose} wide
      footer={row && !editing && (<>
        {m.canDelete && <button className="btn danger" onClick={del}><Trash2 size={14} />Delete</button>}
        <div style={{ flex: 1 }} />
        {m.canWrite && <button className="btn primary" onClick={() => { setEditing(true); setTab('details'); }}><Pencil size={14} />Edit</button>}
      </>)}>
      {error ? <ErrorBox error={error} retry={reload} /> : loading || !row ? <LoadingBlock rows={8} /> : editing ? (
        <RecordForm meta={m} initial={row} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); onChanged?.(); }} />
      ) : (<>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'details', label: 'Details' }, { key: 'comments', label: 'Comments' }, { key: 'files', label: 'Files' }, { key: 'workflow', label: <><GitBranch size={14} />Workflow & approvals</> }, { key: 'history', label: <><History size={14} />History</> }]} />
        {tab === 'comments' && <CommentsPanel entityType={resource} entityId={id} />}
        {tab === 'files' && <FilesPanel entityType={resource} entityId={id} />}
        {tab === 'details' && (<>
          <RecordActions resource={resource} row={row} onDone={() => { reload(); onChanged?.(); }} />
          {extra?.(row)}
          <dl className="kv">
            {row._context && <><dt>Belongs to</dt><dd>{label(row._context.type)} · {row._context.code ? `${row._context.code} ${row._context.name}` : '—'}</dd></>}
            {m.fields.map((f) => <Fragment key={f.n}><dt>{f.l ?? label(f.n)}</dt><dd style={{ whiteSpace: f.t === 'textarea' ? 'pre-wrap' : undefined }}>{cellValue(f, row, f.n)}</dd></Fragment>)}
            {['score', 'rating', 'rice_score', 'wsjf_score', 'progress_pct', 'realisation_pct', 'days_to_expiry', 'emv', 'readiness_index', 'overall_score', 'quadrant', 'overdue'].filter((k) => k in row).map((k) => <Fragment key={k}><dt>{label(k)} <span className="badge tiny">computed</span></dt><dd>{row[k] ?? <span className="muted">insufficient data</span>}</dd></Fragment>)}
            <dt>Created</dt><dd>{fmtDateTime(row.created_at)}</dd><dt>Last updated</dt><dd>{fmtDateTime(row.updated_at)} · v{row.row_version}</dd>
          </dl>
        </>)}
        {tab === 'workflow' && <WorkflowPanel entityType={resource} entityId={id} onChanged={() => { reload(); onChanged?.(); }} />}
        {tab === 'history' && <AuditList entityType={resource} entityId={id} />}
      </>)}
    </Drawer>
  );
}

export function AuditList({ entityType, entityId, limit = 100 }: { entityType?: string; entityId?: string; limit?: number }) {
  const url = entityType && entityId ? `/api/audit?${qs({ entity_type: entityType, entity_id: entityId })}` : `/api/audit?limit=${limit}`;
  const { data, error, loading } = useApi<any[]>(url);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <LoadingBlock />;
  if (!data.length) return <Empty title="No history yet" />;
  return (
    <div className="tl">{data.map((e) => (
      <div key={e.id} className="tl-item"><div className="tl-dot" style={e.actor_type === 'ai' ? { background: 'var(--s7)', boxShadow: '0 0 0 2px var(--s7)' } : undefined} />
        <div><div className="row wrap" style={{ gap: 6 }}><b>{label(e.action)}</b>{e.entity_code && <span className="mono muted">{e.entity_code}</span>}<span className="muted small">by {e.actor_name ?? label(e.actor_type)} · {fmtDateTime(e.occurred_at)}</span>{e.actor_type !== 'user' && <span className="badge">{e.actor_type}</span>}</div>
          {e.after && e.action === 'update' && <div className="small muted" style={{ marginTop: 2 }}>{Object.entries(e.after).slice(0, 6).map(([k, v]) => <div key={k}><span className="mono">{k}</span>: {JSON.stringify(e.before?.[k] ?? null)} → <b>{JSON.stringify(v)}</b></div>)}</div>}
          {e.meta?.justification && <div className="small">Justification: {e.meta.justification}</div>}
          {e.after?.justification && <div className="small">Justification: {e.after.justification}</div>}
        </div>
      </div>))}</div>
  );
}
