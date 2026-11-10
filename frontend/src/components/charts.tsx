/**
 * Reusable visualisation library. Rules (docs/ux/DATA_VISUALISATION.md):
 * fixed categorical order, one axis, legend for >= 2 series, hover tooltip, table alternative,
 * thin marks with rounded data-ends, recessive grid, text in ink colours, empty/missing handled.
 */
import { useState, type ReactNode, useEffect, useRef } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ReferenceLine, LabelList } from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { Empty } from './ui';
import { fmtNum } from '../lib/format';

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const RAG_COLOR: Record<string, string> = { green: 'var(--good)', amber: 'var(--warn)', red: 'var(--crit)', unknown: 'var(--unknown)' };

export interface SeriesDef { key: string; name: string; color?: string; fmt?: (v: number) => string }

/** Hides the drawn SVG from assistive tech when an equivalent data table exists; legends and buttons stay reachable. */
function ChartBody({ height, hideGraphic, children }: { height: number; hideGraphic: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !hideGraphic) return;
    const apply = () => el.querySelectorAll('svg').forEach((svg) => { if (svg.getAttribute('aria-hidden') !== 'true') { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); } });
    apply(); const mo = new MutationObserver(apply); mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [hideGraphic]);
  return <div ref={ref} style={{ height }}>{children}</div>;
}

export function ChartFrame({ title, sub, legend, children, table, height = 260, empty, actions }: { title?: string; sub?: string; legend?: SeriesDef[]; children: ReactNode; table?: { headers: string[]; rows: (string | number | null)[][] }; height?: number; empty?: boolean; actions?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <div>{title && <h2>{title}</h2>}{sub && <div className="sub">{sub}</div>}</div>
        <div className="actions">
          {actions}
          {table && <button className="icon-btn" onClick={() => setAsTable(!asTable)} aria-pressed={asTable} title={asTable ? 'Show chart' : 'Show data table'} aria-label={asTable ? 'Show chart' : 'Show data table'}>{asTable ? <BarChart3 size={16} /> : <Table2 size={16} />}</button>}
        </div>
      </div>
      <div className="card-body">
        {empty ? <Empty title="No data yet" art="chart">Records feeding this chart have not been captured. Missing data is never shown as zero.</Empty>
          : asTable && table ? (
            <div className="table-wrap" style={{ maxHeight: height + 40 }}><table className="data"><thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num' : ''}>{c === null ? '—' : typeof c === 'number' ? fmtNum(c, 2) : c}</td>)}</tr>)}</tbody></table></div>
          ) : (<>
            {legend && legend.length > 1 && <div className="legend" style={{ marginBottom: 8 }}>{legend.map((s, i) => <span key={s.key}><i style={{ background: s.color ?? SERIES[i] }} />{s.name}</span>)}</div>}
            <ChartBody height={height} hideGraphic={!!table}>{children}</ChartBody>
            {table && <table className="sr-only"><caption>{title} – data</caption><thead><tr>{table.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c === null ? '—' : String(c)}</td>)}</tr>)}</tbody></table>}
          </>)}
      </div>
    </section>
  );
}

export function Tip({ active, payload, label: l, fmt, title }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="t">{title ? title(payload[0].payload) : l}</div>
      {payload.map((p: any) => <div className="r" key={p.dataKey ?? p.name}><span className="row" style={{ gap: 6 }}><i className="sw" style={{ background: p.color ?? p.payload?.fill }} />{p.name}</span><b className="num">{fmt ? fmt(p.value, p) : fmtNum(p.value, 2)}</b></div>)}
    </div>
  );
}
const axisProps = { tickLine: false, axisLine: { stroke: 'var(--border)' }, tick: { fill: 'var(--text-3)', fontSize: 11 } } as const;

