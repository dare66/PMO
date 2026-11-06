/**
 * Pure calculation library. Every function returns `null` when the inputs needed are missing –
 * callers must surface "unknown / insufficient data" and must NEVER default to a green status.
 * Formulas are documented in docs/reporting/METRIC_DEFINITIONS.md and the metric_definitions table.
 */

export type Rag = 'green' | 'amber' | 'red' | 'unknown';
export interface Threshold { direction: 'higher_is_better' | 'lower_is_better'; green_at: number; amber_at: number }

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** RAG from a value and a threshold. Missing value => 'unknown' (never green). */
export function rag(value: number | null | undefined, t: Threshold): Rag {
  if (!isNum(value)) return 'unknown';
  if (t.direction === 'higher_is_better') {
    if (value >= t.green_at) return 'green';
    if (value >= t.amber_at) return 'amber';
    return 'red';
  }
  if (value <= t.green_at) return 'green';
  if (value <= t.amber_at) return 'amber';
  return 'red';
}

/** Overall = worst known component. If every component is unknown, overall is unknown. */
export function worstRag(parts: Rag[]): Rag {
  const known = parts.filter((p) => p !== 'unknown');
  if (known.length === 0) return 'unknown';
  if (known.includes('red')) return 'red';
  if (known.includes('amber')) return 'amber';
  // Green only when ALL components are known and green. If some components are unknown and the
  // known ones are green, the overall status is capped at amber (data gap) - see ADR-0007.
  return parts.includes('unknown') ? 'amber' : 'green';
}

// ------------------------------------------------------------------ risk
export function riskScore(likelihood?: number | null, impact?: number | null): number | null {
  if (!isNum(likelihood) || !isNum(impact)) return null;
  return likelihood * impact;
}
export function riskRating(score: number | null): 'low' | 'medium' | 'high' | 'critical' | null {
  if (score === null) return null;
  if (score >= 20) return 'critical';
  if (score >= 12) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

// ------------------------------------------------------------------ earned value
export interface EvmInput {
  bac: number | null | undefined;            // budget at completion
  percentComplete: number | null | undefined; // 0..100
  actualCost: number | null | undefined;     // AC
  start: string | null | undefined;          // planned start
  finish: string | null | undefined;         // planned finish
  asOf?: string;                             // date, default today
}
export interface EvmResult {
  pv: number | null; ev: number | null; ac: number | null;
  sv: number | null; cv: number | null; spi: number | null; cpi: number | null;
  eac: number | null; etc: number | null; vac: number | null; plannedPct: number | null;
  missing: string[];
}
/** Linear planned-value curve between planned start and finish (documented simplification). */
export function plannedPercent(start?: string | null, finish?: string | null, asOf?: string): number | null {
  if (!start || !finish) return null;
  const s = Date.parse(start), f = Date.parse(finish), now = Date.parse(asOf ?? new Date().toISOString().slice(0, 10));
  if (!(f > s)) return null;
  if (now <= s) return 0;
  if (now >= f) return 100;
  return ((now - s) / (f - s)) * 100;
}
export function evm(i: EvmInput): EvmResult {
  const missing: string[] = [];
  if (!isNum(i.bac)) missing.push('budget_at_completion');
  if (!isNum(i.percentComplete)) missing.push('percent_complete');
  if (!i.start || !i.finish) missing.push('planned dates');
  if (!isNum(i.actualCost)) missing.push('actual cost');
  const pp = plannedPercent(i.start, i.finish, i.asOf);
  const pv = isNum(i.bac) && pp !== null ? i.bac * pp / 100 : null;
  const ev = isNum(i.bac) && isNum(i.percentComplete) ? i.bac * i.percentComplete / 100 : null;
  const ac = isNum(i.actualCost) ? i.actualCost : null;
  const spi = ev !== null && pv !== null && pv > 0 ? ev / pv : null;
  const cpi = ev !== null && ac !== null && ac > 0 ? ev / ac : null;
  const eac = isNum(i.bac) && cpi !== null && cpi > 0 ? i.bac / cpi : null;
  return {
    pv: pv === null ? null : round(pv), ev: ev === null ? null : round(ev), ac,
    sv: ev !== null && pv !== null ? round(ev - pv) : null,
    cv: ev !== null && ac !== null ? round(ev - ac) : null,
    spi: spi === null ? null : round(spi, 3), cpi: cpi === null ? null : round(cpi, 3),
    eac: eac === null ? null : round(eac), etc: eac !== null && ac !== null ? round(eac - ac) : null,
    vac: eac !== null && isNum(i.bac) ? round(i.bac - eac) : null,
    plannedPct: pp === null ? null : round(pp, 1), missing,
  };
}

// ------------------------------------------------------------------ investment appraisal
export function npv(rate: number, cashFlows: number[]): number | null {
  if (!cashFlows.length || !isNum(rate)) return null;
  return round(cashFlows.reduce((acc, cf, t) => acc + cf / (1 + rate) ** t, 0));
}
/** IRR by bisection on [-0.99, 10]. Returns null when no sign change (IRR undefined). */
export function irr(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;
  const f = (r: number) => cashFlows.reduce((a, cf, t) => a + cf / (1 + r) ** t, 0);
  let lo = -0.99, hi = 10, flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-7) return round(mid, 4);
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return round((lo + hi) / 2, 4);
}
/** Payback period in years with linear interpolation inside the payback year; null if never paid back. */
export function paybackYears(cashFlows: number[]): number | null {
  let cum = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    const prev = cum;
    cum += cashFlows[t];
    if (t > 0 && prev < 0 && cum >= 0) return round(t - 1 + (-prev / cashFlows[t]), 2);
    if (t === 0 && cum >= 0) return 0;
  }
  return null;
}
export function roi(totalBenefit: number | null, totalCost: number | null): number | null {
  if (!isNum(totalBenefit) || !isNum(totalCost) || totalCost === 0) return null;
  return round((totalBenefit - totalCost) / totalCost * 100, 1);
}

