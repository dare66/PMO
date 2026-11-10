import { describe, expect, it } from 'vitest';
import { benefitRealisationPct, biaScreening, criticalityTier, deriveMtpd, evm, irr, npv, paybackYears, rag, requirementQuality, rice, riskRating, riskScore, validateBia, weeklyLoad, worstRag } from '../src/domain/calc.js';

const T = { direction: 'higher_is_better' as const, green_at: 0.95, amber_at: 0.85 };

describe('RAG (TC-RPT-001..004)', () => {
  it('missing value is unknown, never green', () => { expect(rag(null, T)).toBe('unknown'); expect(rag(undefined, T)).toBe('unknown'); });
  it('applies thresholds in both directions', () => {
    expect(rag(0.97, T)).toBe('green'); expect(rag(0.9, T)).toBe('amber'); expect(rag(0.5, T)).toBe('red');
    const L = { direction: 'lower_is_better' as const, green_at: 0, amber_at: 2 };
    expect(rag(0, L)).toBe('green'); expect(rag(2, L)).toBe('amber'); expect(rag(3, L)).toBe('red');
  });
  it('zero is a real value, distinct from missing', () => { expect(rag(0, { direction: 'lower_is_better', green_at: 0, amber_at: 1 })).toBe('green'); });
  it('overall = worst; all unknown => unknown; partial data caps at amber', () => {
    expect(worstRag(['unknown', 'unknown'])).toBe('unknown');
    expect(worstRag(['green', 'unknown'])).toBe('amber');
    expect(worstRag(['green', 'green'])).toBe('green');
    expect(worstRag(['green', 'red', 'unknown'])).toBe('red');
  });
});

describe('Earned value (TC-FIN-001)', () => {
  it('computes PV, EV, SPI, CPI, EAC', () => {
    const r = evm({ bac: 1000, percentComplete: 40, actualCost: 500, start: '2026-01-01', finish: '2026-12-31', asOf: '2026-07-02' });
    expect(r.ev).toBe(400); expect(r.ac).toBe(500); expect(r.cpi).toBe(0.8); expect(r.eac).toBe(1250);
    expect(r.pv).toBeGreaterThan(495); expect(r.pv).toBeLessThan(505); expect(r.spi).toBeCloseTo(0.8, 1);
  });
  it('returns nulls and a missing list when inputs absent', () => {
    const r = evm({ bac: null, percentComplete: null, actualCost: null, start: null, finish: null });
    expect(r.spi).toBeNull(); expect(r.cpi).toBeNull(); expect(r.missing).toContain('budget_at_completion');
  });
});

describe('Investment appraisal (TC-FIN-002)', () => {
  it('NPV, IRR, payback', () => {
    expect(npv(0.1, [-1000, 500, 500, 500])).toBeCloseTo(243.43, 1);
    expect(irr([-1000, 500, 500, 500])).toBeCloseTo(0.2337, 3);
    expect(paybackYears([-1000, 400, 400, 400])).toBeCloseTo(2.5, 2);
    expect(paybackYears([-1000, 100])).toBeNull();
    expect(irr([100, 100])).toBeNull(); // no sign change
  });
});

describe('BIA calculations (TC-BIA-001..004)', () => {
  const impacts = [
    { category: 'financial', horizon_hours: 4, severity: 2 }, { category: 'financial', horizon_hours: 24, severity: 4 },
    { category: 'regulatory', horizon_hours: 4, severity: 4 }, { category: 'customer', horizon_hours: 72, severity: 5 },
  ];
  it('MTPD = earliest horizon reaching tolerance', () => { expect(deriveMtpd(impacts, 4)).toBe(4); expect(deriveMtpd(impacts, 5)).toBe(72); expect(deriveMtpd([], 4)).toBeNull(); });
  it('tiers', () => { expect(criticalityTier(2)).toBe(1); expect(criticalityTier(24)).toBe(2); expect(criticalityTier(72)).toBe(3); expect(criticalityTier(100)).toBe(4); expect(criticalityTier(null)).toBeNull(); });
  it('flags RTO > MTPD and dependency gaps', () => {
    const f = validateBia({ mtpd_hours: 4, rto_hours: 8, rpo_hours: 1, mbco_pct: 50 }, [{ name: 'Vendor X', dependency_type: 'third_party', recovery_capability_hours: 12, data_loss_capability_hours: 4, single_point_of_failure: true }], []);
    const codes = f.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['RTO_EXCEEDS_MTPD', 'DEP_RTO_GAP', 'DEP_RPO_GAP', 'SPOF', 'NO_RECOVERY_STRATEGY']));
  });
  it('screening scales BIA depth to risk', () => {
    expect(biaScreening({ affects_critical_service: true, changes_business_process: true, handles_personal_data: false, customer_facing: false, regulatory: false, third_party_dependency: false }).level).toBe('full');
    expect(biaScreening({ affects_critical_service: false, changes_business_process: false, handles_personal_data: false, customer_facing: false, regulatory: false, third_party_dependency: true }).level).toBe('none');
  });
});

describe('Other calculations', () => {
  it('risk score/rating', () => { expect(riskScore(4, 5)).toBe(20); expect(riskRating(20)).toBe('critical'); expect(riskRating(12)).toBe('high'); expect(riskScore(null, 3)).toBeNull(); });
  it('RICE', () => { expect(rice(1000, 2, 0.5, 4)).toBe(250); expect(rice(1000, 2, 0.5, 0)).toBeNull(); });
  it('benefit realisation', () => { expect(benefitRealisationPct(0, 100, 25)).toBe(25); expect(benefitRealisationPct(0, 100, null)).toBeNull(); });
  it('weekly load detects over-allocation and leave', () => {
    const w = weeklyLoad(['u'], [{ user_id: 'u', start_date: '2026-11-02', end_date: '2026-11-30', allocation_pct: 70 }, { user_id: 'u', start_date: '2026-11-02', end_date: '2026-11-30', allocation_pct: 50 }], [{ user_id: 'u', start_date: '2026-11-09', end_date: '2026-11-10' }], ['2026-11-02', '2026-11-09']);
    expect(w.u[0].allocated).toBe(120); expect(w.u[0].over).toBe(true); expect(w.u[1].available).toBe(60);
  });
  it('requirement quality flags vague, untestable requirements', () => {
    const q = requirementQuality({ name: 'Fast payments', description: 'Payments should be fast and user-friendly', acceptance_criteria: null, priority: 'should' });
    expect(q.flags.map((f) => f.code)).toEqual(expect.arrayContaining(['VAGUE_TERM', 'NO_ACCEPTANCE_CRITERIA', 'NO_IMPERATIVE']));
    expect(requirementQuality({ name: 'Login', description: 'The system shall lock an account after 5 failed attempts.', acceptance_criteria: 'Given 5 failures the 6th attempt is rejected for 15 minutes', priority: 'must' }).score).toBe(100);
  });
});
