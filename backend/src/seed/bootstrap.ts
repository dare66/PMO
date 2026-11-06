/**
 * Idempotent platform bootstrap: organisation, system roles, delegated-authority matrix,
 * RAG thresholds, metric definitions, workflow templates, integration catalogue (mock),
 * integration service account and (optionally) the first administrator from environment variables.
 * Demo data is ONLY loaded when SEED_DEMO=true and is labelled synthetic.
 */
import { pool, tx } from '../db.js';
import { config } from '../config.js';
import { hashPassword, validatePasswordPolicy } from '../auth/auth.js';
import { nextCode } from '../core/codes.js';
import { seedDemo } from './demo.js';
import type pg from 'pg';

const R = (...keys: string[]) => keys.flatMap((k) => [`${k}:read`, `${k}:write`, `${k}:delete`]);
export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  { key: 'admin', name: 'Platform administrator', description: 'Full access including configuration and restricted records', permissions: ['*'] },
  { key: 'executive', name: 'Executive / Sponsor', description: 'Read everything, decide approvals within authority', permissions: ['*:read', 'approvals:decide', 'ai:use'] },
  { key: 'pmo_manager', name: 'PMO manager', description: 'Governance, gates, RAID and reporting across the portfolio', permissions: ['*:read', ...R('projects', 'programmes', 'milestones', 'deliverables', 'risks', 'issues', 'assumptions', 'dependencies', 'change_requests', 'impact_assessments', 'documents', 'decisions', 'meetings', 'work_items', 'requirements'), 'approvals:decide', 'workflow:override', 'audit:read', 'ai:use'] },
  { key: 'portfolio_manager', name: 'Portfolio manager', description: 'Strategy, portfolios, investment and benefits', permissions: ['*:read', ...R('portfolios', 'programmes', 'objectives', 'key_results', 'business_capabilities', 'benefits', 'business_cases', 'budgets', 'decisions', 'projects'), 'approvals:decide', 'ai:use'] },
  { key: 'project_manager', name: 'Project manager', description: 'Plans and runs projects', permissions: ['*:read', ...R('projects', 'milestones', 'deliverables', 'work_items', 'risks', 'issues', 'assumptions', 'dependencies', 'change_requests', 'impact_assessments', 'requirements', 'resource_allocations', 'documents', 'meetings', 'decisions', 'cost_entries', 'budgets', 'benefits', 'purchase_requests', 'test_plans', 'business_cases'), 'approvals:decide', 'ai:use'] },
  { key: 'product_manager', name: 'Product manager', description: 'Owns products across their lifecycle', permissions: ['*:read', ...R('products', 'product_versions', 'ideas', 'feedback', 'experiments', 'roadmap_items', 'requirements', 'releases', 'benefits', 'business_cases', 'work_items', 'risks', 'issues', 'change_requests', 'documents', 'key_results'), 'approvals:decide', 'ai:use'] },
  { key: 'business_analyst', name: 'Business analyst', description: 'Requirements, processes and impact analysis', permissions: ['*:read', ...R('requirements', 'business_processes', 'process_steps', 'impact_assessments', 'documents', 'test_cases', 'work_items', 'feedback'), 'approvals:decide', 'ai:use'] },
  { key: 'bc_manager', name: 'Business continuity manager', description: 'BIA, recovery strategies and resilience', permissions: ['*:read', ...R('bia_assessments', 'recovery_strategies', 'services', 'business_processes', 'process_steps', 'impact_assessments', 'risks', 'applications'), 'approvals:decide', 'ai:use'] },
  { key: 'finance_controller', name: 'Finance controller', description: 'Budgets, actuals and financial approvals', permissions: ['*:read', ...R('budgets', 'cost_entries', 'business_cases', 'benefits', 'invoices', 'impact_assessments'), 'approvals:decide', 'ai:use'] },
  { key: 'resource_manager', name: 'Resource manager', description: 'Capacity and allocations', permissions: ['*:read', ...R('resource_allocations', 'availability', 'skills', 'teams'), 'ai:use'] },
  { key: 'tester', name: 'Tester', description: 'Test design and execution', permissions: ['projects:read', 'products:read', 'releases:read', 'requirements:read', 'work_items:read', 'users:read', ...R('test_plans', 'test_cases', 'test_executions', 'defects'), 'ai:use'] },
  { key: 'release_manager', name: 'Release manager', description: 'Releases, deployments and environments', permissions: ['*:read', ...R('releases', 'deployments', 'environments'), 'releases:deploy', 'approvals:decide', 'ai:use'] },
  { key: 'operations', name: 'Operations / service owner', description: 'Operational work, services and acceptance', permissions: ['*:read', ...R('work_items', 'services', 'environments', 'deployments', 'impact_assessments', 'applications'), 'approvals:decide', 'ai:use'] },
  { key: 'security_officer', name: 'Security officer', description: 'Security & privacy risk and controls', permissions: ['*:read', ...R('risks', 'controls', 'obligations', 'impact_assessments', 'audit_findings'), 'approvals:decide', 'audit:read', 'ai:use'] },
  { key: 'procurement', name: 'Procurement officer', description: 'Vendors, contracts and purchasing', permissions: ['*:read', ...R('vendors', 'contracts', 'purchase_requests', 'invoices', 'impact_assessments'), 'approvals:decide', 'ai:use'] },
  { key: 'cab', name: 'Change advisory board', description: 'Approves releases and IT changes', permissions: ['*:read', 'approvals:decide', 'ai:use'] },
  { key: 'auditor', name: 'Auditor (read-only)', description: 'Read-only access including audit trail', permissions: ['*:read', 'audit:read'] },
  { key: 'member', name: 'Team member', description: 'Works on assigned items', permissions: ['projects:read', 'products:read', 'programmes:read', 'portfolios:read', 'users:read', 'teams:read', 'milestones:read', 'documents:read', 'requirements:read', ...R('work_items'), 'ai:use'] },
];