// ------------------------------------------------------------------ product discovery
export function rice(reach?: number | null, impact?: number | null, confidence?: number | null, effort?: number | null): number | null {
  if (!isNum(reach) || !isNum(impact) || !isNum(confidence) || !isNum(effort) || effort <= 0) return null;
  return round(reach * impact * confidence / effort, 1);
}
/** WSJF-style ratio: cost of delay / effort (job size). */
export function wsjf(costOfDelay?: number | null, effort?: number | null): number | null {
  if (!isNum(costOfDelay) || !isNum(effort) || effort <= 0) return null;
  return round(costOfDelay / effort, 2);
}

// ------------------------------------------------------------------ BIA (aligned to ISO 22301 / ISO/TS 22317 concepts)
export interface BiaImpact { category: string; horizon_hours: number; severity: number }
/**
 * MTPD = the earliest time horizon at which ANY impact category reaches the organisation's
 * tolerance threshold (severity >= threshold). Null when no horizon breaches tolerance
 * (MTPD beyond assessed horizons) or no impacts recorded.
 */
export function deriveMtpd(impacts: BiaImpact[], threshold: number): number | null {
  const breaching = impacts.filter((i) => i.severity >= threshold).map((i) => Number(i.horizon_hours));
  if (!breaching.length) return null;
  return Math.min(...breaching);
}
export function criticalityTier(mtpdHours: number | null): 1 | 2 | 3 | 4 | null {
  if (!isNum(mtpdHours)) return null;
  if (mtpdHours <= 4) return 1;
  if (mtpdHours <= 24) return 2;
  if (mtpdHours <= 72) return 3;
  return 4;
}
export interface BiaDependency { name: string; dependency_type: string; recovery_capability_hours: number | null; data_loss_capability_hours: number | null; single_point_of_failure: boolean }
export interface BiaFinding { severity: 'error' | 'warning' | 'info'; code: string; message: string }
export function validateBia(b: { mtpd_hours: number | null; rto_hours: number | null; rpo_hours: number | null; mbco_pct: number | null },
  deps: BiaDependency[], strategies: { achievable_rto_hours: number | null; last_tested_on: string | null; test_result: string | null }[]): BiaFinding[] {
  const f: BiaFinding[] = [];
  if (!isNum(b.mtpd_hours)) f.push({ severity: 'warning', code: 'MTPD_UNKNOWN', message: 'MTPD cannot be derived: no impact reaches the tolerance threshold within assessed horizons, or impacts are missing.' });
  if (!isNum(b.rto_hours)) f.push({ severity: 'error', code: 'RTO_MISSING', message: 'Recovery Time Objective is not set.' });
  if (!isNum(b.rpo_hours)) f.push({ severity: 'error', code: 'RPO_MISSING', message: 'Recovery Point Objective is not set.' });
  if (!isNum(b.mbco_pct)) f.push({ severity: 'warning', code: 'MBCO_MISSING', message: 'Minimum Business Continuity Objective is not set.' });
  if (isNum(b.rto_hours) && isNum(b.mtpd_hours) && b.rto_hours > b.mtpd_hours)
    f.push({ severity: 'error', code: 'RTO_EXCEEDS_MTPD', message: `RTO (${b.rto_hours}h) exceeds MTPD (${b.mtpd_hours}h). RTO must be within MTPD.` });
  for (const d of deps) {
    if (isNum(b.rto_hours) && d.recovery_capability_hours === null)
      f.push({ severity: 'warning', code: 'DEP_CAPABILITY_UNKNOWN', message: `Dependency "${d.name}" has no demonstrated recovery capability.` });
    if (isNum(b.rto_hours) && isNum(d.recovery_capability_hours) && d.recovery_capability_hours > b.rto_hours)
      f.push({ severity: 'error', code: 'DEP_RTO_GAP', message: `Dependency "${d.name}" recovers in ${d.recovery_capability_hours}h, which exceeds the RTO of ${b.rto_hours}h.` });
    if (isNum(b.rpo_hours) && isNum(d.data_loss_capability_hours) && d.data_loss_capability_hours > b.rpo_hours)
      f.push({ severity: 'error', code: 'DEP_RPO_GAP', message: `Dependency "${d.name}" may lose ${d.data_loss_capability_hours}h of data, exceeding the RPO of ${b.rpo_hours}h.` });
    if (d.single_point_of_failure) f.push({ severity: 'warning', code: 'SPOF', message: `Dependency "${d.name}" is a single point of failure.` });
  }
  if (!strategies.length) f.push({ severity: 'error', code: 'NO_RECOVERY_STRATEGY', message: 'No recovery strategy is recorded.' });
  for (const s of strategies) {
    if (!s.last_tested_on) f.push({ severity: 'warning', code: 'STRATEGY_UNTESTED', message: 'A recovery strategy has never been tested.' });
    else if (s.test_result === 'failed') f.push({ severity: 'error', code: 'STRATEGY_TEST_FAILED', message: 'A recovery strategy failed its last test.' });
  }
  return f;
}

