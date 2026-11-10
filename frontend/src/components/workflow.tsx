import { useState } from 'react';
import { Check, CircleDashed, Play, Send, ShieldCheck, X, UserRoundCog } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDateTime, fmtMoney, label } from '../lib/format';
import { Empty, ErrorBox, LoadingBlock, Modal, Note, Status, useToast, errMsg } from './ui';
import { RefSelect } from './resource';

const SUBMIT: Record<string, { url: (id: string) => string; text: string }> = {
  budgets: { url: (id) => `/api/budgets/${id}/submit`, text: 'Submit for financial approval' },
  purchase_requests: { url: (id) => `/api/purchase-requests/${id}/submit`, text: 'Submit for procurement approval' },
  business_cases: { url: (id) => `/api/business-cases/${id}/submit`, text: 'Submit business case' },
  documents: { url: (id) => `/api/documents/${id}/submit`, text: 'Submit for document approval' },
  risks: { url: (id) => `/api/risks/${id}/request-acceptance`, text: 'Request risk acceptance' },
  bia_assessments: { url: (id) => `/api/bia/${id}/submit`, text: 'Submit BIA for approval' },
  change_requests: { url: (id) => `/api/change-requests/${id}/submit`, text: 'Submit change for decision' },
  releases: { url: (id) => `/api/releases/${id}/submit-cab`, text: 'Submit to CAB' },
};

export function ApprovalCard({ a, onDone }: { a: any; onDone: () => void }) {
  const { me, can } = useSession();
  const toast = useToast();
  const [mode, setMode] = useState<null | 'reject' | 'conditions' | 'delegate'>(null);
  const [note, setNote] = useState(''); const [to, setTo] = useState<string | null>(null);
  const mine = a.status === 'pending' && can('approvals:decide') && (a.approver_id ? a.approver_id === me?.id : me?.roles.includes(a.approver_role));
  const decide = async (decision: string) => {
    try {
      await api.post(`/api/approvals/${a.id}/decide`, { decision, note: note || undefined, conditions: decision === 'approved_with_conditions' ? note : undefined });
      toast(`${a.code} ${label(decision)}`); setMode(null); onDone();
    } catch (e) { toast(errMsg(e), 'error'); }
  };
  const delegate = async () => { try { await api.post(`/api/approvals/${a.id}/delegate`, { to_user_id: to, reason: note || 'Delegated' }); toast('Delegated'); setMode(null); onDone(); } catch (e) { toast(errMsg(e), 'error'); } };
  return (
    <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row between wrap">
        <div className="row wrap"><span className="mono muted">{a.code}</span><b>{a.entity ? `${a.entity.code} ${a.entity.name}` : label(a.entity_type)}</b></div>
        <Status v={a.status} />
      </div>
      <div className="row wrap small muted" style={{ gap: 12 }}>
        <span>{label(a.approval_type)}{a.stage_key ? ` · gate “${label(a.stage_key)}”` : ''}</span>
        <span>Approver: {a.approver_name ?? label(a.approver_role)}</span>
        {a.amount !== null && <span>Amount: <b className="num">{fmtMoney(a.amount)}</b></span>}
        <span>Requested by {a.requested_by_name ?? '—'} · {fmtDateTime(a.created_at)}</span>
        {a.round > 1 && <span className="badge">Round {a.round}</span>}
      </div>
      {(a.decision_note || a.conditions) && <div className="small">{a.conditions && <div><b>Conditions:</b> {a.conditions}</div>}{a.decision_note && <div><b>Note:</b> {a.decision_note}</div>}</div>}
      {mine && (
        <div className="row wrap">
          <button className="btn primary sm" onClick={() => decide('approved')}><Check size={14} />Approve</button>
          <button className="btn sm" onClick={() => setMode('conditions')}>Approve with conditions</button>
          <button className="btn danger sm" onClick={() => setMode('reject')}><X size={14} />Reject</button>
          <button className="btn ghost sm" onClick={() => setMode('delegate')}><UserRoundCog size={14} />Delegate</button>
        </div>
      )}
      {mode && (
        <Modal title={mode === 'reject' ? 'Reject approval' : mode === 'conditions' ? 'Approve with conditions' : 'Delegate approval'} onClose={() => setMode(null)}
          footer={<><button className="btn" onClick={() => setMode(null)}>Cancel</button>{mode === 'delegate' ? <button className="btn primary" disabled={!to} onClick={delegate}>Delegate</button> : <button className={`btn ${mode === 'reject' ? 'danger' : 'primary'}`} disabled={!note.trim()} onClick={() => decide(mode === 'reject' ? 'rejected' : 'approved_with_conditions')}>Confirm</button>}</>}>
          {mode === 'delegate' && <div className="field" style={{ marginBottom: 10 }}><label htmlFor="dlg-to">Delegate to</label><RefSelect id="dlg-to" resource="users" value={to} onChange={setTo} /></div>}
          <div className="field"><label htmlFor="dlg-note">{mode === 'reject' ? 'Reason (required)' : mode === 'conditions' ? 'Conditions (required)' : 'Reason'}</label><textarea id="dlg-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div style={{ marginTop: 10 }}><Note>Decisions are recorded in the immutable audit trail with your identity. Delegated authority limits and segregation of duties are enforced by the server.</Note></div>
        </Modal>
      )}
    </div>
  );
}