export function BarsChart({ data, x, series, fmt, stacked, horizontal, onClick, refLine }: { data: any[]; x: string; series: SeriesDef[]; fmt?: (v: number) => string; stacked?: boolean; horizontal?: boolean; onClick?: (row: any) => void; refLine?: number }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} barGap={2} margin={{ left: horizontal ? 8 : 0, right: 12, top: 6 }}>
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" {...axisProps} tickFormatter={fmt} /><YAxis type="category" dataKey={x} {...axisProps} width={150} /></> : <><XAxis dataKey={x} {...axisProps} /><YAxis {...axisProps} tickFormatter={fmt} width={64} /></>}
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: 'var(--surface-3)', opacity: .6 }} />
        {refLine !== undefined && <ReferenceLine y={refLine} stroke="var(--text-3)" strokeDasharray="4 4" />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? SERIES[i]} stackId={stacked ? 'a' : undefined} radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) as any : (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) as any} maxBarSize={28} stroke="var(--surface)" strokeWidth={stacked ? 1 : 0} onClick={onClick ? (d: any) => onClick(d.payload ?? d) : undefined} style={onClick ? { cursor: 'pointer' } : undefined} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, x, series, fmt, area }: { data: any[]; x: string; series: SeriesDef[]; fmt?: (v: number) => string; area?: boolean }) {
  return (
    <ResponsiveContainer>
      {area ? (
        <AreaChart data={data} margin={{ right: 12, top: 6 }}>
          <defs>{series.map((s, i) => <linearGradient key={s.key} id={`ag-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color ?? SERIES[i]} stopOpacity={0.28} /><stop offset="1" stopColor={s.color ?? SERIES[i]} stopOpacity={0.02} /></linearGradient>)}</defs>
          <CartesianGrid vertical={false} /><XAxis dataKey={x} {...axisProps} /><YAxis {...axisProps} tickFormatter={fmt} width={64} />
          <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }} />
          {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES[i]} strokeWidth={2} fill={`url(#ag-${s.key})`} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} />)}
        </AreaChart>
      ) : (
        <ComposedChart data={data} margin={{ right: 12, top: 6 }}>
          <CartesianGrid vertical={false} /><XAxis dataKey={x} {...axisProps} /><YAxis {...axisProps} tickFormatter={fmt} width={64} />
          <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 3' }} />
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} />)}
        </ComposedChart>
      )}
    </ResponsiveContainer>
  );
}

export function Donut({ data, center, sub, fmt, onClick }: { data: { name: string; value: number; color: string; key?: string }[]; center?: ReactNode; sub?: string; fmt?: (v: number) => string; onClick?: (d: any) => void }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) auto', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', height: '100%' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie rootTabIndex={-1} data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} cornerRadius={4} onClick={onClick} isAnimationActive>
              {data.filter((d) => d.value > 0).map((d) => <Cell key={d.name} fill={d.color} aria-label={`${d.name}: ${fmt ? fmt(d.value) : d.value}`} style={{ cursor: onClick ? 'pointer' : 'default' }} />)}
            </Pie>
            <Tooltip content={<Tip fmt={fmt} title={(p: any) => p.name} />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}><div><div style={{ fontSize: 24, fontWeight: 700 }} className="num">{center ?? total}</div>{sub && <div className="tiny muted">{sub}</div>}</div></div>
      </div>
      <div className="col" style={{ gap: 6 }}>{data.map((d) => { const inner = <><i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} /><span style={{ minWidth: 70 }}>{d.name}</span><b className="num">{fmt ? fmt(d.value) : d.value}</b></>; return onClick ? <button key={d.name} type="button" className="row small legend-btn" style={{ gap: 8 }} onClick={() => onClick(d)}>{inner}</button> : <div key={d.name} className="row small" style={{ gap: 8 }}>{inner}</div>; })}</div>
    </div>
  );
}

