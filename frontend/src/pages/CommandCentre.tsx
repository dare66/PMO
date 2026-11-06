import { useNavigate } from 'react-router-dom';
import { AlertOctagon, Banknote, Briefcase, CalendarClock, Gavel, ShieldAlert, Sparkles, Target, TrendingUp, Users } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useSession } from '../lib/session';
import { fmtDate, fmtMoney, fmtNum, fmtPct, daysFromNow, label } from '../lib/format';
import { Card, Empty, ErrorBox, Kpi, LoadingBlock, PageHead, Rag, Status, Progress } from '../components/ui';
import { BarsChart, Bubble, ChartFrame, Donut, Heatmap, RAG_COLOR, Ring, TrendChart } from '../components/charts';

export function riskColor(l: number, i: number, n: number) {
  if (!n) return 'var(--surface-2)';
  const s = l * i;
  return s >= 15 ? 'color-mix(in srgb, var(--crit) 55%, var(--surface))' : s >= 8 ? 'color-mix(in srgb, var(--serious) 45%, var(--surface))' : s >= 4 ? 'color-mix(in srgb, var(--warn) 40%, var(--surface))' : 'color-mix(in srgb, var(--good) 28%, var(--surface))';
}

export function CommandCentre() {
  const { me } = useSession();
  const nav = useNavigate();
  const { data: d, error, loading, reload } = useApi<any>('/api/dashboard/executive');
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading || !d) return <><PageHead title="Executive command centre" /><div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="card pad"><LoadingBlock rows={3} /></div>)}</div></>;
  const cur = d.currency;
  const k = d.kpis;
  const totalEnv = d.investment.reduce((a: number, i: any) => a + Number(i.envelope ?? 0), 0);
  const healthData = (['green', 'amber', 'red', 'unknown'] as const).map((r) => ({ name: { green: 'On track', amber: 'At risk', red: 'Off track', unknown: 'No data' }[r], value: d.health_distribution[r], color: RAG_COLOR[r], key: r }));
  const bubbles = d.projects.filter((p: any) => p.strategic_score !== null && p.risk_score !== null).map((p: any) => ({ ...p, bac: Number(p.bac ?? 0) || 1 }));
  return (
    <>
      <div className="hero" style={{ marginBottom: 16 }}>
        <svg className="hero-art" width="420" height="200" viewBox="0 0 420 200" aria-hidden>
          {[...Array(7)].map((_, i) => <circle key={i} cx={330} cy={40} r={30 + i * 28} fill="none" stroke="#fff" strokeOpacity={0.12 - i * 0.012} strokeWidth="1.5" />)}
          <path d="M40 170 C 120 120, 200 150, 260 90 S 380 60, 420 20" stroke="#fff" strokeOpacity=".35" strokeWidth="2" fill="none" />
        </svg>
        <div style={{ position: 'relative' }}>
          <div className="small" style={{ opacity: .85 }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {me?.name.split(' ')[0]}</div>
          <h1>Enterprise command centre</h1>
          <p>Live view of strategy execution, investment, delivery health, risk and resilience – computed from source records. Grey means data is missing, never “green by default”.</p>
          <div className="hero-stats">
            <div><b>{k.active_projects}</b><span>active projects</span></div>
            <div><b>{k.products}</b><span>live products</span></div>
            <div><b>{fmtMoney(k.approved_budget, cur)}</b><span>approved budget</span></div>
            <div><b>{fmtPct(k.budget_utilisation_pct, 1)}</b><span>budget consumed</span></div>
            <div><b>{k.pending_approvals}</b><span>decisions awaiting approval</span></div>
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi label="Portfolio investment" value={fmtMoney(k.actual_spend, cur)} foot={<>of {fmtMoney(k.approved_budget, cur)} approved · envelope {fmtMoney(totalEnv, cur)}</>} icon={<Banknote size={16} />} />
        <Kpi label="Delivery health" value={<span className="row" style={{ gap: 6 }}>{d.health_distribution.red}<span className="small muted">off track</span></span>} foot={`${d.health_distribution.green} on track · ${d.health_distribution.amber} at risk · ${d.health_distribution.unknown} no data`} icon={<Briefcase size={16} />} tone={d.health_distribution.red ? 'crit' : undefined} />
        <Kpi label="Risk exposure" value={k.high_risks} foot={`high/critical of ${k.open_risks} open risks · ${k.critical_issues} critical issue(s)`} icon={<ShieldAlert size={16} />} tone="serious" />
        <Kpi label="Resource utilisation (this week)" value={fmtPct(d.utilisation?.average_pct)} foot={d.utilisation ? `${d.utilisation.overallocated_people} over-allocation(s) across ${d.utilisation.people} people` : 'Not permitted for your role'} icon={<Users size={16} />} />
      </div>

      <div className="grid g-12">
        <div className="span-4"><ChartFrame title="Project health" sub="Overall RAG · worst of schedule, cost, risk, milestones" height={200} table={{ headers: ['Status', 'Projects'], rows: healthData.map((h) => [h.name, h.value]) }}>
          <Donut data={healthData} sub="active projects" onClick={() => nav('/projects')} />
        </ChartFrame></div>
        <div className="span-8"><ChartFrame title="Portfolio map" sub="Strategic alignment vs. delivery risk · bubble size = budget at completion · colour = health" height={260} empty={!bubbles.length}
          legend={[{ key: 'g', name: 'On track', color: RAG_COLOR.green }, { key: 'a', name: 'At risk', color: RAG_COLOR.amber }, { key: 'r', name: 'Off track', color: RAG_COLOR.red }, { key: 'u', name: 'No data', color: RAG_COLOR.unknown }]}
          table={{ headers: ['Project', 'Strategic score', 'Risk score', 'BAC', 'Health'], rows: bubbles.map((p: any) => [`${p.code} ${p.name}`, p.strategic_score, p.risk_score, p.bac, label(p.overall)]) }}>
          <Bubble data={bubbles} x="strategic_score" y="risk_score" z="bac" xLabel="Strategic alignment" yLabel="Delivery risk" colorBy={(p) => RAG_COLOR[p.overall]} onClick={(p) => nav(`/projects/${p.id}`)} fmtZ={(v) => fmtMoney(v, cur)} />
        </ChartFrame></div>

        <div className="span-7"><ChartFrame title="Investment by portfolio" sub="Approved budget vs actual, commitments and forecast-to-complete" height={250}
          legend={[{ key: 'approved_budget', name: 'Approved budget' }, { key: 'actual', name: 'Actual' }, { key: 'commitment', name: 'Committed' }, { key: 'forecast', name: 'Forecast to complete' }]}
          table={{ headers: ['Portfolio', 'Envelope', 'Approved', 'Actual', 'Committed', 'Forecast'], rows: d.investment.map((i: any) => [i.name, i.envelope, i.approved_budget, i.actual, i.commitment, i.forecast]) }}>
          <BarsChart data={d.investment} x="name" fmt={(v) => fmtMoney(v, cur)} series={[{ key: 'approved_budget', name: 'Approved budget' }, { key: 'actual', name: 'Actual' }, { key: 'commitment', name: 'Committed' }, { key: 'forecast', name: 'Forecast to complete' }]} onClick={(r) => nav(`/finance?pf=${r.id}`)} />
        </ChartFrame></div>
        <div className="span-5"><ChartFrame title="Spend trend" sub="Actual expenditure by month (all contexts, base currency)" height={250} table={{ headers: ['Month', 'Actual', 'Forecast'], rows: d.spend_trend.map((m: any) => [m.month, m.actual, m.forecast]) }}>
          <TrendChart area data={d.spend_trend.map((m: any) => ({ ...m, month: m.month.slice(2) }))} x="month" fmt={(v) => fmtMoney(v, cur)} series={[{ key: 'actual', name: 'Actual spend' }]} />
        </ChartFrame></div>

        <div className="span-5"><Card title="Risk heatmap" sub="Open risks by likelihood × impact · click a cell to drill down">
          <Heatmap rows={['5', '4', '3', '2', '1']} cols={['1', '2', '3', '4', '5']} yTitle="Likelihood" xTitle="Impact"
            value={(r, c) => d.risk_heatmap[4 - r][c]} color={(v, r, c) => riskColor(5 - r, c + 1, v ?? 0)} cellText={(v) => (v ? v : '')}
            onCell={(r, c) => nav(`/raid?likelihood=${5 - r}&impact=${c + 1}`)} />
          <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: riskColor(5, 5, 1) }} />Critical ≥15</span><span><i style={{ background: riskColor(3, 3, 1) }} />High 8–14</span><span><i style={{ background: riskColor(2, 2, 1) }} />Medium 4–7</span><span><i style={{ background: riskColor(1, 1, 1) }} />Low</span></div>
        </Card></div>
        <div className="span-7"><Card title="Top risks & critical issues" sub="Highest exposure first">
          <div className="stack-list">
            {d.top_risks.map((r: any) => <div key={r.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/r/risks?open=${r.id}`)}><span className="badge" style={{ background: riskColor(r.likelihood, r.impact, 1), minWidth: 34, justifyContent: 'center' }}>{r.score}</span><span className="mono muted">{r.code}</span><span style={{ flex: 1 }}>{r.name}</span><span className="badge">{label(r.category)}</span></div>)}
            {d.critical_issues.slice(0, 3).map((i: any) => <div key={i.id} className="list-row"><AlertOctagon size={16} color="var(--crit)" /><span className="mono muted">{i.code}</span><span style={{ flex: 1 }}>{i.name}</span><Status v={i.severity} /><span className="small muted">due {fmtDate(i.due_date)}</span></div>)}
          </div>
        </Card></div>

        <div className="span-8"><Card title="Strategic objectives" sub="Progress = mean of measured key results · linked active projects" actions={<button className="btn sm" onClick={() => nav('/strategy')}><Target size={14} />Strategy</button>}>
          {d.objectives.length ? <div className="grid g3">{d.objectives.map((o: any) => (
            <div key={o.id} className="card pad row" style={{ alignItems: 'flex-start', boxShadow: 'none' }}>
              <Ring value={o.progress_pct} label={o.name} />
              <div style={{ flex: 1 }}><div className="small strong">{o.name}</div><div className="tiny muted">{o.key_results.length} key results · {o.linked_projects} projects</div>
                {o.key_results.slice(0, 2).map((kr: any) => <div key={kr.id} className="tiny" style={{ marginTop: 4 }}>{kr.name}: <b className="num">{fmtNum(kr.current, 2)}</b> / {fmtNum(kr.target, 2)} {kr.unit}</div>)}</div>
            </div>))}</div> : <Empty title="No active objectives" />}
        </Card></div>
        <div className="span-4"><Card title="Benefits realisation" sub="Financial benefits: realised vs target (above baseline)">
          <div className="row" style={{ gap: 16 }}>
            <Ring size={84} value={d.benefits.financial_target ? (d.benefits.financial_actual / d.benefits.financial_target) * 100 : null} color="var(--accent)" label="Financial benefits realised" />
            <div><div className="value num" style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoney(d.benefits.financial_actual, cur)}</div><div className="small muted">of {fmtMoney(d.benefits.financial_target, cur)} target</div><div className="small muted">{d.benefits.measured}/{d.benefits.count} benefits measured · {d.benefits.at_risk} at risk</div></div>
          </div>
          <div className="sep" />
          {d.benefits.items.slice(0, 4).map((b: any) => <div key={b.id} style={{ marginBottom: 8 }}><div className="row between small"><span>{b.name}</span><span className="num">{fmtPct(b.realisation_pct)}</span></div><Progress value={b.realisation_pct} tone={b.status === 'at_risk' ? 'warn' : 'accent'} label={b.name} /></div>)}
        </Card></div>

        <div className="span-7"><Card title="Milestone timeline" sub="Next 120 days and overdue · gates marked" actions={<CalendarClock size={16} color="var(--text-3)" />}>
          {d.milestones.length ? <div className="tl">{d.milestones.slice(0, 9).map((m: any) => { const dd = daysFromNow(m.due_date); return (
            <div key={m.id} className="tl-item"><div className="tl-dot" style={dd < 0 ? { background: 'var(--crit)', boxShadow: '0 0 0 2px var(--crit)' } : m.status === 'at_risk' ? { background: 'var(--warn)', boxShadow: '0 0 0 2px var(--warn)' } : undefined} />
              <div className="row between wrap"><div><b>{m.name}</b>{m.is_gate && <span className="badge brand" style={{ marginLeft: 6 }}>Gate</span>}<div className="small muted" style={{ cursor: 'pointer' }} onClick={() => nav(`/projects/${m.project_id}`)}>{m.project_code} · {m.project_name}</div></div>
                <div className="small" style={{ textAlign: 'right' }}>{fmtDate(m.due_date)}<div className={dd < 0 ? '' : 'muted'} style={dd < 0 ? { color: 'var(--crit-ink)', fontWeight: 600 } : undefined}>{dd < 0 ? `${-dd} days overdue` : `in ${dd} days`}</div></div></div>
            </div>); })}</div> : <Empty title="No upcoming milestones" />}
        </Card></div>
        <div className="span-5"><Card title="Decisions requiring attention" sub="Pending executive decisions and approvals" actions={<button className="btn sm" onClick={() => nav('/governance')}><Gavel size={14} />Governance</button>}>
          <div className="stack-list">{d.decisions.map((x: any) => <div key={x.id} className="list-row"><Gavel size={15} color="var(--brand)" /><div style={{ flex: 1 }}><div className="small strong">{x.name}</div><div className="tiny muted">{x.forum} · due {fmtDate(x.due_date)}</div></div></div>)}</div>
          <div className="note" style={{ marginTop: 10 }}>{k.pending_approvals} approval(s) pending across the organisation.</div>
        </Card></div>

        <div className="span-6"><ChartFrame title="Product portfolio health" sub="Health score (0–100) by product · lifecycle stage in table" height={230} table={{ headers: ['Product', 'Stage', 'Health', 'Tech debt', 'Active projects'], rows: d.products.map((p: any) => [p.name, label(p.lifecycle_stage), p.health_score, p.tech_debt_score, p.active_projects]) }}>
          <BarsChart horizontal data={d.products} x="name" series={[{ key: 'health_score', name: 'Health score' }]} onClick={(p) => nav(`/products/${p.id}`)} />
        </ChartFrame></div>
        <div className="span-6"><Card title="Business continuity readiness" sub="BIA criticality tiers (derived from MTPD) and review status" actions={<button className="btn sm" onClick={() => nav('/resilience')}>Resilience</button>}>
          <div className="grid g4" style={{ marginBottom: 12 }}>{d.bia.tiers.map((t: any) => <div key={t.tier} className="card pad" style={{ boxShadow: 'none', textAlign: 'center' }}><div className="tiny muted">Tier {t.tier}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{t.count}</div><div className="tiny muted">{['≤4h', '≤24h', '≤72h', '>72h'][t.tier - 1]} MTPD</div></div>)}</div>
          <div className="row wrap small" style={{ gap: 14 }}><span><b>{d.bia.approved}</b>/{d.bia.total} BIAs approved</span><span style={{ color: d.bia.review_overdue ? 'var(--crit-ink)' : undefined }}><b>{d.bia.review_overdue}</b> review(s) overdue</span>{d.bia.unknown_tier > 0 && <span><b>{d.bia.unknown_tier}</b> without derivable tier</span>}</div>
        </Card></div>

        <div className="span-12"><Card title="Delivery health by project" sub="SPI/CPI from earned value · data gaps listed explicitly" bodyClass="">
          <div className="table-wrap"><table className="data"><thead><tr><th>Project</th><th>Portfolio</th><th>Stage</th><th>Overall</th><th>Schedule</th><th>Cost</th><th>Risk</th><th className="num">SPI</th><th className="num">CPI</th><th className="num">% complete</th><th>Finish</th><th>Data gaps</th></tr></thead>
            <tbody>{d.projects.map((p: any) => <tr key={p.id} className="click" onClick={() => nav(`/projects/${p.id}`)}><td><span className="mono muted">{p.code}</span> {p.name}</td><td>{p.portfolio}</td><td>{label(p.stage)}</td><td><Rag v={p.overall} /></td><td><Rag v={p.schedule} compact /></td><td><Rag v={p.cost} compact /></td><td><Rag v={p.risk} compact /></td><td className="num">{p.spi ?? '—'}</td><td className="num">{p.cpi ?? '—'}</td><td className="num">{fmtPct(p.percent_complete)}</td><td>{fmtDate(p.end_date)}</td><td className="small muted">{p.data_gaps.join(', ') || '—'}</td></tr>)}</tbody></table></div>
        </Card></div>
      </div>
      <div className="row small muted" style={{ marginTop: 12, gap: 6 }}><TrendingUp size={14} />Generated {new Date(d.generated_at).toLocaleString()} · metric formulas, sources and owners: Governance → Metric definitions. <Sparkles size={14} /> Ask the AI assistant for a narrative brief.</div>
    </>
  );
}
