/**
 * SYNTHETIC DEMONSTRATION DATA – development/demo only (SEED_DEMO=true).
 * The organisation is flagged is_synthetic and the UI shows a permanent "Synthetic data" banner.
 * Names, figures and vendors are fictitious. Never enable SEED_DEMO in production.
 */
import crypto from 'node:crypto';
import type pg from 'pg';
import { pool, tx } from '../db.js';
import { config } from '../config.js';
import { hashPassword, loadCtx } from '../auth/auth.js';
import { nextCode } from '../core/codes.js';
import { ensureOrgConfig } from './bootstrap.js';
import { createRow } from '../resources/crud.js';
import { requestApproval } from '../domain/workflow.js';
import { generateDocument } from '../domain/documents.js';
import { recomputeBia } from '../domain/bia.js';

const day = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const monthStart = (back: number) => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };

export async function seedDemo() {
  const exists = (await pool.query(`SELECT 1 FROM organisations WHERE is_synthetic`)).rowCount;
  if (exists) return;
  let password = config.demoPassword;
  if (!password) { password = `Demo-${crypto.randomBytes(6).toString('hex')}1`; console.log(`DEMO_PASSWORD not set – generated demo password: ${password}`); }
  const hash = await hashPassword(password);
  const ids: Record<string, string> = {};

  await tx(async (c) => {
    const org = (await c.query(`INSERT INTO organisations (code, name, base_currency, is_synthetic) VALUES ('DEMO','Synthetic Demo Holdings (SYNTHETIC DATA)','MYR',true) RETURNING *`)).rows[0];
    const O = org.id;
    await ensureOrgConfig(c, O);
    for (const [cur, rate] of [['USD', 4.45], ['SGD', 3.35], ['EUR', 4.8]] as const) await c.query(`INSERT INTO fx_rates (org_id, currency, rate_to_base, effective_date) VALUES ($1,$2,$3,$4)`, [O, cur, rate, day(-30)]);

    let creator: string | null = null;
    const ins = async (table: string, prefix: string | null, row: Record<string, any>) => {
      const data: Record<string, any> = { org_id: O, ...row };
      if (prefix) data.code = await nextCode(c, O, prefix);
      if (creator && table !== 'users' && !('created_by' in data)) { data.created_by = creator; data.updated_by = creator; }
      const cols = Object.keys(data);
      const r = await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, Object.values(data));
      return r.rows[0];
    };

    // ---------------- organisation
    const depts: Record<string, string> = {};
    for (const [k, n] of [['EXE', 'Executive Office'], ['PMO', 'Enterprise PMO'], ['DT', 'Digital & Technology'], ['OPS', 'Operations'], ['FIN', 'Finance'], ['CS', 'Customer Service'], ['RC', 'Risk & Compliance'], ['PRD', 'Product Management']])
      depts[k] = (await ins('departments', 'DEP', { name: n })).id;
    const people: [string, string, string, string, string, number][] = [
      ['admin', 'Aisha Rahman', 'Platform Administrator', 'DT', 'admin', 95], ['ceo', 'Daniel Lim', 'Chief Executive Officer', 'EXE', 'executive', 400],
      ['pmo', 'Priya Nair', 'Head of Enterprise PMO', 'PMO', 'pmo_manager', 180], ['portfolio', 'Hafiz Ismail', 'Portfolio Director', 'PMO', 'portfolio_manager', 200],
      ['pm1', 'Mei Ling Tan', 'Senior Project Manager', 'PMO', 'project_manager', 150], ['pm2', 'Ravi Kumar', 'Project Manager', 'PMO', 'project_manager', 130],
      ['product', 'Sofia Martinez', 'Group Product Manager', 'PRD', 'product_manager', 160], ['product2', 'Kenji Watanabe', 'Product Manager', 'PRD', 'product_manager', 140],
      ['ba', 'Nurul Huda', 'Lead Business Analyst', 'PMO', 'business_analyst', 120], ['bcm', 'Farah Aziz', 'Business Continuity Manager', 'RC', 'bc_manager', 130],
      ['finance', 'Arjun Mehta', 'Finance Controller', 'FIN', 'finance_controller', 160], ['resources', 'Grace Ong', 'Resource Manager', 'PMO', 'resource_manager', 110],
      ['tester', 'Liam Chen', 'QA Lead', 'DT', 'tester', 100], ['release', 'Zainab Yusuf', 'Release Manager', 'DT', 'release_manager', 120],
      ['ops', 'Marcus Lee', 'Head of Service Operations', 'OPS', 'operations', 140], ['security', 'Elena Petrova', 'Information Security Officer', 'RC', 'security_officer', 150],
      ['procurement', 'Tom Becker', 'Procurement Lead', 'FIN', 'procurement', 110], ['cab', 'Siti Rahim', 'Change Advisory Board Chair', 'DT', 'cab', 150],
      ['auditor', 'Omar Haddad', 'Internal Auditor', 'RC', 'auditor', 120],
      ['dev1', 'Wei Jie Goh', 'Senior Engineer', 'DT', 'member', 110], ['dev2', 'Anika Das', 'Engineer', 'DT', 'member', 95],
      ['dev3', 'Lucas Silva', 'Data Engineer', 'DT', 'member', 105], ['dev4', 'Hana Kim', 'UX Designer', 'PRD', 'member', 100],
    ];
    for (const [k, name, title, dep, role, rate] of people) {
      const u = await ins('users', 'USR', { email: `${k}@demo.example`, name, title, department_id: depts[dep], password_hash: hash, cost_rate_hour: rate });
      ids[k] = u.id;
      const r = (await c.query(`SELECT id FROM roles WHERE org_id=$1 AND key=$2`, [O, role])).rows[0];
      await c.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [u.id, r.id]);
    }
    await c.query(`UPDATE users SET owner_id=id WHERE org_id=$1`, [O]);
    creator = ids.admin;
    const U = ids;
    const teamDigital = await ins('teams', 'TEAM', { name: 'Mobile Squad', department_id: depts.DT, lead_user_id: U.dev1, owner_id: U.pm1 });
    const teamData = await ins('teams', 'TEAM', { name: 'Data Platform Team', department_id: depts.DT, lead_user_id: U.dev3, owner_id: U.pm2 });
    for (const [t, u] of [[teamDigital.id, U.dev1], [teamDigital.id, U.dev2], [teamDigital.id, U.dev4], [teamData.id, U.dev3], [teamData.id, U.dev2]]) await c.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)`, [t, u]);
    for (const [n, cat] of [['TypeScript', 'Engineering'], ['Data engineering', 'Engineering'], ['Business analysis', 'Analysis'], ['Business continuity', 'Resilience'], ['UX research', 'Design']]) await ins('skills', 'SKL', { name: n, category: cat });

    // ---------------- strategy
    const obj1 = await ins('objectives', 'OBJ', { name: 'Grow digital revenue share to 45%', level: 'corporate', period_start: day(-180), period_end: day(365), owner_id: U.ceo, description: 'Shift customer transactions and revenue to digital channels.' });
    const obj2 = await ins('objectives', 'OBJ', { name: 'Achieve tier-1 operational resilience', level: 'corporate', period_start: day(-180), period_end: day(365), owner_id: U.bcm, description: 'Critical services recover within tolerance.' });
    const obj3 = await ins('objectives', 'OBJ', { name: 'Reduce cost-to-serve by 15%', level: 'corporate', period_start: day(-180), period_end: day(365), owner_id: U.ops });
    for (const [o, n, u, b, t, cur] of [[obj1, 'Digital revenue share', '%', 28, 45, 34], [obj1, 'Monthly active app users', 'k users', 410, 650, 498], [obj2, 'Tier-1 services with tested recovery', '%', 40, 100, 60], [obj2, 'Critical BIAs approved', 'count', 1, 6, 2], [obj3, 'Cost per transaction', 'MYR', 1.8, 1.53, 1.71]] as const)
      await ins('key_results', 'KR', { objective_id: o.id, name: n, unit: u, baseline_value: b, target_value: t, current_value: cur, measured_at: day(-7), owner_id: o.owner_id });
    await ins('business_capabilities', 'CAP', { name: 'Digital customer engagement', maturity: 3, target_maturity: 4, owner_id: U.product });
    await ins('business_capabilities', 'CAP', { name: 'Payment processing', maturity: 4, target_maturity: 5, owner_id: U.ops });
    await ins('business_capabilities', 'CAP', { name: 'Data & analytics', maturity: 2, target_maturity: 4, owner_id: U.pm2 });

    const pf1 = await ins('portfolios', 'PF', { name: 'Digital Growth', investment_theme: 'Growth', funding_envelope: 9000000, objective_id: obj1.id, owner_id: U.portfolio, description: 'Customer-facing digital products and channels.' });
    const pf2 = await ins('portfolios', 'PF', { name: 'Operational Excellence', investment_theme: 'Run & Modernise', funding_envelope: 11000000, objective_id: obj3.id, owner_id: U.portfolio });
    const pf3 = await ins('portfolios', 'PF', { name: 'Risk & Regulatory', investment_theme: 'Mandatory', funding_envelope: 2500000, objective_id: obj2.id, owner_id: U.pmo });
    const pg1 = await ins('programmes', 'PGM', { name: 'Customer Digital Experience', portfolio_id: pf1.id, objective_id: obj1.id, start_date: day(-200), end_date: day(300), owner_id: U.portfolio, status: 'active' });
    const pg2 = await ins('programmes', 'PGM', { name: 'Core Platform Modernisation', portfolio_id: pf2.id, objective_id: obj2.id, start_date: day(-260), end_date: day(260), owner_id: U.pmo, status: 'active' });
    const pg3 = await ins('programmes', 'PGM', { name: 'Regulatory Compliance 2026', portfolio_id: pf3.id, objective_id: obj2.id, start_date: day(-120), end_date: day(200), owner_id: U.security, status: 'active' });

    // ---------------- products (independent of projects)
    const prod = async (name: string, line: string, pf: any, stage: string, crit: string, health: number, users: number | null, nps: number | null, owner: string, debt: number) =>
      ins('products', 'PRD', { name, product_line: line, portfolio_id: pf.id, lifecycle_stage: stage, criticality: crit, health_score: health, active_users: users, nps, owner_id: owner, tech_debt_score: debt, objective_id: obj1.id, vision: `${name} is the trusted, effortless way for customers to get things done.`, target_users: 'Retail and SME customers' });
    const prMobile = await prod('Customer Mobile App', 'Digital channels', pf1, 'growth', 'critical', 78, 498000, 41, U.product, 35);
    const prPay = await prod('Payments Gateway', 'Payments', pf2, 'mature', 'critical', 84, null, null, U.product2, 52);
    const prPortal = await prod('Customer Self-Service Portal', 'Digital channels', pf1, 'growth', 'high', 69, 212000, 28, U.product, 44);
    const prData = await prod('Data & Analytics Platform', 'Data', pf2, 'development', 'high', 61, 900, null, U.product2, 30);
    const prField = await prod('Field Service App', 'Operations', pf2, 'launch', 'medium', 72, 340, 35, U.product2, 20);
    const prBill = await prod('Legacy Billing System', 'Finance systems', pf2, 'decline', 'medium', 48, 120, null, U.product2, 88);

    // ---------------- projects
    const proj = async (o: Record<string, any>) => ins('projects', 'PRJ', { currency: 'MYR', status: 'active', ...o });
    const P1 = await proj({ name: 'Mobile App 3.0 Redesign', portfolio_id: pf1.id, programme_id: pg1.id, objective_id: obj1.id, department_id: depts.DT, project_type: 'product_development', delivery_approach: 'agile', lifecycle_stage: 'execution', sponsor_id: U.ceo, owner_id: U.pm1, start_date: day(-150), end_date: day(60), baseline_start: day(-150), baseline_end: day(60), budget_at_completion: 2400000, percent_complete: 66, strategic_score: 88, risk_score: 55, criticality: 'high', bia_required: true, description: 'Redesign onboarding, payments and servicing journeys in the mobile app.', business_case: 'Projected +12% digital revenue share and lower contact-centre volumes.', scope_statement: 'New design system, onboarding, bill payments, card controls, accessibility to WCAG 2.2 AA.', success_criteria: 'App store rating ≥4.5; onboarding completion ≥80%.' });
    const P2 = await proj({ name: 'Payments Gateway Cloud Migration', portfolio_id: pf2.id, programme_id: pg2.id, objective_id: obj2.id, department_id: depts.DT, project_type: 'infrastructure', delivery_approach: 'predictive', lifecycle_stage: 'execution', sponsor_id: U.ceo, owner_id: U.pm2, start_date: day(-200), end_date: day(40), baseline_start: day(-200), baseline_end: day(40), budget_at_completion: 3800000, percent_complete: 58, strategic_score: 82, risk_score: 78, criticality: 'critical', bia_required: true, description: 'Migrate the payments gateway from the on-premise data centre to a regulated cloud landing zone.', business_case: 'Data-centre exit saves MYR 1.1M p.a.; improves recovery capability.', scope_statement: 'Re-platform gateway, HSM integration, DR in second region.' });
    const P3 = await proj({ name: 'PDPA Compliance Uplift', portfolio_id: pf3.id, programme_id: pg3.id, objective_id: obj2.id, department_id: depts.RC, project_type: 'regulatory', delivery_approach: 'hybrid', lifecycle_stage: 'planning', sponsor_id: U.security, owner_id: U.pm1, start_date: day(-90), end_date: day(120), baseline_start: day(-90), baseline_end: day(120), budget_at_completion: 1100000, percent_complete: 38, strategic_score: 75, risk_score: 60, criticality: 'high', bia_required: false, description: 'Implement DPO function, breach notification process and data portability capability.', scope_statement: 'Data inventory, DPO appointment, breach runbook, portability API.' });
    const P4 = await proj({ name: 'Customer Portal Self-Service Expansion', portfolio_id: pf1.id, programme_id: pg1.id, objective_id: obj1.id, project_type: 'technology', delivery_approach: 'hybrid', lifecycle_stage: 'initiation', sponsor_id: U.portfolio, owner_id: U.pm2, start_date: day(-60), end_date: day(180), baseline_start: day(-60), baseline_end: day(180), budget_at_completion: 1600000, percent_complete: 24, strategic_score: 70, risk_score: 40, criticality: 'medium', description: 'Add self-service journeys (address change, disputes, statements) to the portal.' });
    const P5 = await proj({ name: 'Data Platform Foundation', portfolio_id: pf2.id, programme_id: pg2.id, objective_id: obj3.id, project_type: 'technology', delivery_approach: 'agile', lifecycle_stage: 'execution', sponsor_id: U.portfolio, owner_id: U.pm2, start_date: day(-120), end_date: day(90), baseline_start: day(-120), baseline_end: day(90), budget_at_completion: 2900000, percent_complete: 52, strategic_score: 79, risk_score: 50, criticality: 'high', bia_required: false, description: 'Lakehouse, governed data products and regulatory reporting pipelines.' });
    const P6 = await proj({ name: 'AI Service Assistant Pilot', portfolio_id: pf1.id, programme_id: pg1.id, objective_id: obj3.id, project_type: 'ai', delivery_approach: 'agile', lifecycle_stage: 'pilot', sponsor_id: U.ceo, owner_id: U.pm1, start_date: day(-45), end_date: day(100), baseline_start: day(-45), baseline_end: day(100), budget_at_completion: 650000, percent_complete: 30, strategic_score: 84, risk_score: 65, criticality: 'medium', description: 'Pilot a retrieval-augmented assistant for contact-centre agents with human review.' });
    const P7 = await proj({ name: 'Field Service App Launch', portfolio_id: pf2.id, objective_id: obj3.id, project_type: 'product_development', delivery_approach: 'hybrid', lifecycle_stage: 'release', sponsor_id: U.ops, owner_id: U.pm1, start_date: day(-180), end_date: day(10), baseline_start: day(-180), baseline_end: day(0), budget_at_completion: 900000, percent_complete: 93, strategic_score: 60, risk_score: 30, criticality: 'medium', bia_required: false, description: 'Mobile app for field technicians with offline job dispatch.' });
    const P8 = await proj({ name: 'Legacy Billing Decommission', portfolio_id: pf2.id, programme_id: pg2.id, objective_id: obj3.id, project_type: 'technology', delivery_approach: 'predictive', lifecycle_stage: 'planning', sponsor_id: U.finance, owner_id: U.pm2, start_date: day(-30), end_date: day(240), baseline_start: day(-30), baseline_end: day(240), budget_at_completion: 1200000, percent_complete: 6, strategic_score: 55, risk_score: 45, criticality: 'medium', description: 'Migrate billing to the ERP module and retire the legacy billing product.' });
    const P9 = await proj({ name: 'Branch Network Refresh', portfolio_id: pf2.id, objective_id: obj3.id, project_type: 'infrastructure', delivery_approach: 'predictive', lifecycle_stage: 'closed', status: 'closed', sponsor_id: U.ops, owner_id: U.pm2, start_date: day(-320), end_date: day(-25), baseline_start: day(-320), baseline_end: day(-40), actual_end: day(-25), budget_at_completion: 750000, percent_complete: 100, strategic_score: 40, risk_score: 20, closure_summary: 'All 42 branches refreshed; 15 days late due to supplier delay.', lessons_learned: 'Engage logistics vendor earlier; pilot two branches first.' });
    const P10 = await proj({ name: 'Contact Centre Optimisation', portfolio_id: pf2.id, objective_id: obj3.id, project_type: 'operational_improvement', delivery_approach: 'custom', lifecycle_stage: 'intake', owner_id: U.ops, description: 'Reduce average handling time through knowledge and routing improvements.' });
    Object.assign(ids, { P1: P1.id, P2: P2.id, P3: P3.id, P4: P4.id, P5: P5.id, P6: P6.id, P7: P7.id, P8: P8.id, P9: P9.id, P10: P10.id, prMobile: prMobile.id, prPay: prPay.id, prPortal: prPortal.id, prData: prData.id, prField: prField.id, prBill: prBill.id, pf1: pf1.id, pf2: pf2.id, pf3: pf3.id });
    for (const [p, pr, rel] of [[P1, prMobile, 'enhances'], [P1, prPortal, 'supports'], [P2, prPay, 'enhances'], [P4, prPortal, 'enhances'], [P5, prData, 'delivers'], [P6, prMobile, 'enhances'], [P6, prPortal, 'enhances'], [P7, prField, 'delivers'], [P8, prBill, 'retires'], [P9, prPay, 'supports'], [P3, prMobile, 'supports'], [P3, prData, 'supports']] as const)
      await c.query(`INSERT INTO project_products (project_id, product_id, relationship) VALUES ($1,$2,$3)`, [p.id, pr.id, rel]);

    // milestones
    const ms = async (p: any, name: string, due: number, status: string, gate = false, base?: number) => ins('milestones', 'MS', { project_id: p.id, name, due_date: day(due), baseline_date: day(base ?? due), status, is_gate: gate, owner_id: p.owner_id, actual_date: status === 'achieved' ? day(due) : null });
    await ms(P1, 'Design system approved', -110, 'achieved', true); await ms(P1, 'Onboarding journey live (beta)', -40, 'achieved'); await ms(P1, 'Payments journey code complete', -5, 'at_risk', false, -15); await ms(P1, 'UAT sign-off', 35, 'planned', true); await ms(P1, 'Go-live', 58, 'planned', true);
    await ms(P2, 'Landing zone accredited', -120, 'achieved', true); await ms(P2, 'HSM integration complete', -20, 'planned', false, -45); await ms(P2, 'DR failover test', 15, 'planned', true); await ms(P2, 'Production cut-over', 38, 'planned', true);
    await ms(P3, 'DPO appointed', -60, 'achieved'); await ms(P3, 'Breach notification runbook', 20, 'planned'); await ms(P3, 'Portability API live', 110, 'planned', true);
    await ms(P4, 'Charter approved', 5, 'planned', true); await ms(P4, 'Release 1', 120, 'planned');
    await ms(P5, 'Lakehouse MVP', -30, 'achieved'); await ms(P5, 'Regulatory reporting pipeline', 30, 'at_risk'); await ms(P5, 'Data catalogue rollout', 80, 'planned');
    await ms(P6, 'Model & guardrail evaluation', 10, 'planned', true); await ms(P6, 'Agent pilot (50 users)', 60, 'planned');
    await ms(P7, 'Offline sync complete', -30, 'achieved'); await ms(P7, 'Go-live', 8, 'planned', true);
    await ms(P8, 'Migration design', 45, 'planned'); await ms(P9, 'All branches refreshed', -25, 'achieved', true, -40);
    for (const [p, n, st] of [[P1, 'Design system library', 'accepted'], [P1, 'Accessibility conformance report', 'in_progress'], [P2, 'Cloud runbook', 'submitted'], [P7, 'Technician training pack', 'accepted']] as const)
      await ins('deliverables', 'DLV', { project_id: p.id, name: n, status: st, owner_id: p.owner_id, due_date: day(20) });

    // ---------------- services, processes, applications, environments, vendors
    const vend = async (name: string, cat: string, risk: string, dd: string, perf: number, country: string) => ins('vendors', 'VND', { name, category: cat, risk_rating: risk, due_diligence_status: dd, due_diligence_date: day(-200), performance_score: perf, country, owner_id: U.procurement, status: 'active', exit_plan: dd === 'passed' ? 'Documented 6-month exit with data return clauses.' : null });
    const vCloud = await vend('Nimbus Cloud Services', 'Cloud hosting', 'high', 'passed', 86, 'SG');
    const vPay = await vend('SecureSwitch Payments', 'Payment processing', 'critical', 'passed', 91, 'MY');
    const vStudio = await vend('Pixel Forge Studio', 'Software development', 'medium', 'passed', 74, 'MY');
    const vData = await vend('DataWorks Analytics', 'Data services', 'medium', 'in_progress', 68, 'IN');
    const vField = await vend('FieldTech Devices', 'Hardware', 'low', 'expired', 80, 'CN');
    const svc = async (name: string, pr: any, crit: string, owner: string) => ins('services', 'SVC', { name, product_id: pr.id, criticality: crit, owner_id: owner, service_type: 'business', sla_target: crit === 'critical' ? '99.95% availability' : '99.5% availability', status: 'live' });
    const sMobile = await svc('Mobile Banking Service', prMobile, 'critical', U.ops);
    const sPay = await svc('Payment Processing', prPay, 'critical', U.ops);
    const sPortal = await svc('Customer Self-Service', prPortal, 'high', U.ops);
    const sField = await svc('Field Job Dispatch', prField, 'medium', U.ops);
    const sReport = await svc('Regulatory Reporting', prData, 'high', U.finance);
    const proc = async (name: string, s: any, dep: string, crit: string) => ins('business_processes', 'BP', { name, service_id: s.id, department_id: depts[dep], criticality: crit, owner_id: s.owner_id, automation_potential: 'medium', status: 'active' });
    const bpOnboard = await proc('Customer onboarding', sMobile, 'CS', 'high');
    const bpAuth = await proc('Card payment authorisation', sPay, 'OPS', 'critical');
    const bpComplaint = await proc('Complaint handling', sPortal, 'CS', 'medium');
    const bpDispatch = await proc('Field job dispatch', sField, 'OPS', 'medium');
    const bpReg = await proc('Month-end regulatory reporting', sReport, 'FIN', 'high');
    const steps: [any, number, string, string, string, number[] | null][] = [[bpOnboard, 1, 'Customer starts application', 'Customer', 'start', [2]], [bpOnboard, 2, 'Capture identity & e-KYC', 'Mobile App', 'task', [3]], [bpOnboard, 3, 'Screening passed?', 'Compliance', 'decision', [4, 5]], [bpOnboard, 4, 'Open account & issue card', 'Core Banking', 'task', [6]], [bpOnboard, 5, 'Manual review', 'Compliance', 'task', [4]], [bpOnboard, 6, 'Customer onboarded', 'Customer', 'end', null]];
    for (const [bp, seq, n, lane, t, next] of steps) await ins('process_steps', 'PS', { process_id: bp.id, seq, name: n, lane, step_type: t, next_step_seq: next });
    const app = async (name: string, pr: any, hosting: string, v: any, cls: string, eol?: number) => ins('applications', 'APP', { name, product_id: pr.id, hosting, vendor_id: v?.id ?? null, data_classification: cls, owner_id: pr.owner_id, technology_stack: 'Kubernetes, PostgreSQL', lifecycle: eol ? 'sunset' : 'active', end_of_life_date: eol ? day(eol) : null });
    await app('Mobile API layer', prMobile, 'cloud', vCloud, 'confidential'); await app('Payments switch', prPay, 'on_premise', vPay, 'restricted'); await app('Portal web app', prPortal, 'cloud', vCloud, 'confidential'); await app('Lakehouse', prData, 'cloud', vData, 'confidential'); await app('Billing engine', prBill, 'on_premise', null, 'confidential', 240);
    for (const [n, t, pr, h] of [['Mobile PROD', 'production', prMobile, 'cloud'], ['Mobile UAT', 'uat', prMobile, 'cloud'], ['Payments PROD (DC1)', 'production', prPay, 'on_premise'], ['Payments DR (Cloud region B)', 'dr', prPay, 'cloud'], ['Field PROD', 'production', prField, 'cloud']] as const)
      await ins('environments', 'ENV', { name: n, env_type: t, product_id: pr.id, hosting: h, owner_id: U.release, status: 'available' });
    const con = async (v: any, name: string, value: number, start: number, end: number, ctxType: string | null, ctxId: string | null, cur = 'MYR') => ins('contracts', 'CON', { vendor_id: v.id, name, contract_value: value, currency: cur, start_date: day(start), end_date: day(end), context_type: ctxType, context_id: ctxId, owner_id: U.procurement, renewal_notice_days: 90, sla_summary: '99.9% availability; P1 response 15 min', status: 'active' });
    const cCloud = await con(vCloud, 'Cloud landing zone & hosting', 420000, -300, 400, 'project', P2.id, 'USD');
    const cPay = await con(vPay, 'Payment switching services', 2400000, -700, 45, 'product', prPay.id);
    const cStudio = await con(vStudio, 'Mobile app development partner', 1100000, -160, 120, 'project', P1.id);
    await con(vData, 'Analytics engineering services', 640000, -110, 250, 'project', P5.id);
    await con(vField, 'Rugged device supply', 180000, -400, -10, 'product', prField.id);

    // ---------------- finance
    const bud = async (t: string, id: string, name: string, type: string, amount: number, status = 'approved') => ins('budgets', 'BUD', { context_type: t, context_id: id, name, fiscal_year: new Date().getUTCFullYear(), expenditure_type: type, amount, status, owner_id: U.finance, approved_by: status === 'approved' ? U.finance : null, approved_at: status === 'approved' ? new Date().toISOString() : null });
    const projBud: [any, number, number][] = [[P1, 1900000, 500000], [P2, 3200000, 600000], [P3, 700000, 400000], [P4, 1300000, 300000], [P5, 2400000, 500000], [P6, 450000, 200000], [P7, 750000, 150000], [P8, 900000, 300000], [P9, 650000, 100000]];
    for (const [p, cap, op] of projBud) { await bud('project', p.id, `${p.name} – capex`, 'capex', cap); await bud('project', p.id, `${p.name} – opex`, 'opex', op); }
    const pendingBudget = await bud('project', P6.id, 'AI pilot scale-up contingency', 'opex', 180000, 'draft');
    for (const pr of [prMobile, prPay, prPortal, prData]) await bud('product', pr.id, `${pr.name} – run budget`, 'opex', 600000);
    // monthly actuals (base pattern scaled to achieve target AC), commitments and forecasts
    const spend: [any, number, number, number][] = [[P1, 1650000, 300000, 450000], [P2, 2950000, 400000, 900000], [P3, 380000, 120000, 500000], [P4, 360000, 200000, 900000], [P5, 1820000, 250000, 1300000], [P6, 180000, 90000, 400000], [P7, 800000, 30000, 60000], [P8, 60000, 80000, 1000000], [P9, 790000, 0, 0]];
    for (const [p, actual, commit, fc] of spend) {
      const months = Math.max(1, Math.min(8, Math.round((Date.now() - Date.parse(p.start_date)) / (30 * 86400000))));
      for (let m = months - 1; m >= 0; m--) {
        const share = actual / months * (0.8 + ((m * 7) % 5) / 10);
        await ins('cost_entries', 'CST', { context_type: 'project', context_id: p.id, name: `Monthly actuals ${monthStart(m).slice(0, 7)}`, entry_kind: 'actual', expenditure_type: m % 3 === 0 ? 'opex' : 'capex', cost_category: ['internal_labour', 'external', 'cloud', 'licence'][m % 4], amount: Math.round(share), entry_date: monthStart(m), owner_id: U.finance, vendor_id: p.id === P1.id ? vStudio.id : null, contract_id: p.id === P1.id ? cStudio.id : null });
      }
      if (commit) await ins('cost_entries', 'CST', { context_type: 'project', context_id: p.id, name: 'Open purchase orders', entry_kind: 'commitment', amount: commit, entry_date: day(-5), owner_id: U.finance });
      if (fc) await ins('cost_entries', 'CST', { context_type: 'project', context_id: p.id, name: 'Forecast to complete', entry_kind: 'forecast', amount: fc, entry_date: day(45), owner_id: U.finance });
    }
    await ins('cost_entries', 'CST', { context_type: 'project', context_id: P2.id, name: 'Cloud consumption (USD invoice)', entry_kind: 'actual', amount: 38000, currency: 'USD', entry_date: day(-12), cost_category: 'cloud', vendor_id: vCloud.id, contract_id: cCloud.id, owner_id: U.finance });
    for (const pr of [prMobile, prPay]) for (let m = 5; m >= 0; m--) await ins('cost_entries', 'CST', { context_type: 'product', context_id: pr.id, name: `Run cost ${monthStart(m).slice(0, 7)}`, entry_kind: 'actual', expenditure_type: 'opex', cost_category: 'cloud', amount: 42000 + m * 1500, entry_date: monthStart(m), owner_id: U.finance });
    const ben = async (t: string, id: string, name: string, type: string, unit: string, b: number, tgt: number, a: number | null, status: string, owner: string) => ins('benefits', 'BEN', { context_type: t, context_id: id, name, benefit_type: type, unit, baseline_value: b, target_value: tgt, actual_value: a, status, owner_id: owner, measure: name, measurement_method: 'Monthly finance/BI report', realisation_start: day(-30), realisation_end: day(365), last_measured_at: a === null ? null : day(-10) });
    await ben('project', P1.id, 'Digital sales uplift (annualised)', 'financial', 'MYR', 0, 3200000, 900000, 'tracking', U.product);
    await ben('project', P1.id, 'Onboarding completion rate', 'non_financial', '%', 58, 80, 71, 'tracking', U.product);
    await ben('project', P2.id, 'Data-centre exit savings', 'financial', 'MYR', 0, 1100000, null, 'planned', U.finance);
    await ben('project', P5.id, 'Report production effort saved', 'non_financial', 'hours/month', 0, 600, 120, 'at_risk', U.finance);
    await ben('project', P7.id, 'First-time fix rate', 'non_financial', '%', 68, 85, 74, 'tracking', U.ops);
    await ben('project', P9.id, 'Branch network incidents reduction', 'non_financial', 'incidents/month', 40, 15, 18, 'tracking', U.ops);
    const bc = await ins('business_cases', 'BC', { context_type: 'project', context_id: P6.id, name: 'AI Service Assistant – scale business case', problem: 'Agent handling time is 9.5 minutes; knowledge is fragmented.', options_considered: '1) Do nothing 2) Knowledge base refresh 3) AI assistant with human review', recommended_option: 'Option 3, phased with a 50-user pilot and guardrails.', discount_rate: 0.08, cash_flows: [-650000, 280000, 420000, 460000, 460000], total_cost_of_ownership: 1450000, owner_id: U.pm1 });

    // ---------------- RAID
    const risk = async (t: string, id: string | null, name: string, cat: string, l: number, i: number, owner: string, mitigation: string | null, extra: Record<string, any> = {}) => ins('risks', 'RSK', { context_type: t, context_id: id, name, category: cat, likelihood: l, impact: i, owner_id: owner, mitigation_plan: mitigation, treatment: 'mitigate', status: 'open', due_date: day(30), ...extra });
    await risk('project', P2.id, 'HSM integration delays cut-over window', 'delivery', 4, 5, U.pm2, 'Vendor war-room; parallel test rig.', { residual_likelihood: 3, residual_impact: 4 });
    await risk('project', P2.id, 'Card authorisation outage during migration', 'operational', 3, 5, U.ops, 'Blue/green cut-over with instant rollback.', { residual_likelihood: 2, residual_impact: 5 });
    await risk('project', P2.id, 'Cloud cost overrun from egress charges', 'financial', 3, 3, U.finance, null, { due_date: day(-10) });
    await risk('project', P1.id, 'Accessibility defects block go-live', 'compliance', 3, 4, U.pm1, 'Weekly automated + manual audits.');
    await risk('project', P1.id, 'Key mobile engineers over-allocated', 'delivery', 4, 3, U.resources, null);
    await risk('project', P1.id, 'App store review rejection', 'delivery', 2, 3, U.product, 'Pre-submission checklist.');
    await risk('project', P5.id, 'Source data quality insufficient for regulatory reports', 'compliance', 4, 4, U.pm2, 'Data quality rules and stewardship.');
    await risk('project', P5.id, 'Vendor due diligence incomplete', 'vendor', 3, 3, U.procurement, null);
    await risk('project', P6.id, 'Assistant produces unsupported answers (hallucination)', 'operational', 3, 4, U.pm1, 'Citations required; human approval; evaluation set.');
    await risk('project', P3.id, 'Breach notification process not tested before deadline', 'privacy', 3, 4, U.security, 'Table-top exercise scheduled.');
    await risk('project', P8.id, 'Billing data migration reconciliation gaps', 'financial', 3, 4, U.finance, null);
    await risk('product', prBill.id, 'Unsupported OS on billing servers', 'security', 4, 4, U.security, 'Isolate network segment; accelerate decommission.');
    await risk('product', prPay.id, 'Single switching vendor concentration', 'vendor', 2, 5, U.procurement, 'Evaluate secondary switch.');
    await risk('product', prMobile.id, 'Fraud via account takeover', 'security', 3, 5, U.security, 'Device binding and behavioural analytics.');
    await risk('enterprise', null, 'Cyber attack on customer channels', 'security', 3, 5, U.security, 'SOC 24x7, DDoS protection, IR retainer.');
    await risk('enterprise', null, 'Key-person dependency in PMO', 'operational', 2, 3, U.pmo, 'Cross-training plan.');
    const acceptRisk = await risk('product', prField.id, 'Minor UI inconsistency on legacy devices', 'delivery', 2, 2, U.product2, 'Document workaround; accept until device refresh.');
    await risk('project', P9.id, 'Supplier delay (closed project)', 'vendor', 3, 2, U.pm2, 'Resolved', { status: 'closed' });
    const iss = async (t: string, id: string | null, name: string, sev: string, owner: string, due: number, status = 'open') => ins('issues', 'ISS', { context_type: t, context_id: id, name, severity: sev, owner_id: owner, due_date: day(due), status });
    await iss('project', P2.id, 'HSM firmware incompatible with cloud HSM cluster', 'critical', U.pm2, 5);
    await iss('project', P1.id, 'Payment journey failing performance tests', 'high', U.dev1, 10, 'in_progress');
    await iss('project', P5.id, 'Regulatory pipeline missing 3 source feeds', 'high', U.dev3, 14);
    await iss('project', P4.id, 'Charter sign-off delayed by sponsor availability', 'medium', U.pm2, 7);
    await iss('service', sPay.id, 'Intermittent latency spikes in authorisation', 'high', U.ops, 3);
    await iss('project', P7.id, 'Training material translation pending', 'low', U.pm1, 6);
    for (const [t, id, n, by, st] of [['project', P1.id, 'Design partner retains current squad through go-live', 20, 'unvalidated'], ['project', P2.id, 'Regulator accepts cloud DR region', -30, 'validated'], ['project', P6.id, 'Knowledge articles are current enough to ground answers', 15, 'unvalidated'], ['project', P8.id, 'ERP billing module supports bulk invoicing', 40, 'unvalidated'], ['programme', pg2.id, 'Cloud landing zone reused by all modernisation projects', -60, 'validated']] as const)
      await ins('assumptions', 'ASM', { context_type: t, context_id: id, name: n, validate_by: day(by), status: st, owner_id: U.pmo, validation_method: 'Confirm in steering committee' });
    for (const [n, ft, fid, tt, tid, need, st] of [['Payments migration needs landing-zone accreditation', 'project', P2.id, 'project', P5.id, -20, 'met'], ['Mobile 3.0 payments journey depends on gateway APIs v2', 'project', P1.id, 'project', P2.id, 25, 'at_risk'], ['Portal disputes needs data platform events', 'project', P4.id, 'project', P5.id, 60, 'open'], ['Billing decommission needs Data Platform history archive', 'project', P8.id, 'project', P5.id, 90, 'open'], ['AI assistant needs portal knowledge API', 'project', P6.id, 'product', prPortal.id, 20, 'open']] as const)
      await ins('dependencies', 'DEPN', { name: n, from_type: ft, from_id: fid, to_type: tt, to_id: tid, need_by: day(need), status: st, owner_id: U.pmo, dependency_type: 'deliverable' });

    // ---------------- discovery & roadmap
    const idea = async (name: string, pr: any, src: string, reach: number | null, impact: number | null, conf: number | null, effort: number | null, stage: string, cod?: number) => ins('ideas', 'IDEA', { name, product_id: pr.id, source: src, reach, impact, confidence: conf, effort, stage, cost_of_delay: cod ?? null, owner_id: pr.owner_id, problem_statement: stage === 'new' ? null : `Customers struggle with ${name.toLowerCase()}.`, status: 'open' });
    const ideaRows = [
      await idea('Instant card freeze from lock screen', prMobile, 'customer', 120000, 2, 0.8, 2, 'validated', 400000), await idea('Split bill with contacts', prMobile, 'customer', 60000, 1, 0.5, 3, 'discovery', 150000),
      await idea('Spending insights with budgets', prMobile, 'market', 200000, 1.5, 0.6, 5, 'assessing', 300000), await idea('Dispute a transaction online', prPortal, 'customer', 40000, 2, 0.9, 2, 'approved', 250000),
      await idea('Paperless statements by default', prPortal, 'employee', 150000, 0.5, 0.9, 1, 'validated', 90000), await idea('Real-time payment status webhooks', prPay, 'partner', 300, 3, 0.7, 4, 'discovery', 500000),
      await idea('Technician route optimisation', prField, 'employee', 340, 2, 0.5, 6, 'new'), await idea('Self-serve data product catalogue', prData, 'employee', 900, 1, 0.8, 3, 'assessing', 120000),
      await idea('Voice banking', prMobile, 'market', 50000, 1, 0.3, 8, 'parked'), await idea('Chat-based onboarding', prMobile, 'ai_suggested', null, null, null, null, 'new'),
    ];
    for (const [n, pr, ch, sent, idx] of [['App crashes when uploading ID', prMobile, 'App store', 'negative', 0], ['Love the new card controls', prMobile, 'Survey', 'positive', 0], ['Cannot find statements', prPortal, 'Contact centre', 'negative', 4], ['Want to dispute charges without calling', prPortal, 'Complaints', 'negative', 3], ['Split bill please!', prMobile, 'App store', 'neutral', 1], ['Webhooks would reduce our polling', prPay, 'Partner forum', 'neutral', 5]] as const)
      await ins('feedback', 'FB', { name: n, product_id: pr.id, channel: ch, sentiment: sent, idea_id: ideaRows[idx].id, owner_id: pr.owner_id, status: 'linked' });
    await ins('experiments', 'EXP', { name: 'Card freeze widget A/B', idea_id: ideaRows[0].id, product_id: prMobile.id, hypothesis: 'A lock-screen freeze widget reduces lost-card calls by 20%.', metric: 'Lost-card calls / 1k MAU', success_threshold: '-20%', outcome: 'validated', result: '-26% in test cohort', start_date: day(-70), end_date: day(-40), status: 'completed', owner_id: U.product });
    await ins('experiments', 'EXP', { name: 'Split bill concierge test', idea_id: ideaRows[1].id, product_id: prMobile.id, hypothesis: '10% of users will try split bill in 2 weeks.', metric: 'Trial rate', success_threshold: '10%', status: 'running', start_date: day(-7), end_date: day(7), owner_id: U.product });
    const rm = async (pr: any, name: string, lane: string, s: number, e: number, status = 'planned', conf = 'medium', ideaRow?: any) => ins('roadmap_items', 'RM', { product_id: pr.id, name, lane, start_date: day(s), end_date: day(e), status, confidence: conf, idea_id: ideaRow?.id ?? null, objective_id: obj1.id, owner_id: pr.owner_id });
    await rm(prMobile, 'Mobile 3.0 – new onboarding', 'Now', -120, -30, 'delivered', 'high'); await rm(prMobile, 'Mobile 3.0 – payments & card controls', 'Now', -40, 55, 'in_progress', 'high', ideaRows[0]); await rm(prMobile, 'Spending insights', 'Next', 70, 160, 'planned', 'medium', ideaRows[2]); await rm(prMobile, 'Split bill', 'Later', 150, 240, 'planned', 'low', ideaRows[1]);
    await rm(prPortal, 'Online disputes', 'Now', -20, 70, 'in_progress', 'high', ideaRows[3]); await rm(prPortal, 'Paperless statements', 'Next', 60, 120, 'planned', 'high', ideaRows[4]);
    await rm(prPay, 'Cloud-native gateway', 'Now', -200, 40, 'in_progress', 'medium'); await rm(prPay, 'Payment status webhooks', 'Next', 60, 150, 'planned', 'medium', ideaRows[5]);
    await rm(prData, 'Regulatory data products', 'Now', -60, 40, 'in_progress', 'medium'); await rm(prData, 'Self-serve catalogue', 'Later', 120, 220, 'planned', 'low', ideaRows[7]);
    await rm(prField, 'Offline dispatch v1', 'Now', -150, 10, 'in_progress', 'high');
    for (const [pr, v, d, st] of [[prMobile, '2.9.4', -60, 'supported'], [prMobile, '3.0.0', 58, 'planned'], [prPay, '2.3.1', -120, 'supported'], [prField, '1.0.0', 8, 'planned']] as const)
      await ins('product_versions', 'PV', { product_id: pr.id, name: `${pr.name} ${v}`, version_label: v, released_on: d < 0 ? day(d) : null, status: st, owner_id: pr.owner_id });

    // ---------------- releases & quality
    const rel1 = await ins('releases', 'REL', { name: 'Mobile App 3.0', product_id: prMobile.id, project_id: P1.id, version_label: '3.0.0', planned_date: day(58), release_type: 'major', deployment_plan: 'Phased rollout 5% → 25% → 100% over 7 days.', rollback_plan: null, support_model: 'L1 contact centre, L2 mobile squad, hypercare 21 days', hypercare_days: 21, owner_id: U.release, status: 'in_test' });
    const rel2 = await ins('releases', 'REL', { name: 'Field Service App 1.0', product_id: prField.id, project_id: P7.id, version_label: '1.0.0', planned_date: day(8), release_type: 'major', deployment_plan: 'Regional waves by depot.', rollback_plan: 'Keep paper dispatch for 2 weeks; disable app via MDM.', support_model: 'Ops service desk', business_validation: true, operational_acceptance: true, knowledge_transfer_done: true, owner_id: U.release, status: 'ready', cab_status: 'not_submitted' });
    const rel3 = await ins('releases', 'REL', { name: 'Payments Gateway 2.3.2 (patch)', product_id: prPay.id, version_label: '2.3.2', planned_date: day(-20), actual_date: day(-20), release_type: 'patch', deployment_plan: 'Rolling restart', rollback_plan: 'Redeploy 2.3.1 image', support_model: 'BAU', cab_status: 'approved', business_validation: true, operational_acceptance: true, knowledge_transfer_done: true, owner_id: U.release, status: 'closed' });
    void rel3;
    const tp = async (rel: any, p: any, name: string, level: string, owner: string, status: string, bo?: string) => ins('test_plans', 'TP', { context_type: 'project', context_id: p.id, release_id: rel.id, name, test_level: level, pass_threshold_pct: level === 'uat' ? 100 : 95, owner_id: owner, business_owner_id: bo ?? null, status, entry_criteria: 'Build deployed to test environment; smoke tests pass.', exit_criteria: 'Pass threshold met; no open critical defects.' });
    const tp1 = await tp(rel1, P1, 'Mobile 3.0 system test', 'system', U.tester, 'in_execution');
    const tp2 = await tp(rel1, P1, 'Mobile 3.0 UAT', 'uat', U.tester, 'draft', U.product);
    const tp3 = await tp(rel2, P7, 'Field app UAT', 'uat', U.tester, 'signed_off', U.ops);
    const tp4 = await tp(rel2, P7, 'Field app system test', 'system', U.tester, 'completed');

    // requirements via CRUD (computes quality flags)
    const pmCtx = (await loadCtx(U.pm1, undefined, c))!;
    const baCtx = (await loadCtx(U.ba, undefined, c))!;
    const reqs = [];
    for (const [n, desc, ac, pri] of [
      ['Biometric login', 'The app shall allow customers to sign in with device biometrics within 2 seconds.', 'Given an enrolled device, when the customer authenticates with biometrics, then they are signed in within 2s in 95% of attempts.', 'must'],
      ['Freeze card', 'The app shall let a customer freeze and unfreeze a card instantly.', 'Card status changes within 5 seconds and is reflected in authorisation.', 'must'],
      ['Fast and user-friendly payments', 'Payments should be fast and easy etc.', null, 'should'],
      ['Accessible design', 'The app must conform to WCAG 2.2 AA for all customer journeys.', 'Automated and manual audit reports show no AA failures.', 'must'],
      ['Spending insights', 'Show insights and budgets and alerts and goals and tips.', 'Insights shown', 'could'],
    ] as const) reqs.push(await createRow(baCtx, 'requirements', { name: n, description: desc, acceptance_criteria: ac, priority: pri, context_type: 'project', context_id: P1.id, req_type: 'functional', status: 'approved' }, { db: c }));
    const tcases = [];
    for (const [plan, n, r] of [[tp1, 'Biometric login happy path', 0], [tp1, 'Biometric fallback to PIN', 0], [tp1, 'Freeze card propagates to switch', 1], [tp1, 'Payment confirmation screen', 2], [tp1, 'Screen reader labels on payments', 3], [tp2, 'UAT: onboarding end-to-end', 0], [tp2, 'UAT: pay a bill', 2], [tp3, 'UAT: dispatch job offline', null], [tp3, 'UAT: close job with photo', null], [tp4, 'Sync after reconnect', null]] as const)
      tcases.push(await ins('test_cases', 'TC', { test_plan_id: plan.id, name: n, requirement_id: r === null ? null : reqs[r].id, steps: '1. Prepare data 2. Execute 3. Verify', expected_result: 'Behaves as specified', owner_id: U.tester, status: 'ready' }));
    const testerCtx = (await loadCtx(U.tester, undefined, c))!;
    for (const [i, res] of [[0, 'passed'], [1, 'passed'], [2, 'passed'], [3, 'failed'], [4, 'passed'], [7, 'passed'], [8, 'passed'], [9, 'passed']] as const)
      await createRow(testerCtx, 'test_executions', { name: `Run ${tcases[i].code}`, test_case_id: tcases[i].id, result: res, executed_by: U.tester, executed_at: new Date(Date.now() - 86400000 * (10 - i)).toISOString(), environment: 'UAT', evidence_ref: `evidence/${tcases[i].code}.png`, notes: res === 'failed' ? 'Confirmation screen times out after 8s under load.' : null }, { db: c });
    await c.query(`UPDATE defects SET severity='high', release_id=$2, assignee_id=$3 WHERE org_id=$1`, [O, rel1.id, U.dev1]);
    await ins('defects', 'DEF', { context_type: 'project', context_id: P1.id, release_id: rel1.id, name: 'VoiceOver reads amount twice', severity: 'medium', assignee_id: U.dev4, owner_id: U.tester, status: 'in_progress' });

    // ---------------- BIA (integrated, with traceability)
    const bia = async (o: Record<string, any>, impacts: [string, number, number][], deps: any[], strategies: any[]) => {
      const b = await ins('bia_assessments', 'BIA', { owner_id: U.bcm, tolerance_threshold: 4, review_frequency_months: 12, ...o });
      for (const [cat, h, sev] of impacts) await c.query(`INSERT INTO bia_impacts (org_id, bia_id, category, horizon_hours, severity) VALUES ($1,$2,$3,$4,$5)`, [O, b.id, cat, h, sev]);
      for (const d of deps) await c.query(`INSERT INTO bia_dependencies (org_id, bia_id, dependency_type, name, product_id, vendor_id, recovery_capability_hours, data_loss_capability_hours, single_point_of_failure) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [O, b.id, d.type, d.name, d.product ?? null, d.vendor ?? null, d.rec ?? null, d.loss ?? null, d.spof ?? false]);
      for (const s of strategies) await ins('recovery_strategies', 'RS', { bia_id: b.id, owner_id: U.bcm, status: 'approved', ...s });
      await recomputeBia(c, { orgId: O } as any, b.id);
      return b;
    };
    const grid = (vals: Record<string, number[]>) => Object.entries(vals).flatMap(([cat, sev]) => [1, 4, 24, 72, 168].map((h, i) => [cat, h, sev[i]] as [string, number, number]));
    const biaAuth = await bia({ name: 'Card payment authorisation', process_id: bpAuth.id, service_id: sPay.id, product_id: prPay.id, project_id: P2.id, rto_hours: 2, rpo_hours: 0.25, mbco_pct: 80, status: 'approved', approved_by: U.bcm, approved_at: new Date().toISOString(), next_review_date: day(300), peak_periods: 'Month-end, festive seasons', manual_workarounds: 'Stand-in processing with offline limits', bc_requirements: 'Active-active processing across two sites', dr_requirements: 'RTO 2h / RPO 15 min with quarterly failover tests' },
      grid({ financial: [3, 5, 5, 5, 5], operational: [3, 4, 5, 5, 5], regulatory: [2, 4, 5, 5, 5], customer: [4, 5, 5, 5, 5], reputational: [2, 4, 5, 5, 5] }),
      [{ type: 'application', name: 'Payments switch', product: prPay.id, rec: 1.5, loss: 0.1 }, { type: 'third_party', name: 'SecureSwitch Payments', vendor: vPay.id, rec: 2, loss: 0.25, spof: true }, { type: 'infrastructure', name: 'Cloud region B DR', vendor: vCloud.id, rec: 1, loss: 0.25 }, { type: 'data', name: 'Transaction ledger', rec: 1, loss: 0.1 }, { type: 'people', name: 'Payments ops on-call (4 FTE)', rec: 0.5 }],
      [{ name: 'Failover to cloud DR region', strategy_type: 'technical', achievable_rto_hours: 1.5, last_tested_on: day(-60), test_result: 'passed', procedure: 'Runbook PAY-DR-01', evidence_ref: 'DR test report Q3' }, { name: 'Stand-in authorisation', strategy_type: 'manual_workaround', achievable_rto_hours: 0.5, last_tested_on: day(-90), test_result: 'passed' }]);
    await bia({ name: 'Customer onboarding', process_id: bpOnboard.id, service_id: sMobile.id, product_id: prMobile.id, project_id: P1.id, rto_hours: 12, rpo_hours: 1, mbco_pct: 50, status: 'approved', approved_by: U.bcm, approved_at: new Date().toISOString(), next_review_date: day(200), manual_workarounds: 'Branch-assisted onboarding' },
      grid({ financial: [1, 2, 3, 4, 4], operational: [1, 2, 3, 3, 4], regulatory: [0, 1, 2, 3, 3], customer: [2, 3, 4, 4, 5], reputational: [1, 2, 3, 4, 4] }),
      [{ type: 'application', name: 'Mobile API layer', product: prMobile.id, rec: 4, loss: 0.5 }, { type: 'third_party', name: 'e-KYC provider', rec: 8 }, { type: 'infrastructure', name: 'Nimbus Cloud', vendor: vCloud.id, rec: 4 }],
      [{ name: 'Multi-AZ redeploy', strategy_type: 'technical', achievable_rto_hours: 4, last_tested_on: day(-120), test_result: 'passed' }, { name: 'Branch-assisted onboarding', strategy_type: 'manual_workaround', achievable_rto_hours: 2 }]);
    await bia({ name: 'Complaint handling', process_id: bpComplaint.id, service_id: sPortal.id, product_id: prPortal.id, rto_hours: 72, rpo_hours: 24, status: 'draft', manual_workarounds: 'Email and phone logging' },
      grid({ financial: [0, 0, 1, 2, 3], operational: [0, 1, 2, 3, 4], regulatory: [0, 1, 2, 4, 5], customer: [1, 2, 3, 4, 4], reputational: [0, 1, 2, 3, 4] }),
      [{ type: 'application', name: 'Portal web app', product: prPortal.id, rec: 8 }, { type: 'people', name: 'Complaints team' }], []);
    await bia({ name: 'Field job dispatch', process_id: bpDispatch.id, service_id: sField.id, product_id: prField.id, project_id: P7.id, assessment_level: 'light', rto_hours: 24, rpo_hours: 4, mbco_pct: 40, status: 'draft' },
      grid({ financial: [0, 1, 2, 3, 3], operational: [1, 2, 3, 4, 4], regulatory: [0, 0, 0, 1, 1], customer: [0, 1, 2, 3, 4], reputational: [0, 0, 1, 2, 3] }),
      [{ type: 'third_party', name: 'FieldTech device supply', vendor: vField.id, spof: true }], []);
    await bia({ name: 'Month-end regulatory reporting', process_id: bpReg.id, service_id: sReport.id, product_id: prData.id, project_id: P5.id, rto_hours: 48, rpo_hours: 24, mbco_pct: 100, status: 'approved', approved_by: U.bcm, approved_at: day(-400), next_review_date: day(-20) },
      grid({ financial: [0, 0, 1, 2, 3], operational: [0, 1, 1, 2, 3], regulatory: [0, 1, 3, 5, 5], customer: [0, 0, 0, 1, 1], reputational: [0, 0, 2, 3, 4] }),
      [{ type: 'application', name: 'Lakehouse', product: prData.id, rec: 24, loss: 24 }, { type: 'third_party', name: 'DataWorks Analytics', vendor: vData.id, rec: 72 }],
      [{ name: 'Re-run pipelines from raw zone', strategy_type: 'technical', achievable_rto_hours: 24, last_tested_on: day(-380), test_result: 'partial' }]);
    void biaAuth;

    // ---------------- work: project tasks + operational work
    const wi = async (o: Record<string, any>) => ins('work_items', 'WI', { owner_id: U.pmo, ...o });
    const tasks: [any, string, string, string, number, number, string][] = [
      [P1, 'Build payments confirmation screen', 'in_progress', U.dev1, -20, 5, 'high'], [P1, 'Fix VoiceOver labelling', 'in_progress', U.dev4, -5, 7, 'medium'], [P1, 'Performance test payments', 'blocked', U.dev2, -10, 2, 'high'], [P1, 'Card controls API integration', 'review', U.dev1, -25, 0, 'high'],
      [P1, 'Prepare UAT scripts', 'todo', U.tester, 5, 25, 'medium'], [P1, 'Onboarding analytics events', 'done', U.dev2, -60, -40, 'low'], [P2, 'HSM firmware upgrade', 'in_progress', U.dev1, -15, 6, 'critical'], [P2, 'DR runbook rehearsal', 'todo', U.ops, 5, 14, 'high'],
      [P2, 'Network ACL review', 'done', U.security, -40, -30, 'medium'], [P3, 'Data inventory workshops', 'in_progress', U.ba, -30, 10, 'medium'], [P3, 'Breach runbook draft', 'todo', U.security, 0, 20, 'high'], [P4, 'Disputes journey design', 'in_progress', U.dev4, -10, 20, 'medium'],
      [P5, 'Ingest card transactions feed', 'in_progress', U.dev3, -20, 10, 'high'], [P5, 'Data quality rules', 'todo', U.dev3, 0, 25, 'high'], [P6, 'Evaluation dataset (200 Q&A)', 'in_progress', U.ba, -14, 7, 'high'], [P6, 'Guardrail policy', 'todo', U.security, 0, 12, 'high'],
      [P7, 'Depot rollout plan', 'done', U.pm1, -20, -5, 'medium'], [P7, 'Train technicians wave 1', 'in_progress', U.ops, -3, 6, 'medium'], [P8, 'Billing data profiling', 'todo', U.dev3, 10, 40, 'medium'],
    ];
    let rank = 1;
    for (const [p, n, st, a, s, d, pri] of tasks) await wi({ context_type: 'project', context_id: p.id, name: n, status: st, assignee_id: a, start_date: day(s), due_date: day(d), priority: pri, work_type: 'task', estimate_hours: 24, board_rank: rank++, team_id: p.id === P5.id ? teamData.id : teamDigital.id });
    const opsWork: [string, string, string, string, string, string | null, number][] = [
      ['Card authorisation latency spike', 'incident', 'service', sPay.id, 'in_progress', U.ops, 0], ['Password reset failures for SME users', 'incident', 'product', prPortal.id, 'todo', U.dev2, 1], ['New starter access – finance analyst', 'service_request', 'none', '', 'todo', U.ops, 3],
      ['Quarterly certificate rotation', 'maintenance', 'service', sMobile.id, 'todo', U.dev1, 12], ['Patch billing servers (critical CVE)', 'security_remediation', 'product', prBill.id, 'in_progress', U.security, 4], ['Root cause: recurring dispatch sync failures', 'problem', 'service', sField.id, 'todo', U.ops, 15],
      ['PDPA data retention review', 'compliance_action', 'none', '', 'todo', U.security, 30], ['Weekly backup restore test', 'recurring', 'service', sPay.id, 'todo', U.ops, 2], ['Reduce portal page weight', 'service_improvement', 'product', prPortal.id, 'todo', U.dev4, 40], ['Firewall rule change for analytics', 'infrastructure_change', 'service', sReport.id, 'review', U.dev3, 5],
    ];
    for (const [n, t, ct, cid, st, a, due] of opsWork) await wi({ name: n, work_type: t, context_type: ct, context_id: ct === 'none' ? null : cid, status: st, assignee_id: a, due_date: day(due), priority: t === 'incident' || t === 'security_remediation' ? 'critical' : 'medium', recurrence_rule: t === 'recurring' ? 'FREQ=WEEKLY' : null, owner_id: U.ops });

    // ---------------- resources
    const alloc = async (u: string, t: string, id: string | null, role: string, s: number, e: number, pct: number, type = 'hard') => ins('resource_allocations', 'RA', { user_id: u, context_type: t, context_id: id, name: `${role} allocation`, role_name: role, start_date: day(s), end_date: day(e), allocation_pct: pct, allocation_type: type, owner_id: U.resources, status: 'active' });
    await alloc(U.dev1, 'project', P1.id, 'Lead engineer', -150, 60, 70); await alloc(U.dev1, 'project', P2.id, 'HSM specialist', -30, 30, 50); await alloc(U.dev1, 'bau', null, 'On-call', -200, 200, 10);
    await alloc(U.dev2, 'project', P1.id, 'Engineer', -150, 60, 60); await alloc(U.dev2, 'project', P5.id, 'Engineer', -60, 90, 30);
    await alloc(U.dev3, 'project', P5.id, 'Data engineer', -120, 90, 80); await alloc(U.dev3, 'project', P8.id, 'Data engineer', 0, 120, 40, 'soft');
    await alloc(U.dev4, 'project', P1.id, 'UX designer', -150, 60, 50); await alloc(U.dev4, 'project', P4.id, 'UX designer', -30, 120, 40);
    await alloc(U.pm1, 'project', P1.id, 'Project manager', -150, 60, 40); await alloc(U.pm1, 'project', P3.id, 'Project manager', -90, 120, 30); await alloc(U.pm1, 'project', P6.id, 'Project manager', -45, 100, 20); await alloc(U.pm1, 'project', P7.id, 'Project manager', -180, 10, 20);
    await alloc(U.pm2, 'project', P2.id, 'Project manager', -200, 40, 50); await alloc(U.pm2, 'project', P4.id, 'Project manager', -60, 180, 25); await alloc(U.pm2, 'project', P5.id, 'Project manager', -120, 90, 25);
    await alloc(U.ba, 'project', P3.id, 'Business analyst', -90, 120, 50); await alloc(U.ba, 'project', P6.id, 'Business analyst', -45, 100, 40);
    await alloc(U.tester, 'project', P1.id, 'QA lead', -60, 60, 60); await alloc(U.tester, 'project', P7.id, 'QA lead', -60, 10, 30);
    await alloc(U.ops, 'bau', null, 'Service operations', -365, 365, 60); await alloc(U.ops, 'project', P7.id, 'Business owner', -60, 20, 20);
    await alloc(U.security, 'project', P3.id, 'Security lead', -90, 120, 40); await alloc(U.security, 'bau', null, 'Security operations', -365, 365, 50);
    await alloc(U.product, 'product', prMobile.id, 'Product owner', -365, 365, 60); await alloc(U.product, 'product', prPortal.id, 'Product owner', -365, 365, 40);
    await alloc(U.product2, 'product', prPay.id, 'Product owner', -365, 365, 40); await alloc(U.product2, 'product', prData.id, 'Product owner', -365, 365, 30); await alloc(U.product2, 'product', prField.id, 'Product owner', -365, 365, 30);
    await ins('availability', 'AV', { user_id: U.dev2, name: 'Annual leave', start_date: day(14), end_date: day(18), availability_type: 'leave' });
    await ins('availability', 'AV', { user_id: U.pm1, name: 'PMP training', start_date: day(21), end_date: day(22), availability_type: 'training' });

    // ---------------- governance & compliance
    for (const [n, f, ref, eff, tested] of [['Access reviews quarterly', 'ISO/IEC 27001:2022', 'A.5.18', 'effective', -40], ['Change approval for production', 'ITIL 4 change enablement', 'Change enablement', 'effective', -20], ['Backup & restore testing', 'ISO 22301:2019', '8.4', 'partially_effective', -100], ['Vendor due diligence', 'Internal policy', 'VEN-01', 'partially_effective', -200], ['Personal data breach notification', 'Malaysia PDPA (as amended 2024)', 'Breach notification', 'not_tested', null]] as const)
      await ins('controls', 'CTL', { name: n, framework: f, framework_ref: ref, effectiveness: eff, last_tested_on: tested === null ? null : day(tested), owner_id: U.security });
    for (const [n, reg, st] of [['Appoint a Data Protection Officer', 'Malaysia PDPA (Amendment) Act 2024', 'compliant'], ['Notify Commissioner of personal data breaches', 'Malaysia PDPA (Amendment) Act 2024', 'partially'], ['Support data portability requests', 'Malaysia PDPA (Amendment) Act 2024', 'non_compliant'], ['Data processor security obligations', 'Malaysia PDPA (Amendment) Act 2024', 'partially']] as const)
      await ins('obligations', 'OBL', { name: n, source_regulation: reg, jurisdiction: 'Malaysia', compliance_status: st, owner_id: U.security, description: 'Synthetic example – verify obligations with legal counsel.' });
    await ins('audit_findings', 'AF', { context_type: 'product', context_id: prBill.id, name: 'Unsupported OS on billing servers', severity: 'high', corrective_action: 'Isolate and decommission', due_date: day(60), owner_id: U.security });
    await ins('audit_findings', 'AF', { context_type: 'enterprise', context_id: null, name: 'BIA reviews not performed on schedule', severity: 'medium', corrective_action: 'Automated review reminders', due_date: day(30), owner_id: U.bcm, status: 'in_progress' });
    for (const [n, forum, due, t, id] of [['Approve go/no-go for payments cut-over window', 'Steering Committee', 12, 'project', P2.id], ['Fund AI assistant scale-up', 'Portfolio Board', 25, 'project', P6.id], ['Select secondary payment switch vendor', 'Architecture Review Board', 40, 'product', prPay.id]] as const)
      await ins('decisions', 'DEC', { name: n, forum, due_date: day(due), needs_attention: true, status: 'pending', context_type: t, context_id: id, owner_id: U.pmo });
    await ins('decisions', 'DEC', { name: 'Adopt hybrid delivery as default', forum: 'PMO Council', decision: 'Approved', rationale: 'Most initiatives mix predictive governance and agile delivery.', decided_on: day(-90), decided_by: U.pmo, status: 'decided', context_type: 'enterprise', context_id: null, owner_id: U.pmo });
    await ins('architecture_decisions', 'ADR', { name: 'Use active-passive DR for payments in cloud region B', context_type: 'project', context_id: P2.id, context: 'RTO 2h requires a warm standby.', decision: 'Active-passive with automated failover.', consequences: 'Additional run cost MYR 18k/month.', status: 'accepted', owner_id: U.pm2 });
    await ins('meetings', 'MTG', { name: 'Payments migration steering committee', context_type: 'project', context_id: P2.id, meeting_at: new Date(Date.now() - 3 * 86400000).toISOString(), attendees: 'Daniel Lim, Ravi Kumar, Marcus Lee, Farah Aziz', minutes: 'HSM firmware issue discussed.\nAction: Ravi to confirm vendor fix date by ' + day(4) + '\nMarcus will schedule DR rehearsal\nDecision deferred on cut-over window.', status: 'held', owner_id: U.pm2 });

    // ---------------- change requests (via CRUD so impact assessments are generated)
    const pm2Ctx = (await loadCtx(U.pm2, undefined, c))!;
    await createRow(pm2Ctx, 'change_requests', { name: 'Extend payments cut-over by 3 weeks', context_type: 'project', context_id: P2.id, change_type: 'schedule', justification: 'HSM firmware incompatibility.', impact_schedule_days: 21, impact_cost: 180000, risk_level: 'high' }, { db: c });
    const cr2 = await createRow(pmCtx, 'change_requests', { name: 'Add Apple Pay provisioning to Mobile 3.0', context_type: 'project', context_id: P1.id, change_type: 'scope', justification: 'Customer demand and competitor parity.', impact_schedule_days: 10, impact_cost: 95000, risk_level: 'medium' }, { db: c });
    await createRow(pm2Ctx, 'change_requests', { name: 'Firewall change for analytics ingestion', context_type: 'service', context_id: sReport.id, change_type: 'it_change', justification: 'New source feeds.', risk_level: 'low' }, { db: c });
    await c.query(`UPDATE impact_assessments SET status='completed', rating='medium', notes='Assessed (synthetic).', assessor_id=$2 WHERE change_request_id=$1 AND area IN ('schedule','scope')`, [cr2.id, U.pm1]);

    // ---------------- approvals pending (realistic inbox)
    const finCtx = (await loadCtx(U.pm1, undefined, c))!;
    await c.query(`UPDATE budgets SET status='submitted' WHERE id=$1`, [pendingBudget.id]);
    await requestApproval(c, finCtx, { entity_type: 'budgets', entity_id: pendingBudget.id, entity_code: pendingBudget.code, approval_type: 'financial', roles: ['finance_controller'], amount: 180000 });
    await c.query(`UPDATE risks SET acceptance_status='pending' WHERE id=$1`, [acceptRisk.id]);
    await requestApproval(c, (await loadCtx(U.product2, undefined, c))!, { entity_type: 'risks', entity_id: acceptRisk.id, entity_code: acceptRisk.code, approval_type: 'risk_acceptance', roles: ['pmo_manager'] });
    await c.query(`UPDATE business_cases SET status='submitted' WHERE id=$1`, [bc.id]);
    await requestApproval(c, finCtx, { entity_type: 'business_cases', entity_id: bc.id, entity_code: bc.code, approval_type: 'financial', roles: ['portfolio_manager'] });
    const pr = await ins('purchase_requests', 'PR', { context_type: 'project', context_id: P5.id, vendor_id: vData.id, name: 'Data quality tooling licences', amount: 85000, quotations_count: 3, evaluation_summary: 'Three quotes; DataWorks best value.', status: 'submitted', owner_id: U.pm2 });
    await requestApproval(c, pm2Ctx, { entity_type: 'purchase_requests', entity_id: pr.id, entity_code: pr.code, approval_type: 'procurement', roles: ['procurement'], amount: 85000 });

    // ---------------- workflow instances (projects mid-lifecycle)
    const wf = (await c.query(`SELECT id, stages FROM workflow_definitions WHERE org_id=$1 AND key='project_lifecycle'`, [O])).rows[0];
    const keys: string[] = wf.stages.map((s: any) => s.key);
    for (const [p, stage] of [[P1, 'execution'], [P2, 'execution'], [P3, 'planning'], [P4, 'initiation'], [P5, 'execution'], [P7, 'release'], [P8, 'planning']] as const) {
      const hist = keys.slice(0, keys.indexOf(stage) + 1).map((k, i) => ({ at: new Date(Date.parse(p.start_date) + i * 5 * 86400000).toISOString(), stage: k, event: i === 0 ? 'started' : 'entered', by: p.owner_id }));
      await c.query(`INSERT INTO workflow_instances (org_id, definition_id, entity_type, entity_id, current_stage, requested_by, history) VALUES ($1,$2,'projects',$3,$4,$5,$6)`, [O, wf.id, p.id, stage, p.owner_id, JSON.stringify(hist)]);
    }
    const aiwf = (await c.query(`SELECT id FROM workflow_definitions WHERE org_id=$1 AND key='ai_initiative'`, [O])).rows[0];
    await c.query(`INSERT INTO workflow_instances (org_id, definition_id, entity_type, entity_id, current_stage, requested_by, history) VALUES ($1,$2,'projects',$3,'pilot',$4,'[]')`, [O, aiwf.id, P6.id, P6.owner_id]);

    // ---------------- documents generated from data
    const pmoCtx = (await loadCtx(U.pmo, undefined, c))!;
    await generateDocument(c, pmoCtx, { doc_type: 'status_report', context_type: 'project', context_id: P2.id });
    await generateDocument(c, pmoCtx, { doc_type: 'project_charter', context_type: 'project', context_id: P4.id });
    await generateDocument(c, pmoCtx, { doc_type: 'raid_report', context_type: 'project', context_id: P1.id });
    await generateDocument(c, (await loadCtx(U.bcm, undefined, c))!, { doc_type: 'bia_report', context_type: 'product', context_id: prPay.id, record_id: biaAuth.id });
    await ins('documents', 'DOC', { name: 'SOP – Payments DR failover', doc_type: 'sop', context_type: 'service', context_id: sPay.id, status: 'approved', current_version: 1, review_due: day(120), owner_id: U.ops, classification: 'confidential' });
    const sop = (await c.query(`SELECT id FROM documents WHERE org_id=$1 AND doc_type='sop'`, [O])).rows[0];
    await c.query(`INSERT INTO document_versions (org_id, document_id, version, content, created_by, change_note) VALUES ($1,$2,1,$3,$4,'Initial approved version')`, [O, sop.id, '# SOP – Payments DR failover\n\n1. Declare incident (P1) and notify BC manager.\n2. Freeze deployments.\n3. Execute runbook PAY-DR-01 failover.\n4. Validate authorisation success rate ≥ 99%.\n5. Communicate to stakeholders every 30 minutes.\n\n_Synthetic example document._', U.ops]);
    await ins('documents', 'DOC', { name: 'Restricted – Payments switch vendor exit analysis', doc_type: 'other', context_type: 'product', context_id: prPay.id, status: 'draft', classification: 'restricted', owner_id: U.procurement });
  });
  console.log('Synthetic demo data loaded. Sign in as e.g. admin@demo.example / pmo@demo.example / ceo@demo.example');
}