const MATRIX: [string, string, number | null][] = [
  ['finance_controller', 'financial', 250000], ['portfolio_manager', 'financial', 2000000], ['executive', 'financial', null],
  ['procurement', 'procurement', 100000], ['finance_controller', 'procurement', 500000], ['executive', 'procurement', null],
  ['pmo_manager', 'change', 100000], ['executive', 'change', null], ['finance_controller', 'change', 250000],
  ['pmo_manager', 'risk_acceptance', null], ['executive', 'risk_acceptance', null],
  ['pmo_manager', 'gate', null], ['portfolio_manager', 'gate', null], ['executive', 'gate', null],
  ['cab', 'cab', null], ['pmo_manager', 'document', null], ['bc_manager', 'bia', null],
];

const THRESHOLDS: [string, string, number, number][] = [
  ['spi', 'higher_is_better', 0.95, 0.85], ['cpi', 'higher_is_better', 0.95, 0.85],
  ['high_risks', 'lower_is_better', 0, 2], ['overdue_milestones', 'lower_is_better', 0, 1],
  ['budget_utilisation', 'lower_is_better', 90, 100], ['resource_utilisation', 'lower_is_better', 90, 110],
];

export const METRICS: [string, string, string, string, string][] = [
  ['project_health', 'Project health (overall RAG)', 'Worst of schedule, cost, risk and milestone RAG. Unknown components cap overall at amber; all unknown = unknown. Never green on missing data.', 'projects, cost_entries, risks, milestones', 'pmo_manager'],
  ['spi', 'Schedule performance index', 'SPI = EV / PV; EV = BAC × % complete; PV = BAC × planned % (linear between baseline start and finish)', 'projects.budget_at_completion, percent_complete, baseline dates', 'pmo_manager'],
  ['cpi', 'Cost performance index', 'CPI = EV / AC; AC = Σ actual cost entries converted to base currency', 'projects, cost_entries(kind=actual)', 'finance_controller'],
  ['budget_utilisation', 'Budget utilisation %', 'Σ actual ÷ Σ approved budget lines × 100 (rolled up portfolio → programme → project/product)', 'budgets(status=approved), cost_entries', 'finance_controller'],
  ['risk_exposure', 'Risk exposure', 'Count of open risks by likelihood × impact cell; high = score ≥ 12, critical ≥ 20', 'risks', 'pmo_manager'],
  ['benefit_realisation', 'Benefit realisation %', '(actual − baseline) ÷ (target − baseline) × 100; null if any input missing', 'benefits', 'portfolio_manager'],
  ['okr_progress', 'Objective progress %', 'Mean of key-result progress, each clamped 0–100; null when no measured KRs', 'objectives, key_results', 'portfolio_manager'],
  ['resource_utilisation', 'Resource utilisation %', 'Σ allocation % in week ÷ available capacity % (leave removes 20% per working day)', 'resource_allocations, availability', 'resource_manager'],
  ['bia_tier', 'BIA criticality tier', 'MTPD = earliest horizon where any impact category severity ≥ tolerance threshold. Tier 1 ≤4h, 2 ≤24h, 3 ≤72h, 4 >72h', 'bia_assessments, bia_impacts', 'bc_manager'],
  ['release_readiness', 'Release readiness', 'All mandatory checks pass: tests linked, thresholds met, UAT signed off, no open critical/high defects, rollback + deployment plans, CAB, business validation, operational acceptance', 'releases, test_*, defects, approvals', 'release_manager'],
];