/** Progress ring for a single headline percentage; null => dashed "no data" ring. */
export function Ring({ value, size = 64, stroke = 7, color = 'var(--brand)', label: l }: { value: number | null; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} role="img" aria-label={`${l ?? 'Progress'}: ${v === null ? 'no data' : `${Math.round(v)}%`}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeDasharray={v === null ? '3 4' : undefined} />
      {v !== null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }} />}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 4.4} fontWeight={700} fill="var(--text)">{v === null ? '—' : `${Math.round(v)}%`}</text>
    </svg>
  );
}

/** Portfolio bubble / quadrant chart. */
export function Bubble({ data, x, y, z, xLabel, yLabel, colorBy, onClick, fmtZ }: { data: any[]; x: string; y: string; z: string; xLabel: string; yLabel: string; colorBy: (d: any) => string; onClick?: (d: any) => void; fmtZ?: (v: number) => string }) {
  return (
    <ResponsiveContainer>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
        <CartesianGrid />
        <XAxis type="number" dataKey={x} name={xLabel} domain={[0, 100]} {...axisProps} label={{ value: xLabel, position: 'insideBottom', offset: -10, fill: 'var(--text-3)', fontSize: 11 }} />
        <YAxis type="number" dataKey={y} name={yLabel} domain={[0, 100]} {...axisProps} width={40} label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 11 }} />
        <ZAxis type="number" dataKey={z} range={[80, 900]} />
        <ReferenceLine x={50} stroke="var(--border-strong)" strokeDasharray="4 4" /><ReferenceLine y={50} stroke="var(--border-strong)" strokeDasharray="4 4" />
        <Tooltip cursor={false} content={({ active, payload }: any) => active && payload?.length ? <div className="chart-tip"><div className="t">{payload[0].payload.code} {payload[0].payload.name}</div><div className="r"><span>{xLabel}</span><b>{payload[0].payload[x]}</b></div><div className="r"><span>{yLabel}</span><b>{payload[0].payload[y]}</b></div><div className="r"><span>Budget</span><b>{fmtZ ? fmtZ(payload[0].payload[z]) : payload[0].payload[z]}</b></div></div> : null} />
        <Scatter data={data} onClick={onClick ? (d: any) => onClick(d.payload ?? d) : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          {data.map((d, i) => <Cell key={i} fill={colorBy(d)} fillOpacity={0.78} stroke="var(--surface)" strokeWidth={2} />)}
          <LabelList dataKey="code" position="top" style={{ fill: 'var(--text-2)', fontSize: 10, fontWeight: 600 }} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Waterfall built from stacked bars: invisible base + visible delta. */
export function Waterfall({ steps, fmt }: { steps: { name: string; value: number; total?: boolean }[]; fmt?: (v: number) => string }) {
  let running = 0;
  const data = steps.map((s) => {
    if (s.total) { running = s.value; return { name: s.name, base: 0, up: s.value >= 0 ? s.value : 0, down: s.value < 0 ? -s.value : 0, total: true, raw: s.value }; }
    const start = running; running += s.value;
    return { name: s.name, base: Math.min(start, running), up: s.value >= 0 ? s.value : 0, down: s.value < 0 ? -s.value : 0, total: false, raw: s.value };
  });
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ right: 12, top: 6 }}>
        <CartesianGrid vertical={false} /><XAxis dataKey="name" {...axisProps} interval={0} /><YAxis {...axisProps} tickFormatter={fmt} width={64} />
        <Tooltip cursor={{ fill: 'var(--surface-3)', opacity: .6 }} content={({ active, payload }: any) => active && payload?.length ? <div className="chart-tip"><div className="t">{payload[0].payload.name}</div><b className="num">{fmt ? fmt(payload[0].payload.raw) : payload[0].payload.raw}</b></div> : null} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="up" stackId="w" name="Increase" radius={[4, 4, 0, 0]} maxBarSize={42}>{data.map((d, i) => <Cell key={i} fill={d.total ? 'var(--s1)' : 'var(--s3)'} />)}</Bar>
        <Bar dataKey="down" stackId="w" name="Decrease" fill="var(--s8)" radius={[4, 4, 0, 0]} maxBarSize={42} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Generic heatmap grid with sequential or status colour function. */
export function Heatmap({ rows, cols, value, color, rowLabel, colLabel, onCell, cellText, xTitle, yTitle, textColor }: { rows: string[]; cols: string[]; value: (r: number, c: number) => number | null; color: (v: number | null, r: number, c: number) => string; textColor?: (v: number | null) => string; rowLabel?: (r: string) => ReactNode; colLabel?: (c: string) => ReactNode; onCell?: (r: number, c: number) => void; cellText?: (v: number | null) => ReactNode; xTitle?: string; yTitle?: string }) {
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `minmax(90px, auto) repeat(${cols.length}, minmax(34px, 1fr))` }} role="table" aria-label={`${yTitle ?? ''} by ${xTitle ?? ''}`}>
        <div role="row" style={{ display: 'contents' }}><div className="axis tiny" role="columnheader">{yTitle} \ {xTitle}</div>
        {cols.map((c) => <div key={c} className="axis" role="columnheader">{colLabel ? colLabel(c) : c}</div>)}</div>
        {rows.map((r, ri) => <div key={`row${ri}`} role="row" style={{ display: 'contents' }}>{[
          <div key={`l${ri}`} className="axis" style={{ justifyItems: 'end', placeItems: 'center end', paddingRight: 6 }} role="rowheader">{rowLabel ? rowLabel(r) : r}</div>,
          ...cols.map((c, ci) => { const v = value(ri, ci); const bg = color(v, ri, ci); return <div key={`${ri}-${ci}`} role="cell" className="cell" title={`${r} / ${c}: ${v ?? 'no data'}`} aria-label={`${r} / ${c}: ${v ?? 'no data'}`} tabIndex={onCell ? 0 : undefined} style={{ background: bg, color: textColor ? textColor(v) : 'var(--text)', cursor: onCell ? 'pointer' : 'default' }} onClick={onCell ? () => onCell(ri, ci) : undefined} onKeyDown={onCell ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell(ri, ci); } } : undefined}>{cellText ? cellText(v) : v ?? ''}</div>; }),
        ]}</div>)}
      </div>
    </div>
  );
}
/** Ink that stays readable on the sequential ramp (white on the darker half). */
export const seqText = (v: number | null, max: number) => (v !== null && v > 0 && Math.floor((v / Math.max(1, max)) * 5) >= 4 ? 'var(--q-ink-hi)' : 'var(--text)');
export const seqColor = (v: number | null, max: number) => {
  if (v === null) return 'repeating-linear-gradient(135deg, var(--surface-2) 0 4px, var(--surface-3) 4px 8px)';
  if (v <= 0) return 'var(--surface-2)';
  const steps = ['var(--q100)', 'var(--q200)', 'var(--q300)', 'var(--q400)', 'var(--q500)', 'var(--q600)'];
  return steps[Math.min(steps.length - 1, Math.floor((v / Math.max(1, max)) * (steps.length - 1)))];
};

/** Gantt / timeline in SVG: bars (start..end) + diamonds (milestones) + today line. */
export interface GanttRow { id: string; label: string; sub?: string; start?: string | null; end?: string | null; milestone?: string | null; color?: string; progress?: number | null; baselineEnd?: string | null; onClick?: () => void }
export function Gantt({ rows, from, to }: { rows: GanttRow[]; from?: string; to?: string }) {
  const dates = rows.flatMap((r) => [r.start, r.end, r.milestone, r.baselineEnd]).filter(Boolean).map((d) => Date.parse(d!));
  if (!dates.length) return <Empty title="Nothing scheduled" art="chart">Add start/finish dates or milestones to see the timeline.</Empty>;
  const min = from ? Date.parse(from) : Math.min(...dates, Date.now()) - 7 * 864e5;
  const max = to ? Date.parse(to) : Math.max(...dates, Date.now()) + 14 * 864e5;
  const labelW = 230, W = 1100, rowH = 34, head = 30;
  const x = (d: number) => labelW + ((d - min) / (max - min)) * (W - labelW - 16);
  const months: number[] = []; const m = new Date(min); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  while (m.getTime() < max) { months.push(m.getTime()); m.setUTCMonth(m.getUTCMonth() + 1); }
  const H = head + rows.length * rowH + 8;
  return (
    <div className="gantt">
      <svg width={W} height={H} role="img" aria-label="Timeline">
        {months.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={head - 6} y2={H} stroke="var(--grid)" /><text x={x(t) + 4} y={18} fontSize={11} fill="var(--text-3)">{new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</text></g>)}
        {rows.map((r, i) => {
          const y = head + i * rowH;
          const s = r.start ? x(Date.parse(r.start)) : null, e = r.end ? x(Date.parse(r.end)) : null;
          return (
            <g key={r.id} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : 'default' }}>
              <rect x={0} y={y} width={W} height={rowH} fill={i % 2 ? 'var(--surface-2)' : 'transparent'} />
              <text x={12} y={y + 15} fontSize={12.5} fontWeight={550} fill="var(--text)">{r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label}</text>
              {r.sub && <text x={12} y={y + 28} fontSize={10.5} fill="var(--text-3)">{r.sub}</text>}
              {s !== null && e !== null && <>
                <rect x={s} y={y + 9} width={Math.max(3, e - s)} height={16} rx={4} fill={r.color ?? 'var(--s1)'} opacity={0.22} />
                <rect x={s} y={y + 9} width={Math.max(3, (e - s) * ((r.progress ?? 0) / 100))} height={16} rx={4} fill={r.color ?? 'var(--s1)'} />
                <title>{`${r.label}: ${r.start} → ${r.end}${r.progress != null ? ` (${r.progress}% complete)` : ''}`}</title>
              </>}
              {r.baselineEnd && <line x1={x(Date.parse(r.baselineEnd))} x2={x(Date.parse(r.baselineEnd))} y1={y + 6} y2={y + 28} stroke="var(--text-2)" strokeWidth={2} strokeDasharray="2 2"><title>Baseline finish {r.baselineEnd}</title></line>}
              {r.milestone && <g transform={`translate(${x(Date.parse(r.milestone))}, ${y + 17}) rotate(45)`}><rect x={-6} y={-6} width={12} height={12} rx={2} fill={r.color ?? 'var(--s7)'} stroke="var(--surface)" strokeWidth={2} /><title>{`${r.label}: ${r.milestone}`}</title></g>}
            </g>
          );
        })}
        <line x1={x(Date.now())} x2={x(Date.now())} y1={head - 6} y2={H} stroke="var(--crit)" strokeWidth={1.5} />
        <text x={x(Date.now()) + 4} y={H - 6} fontSize={10} fill="var(--crit-ink)" fontWeight={700}>Today</text>
      </svg>
    </div>
  );
}

/** Layered dependency / relationship graph (left→right), plain SVG. */
export function RelGraph({ columns, edges, onNode }: { columns: { title: string; nodes: { id: string; label: string; sub?: string; tone?: string }[] }[]; edges: { from: string; to: string; tone?: string }[]; onNode?: (id: string) => void }) {
  const colW = 196, nodeH = 44, gap = 12, W = columns.length * colW + 20;
  const pos = new Map<string, { x: number; y: number }>();
  const H = Math.max(...columns.map((c) => c.nodes.length), 1) * (nodeH + gap) + 40;
  columns.forEach((c, ci) => c.nodes.forEach((n, ni) => pos.set(n.id, { x: 10 + ci * colW, y: 30 + ni * (nodeH + gap) })));
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 900), maxHeight: H }} role="img" aria-label="Relationship graph">
        {columns.map((c, ci) => <text key={c.title} x={10 + ci * colW} y={16} fontSize={11} fontWeight={700} fill="var(--text-3)" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.title}</text>)}
        {edges.map((e, i) => { const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null; const x1 = a.x + colW - 30, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2; return <path key={i} d={`M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`} fill="none" stroke={e.tone ? `var(--${e.tone})` : 'var(--border-strong)'} strokeWidth={1.6} />; })}
        {columns.flatMap((c) => c.nodes).map((n) => { const p = pos.get(n.id)!; return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={onNode ? () => onNode(n.id) : undefined} style={{ cursor: onNode ? 'pointer' : 'default' }}>
            <rect width={colW - 30} height={nodeH} rx={10} fill="var(--surface)" stroke={n.tone ? `var(--${n.tone})` : 'var(--border-strong)'} strokeWidth={1.4} />
            <text x={10} y={18} fontSize={12} fontWeight={600} fill="var(--text)">{n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}</text>
            {n.sub && <text x={10} y={33} fontSize={10.5} fill="var(--text-3)">{n.sub}</text>}
          </g>); })}
      </svg>
    </div>
  );
}