/** Screening: decide whether a full / light / no BIA is required for a project. Configurable weights. */
export function biaScreening(a: { affects_critical_service: boolean; changes_business_process: boolean; handles_personal_data: boolean; customer_facing: boolean; regulatory: boolean; third_party_dependency: boolean }) {
  const score = (a.affects_critical_service ? 3 : 0) + (a.changes_business_process ? 2 : 0) + (a.handles_personal_data ? 2 : 0)
    + (a.customer_facing ? 2 : 0) + (a.regulatory ? 2 : 0) + (a.third_party_dependency ? 1 : 0);
  const level = score >= 5 ? 'full' : score >= 2 ? 'light' : 'none';
  return { score, level: level as 'full' | 'light' | 'none' };
}

// ------------------------------------------------------------------ benefits
export function benefitRealisationPct(baseline?: number | null, target?: number | null, actual?: number | null): number | null {
  if (!isNum(baseline) || !isNum(target) || !isNum(actual) || target === baseline) return null;
  return round((actual - baseline) / (target - baseline) * 100, 1);
}
export function keyResultProgress(baseline?: number | null, target?: number | null, current?: number | null): number | null {
  const p = benefitRealisationPct(baseline, target, current);
  return p === null ? null : Math.max(0, Math.min(100, p));
}