const S = (key: string, name: string, extra: Record<string, unknown> = {}) => ({ key, name, ...extra });
export const WORKFLOWS: { key: string; name: string; entity_type: string; description: string; stages: any[] }[] = [
  { key: 'project_lifecycle', name: 'Project lifecycle (full governance, hybrid)', entity_type: 'projects', description: 'Idea → post-implementation review with gates. Tailor by copying and editing.', stages: [
    S('idea', 'Idea / request', { sets: { lifecycle_stage: 'idea' } }),
    S('intake', 'Intake', { exit: ['field:description'], sets: { lifecycle_stage: 'intake' } }),
    S('initial_assessment', 'Initial assessment', { exit: ['field:owner_id', 'field:sponsor_id'], sets: { lifecycle_stage: 'initial_assessment' } }),
    S('bia_screening', 'BIA & impact screening', { exit: ['bia_screened'], sets: { lifecycle_stage: 'bia_screening' } }),
    S('feasibility', 'Feasibility', { exit: ['field:scope_statement'], sets: { lifecycle_stage: 'feasibility' } }),
    S('business_case', 'Business case', { exit: ['field:business_case', 'field:budget_at_completion'], sets: { lifecycle_stage: 'business_case' } }),
    S('prioritisation', 'Prioritisation', { exit: ['field:strategic_score'], sets: { lifecycle_stage: 'prioritisation' } }),
    S('approval', 'Investment approval', { approvals: [{ role: 'portfolio_manager' }, { role: 'finance_controller' }], sets: { lifecycle_stage: 'approval' } }),
    S('initiation', 'Initiation', { exit: ['document_exists:project_charter'], deliverables: ['project_charter'], sets: { lifecycle_stage: 'initiation' } }),
    S('planning', 'Planning', { exit: ['field:start_date', 'field:end_date', 'budget_approved', 'benefits_defined', 'risks_reviewed', 'bia_approved_if_required'], approvals: [{ role: 'pmo_manager' }], sets: { lifecycle_stage: 'planning' } }),
    S('execution', 'Execution', { sets: { lifecycle_stage: 'execution' } }),
    S('monitoring', 'Monitoring & control', { exit: ['risks_reviewed'], sets: { lifecycle_stage: 'monitoring' } }),
    S('testing', 'Testing & validation', { exit: ['no_open_critical_defects', 'test_pass_rate:95'], sets: { lifecycle_stage: 'testing' } }),
    S('release', 'Release & deployment', { sets: { lifecycle_stage: 'release' } }),
    S('handover', 'Operational handover', { exit: ['operational_handover'], approvals: [{ role: 'operations' }], sets: { lifecycle_stage: 'handover' } }),
    S('closure', 'Closure', { exit: ['all_milestones_achieved', 'field:lessons_learned'], approvals: [{ role: 'pmo_manager' }], sets: { lifecycle_stage: 'closure' } }),
    S('benefits_tracking', 'Benefits tracking', { exit: ['benefits_defined'], sets: { lifecycle_stage: 'benefits_tracking' } }),
    S('pir', 'Post-implementation review', { sets: { lifecycle_stage: 'pir' } }),
  ] },
  { key: 'agile_delivery', name: 'Agile delivery (lightweight)', entity_type: 'projects', description: 'For adaptive teams: fewer gates, continuous delivery.', stages: [
    S('intake', 'Intake', { exit: ['field:description'], sets: { lifecycle_stage: 'intake' } }),
    S('discovery', 'Discovery', { exit: ['bia_screened'], sets: { lifecycle_stage: 'discovery' } }),
    S('delivery', 'Iterative delivery', { approvals: [{ role: 'portfolio_manager' }], sets: { lifecycle_stage: 'execution' } }),
    S('release', 'Release', { exit: ['no_open_critical_defects'], sets: { lifecycle_stage: 'release' } }),
    S('closure', 'Closure', { sets: { lifecycle_stage: 'closure' } }),
  ] },
  { key: 'ai_initiative', name: 'AI initiative', entity_type: 'projects', description: 'Adds AI risk, data protection and human-oversight review.', stages: [
    S('intake', 'Use-case intake', { exit: ['field:description'], sets: { lifecycle_stage: 'intake' } }),
    S('ai_risk', 'AI risk & impact assessment', { exit: ['bia_screened', 'risks_reviewed'], sets: { lifecycle_stage: 'ai_risk_assessment' } }),
    S('dp_review', 'Data protection & security review', { approvals: [{ role: 'security_officer' }], sets: { lifecycle_stage: 'data_protection_review' } }),
    S('pilot', 'Pilot', { exit: ['benefits_defined'], sets: { lifecycle_stage: 'pilot' } }),
    S('scale', 'Scale decision', { approvals: [{ role: 'executive' }], sets: { lifecycle_stage: 'scale' } }),
    S('operate', 'Operate & monitor', { sets: { lifecycle_stage: 'operate' } }),
  ] },
  { key: 'regulatory_initiative', name: 'Regulatory initiative', entity_type: 'projects', description: 'Compliance-driven work with mandatory BIA and evidence.', stages: [
    S('obligation', 'Obligation analysis', { exit: ['field:description'], sets: { lifecycle_stage: 'intake' } }),
    S('impact', 'Impact & BIA', { exit: ['bia_screened', 'bia_approved_if_required'], sets: { lifecycle_stage: 'bia_screening' } }),
    S('plan', 'Plan', { approvals: [{ role: 'security_officer' }, { role: 'pmo_manager' }], sets: { lifecycle_stage: 'planning' } }),
    S('implement', 'Implement', { sets: { lifecycle_stage: 'execution' } }),
    S('evidence', 'Evidence & attestation', { exit: ['no_open_critical_defects'], sets: { lifecycle_stage: 'testing' } }),
    S('close', 'Close', { sets: { lifecycle_stage: 'closure' } }),
  ] },
  { key: 'business_change', name: 'Business change', entity_type: 'projects', description: 'Process and organisational change with readiness.', stages: [
    S('intake', 'Intake', { exit: ['field:description'] }), S('impact', 'Change impact', { exit: ['bia_screened'] }),
    S('readiness', 'Business readiness', { approvals: [{ role: 'operations' }] }), S('transition', 'Transition'), S('embed', 'Embed & benefits', { exit: ['benefits_defined'] }),
  ] },
  { key: 'infrastructure_change', name: 'Infrastructure change', entity_type: 'projects', description: 'Infrastructure delivery with operational acceptance.', stages: [
    S('design', 'Design', { exit: ['field:scope_statement'] }), S('build', 'Build'), S('test', 'Test', { exit: ['no_open_critical_defects'] }),
    S('cab', 'CAB', { approvals: [{ role: 'cab' }] }), S('cutover', 'Cut-over'), S('handover', 'Handover', { exit: ['operational_handover'] }),
  ] },
  { key: 'operational_improvement', name: 'Operational improvement', entity_type: 'projects', description: 'Lean improvement cycle (measure → improve → control).', stages: [
    S('define', 'Define', { exit: ['field:description'] }), S('measure', 'Measure baseline', { exit: ['benefits_defined'] }), S('improve', 'Improve'), S('control', 'Control', { approvals: [{ role: 'operations' }] }),
  ] },
  { key: 'new_product', name: 'New product', entity_type: 'products', description: 'Concept to retirement; products persist beyond projects.', stages: [
    S('concept', 'Concept', { sets: { lifecycle_stage: 'concept' } }),
    S('discovery', 'Discovery', { exit: ['field:vision', 'field:target_users'], sets: { lifecycle_stage: 'discovery' } }),
    S('validation', 'Validation & business case', { approvals: [{ role: 'portfolio_manager' }], sets: { lifecycle_stage: 'development' } }),
    S('launch', 'Launch readiness', { approvals: [{ role: 'executive' }], sets: { lifecycle_stage: 'launch' } }),
    S('growth', 'Growth', { sets: { lifecycle_stage: 'growth' } }),
    S('mature', 'Mature', { sets: { lifecycle_stage: 'mature' } }),
    S('retire', 'Retirement', { approvals: [{ role: 'portfolio_manager' }], sets: { lifecycle_stage: 'retired' } }),
  ] },
  { key: 'new_programme', name: 'New programme', entity_type: 'programmes', description: 'Programme definition, delivery and closure.', stages: [
    S('identify', 'Identify', { exit: ['field:description'] }), S('define', 'Define', { exit: ['field:portfolio_id'], approvals: [{ role: 'portfolio_manager' }] }), S('deliver', 'Deliver capabilities'), S('close', 'Close', { approvals: [{ role: 'executive' }] }),
  ] },
  { key: 'idea_intake', name: 'New idea', entity_type: 'ideas', description: 'Idea triage and discovery.', stages: [
    S('new', 'New', { sets: { stage: 'new' } }), S('assess', 'Assess', { exit: ['field:problem_statement'], sets: { stage: 'assessing' } }),
    S('discover', 'Discovery', { exit: ['field:hypothesis', 'field:effort'], sets: { stage: 'discovery' } }),
    S('decide', 'Decision', { approvals: [{ role: 'product_manager' }], sets: { stage: 'validated' } }), S('approved', 'Approved for delivery', { sets: { stage: 'approved' } }),
  ] },
  { key: 'it_change', name: 'IT / application change', entity_type: 'change_requests', description: 'Assess → CAB → implement → review.', stages: [
    S('submitted', 'Submitted'), S('assessment', 'Impact assessment', { exit: ['impact_assessments_complete'] }),
    S('cab', 'CAB review', { approvals: [{ role: 'cab' }] }), S('implement', 'Implementation'), S('review', 'Post-implementation review'),
  ] },
  { key: 'procurement_request', name: 'Procurement request', entity_type: 'purchase_requests', description: 'Quotation evaluation and approval.', stages: [
    S('draft', 'Draft'), S('evaluate', 'Quotation evaluation', { exit: ['field:evaluation_summary', 'field:vendor_id'] }),
    S('approve', 'Procurement approval', { approvals: [{ role: 'procurement' }] }), S('order', 'Ordering', { exit: ['field:po_number'] }), S('close', 'Received & closed'),
  ] },
  { key: 'service_improvement', name: 'Service improvement', entity_type: 'work_items', description: 'Continual improvement for operational services.', stages: [
    S('propose', 'Propose', { exit: ['field:description'] }), S('prioritise', 'Prioritise', { approvals: [{ role: 'operations' }] }), S('implement', 'Implement'), S('verify', 'Verify'),
  ] },
];

