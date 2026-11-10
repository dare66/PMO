"""
Reconciliation of FRS-EPMO-001 v1.1 ("Enterprise_Project_Management_PMO_FRS_v1.1_Product_Management_Included.docx")
against the Meridian implementation. Every one of the 301 baseline items is listed under its ORIGINAL ID; none is dropped.

The customer stated the uploaded document is partial ("not the complete info"); items from sections not supplied
cannot be reconciled and are tracked as GAP-013 in REQUIREMENT_GAP_REGISTER.md.

Status vocabulary
  Implemented  – behaviour exists, is server-enforced where it is a rule, and has automated test evidence where marked
  Partial      – core behaviour exists; the stated remainder is listed in 'gap' with the planned phase
  Deferred     – not built in this release; justification and phase in 'gap' (never silently removed)

Run: python3 docs/requirements/frs_v11_reconciliation.py
Writes FRS_V11_RECONCILIATION.md and FRS_V11_RECONCILIATION.csv next to this file.
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
I, P, D = 'Implemented', 'Partial', 'Deferred'

# id: (status, evidence (API / data / UI), automated tests, gap or note)
M = {
 'GO-01': (I, 'projects table is the single project identity; registers link by context_type/context_id; requests.converted_project_id', 'TC-PRD-001; frs: intake pipeline', ''),
 'GO-02': (I, 'workflow_definitions gates with entry/exit criteria; GUARDED_STATUS; approvals engine', 'TC-WF-001..002; TC-GOV-*', ''),
 'GO-03': (I, 'project_baselines (immutable), /api/projects/:id/schedule (forecast vs baseline), finance summary (budget/actual/forecast/EAC)', 'TC-FIN-003; frs: baselines', ''),
 'GO-04': (I, 'benefits with owner, baseline, target, measurement date; gate criterion benefits_defined', 'TC-WF-001', ''),
 'GO-05': (I, 'BIA screening & gate criterion bia_approved_if_required; release readiness; service acceptance', 'TC-BIA-*; TC-REL-*', ''),
 'GO-06': (I, 'resource_allocations, availability, capacity heatmap, over-allocation on resource request', 'TC-CALC-LOAD; frs: allocation requests', ''),
 'GO-07': (I, '/api/traceability/:type/:id (objective→requirement→work→test→evidence) + CSV snapshot', 'api: TC-BA-RQ', ''),
 'GO-08': (I, 'hash-chained append-only audit_events for every mutation, approval and decision', 'TC-AUD-001..002', ''),
 'GO-09': (I, 'documents (sop/user_guide/process_flow generators), lessons with /api/lessons/relevant, global search', 'frs: generators', ''),
 'GO-10': (I, 'AI intake drafts origin=ai, human acceptance only, sources cited, generated docs DRAFT until approval', 'TC-AI-*; frs: AI acceptance', ''),
 # ---------------- portfolio
 'FR-PORT-001': (I, 'objectives → portfolios → programmes → projects/products; requests as initiatives', 'TC-RPT-OKR', ''),
 'FR-PORT-002': (P, 'projects.objective_id, portfolio investment theme, key results', '', 'Single objective per project; M:N project↔objective links planned Phase 3'),
 'FR-PORT-003': (I, 'requests.pipeline_stage state machine via POST /api/requests/:id/transition (all 10 states)', 'frs: intake pipeline', ''),
 'FR-PORT-004': (I, 'scoring_models (configurable weighted criteria, direction), /api/scores with audited overrides; immutable scores', 'frs: scoring', ''),
 'FR-PORT-005': (P, 'investment_scenarios + scenario_items with funding/capacity limits, /api/scenarios/:id/evaluate', '', 'Sequencing what-if (start-date shifting) planned Phase 3'),
 'FR-PORT-006': (P, 'executive dashboard health/risk/alignment map, filterable registers', 'TC-RPT-001', 'Heatmap pivots by business unit/sponsor/delivery method planned Phase 3'),
 'FR-PORT-007': (P, 'dependencies register (cross-project), duplicate detection, resource conflicts', 'frs: duplicates', 'Shared-milestone & duplicated-scope analytics view planned Phase 3'),
 'FR-PORT-008': (I, 'portfolio finance roll-up, benefits, health/confidence on dashboard', 'TC-FIN-003', ''),
 'FR-PORT-009': (I, 'decisions, meetings (minutes), actions, scores history (immutable) for re-prioritisation', 'frs: scoring', ''),
 'FR-PORT-010': (I, 'rag_thresholds (configurable) + runEscalations exception alerts (finance >5%, risks, issues)', 'TC-RPT-001', ''),
 # ---------------- initiation
 'FR-INIT-001': (P, 'requests with request_type (7 types incl. emergency) and type-specific fields', 'frs: intake pipeline', 'Per-type form layouts are metadata-driven but not yet admin-configurable per type (Phase 3)'),
 'FR-INIT-002': (I, 'requests: problem_statement, current_state, proposed_outcome, urgency, sponsor, requester, department, impacted_customers, target_date', 'frs: intake pipeline', ''),
 'FR-INIT-003': (I, 'findDuplicates (title, description, system, process; requests+projects+ideas); audited on create', 'frs: intake pipeline', ''),
 'FR-INIT-004': (P, 'nextCode per org/prefix (RQ-0001, PRJ-…)', '', 'Prefix configurable in registry; admin-editable numbering rules planned Phase 3'),
 'FR-INIT-005': (I, 'triage/screening/discovery/rejection (reason)/deferral (reason+date)/convert', 'frs: intake pipeline', ''),
 'FR-INIT-006': (I, 'project_charter generator with explicit MISSING markers', 'TC-RPT-DOC', ''),
 'FR-INIT-007': (I, 'projects: project_type, complexity, criticality, regulatory_category, delivery_approach, governance_tier', '', ''),
 'FR-INIT-008': (I, 'projects: status, lifecycle_stage, owner, sponsor, business_owner_id, dates, forecast (schedule)', '', ''),
 'FR-INIT-009': (P, 'statuses suspended/terminated/archived + status_reason; closure guarded', 'TC-PRD-002', 'Approval routing for suspend/terminate planned Phase 3 (closure already approval-guarded)'),
 'FR-INIT-010': (I, 'convert request with template_project_id (copies milestones); programme_id', 'frs: intake pipeline', ''),
 # ---------------- business case
 'FR-BC-001': (I, 'business_cases: rationale, problem, options incl. do-nothing, recommendation', '', ''),
 'FR-BC-002': (I, 'business_cases + dis_benefits, assumptions, dependencies, risks; benefits register', '', ''),
 'FR-BC-003': (I, 'evaluateBusinessCase NPV/IRR/payback/ROI; null when inputs missing', 'calc tests', ''),
 'FR-BC-004': (I, 'sensitivity_pct with best/base/worst in /api/business-cases/:id/evaluate', 'calc tests', ''),
 'FR-BC-005': (P, 'business_cases.feasibility (structured text)', '', 'Per-dimension feasibility scoring planned Phase 3'),
 'FR-BC-006': (I, 'benefits: owner, baseline, target, measurement method, due date, evidence', '', ''),
 'FR-BC-007': (P, 'business_cases.version; approval preserved in audit; approval guard', '', 'Snapshot table for approved business case versions planned Phase 3 (audit holds full before/after)'),
 'FR-BC-008': (I, 'business_case generator + decision records on approval', 'TC-RPT-DOC', ''),
 # ---------------- business analysis
 'FR-BA-001': (I, 'business_capabilities, business_processes (as_is/to_be), process_steps', '', ''),
 'FR-BA-002': (I, 'BPMN 2.0 import/export /api/processes/:id/bpmn (XXE guarded); Mermaid process_flow generator', 'frs: BPMN XXE', ''),
 'FR-BA-003': (I, 'requirements.req_type business/functional/non_functional/regulatory/bc_dr; stakeholders', '', ''),
 'FR-BA-004': (I, 'requirements: code, source, owner, priority, acceptance criteria, status, version (immutable history)', 'TC-BA-RQ', ''),
 'FR-BA-005': (P, 'meetings (meeting_type workshop/interview) and AI intake from notes', '', 'Dedicated elicitation-session register planned Phase 3'),
 'FR-BA-006': (I, 'MoSCoW priority; weighted scoring models', 'frs: scoring', ''),
 'FR-BA-007': (I, 'traceability matrix objective→requirement→work item→test→defect/evidence', 'TC-BA-RQ', ''),
 'FR-BA-008': (I, 'requirement submit→approval (SoD), approved edits re-version and return to review', 'TC-BA-RQ', ''),
 'FR-BA-009': (I, 'requirements_spec (BRD/FRS + RTM) generator; RTM CSV export', 'frs: generators', ''),
 'FR-BA-010': (P, 'parent links via work items; duplicate detection; coverage in quality status', '', 'Requirement parent/child & conflict links planned Phase 3'),
 'FR-BA-011': (I, 'req_type non_functional/regulatory/bc_dr with category tagging', '', ''),
 'FR-BA-012': (I, 'test executions with evidence_ref verify requirements (RTM verified flag)', 'TC-BA-RQ', ''),
 # ---------------- scope
 'FR-SCP-001': (I, 'projects.scope_statement, assumptions register, constraints', '', ''),
 'FR-SCP-002': (P, 'work_items hierarchy (phase/work_package/deliverable links), deliverables', '', 'Control-account attributes planned Phase 3'),
 'FR-SCP-003': (I, 'deliverables register with owner, due date, acceptance status, evidence files', '', ''),
 'FR-SCP-004': (I, 'links via requirement_id, work items, risks/contexts, traceability', '', ''),
 'FR-SCP-005': (I, 'POST /api/projects/:id/baseline; immutable project_baselines; re-baseline only via approved CR', 'frs: baselines', ''),
 'FR-SCP-006': (I, 'deliverable acceptance; contract milestone acceptance (human only)', '', ''),
 'FR-SCP-007': (P, 'RTM gaps (requirements without work/tests)', '', 'Unapproved-scope-addition detection planned Phase 3'),
 'FR-SCP-008': (I, 'work types epic/feature/story; sprints', 'frs: sprints', ''),
 # ---------------- schedule
 'FR-SCH-001': (I, 'work items from backlog, templates (request conversion), AI intake, CSV/integration import', '', ''),
 'FR-SCH-002': (I, 'work_items: owner, effort, durations, dates, status, completion rules (requires_evidence)', '', ''),
 'FR-SCH-003': (I, 'work_dependencies FS/SS/FF/SF with lag; cycle refusal', 'frs: CPM', ''),
 'FR-SCH-004': (I, 'CPM forward/backward pass, float, critical path, forecast finish (/api/projects/:id/schedule)', 'frs: CPM', ''),
 'FR-SCH-005': (P, 'Gantt (timeline) and roadmap views; milestone list', '', 'Dependency network and calendar views planned with frontend Phase 3'),
 'FR-SCH-006': (P, 'holidays calendar (org/calendar), weekends excluded in CPM', 'frs: working days', 'Per-project calendars and time-zone-aware working patterns planned Phase 3'),
 'FR-SCH-007': (P, 'three-point (PERT) estimates, estimate_hours', 'frs: PERT', 'Analogous/parametric estimate records planned Phase 3'),
 'FR-SCH-008': (I, 'baseline_start/end (locked), current plan dates, actual_end; milestones.baseline_date', 'frs: baselines', ''),
 'FR-SCH-009': (I, 'SPI/SV (EVM) and slippage vs baseline', 'calc tests', ''),
 'FR-SCH-010': (D, '-', '', 'Resource levelling/compression algorithms deferred to Phase 4; what-if via investment scenarios'),
 'FR-SCH-011': (I, 'assumptions register; budgets.budget_type contingency/management_reserve', '', ''),
 'FR-SCH-012': (I, 'sprints, /api/sprints/:id/report (burndown, velocity)', 'frs: sprints', ''),
 # ---------------- work
 'FR-WRK-001': (I, 'work_type includes phase, work_package, epic, feature, story, task, subtask, action', '', ''),
 'FR-WRK-002': (I, 'owner + assignee, watchers (/api/watch), approvals', '', ''),
 'FR-WRK-003': (I, 'status, priority, dates, estimate/actual/remaining, dependencies, acceptance & evidence', '', ''),
 'FR-WRK-004': (P, 'Kanban board (board_rank), lists, sprint assignment', '', 'Calendar view planned Phase 3'),
 'FR-WRK-005': (P, 'recurrence (spawned on done), templates via conversion', '', 'Checklists, bulk update and clone actions planned Phase 3'),
 'FR-WRK-006': (I, 'comments with @mentions, files (scanned), audit history, decision links', 'frs: comments; quarantine', ''),
 'FR-WRK-007': (I, 'My work page (overdue, upcoming), workload heatmap', '', ''),
 'FR-WRK-008': (I, 'blocked_reason required, escalation job, reassignment audited, approval delegation', 'frs: evidence/blocked', ''),
 'FR-WRK-009': (I, 'requires_evidence → done needs completion_evidence or clean attachment', 'frs: evidence', ''),
 'FR-WRK-010': (I, '/api/projects/:id/progress weighted effort/milestone; task counts never used', 'frs: progress', ''),
 'FR-WRK-011': (I, 'time_entries own-time only, approval by another person, immutable after decision', 'frs: time entries', ''),
 'FR-WRK-012': (P, 'integration framework (Jira/Azure DevOps MOCK adapters) with idempotent inbound events keyed by external_id', 'TC-INT-*', 'Live connectors need customer credentials (env-referenced) – Phase 4'),
 # ---------------- resources
 'FR-RES-001': (I, 'users: title, department, skills/proficiency, location, manager_id, employment_type, availability', '', ''),
 'FR-RES-002': (P, 'availability (leave/training), capacity', '', 'HR-integrated calendars via MOCK adapter only'),
 'FR-RES-003': (I, 'skill_requirements by skill/proficiency/period/FTE', '', ''),
 'FR-RES-004': (I, 'resource_allocations named, % and dates, soft/hard', '', ''),
 'FR-RES-005': (I, 'over-allocation on request, capacity heatmap, /api/skills/gap', 'frs: allocation', ''),
 'FR-RES-006': (I, 'allocation request → resource manager approval → active; release status', 'frs: allocation', ''),
 'FR-RES-007': (I, 'capacity heatmap, utilisation, demand vs capacity', 'TC-RPT-HEAT', ''),
 'FR-RES-008': (I, 'raci_assignments; one A per item enforced; /api/raci/:type/:id validation', 'frs: RACI', ''),
 'FR-RES-009': (P, 'users directory with manager, phone, location; teams', '', 'Org-chart visual planned Phase 3'),
 'FR-RES-010': (D, '-', '', 'Onboarding/offboarding checklists deferred to Phase 4 (can be modelled with recurring work templates meanwhile)'),
 'FR-RES-011': (P, 'lessons, feedback; access_end_date ends access automatically', 'frs: access end', 'Team-health pulse planned Phase 3; deliberately not a performance appraisal system'),
 'FR-RES-012': (I, 'employment_type contractor/vendor, access_end_date enforced at login and per request', 'frs: access end', ''),
 # ---------------- stakeholders
 'FR-STK-001': (I, 'stakeholders: organisation, role, influence, interest, attitude, channel; quadrant computed', '', ''),
 'FR-STK-002': (P, 'stakeholders per context; user link', '', 'Links to individual requirements/decisions/benefits planned Phase 3'),
 'FR-STK-003': (I, 'engagement current vs desired + plan', '', ''),
 'FR-STK-004': (I, 'communications register (audience, message, owner, channel, frequency, evidence)', '', ''),
 'FR-STK-005': (I, 'meetings with agenda, attendees, minutes; meeting_minutes generator', 'frs: generators', ''),
 'FR-STK-006': (I, 'work_items.meeting_id; AI action extraction from minutes (suggestions)', 'TC-AI-*', ''),
 'FR-STK-007': (I, 'announcements publish (endpoint only), targeted roles, acknowledgement tracking', 'frs: announcements', ''),
 'FR-STK-008': (P, 'feedback register, issue escalation', '', 'Engagement trend chart planned Phase 3'),
 # ---------------- RAID
 'FR-RAID-001': (I, 'separate risks, assumptions, issues, dependencies, decisions registers', '', ''),
 'FR-RAID-002': (I, 'cause/event/effect, category, owner, dates, status, response', '', ''),
 'FR-RAID-003': (I, 'likelihood×impact score, probability %, proximity, velocity', '', ''),
 'FR-RAID-004': (I, 'risk_type threat/opportunity, contingency, trigger, residual, secondary risk', '', ''),
 'FR-RAID-005': (P, 'EMV computed (probability × cost impact, sign by threat/opportunity)', '', 'Monte Carlo via integration deferred to Phase 4'),
 'FR-RAID-006': (I, 'risk contexts incl. BIA/product/vendor; controls link', '', ''),
 'FR-RAID-007': (I, 'runEscalations (score/age/overdue) for risks & issues', '', ''),
 'FR-RAID-008': (I, 'risk acceptance approval (humans, appetite-based routing), acceptance_rationale, last_reviewed_on', 'TC-GOV-*', ''),
 'FR-RAID-009': (I, 'risk heatmap per project and portfolio, top risks', '', ''),
 'FR-RAID-010': (I, 'POST /api/issues/:id/convert-to-work', '', ''),
 # ---------------- quality & test
 'FR-QLT-001': (P, 'project_management_plan generator quality section; quality reviews', 'frs: generators', 'Dedicated quality plan template planned Phase 3'),
 'FR-QLT-002': (I, 'quality_reviews with standard/checklist ref, schedule, evidence files', '', ''),
 'FR-QLT-003': (I, 'review_type qa_review/process_audit/peer_review/inspection', '', ''),
 'FR-QLT-004': (I, 'non_conformances: root cause, corrective/preventive, effectiveness check; overdue flag', '', ''),
 'FR-QLT-005': (I, 'test_cases.requirement_id, deliverable reviews, acceptance', '', ''),
 'FR-QLT-006': (I, '/api/quality/:type/:id gate & exceptions', 'frs: waivers', ''),
 'FR-TST-001': (I, 'test_plans entry/exit criteria, level, environment, roles', '', ''),
 'FR-TST-002': (I, 'test_level unit…uat, performance, security, oat', '', ''),
 'FR-TST-003': (I, 'test_cases steps/expected; executions with evidence & files', '', ''),
 'FR-TST-004': (I, 'test_cases → requirements; RTM', 'TC-BA-RQ', ''),
 'FR-TST-005': (I, 'test_executions: tester, date, environment, build_version, result', '', ''),
 'FR-TST-006': (I, 'defects: severity, priority, owner, root cause, fix version, reopen count', '', ''),
 'FR-TST-007': (I, 'waiver/known error only via approval; residual risks at service acceptance', 'frs: waivers', ''),
 'FR-TST-008': (I, 'coverage, pass rate, leakage, reopen rate, outstanding severity', 'frs: quality', ''),
 'FR-TST-009': (I, 'uat_report generator (sign-off state explicit)', 'frs: generators', ''),
 'FR-TST-010': (I, 'test_plans.business_owner_id signs off UAT; testers/operations execute; PMO read-only oversight', 'TC-REL-*', ''),
 # ---------------- change
 'FR-CHG-001': (I, 'change_requests change_type scope/schedule/cost/…', 'TC-CHG-*', ''),
 'FR-CHG-002': (I, 'origin, justification, urgency, alternatives, impact, recommendation, requested_effective_date', '', ''),
 'FR-CHG-003': (I, 'auto impact assessments (schedule, cost, scope, risk, BIA, security, operations, vendor)', 'TC-CHG-*', ''),
 'FR-CHG-004': (I, 'approval matrix thresholds + parallel finance approval', 'TC-GOV-*', ''),
 'FR-CHG-005': (I, 'statuses submitted/assessing/pending/approved/rejected/deferred/implemented/verified', '', ''),
 'FR-CHG-006': (I, 'baseline fields locked; approved CR creates new baseline version', 'frs: re-baseline', ''),
 'FR-CHG-007': (I, 'emergency flag; retrospective review escalation', '', ''),
 'FR-CHG-008': (I, 'configuration_items with versions, environments, releases, parent', '', ''),
 'FR-CHG-009': (P, 'CR context + impact assessments; documents/releases linked by context', '', 'Explicit CR↔artefact link table planned Phase 3'),
 'FR-CHG-010': (I, '/api/change-metrics volume, reasons, approval time, rejected, cumulative movement', '', ''),
 # ---------------- OCM
 'FR-OCM-001': (I, 'readiness_assessments per gate (5 ADKAR-style dimensions), readiness index', '', ''),
 'FR-OCM-002': (I, 'ocm_impacts group_type role/team/location/process/policy/system/customer', '', ''),
 'FR-OCM-003': (I, 'ocm_impacts.dimension people/process/technology/data/policy/culture/service', '', ''),
 'FR-OCM-004': (P, 'stakeholders + communications', '', 'Change network/champions register planned Phase 3'),
 'FR-OCM-005': (I, 'communications, training_activities, mitigation per impact', '', ''),
 'FR-OCM-006': (I, 'training planned/attended, assessment pass %, materials', '', ''),
 'FR-OCM-007': (I, '/api/ocm/:type/:id readiness trend, training attendance, impacts', '', ''),
 'FR-OCM-008': (P, 'ocm impact mitigation; feedback; issues', '', 'Resistance log view planned Phase 3'),
 'FR-OCM-009': (P, 'closure handover in workflow; product metrics ownership', '', 'Explicit adoption-ownership transfer step planned Phase 3'),
 'FR-OCM-010': (I, 'ocm_impacts (Change module) distinct from change_requests; both in same context', '', ''),
 # ---------------- finance
 'FR-FIN-001': (I, 'budgets by fiscal year, category, CBS, department, funding_source, currency', '', ''),
 'FR-FIN-002': (I, 'estimate_basis, confidence_range, budget_type contingency/management_reserve', '', ''),
 'FR-FIN-003': (I, 'budget_type original/change; actual/commitment/accrual/forecast; EAC', 'TC-FIN-003', ''),
 'FR-FIN-004': (I, 'capex/opex + cost categories', '', ''),
 'FR-FIN-005': (I, 'purchase_requests, contracts, invoices, contract_milestones', '', ''),
 'FR-FIN-006': (I, 'finance_periods lock + sign-off; ERP import MOCK', 'frs: period locks', ''),
 'FR-FIN-007': (I, 'EVM CV/CPI/EAC/ETC/VAC, burn, monthly cash flow', 'calc tests', ''),
 'FR-FIN-008': (I, 'fx_rates with date; base reporting currency', 'TC-FIN-*', ''),
 'FR-FIN-009': (I, 'budget approvals by authority, release_date, funding_restrictions, owner', '', ''),
 'FR-FIN-010': (I, 'benefits types incl. dis-benefits, non-financial', '', ''),
 'FR-FIN-011': (I, 'benefit realisation % (null if inputs missing), evidence', '', ''),
 'FR-FIN-012': (I, 'forecast entries, cost-to-complete, finance exception alert >5%', '', ''),
 'FR-FIN-013': (I, 'budgets:read permission, ABAC classification, export excludes finance without permission', 'TC-SEC-RBAC; frs: export', ''),
 'FR-FIN-014': (I, 'period locks; actuals immutable; reversal entries linked (reversal_of)', 'frs: reversals', ''),
 # ---------------- procurement
 'FR-PROC-001': (P, 'purchase_requests, tenders', '', 'Procurement plan/make-or-buy record planned Phase 3'),
 'FR-PROC-002': (I, 'vendors: due diligence, risk rating, category, status', 'TC-VND-*', ''),
 'FR-PROC-003': (I, 'tenders + bids, weighted criteria (sum 100), scoring, award with justification', '', ''),
 'FR-PROC-004': (I, 'contracts scope/value/term/renewal/SLA; contract_milestones', '', ''),
 'FR-PROC-005': (I, 'contract milestone acceptance (human), vendor_reviews, SLA met %', '', ''),
 'FR-PROC-006': (P, 'contract statuses, renewal alerts, change requests', '', 'Claims/disputes register planned Phase 3'),
 'FR-PROC-007': (I, 'vendor contexts in RAID, dependencies, concentration in vendor risk', '', ''),
 'FR-PROC-008': (I, 'coi_declarations block scoring; procurement audit trail', 'frs: COI', ''),
 # ---------------- BIA
 'FR-BIA-001': (P, 'BIA screening questions by project type/criticality', 'TC-BIA-*', 'Configurable questionnaire builder planned Phase 3'),
 'FR-BIA-002': (I, 'BIA links process, service, product, project, applications; dependencies', '', ''),
 'FR-BIA-003': (I, 'categories financial, operational, customer, regulatory, safety, reputational, data, strategic, environmental', '', ''),
 'FR-BIA-004': (I, 'impacts at configurable horizons; MTPD derived', 'TC-BIA-001', ''),
 'FR-BIA-005': (I, 'RTO, RPO, MBCO/minimum service, workaround duration, dependencies; RTO ≤ MTPD validated', 'TC-BIA-002', ''),
 'FR-BIA-006': (I, 'bia_dependencies upstream/downstream: people, facilities, suppliers, systems, data', '', ''),
 'FR-BIA-007': (I, 'peak periods, workaround, resource constraints, operating_hours', '', ''),
 'FR-BIA-008': (I, 'BIA → risks, recovery strategies, release readiness, traceability', 'TC-BIA-*', ''),
 'FR-BIA-009': (I, 'owner + deputy, BC manager approval (SoD)', '', ''),
 'FR-BIA-010': (I, 'bia_versions immutable on approval; material edit reopens with review_trigger', 'frs: BIA versions', ''),
 'FR-BIA-011': (I, 'recovery_strategies, bc_exercises with achieved RTO/RPO and evidence', '', ''),
 'FR-BIA-012': (I, 'AI only suggests; targets set by owners; approvals human-only', 'TC-AI-*', ''),
 # ---------------- documents
 'FR-DOC-001': (I, 'documents: folder, tags, classification, owner, version, status, retention_category', '', ''),
 'FR-DOC-002': (P, 'doc types, controlled codes (DOC-), review_due, approval workflow', '', 'Template library editor planned Phase 3'),
 'FR-DOC-003': (I, 'versions (immutable), compare (/compare), check-out/check-in lock', 'frs: documents', ''),
 'FR-DOC-004': (I, 'generators: charter, business case, PMP, BRD/FRS, RAID, status, minutes, UAT report, closure, readiness', 'frs: generators', 'Test plan document = uat_report for the plan; FRD covered by requirements_spec'),
 'FR-DOC-005': (I, 'sop generator from process steps, roles, controls, exceptions, revision history', 'frs: generators', ''),
 'FR-DOC-006': (P, 'user_guide generator (roles, prerequisites, instructions, troubleshooting)', 'frs: generators', 'Screenshots are attached manually and flagged MISSING; not auto-captured'),
 'FR-DOC-007': (I, 'process_flow generator (Mermaid) + BPMN 2.0 export', 'frs: generators', ''),
 'FR-DOC-008': (P, 'document context links; source_refs', '', 'Explicit document↔requirement/decision relations planned Phase 3'),
 'FR-DOC-009': (I, 'allow-listed PDF/DOCX/XLSX/PPTX/CSV/PNG/JPG/SVG… with magic-byte checks, malware scan, quarantine', 'frs: quarantine', ''),
 'FR-DOC-010': (P, 'full-text index on document versions; access-aware global search', '', 'OCR deferred to Phase 4'),
 'FR-DOC-011': (P, 'comments, approval status, distribution, acknowledgement', '', 'Inline redlines deferred to Phase 4'),
 'FR-DOC-012': (I, 'retention_until, legal hold (delete blocked), archive, export', 'frs: legal hold', ''),
 'FR-DOC-013': (I, 'generated header: source, generation time, author, status; source records listed', 'frs: generators', ''),
 'FR-DOC-014': (I, 'generated/AI docs always draft until approval workflow', 'frs: generators', ''),
 # ---------------- meetings
 'FR-MTG-001': (I, 'meetings linked to project/product/programme contexts', '', ''),
 'FR-MTG-002': (I, 'agenda, attendees, apologies, materials, meeting_type, classification', '', ''),
 'FR-MTG-003': (I, 'minutes, decisions, actions (work_items.meeting_id)', '', ''),
 'FR-MTG-004': (I, 'decisions register with rationale, decision maker, date, conditions', '', ''),
 'FR-MTG-005': (I, 'overdue action escalation job', '', ''),
 'FR-MTG-006': (I, 'meeting_minutes generator; AI action suggestions from notes', 'frs: generators', ''),
 # ---------------- operations / release
 'FR-OPS-001': (I, 'releases scope, deployment_window, dependencies, owners', '', ''),
 'FR-OPS-002': (I, 'cutover_steps sequence, owner, validation, rollback criteria; /api/releases/:id/cutover', '', ''),
 'FR-OPS-003': (I, 'backup/monitoring/security/access evidence fields + readiness checks', 'TC-REL-*', ''),
 'FR-OPS-004': (I, 'services with owner, support model, SLA; vendor contacts', '', ''),
 'FR-OPS-005': (I, 'documents (runbook/SOP/user guide), known errors, CIs', '', ''),
 'FR-OPS-006': (I, 'operational acceptance, training, readiness', '', ''),
 'FR-OPS-007': (I, 'go/no-go with conditions/exception, decision record, audit', 'frs: go/no-go', ''),
 'FR-OPS-008': (I, 'hypercare start/exit with exit criteria evidence; incidents as work items', '', ''),
 'FR-OPS-009': (I, 'service acceptance by named person; residual risks required with open high defects', '', ''),
 'FR-OPS-010': (I, 'configuration_items.release_id, version_label; RTM', '', ''),
 # ---------------- closure
 'FR-CLO-001': (I, 'closure gate criteria (milestones, handover, finance) and approval-guarded closed', 'TC-WF-*', ''),
 'FR-CLO-002': (I, 'open items, tech_debt_items, residual risks with owners', '', ''),
 'FR-CLO-003': (I, 'closure_report generator', '', ''),
 'FR-CLO-004': (I, 'lessons (validated, reusable, tags) throughout delivery; /api/lessons/relevant', '', ''),
 'FR-CLO-005': (I, 'vendor_reviews, lessons categories', '', ''),
 'FR-CLO-006': (I, 'archived status, soft delete, retention, search and audit preserved', '', ''),
 'FR-CLO-007': (I, 'benefits with owner and measurement dates beyond closure', '', ''),
 'FR-CLO-008': (P, 'PIR stage in lifecycle template', '', 'Configurable PIR interval scheduler planned Phase 3'),
 # ---------------- integration management
 'FR-INT-001': (I, 'project_management_plan generator over subsidiary plans + baselines', 'frs: generators', ''),
 'FR-INT-002': (I, 'dependencies (cross-project/vendor/release)', '', ''),
 'FR-INT-003': (I, 'integrated change control: impact assessments across areas; re-baseline on approval', 'frs: re-baseline', ''),
 'FR-INT-004': (I, 'status report, exception alerts, decisions', '', ''),
 'FR-INT-005': (P, 'stage transitions; work-item transfer between projects (/move, audited)', '', 'Project split/merge planned Phase 4'),
 'FR-INT-006': (I, 'programme roll-up of benefits, finance, risks, roadmap', '', ''),
 # ---------------- NFRs
 'NFR-001': (P, 'Docker health checks; stateless API', '', 'Availability is an operational SLO; HA deployment topology to be agreed with hosting (see DEPLOYMENT.md)'),
 'NFR-002': (P, 'indexed queries; autocannon: p99 75–257 ms at 20 concurrent connections on 5 core endpoints (TEST_EVIDENCE §3)', 'load test', 'Agreed production load profile to be tested in the target environment'),
 'NFR-003': (P, 'pagination, indexes, single schema', '', 'Load profile validation in target environment'),
 'NFR-004': (I, 'row_version optimistic locking; document check-out; baseline locks', 'TC-SEC-OPT', ''),
 'NFR-005': (P, 'scripts/backup.sh, restore.sh, restore-drill.sh; drill PASS – row counts and audit hash-chain head identical (TEST_EVIDENCE §4)', 'restore drill', 'Platform RTO/RPO per service tier to be agreed; repeat drill per release and off-host encrypted storage'),
 'NFR-006': (P, 'threat model, OWASP ASVS review, CSP, npm audit: runtime backend 0 vulns; frontend 2 moderate accepted (TEST_EVIDENCE §2)', 'npm audit', 'Independent penetration test required before production; react-router v7 migration Phase 3'),
 'NFR-007': (P, 'WCAG 2.2 AA design system; axe-core scan 58 page states (light+dark) = 0 violations after fixes (TEST_EVIDENCE §5)', 'scripts/a11y.mjs', 'Formal manual accessibility assessment required'),
 'NFR-008': (I, 'responsive layouts, inline validation, contextual help', 'TC-UX-MOB', ''),
 'NFR-009': (P, 'evergreen Chromium/Firefox/Safari/Edge', '', 'Supported-version matrix to be published with release'),
 'NFR-010': (I, 'modular monolith, OpenAPI, automated tests, CI', '', ''),
 'NFR-011': (I, 'CSV/JSON/BPMN import-export; OpenAPI', '', ''),
 'NFR-012': (I, 'searchable audit with export and permission control', 'TC-AUD-*', ''),
 'NFR-013': (P, 'org locale, time zone, currency, date format settings (/api/org/settings)', '', 'UI translations beyond English planned Phase 4'),
 'NFR-014': (I, 'FKs, transactions, strict validation, immutable history triggers', '', ''),
 'NFR-015': (P, 'structured logs, /health, job_runs, integration dead letters', '', 'Metrics/traces export (OpenTelemetry) planned Phase 4'),
 'NFR-016': (I, 'GET /api/projects/:id/export full JSON with relationships, permission-scoped', 'frs: export', ''),
 # ---------------- acceptance criteria
 'AC-01': (I, 'request → convert (identifier) → gates with evidence', 'frs: intake; TC-WF-*', ''),
 'AC-02': (I, 'traceability navigation objective→project→requirement→work→test→benefit', 'TC-BA-RQ', ''),
 'AC-03': (I, 'baselines immutable, changed only via approved CR', 'frs: baselines', ''),
 'AC-04': (I, 'BIA impacts over time, dependencies, MTPD, RTO/RPO, approvals, validation findings', 'TC-BIA-*', ''),
 'AC-05': (I, 'WBS, schedule, dependencies (CPM), milestones, assignments, forecast', 'frs: CPM', ''),
 'AC-06': (I, 'capacity heatmap; allocation requests with over-allocation flag', 'frs: allocation', ''),
 'AC-07': (I, 'finance summary reconciliation, period sign-off, forecast calculation', 'TC-FIN-003; frs: finance', ''),
 'AC-08': (I, 'CR → impact assessments; plan/baseline updated only after approval', 'TC-CHG-*; frs: re-baseline', ''),
 'AC-09': (I, 'SOP, user guide and process flow generated as drafts, published via document approval', 'frs: generators', ''),
 'AC-10': (I, 'UAT report & RTM trace evidence/defects/acceptance to requirements', 'frs: generators', ''),
 'AC-11': (I, 'go/no-go blocked without evidence unless justified exception; deploy blocked if not ready', 'TC-REL-*; frs: go/no-go', ''),
 'AC-12': (I, 'all approvals, changes, financial adjustments and admin actions audited', 'TC-AUD-*', ''),
 'AC-13': (I, 'AI cites sources; cannot approve/accept/deploy', 'TC-AI-*', ''),
 'AC-14': (I, 'project export with documents, versions and relations', 'frs: export', ''),
 # ---------------- product management
 'PRD-001': (I, 'products register: code, type, owner, sponsor, lifecycle, criticality', 'TC-PRD-*', ''),
 'PRD-002': (I, 'products.parent_id + product_type (portfolio/line/product/module/platform/service)', '', ''),
 'PRD-003': (I, 'vision, mission, value proposition, segments; personas with JTBD', '', ''),
 'PRD-004': (I, 'product_roles (7 role types) with effective dates and delegation', '', ''),
 'PRD-005': (I, 'ideas with source, category, attachments', '', ''),
 'PRD-006': (I, 'duplicate detection, RICE/WSJF/scoring, comments, deferral, conversion via requests', 'frs: duplicates', ''),
 'PRD-007': (I, 'personas (consent basis), feedback themes, stakeholders', '', ''),
 'PRD-008': (I, 'ideas reach/impact/confidence/effort, problem, evidence', 'calc tests', ''),
 'PRD-009': (I, 'hypotheses, experiments, findings and decisions', '', ''),
 'PRD-010': (I, 'hypotheses register with segment, measure, baseline, target, actual, status', '', ''),
 'PRD-011': (P, 'experiments with hypothesis, metric, success threshold, dates, result, outcome', '', 'Control/treatment design, sample size and guardrail metrics planned Phase 3'),
 'PRD-012': (I, 'product vision/strategy fields, objectives/OKRs', '', ''),
 'PRD-013': (I, 'business cases on products (NPV/ROI)', '', ''),
 'PRD-014': (P, 'product portfolio views by lifecycle/criticality/health', '', 'Revenue/value bubble view planned Phase 3'),
 'PRD-015': (I, 'roadmap Now/Next/Later + dates, confidence', '', ''),
 'PRD-016': (I, 'roadmap_versions immutable snapshots with rationale', 'frs: roadmap versions', ''),
 'PRD-017': (I, 'RICE, WSJF, MoSCoW and configurable weighted scorecards with audited overrides', 'frs: scoring', ''),
 'PRD-018': (I, 'key results linked to objectives, products, releases', '', ''),
 'PRD-019': (I, 'product requirements with acceptance criteria, personas, source, version', '', ''),
 'PRD-020': (I, 'work types theme/epic/feature/story/defect/technical_enabler/research', '', ''),
 'PRD-021': (I, 'project_products M:N; request conversion links product', 'TC-PRD-001', ''),
 'PRD-022': (I, 'product-context work and releases without a project', 'TC-WRK-001', ''),
 'PRD-023': (I, 'releases with notes, environments, window, readiness, rollback', 'TC-REL-*', ''),
 'PRD-024': (I, 'launch_plans (audience, channels, comms, training, support readiness, FAQ, risks)', '', ''),
 'PRD-025': (P, 'product_metrics + metric_values with segments', 'frs: product health', 'Pre-defined adoption funnel view planned Phase 3'),
 'PRD-026': (I, 'metric definitions (source, owner, refresh, baseline, target, direction) + series', 'frs: product health', ''),
 'PRD-027': (I, 'feedback register with source/theme, linked to ideas', '', ''),
 'PRD-028': (I, '/api/products/:id/health configurable, unknown when no data', 'frs: product health', ''),
 'PRD-029': (I, 'tech_debt_items register with risk, estimate, component, quarter', '', ''),
 'PRD-030': (I, 'product-context budgets/costs/benefits roll-up', 'TC-FIN-*', ''),
 'PRD-031': (I, 'pricing_plans (restricted by default)', '', ''),
 'PRD-032': (I, 'product risks/controls/obligations', '', ''),
 'PRD-033': (I, 'BIA on products (MTPD, RTO/RPO)', 'TC-BIA-*', ''),
 'PRD-034': (I, 'release readiness and service acceptance', 'TC-REL-*', ''),
 'PRD-035': (I, 'product-context documents with versions', '', ''),
 'PRD-036': (I, 'product change requests with BIA impact for critical products', 'TC-CHG-*', ''),
 'PRD-037': (I, 'next_review_date with review-due escalation', '', ''),
 'PRD-038': (P, 'lifecycle stage retire/sunset; project relationship retires', '', 'Sunset checklist template planned Phase 3'),
 'PRD-039': (I, 'meetings/decisions with product contexts; governance workflows', '', ''),
 'PRD-040': (P, 'product workspace dashboards (health, roadmap, discovery, delivery)', '', 'Role-based product reporting pack planned Phase 3'),
 'PRD-041': (I, 'comments, mentions, watchers, notifications on products', 'frs: comments', ''),
 'PRD-042': (P, 'generators + workflow templates', '', 'Template editor planned Phase 3'),
 'PRD-043': (I, 'RBAC + ABAC (restricted pricing/personas), explicit-only sensitive perms', 'TC-SEC-*', ''),
 'PRD-044': (I, 'audit of score changes, roadmap versions, exports', 'TC-AUD-*', ''),
 'PRD-045': (I, 'AI idea clustering (/api/ai/idea-clusters, read-only), drafts require acceptance', 'frs: clustering', ''),
}

def main():
    rows = json.load(open(os.environ.get('FRS_ROWS', os.path.join(HERE, 'frs_v11_items.json'))))
    missing = [r['id'] for r in rows if r['id'] not in M]
    extra = [k for k in M if k not in {r['id'] for r in rows}]
    assert not missing, f'unreconciled baseline items: {missing}'
    assert not extra, f'unknown ids: {extra}'
    out = []
    for r in rows:
        st, ev, tests, gap = M[r['id']]
        out.append({'baseline_id': r['id'], 'baseline_text': ' – '.join(c for c in r['cols'] if c not in ('Must', 'Should', 'Could')), 'status': st, 'implementation_evidence': ev, 'automated_tests': tests, 'gap_or_note': gap})
    with open(os.path.join(HERE, 'FRS_V11_RECONCILIATION.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
    cnt = {s: sum(1 for o in out if o['status'] == s) for s in (I, P, D)}
    md = ['# FRS-EPMO-001 v1.1 reconciliation register', '',
          'Every item of the uploaded FRS v1.1 is listed below under its **original ID**. No requirement has been removed. '
          'The customer noted the uploaded file is not the complete FRS; sections not supplied are tracked as GAP-013.', '',
          f'**Totals:** {len(out)} items · {cnt[I]} Implemented · {cnt[P]} Partial · {cnt[D]} Deferred', '',
          'Status meanings: *Implemented* = built and server-enforced where it is a rule; *Partial* = core built, remainder stated; *Deferred* = not built in this release with justification. '
          '"frs: …" test references are in `backend/test/frs.test.ts`; TC-* references are in `backend/test/api.test.ts`.', '']
    sec = None
    for o in out:
        s = o['baseline_id'].rsplit('-', 1)[0]
        if s != sec:
            sec = s; md += ['', f'## {s}', '', '| ID | Requirement (v1.1) | Status | Evidence | Tests | Gap / note |', '|---|---|---|---|---|---|']
        cell = lambda x: (x or '—').replace('|', '/').replace('\n', ' ')
        md.append(f"| {o['baseline_id']} | {cell(o['baseline_text'][:220])} | {o['status']} | {cell(o['implementation_evidence'])} | {cell(o['automated_tests'])} | {cell(o['gap_or_note'])} |")
    open(os.path.join(HERE, 'FRS_V11_RECONCILIATION.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')
    print(f'{len(out)} items reconciled: {cnt}')

if __name__ == '__main__':
    main()