// ------------------------------------------------------------------ currency
export function toBase(amount: number, currency: string, base: string, rates: Record<string, number>): number | null {
  if (currency === base) return amount;
  const r = rates[currency];
  return isNum(r) ? amount * r : null;
}

// ------------------------------------------------------------------ resources
export interface Alloc { user_id: string; start_date: string; end_date: string; allocation_pct: number }
export interface Leave { user_id: string; start_date: string; end_date: string }
/** Weekly allocation % per user (Mon-based weeks). Leave reduces available capacity proportionally. */
export function weeklyLoad(users: string[], allocs: Alloc[], leave: Leave[], weekStarts: string[]) {
  const res: Record<string, { week: string; allocated: number; available: number; utilisation: number | null; over: boolean }[]> = {};
  for (const u of users) {
    res[u] = weekStarts.map((w) => {
      const ws = Date.parse(w), we = ws + 6 * 86400000;
      const overlapDays = (s: string, e: string) => {
        const a = Math.max(ws, Date.parse(s)), b = Math.min(we, Date.parse(e));
        if (b < a) return 0;
        // count working days Mon-Fri in [a,b]
        let n = 0;
        for (let t = a; t <= b; t += 86400000) { const d = new Date(t).getUTCDay(); if (d !== 0 && d !== 6) n++; }
        return n;
      };
      const allocated = allocs.filter((a) => a.user_id === u).reduce((acc, a) => acc + a.allocation_pct * overlapDays(a.start_date, a.end_date) / 5, 0);
      const leaveDays = leave.filter((l) => l.user_id === u).reduce((acc, l) => acc + overlapDays(l.start_date, l.end_date), 0);
      const available = Math.max(0, 100 - Math.min(5, leaveDays) * 20);
      return { week: w, allocated: round(allocated, 1), available, utilisation: available > 0 ? round(allocated / available * 100, 1) : null, over: allocated > available };
    });
  }
  return res;
}

// ------------------------------------------------------------------ requirements quality (deterministic checks)
const VAGUE = ['user-friendly', 'user friendly', 'fast', 'quickly', 'easy', 'simple', 'flexible', 'robust', 'efficient', 'intuitive', 'as appropriate', 'etc', 'and/or', 'approximately', 'seamless', 'state of the art', 'adequate', 'minimal', 'optimal', 'support for'];
export function requirementQuality(r: { name?: string | null; description?: string | null; acceptance_criteria?: string | null; priority?: string | null }) {
  const text = `${r.name ?? ''} ${r.description ?? ''}`.toLowerCase();
  const flags: { code: string; message: string }[] = [];
  for (const v of VAGUE) if (new RegExp(`\\b${v.replace(/[-/]/g, '.')}\\b`).test(text)) flags.push({ code: 'VAGUE_TERM', message: `Ambiguous term "${v}" – replace with a measurable criterion.` });
  if (!r.acceptance_criteria || r.acceptance_criteria.trim().length < 10) flags.push({ code: 'NO_ACCEPTANCE_CRITERIA', message: 'Acceptance criteria are missing or too short to be testable.' });
  if (!/\b(shall|must|will)\b/.test(text)) flags.push({ code: 'NO_IMPERATIVE', message: 'Requirement does not use a clear imperative (shall/must).' });
  if ((text.match(/\band\b/g) ?? []).length >= 3) flags.push({ code: 'COMPOUND', message: 'Requirement may combine several requirements; consider splitting.' });
  if (!r.priority) flags.push({ code: 'NO_PRIORITY', message: 'Priority is not set.' });
  const score = Math.max(0, 100 - flags.length * 20);
  return { score, flags };
}