const INTEGRATIONS: [string, string, string, Record<string, string>][] = [
  ['jira', 'Jira (delivery teams)', 'jira', { name: 'fields.summary', description: 'fields.description', status: 'fields.status' }],
  ['azure_devops', 'Azure DevOps Boards', 'azure_devops', { name: 'fields.System.Title' }],
  ['github', 'GitHub', 'github', { name: 'title', description: 'body' }],
  ['teams', 'Microsoft Teams notifications', 'teams', {}],
  ['slack', 'Slack notifications', 'slack', {}],
  ['servicenow', 'ServiceNow ITSM', 'servicenow', { name: 'short_description', work_type: 'type' }],
  ['erp', 'ERP / Finance actuals', 'erp', {}],
  ['hr', 'HR system (leave & org)', 'hr', {}],
  ['email', 'Email gateway', 'email', {}],
  ['webhook', 'Generic signed webhook', 'webhook', {}],
];

export async function ensureOrgConfig(c: pg.PoolClient, orgId: string) {
  for (const r of SYSTEM_ROLES) await c.query(`INSERT INTO roles (org_id, key, name, description, permissions, is_system) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (org_id, key) DO NOTHING`, [orgId, r.key, r.name, r.description, r.permissions]);
  for (const [role, type, max] of MATRIX) await c.query(`INSERT INTO approval_matrix (org_id, role_key, approval_type, max_amount) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [orgId, role, type, max]);
  for (const [k, d, g, a] of THRESHOLDS) await c.query(`INSERT INTO rag_thresholds (org_id, metric_key, direction, green_at, amber_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [orgId, k, d, g, a]);
  for (const [k, n, f, s, o] of METRICS) await c.query(`INSERT INTO metric_definitions (org_id, key, name, formula, source_data, owner_role) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org_id, key) DO UPDATE SET name=EXCLUDED.name, formula=EXCLUDED.formula, source_data=EXCLUDED.source_data`, [orgId, k, n, f, s, o]);
  for (const w of WORKFLOWS) await c.query(`INSERT INTO workflow_definitions (org_id, key, name, description, entity_type, stages) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org_id, key, version) DO NOTHING`, [orgId, w.key, w.name, w.description, w.entity_type, JSON.stringify(w.stages)]);
  for (const [k, n, conn, map] of INTEGRATIONS) await c.query(`INSERT INTO integrations (org_id, key, name, connector, mode, field_mapping, secret_ref) VALUES ($1,$2,$3,$4,'mock',$5,$6) ON CONFLICT (org_id, key) DO NOTHING`, [orgId, k, n, conn, JSON.stringify(map), `INTEGRATION_${k.toUpperCase()}`]);
  const svc = (await c.query(`SELECT id FROM users WHERE org_id=$1 AND is_service_account`, [orgId])).rows[0];
  if (!svc) await c.query(`INSERT INTO users (org_id, code, email, name, is_service_account, status) VALUES ($1,$2,$3,'Integration service account',true,'active')`, [orgId, await nextCode(c, orgId, 'USR'), `integration+${orgId.slice(0, 8)}@service.local`]);
}

export async function bootstrap() {
  await tx(async (c) => {
    let org = (await c.query(`SELECT * FROM organisations ORDER BY created_at LIMIT 1`)).rows[0];
    if (!org && config.seedDemo) return; // demo creates its own org below
    if (!org) {
      org = (await c.query(`INSERT INTO organisations (code, name, base_currency) VALUES ($1,$2,$3) RETURNING *`, [process.env.ORG_CODE ?? 'ORG', process.env.ORG_NAME ?? 'My Organisation', process.env.BASE_CURRENCY ?? 'MYR'])).rows[0];
    }
    await ensureOrgConfig(c, org.id);
  });
  if (config.seedDemo) await seedDemo();
  await tx(async (c) => {
    const org = (await c.query(`SELECT * FROM organisations ORDER BY created_at LIMIT 1`)).rows[0];
    if (config.adminEmail && config.adminPassword) {
      const policy = validatePasswordPolicy(config.adminPassword);
      if (policy) throw new Error(`ADMIN_PASSWORD rejected: ${policy}`);
      const exists = (await c.query(`SELECT id FROM users WHERE lower(email)=lower($1)`, [config.adminEmail])).rows[0];
      if (!exists) {
        const u = (await c.query(`INSERT INTO users (org_id, code, email, name, title, password_hash) VALUES ($1,$2,$3,'Platform Administrator','Administrator',$4) RETURNING id`, [org.id, await nextCode(c, org.id, 'USR'), config.adminEmail, await hashPassword(config.adminPassword)])).rows[0];
        const role = (await c.query(`SELECT id FROM roles WHERE org_id=$1 AND key='admin'`, [org.id])).rows[0];
        await c.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2)`, [u.id, role.id]);
        console.log(`Created administrator ${config.adminEmail}`);
      }
    }
  });
  void pool;
}