export function WorkflowPanel({ entityType, entityId, onChanged }: { entityType: string; entityId: string; onChanged?: () => void }) {
  const { can, meta } = useSession();
  const toast = useToast();
  const wf = useApi<any>(`/api/workflows/for/${entityType}/${entityId}`);
  const defs = useApi<any[]>('/api/workflows/definitions');
  const approvals = useApi<any[]>(`/api/approvals?entity_type=${entityType}&entity_id=${entityId}`);
  const [defKey, setDefKey] = useState('');
  const [justify, setJustify] = useState<string | null>(null);
  const [lastErr, setLastErr] = useState<any>(null);
  const refresh = () => { wf.reload(); approvals.reload(); onChanged?.(); };
  const run = async (fn: () => Promise<any>, ok: string) => { setLastErr(null); try { await fn(); toast(ok); refresh(); } catch (e) { setLastErr(e); } };
  const available = (defs.data ?? []).filter((d) => d.entity_type === entityType);
  const w = wf.data;
  const canWrite = meta.get(entityType)?.canWrite;
  return (
    <div className="col" style={{ gap: 14 }}>
      {SUBMIT[entityType] && canWrite && <div className="row"><button className="btn primary" onClick={() => run(() => api.post(SUBMIT[entityType].url(entityId)), 'Submitted for approval')}><Send size={14} />{SUBMIT[entityType].text}</button><span className="small muted">Routed by the delegated-authority matrix.</span></div>}
      {wf.loading ? <LoadingBlock /> : wf.error ? <ErrorBox error={wf.error} /> : w ? (
        <div className="card pad">
          <div className="row between wrap"><div><h3>{w.instance.definition_name}</h3><div className="small muted">State: <Status v={w.instance.state} /></div></div>
            {w.instance.state !== 'completed' && w.instance.state !== 'cancelled' && canWrite && (
              <div className="row">
                <button className="btn primary sm" disabled={w.instance.state === 'awaiting_approval'} onClick={() => run(() => api.post(`/api/workflows/instances/${w.instance.id}/advance`), 'Stage advanced / submitted')}><Play size={14} />{w.instance.state === 'returned' ? 'Resubmit' : w.current?.approvals?.length ? 'Submit gate for approval' : 'Advance stage'}</button>
                {can('workflow:override') && <button className="btn sm" onClick={() => setJustify('')}><ShieldCheck size={14} />Gate exception</button>}
              </div>)}
          </div>
          <ol className="row wrap" style={{ listStyle: 'none', padding: 0, margin: '14px 0', gap: 6 }} aria-label="Stages">
            {w.stages.map((s: any, i: number) => (
              <li key={s.key} className={`badge ${i < w.current_index ? 'good' : i === w.current_index ? 'brand' : ''}`} aria-current={i === w.current_index ? 'step' : undefined}>{i < w.current_index ? <Check size={12} /> : i === w.current_index ? <CircleDashed size={12} /> : null}{s.name}</li>
            ))}
          </ol>
          <div className="grid g2">
            <div><h3 style={{ marginBottom: 6 }}>Exit criteria – {w.current?.name}</h3>{w.exit_criteria.length ? w.exit_criteria.map((c: any) => <div key={c.criterion} className="row small" style={{ padding: '3px 0' }}>{c.met ? <Check size={14} color="var(--good)" /> : <X size={14} color="var(--crit)" />}<span>{c.detail}</span></div>) : <div className="small muted">No exit criteria configured.</div>}
              {w.current?.approvals?.length ? <div className="small" style={{ marginTop: 6 }}>Gate approvers: {w.current.approvals.map((a: any) => label(a.role)).join(', ')}</div> : null}</div>
            <div><h3 style={{ marginBottom: 6 }}>Entry criteria – {w.next?.name ?? 'Completion'}</h3>{w.next_entry_criteria.length ? w.next_entry_criteria.map((c: any) => <div key={c.criterion} className="row small" style={{ padding: '3px 0' }}>{c.met ? <Check size={14} color="var(--good)" /> : <X size={14} color="var(--crit)" />}<span>{c.detail}</span></div>) : <div className="small muted">None.</div>}</div>
          </div>
          {lastErr && <div style={{ marginTop: 10 }}><ErrorBox error={lastErr} /></div>}
          <details style={{ marginTop: 12 }}><summary className="small muted" style={{ cursor: 'pointer' }}>Stage history ({w.instance.history.length})</summary>
            <div className="small" style={{ marginTop: 6 }}>{[...w.instance.history].reverse().map((h: any, i: number) => <div key={i}>{fmtDateTime(h.at)} · {label(h.stage)} · {label(h.event)}{h.note ? ` – ${h.note}` : ''}</div>)}</div></details>
        </div>
      ) : (
        <div className="card pad">
          {available.length ? (<div className="row wrap"><select className="input" style={{ maxWidth: 340 }} value={defKey} onChange={(e) => setDefKey(e.target.value)} aria-label="Workflow template"><option value="">Choose a workflow template…</option>{available.map((d) => <option key={d.key} value={d.key}>{d.name} (v{d.version})</option>)}</select>
            <button className="btn primary" disabled={!defKey || !canWrite} onClick={() => run(() => api.post('/api/workflows/start', { definition_key: defKey, entity_type: entityType, entity_id: entityId }), 'Workflow started')}><Play size={14} />Start workflow</button></div>)
            : <div className="small muted">No lifecycle workflow template applies to this record type. Configure one under Administration → Workflows.</div>}
          {lastErr && <div style={{ marginTop: 10 }}><ErrorBox error={lastErr} /></div>}
        </div>
      )}
      <div><h3 style={{ marginBottom: 8 }}>Approvals</h3>
        {approvals.loading ? <LoadingBlock rows={2} /> : approvals.error ? <ErrorBox error={approvals.error} /> : approvals.data?.length ? <div className="col">{approvals.data.map((a) => <ApprovalCard key={a.id} a={a} onDone={refresh} />)}</div> : <Empty title="No approvals yet" />}
      </div>
      {justify !== null && w && (
        <Modal title="Record a gate exception" onClose={() => setJustify(null)} footer={<><button className="btn" onClick={() => setJustify(null)}>Cancel</button><button className="btn primary" disabled={justify.trim().length < 10} onClick={() => { const j = justify; setJustify(null); run(() => api.post(`/api/workflows/instances/${w.instance.id}/advance`, { exception_justification: j }), 'Exception recorded'); }}>Advance with exception</button></>}>
          <Note warn>Unmet criteria will be bypassed. The justification and the failed criteria are written to the audit trail.</Note>
          <div className="field" style={{ marginTop: 10 }}><label htmlFor="exc">Justification (min. 10 characters)</label><textarea id="exc" className="input" value={justify} onChange={(e) => setJustify(e.target.value)} /></div>
        </Modal>
      )}
    </div>
  );
}
