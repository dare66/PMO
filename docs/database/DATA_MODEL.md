# Shared enterprise data model

Source of truth: `backend/migrations/001_core.sql`. One PostgreSQL schema; no per-module databases.

## Conventions
| Concern | Rule |
|---|---|
| Primary key | `id uuid DEFAULT gen_random_uuid()` |
| Human ID | `code` e.g. `PRJ-0007`, unique per organisation and prefix (`code_counters`) |
| Tenant boundary | `org_id` on every business table; every query filters by it |
| Ownership & status | `owner_id`, `status` on every business table |
| Audit fields | `created_at/by`, `updated_at/by`; `row_version` incremented by trigger (optimistic locking) |
| Soft delete | `deleted_at`; all reads exclude deleted rows; deletes are audited |
| Classification | `classification` public/internal/confidential/restricted (ABAC) |
| History | `audit_events` stores before/after per change (append-only, hash-chained); `document_versions`; `workflow_instances.history` |
| Polymorphic parent | `(context_type, context_id)` only where a record legitimately belongs to several parent kinds (work, RAID, finance, documents, tests). Validated in the service layer against the allowed list per resource |
| Many-to-many | explicit join tables (`project_products`, `team_members`, `user_skills`, `risk_controls`, `user_roles`) |
| Money | `numeric(16,2)` + `currency char(3)`; FX in `fx_rates`; reports convert to `organisations.base_currency` |
| Indexes | FKs used in filters, `(context_type, context_id)`, pending approvals, audit entity/time |
| Retention | Audit: retain ≥7 years (configurable, legal to confirm). AI interactions: 24 months. Soft-deleted records: purge job after retention (planned). Synthetic demo org flagged `is_synthetic` |

## ERD (core)

```mermaid
erDiagram
  ORGANISATIONS ||--o{ DEPARTMENTS : has
  ORGANISATIONS ||--o{ USERS : has
  USERS }o--o{ ROLES : user_roles
  TEAMS }o--o{ USERS : team_members
  USERS }o--o{ SKILLS : user_skills
  OBJECTIVES ||--o{ KEY_RESULTS : measured_by
  OBJECTIVES ||--o{ PORTFOLIOS : aligns
  PORTFOLIOS ||--o{ PROGRAMMES : contains
  PORTFOLIOS ||--o{ PROJECTS : funds
  PROGRAMMES ||--o{ PROJECTS : groups
  PORTFOLIOS ||--o{ PRODUCTS : owns
  PROJECTS }o--o{ PRODUCTS : project_products
  PRODUCTS ||--o{ PRODUCT_VERSIONS : versions
  PRODUCTS ||--o{ IDEAS : discovery
  IDEAS ||--o{ FEEDBACK : evidence
  IDEAS ||--o{ EXPERIMENTS : validates
  PRODUCTS ||--o{ ROADMAP_ITEMS : plans
  PROJECTS ||--o{ MILESTONES : schedules
  PROJECTS ||--o{ DELIVERABLES : produces
  PRODUCTS ||--o{ SERVICES : provides
  SERVICES ||--o{ BUSINESS_PROCESSES : supports
  BUSINESS_PROCESSES ||--o{ PROCESS_STEPS : steps
  BUSINESS_PROCESSES ||--o{ BIA_ASSESSMENTS : assessed_by
  BIA_ASSESSMENTS ||--o{ BIA_IMPACTS : impact_over_time
  BIA_ASSESSMENTS ||--o{ BIA_DEPENDENCIES : depends_on
  BIA_ASSESSMENTS ||--o{ RECOVERY_STRATEGIES : recovered_by
  VENDORS ||--o{ CONTRACTS : under
  VENDORS ||--o{ BIA_DEPENDENCIES : third_party
  PRODUCTS ||--o{ APPLICATIONS : implemented_by
  PRODUCTS ||--o{ ENVIRONMENTS : runs_in
  PRODUCTS ||--o{ RELEASES : released_as
  RELEASES ||--o{ DEPLOYMENTS : deployed_by
  RELEASES ||--o{ TEST_PLANS : verified_by
  TEST_PLANS ||--o{ TEST_CASES : contains
  TEST_CASES ||--o{ TEST_EXECUTIONS : run
  TEST_EXECUTIONS ||--o{ DEFECTS : raises
  REQUIREMENTS ||--o{ TEST_CASES : verified_by
  REQUIREMENTS ||--o{ WORK_ITEMS : implemented_by
  CHANGE_REQUESTS ||--o{ IMPACT_ASSESSMENTS : assessed_by
  RISKS }o--o{ CONTROLS : risk_controls
  CONTROLS ||--o{ OBLIGATIONS : satisfies
  CONTROLS ||--o{ AUDIT_FINDINGS : findings
  DOCUMENTS ||--o{ DOCUMENT_VERSIONS : versions
  WORKFLOW_DEFINITIONS ||--o{ WORKFLOW_INSTANCES : instantiates
  WORKFLOW_INSTANCES ||--o{ APPROVALS : raises
  INTEGRATIONS ||--o{ INTEGRATION_EVENTS : logs
  USERS ||--o{ AI_INTERACTIONS : asks
```

Polymorphic (`context_type/context_id`) entities: work_items, risks, issues, assumptions, budgets, cost_entries, benefits, business_cases, requirements, change_requests, resource_allocations, test_plans, defects, purchase_requests, contracts, documents, decisions, meetings, audit_findings, architecture_decisions. `dependencies` uses `(from_type, from_id) → (to_type, to_id)`.

## Entity catalogue (mapping to requested entities)
Organisation=`organisations`; Department=`departments`; User=`users`; Role/Permission=`roles.permissions`; Team=`teams`; Skill=`skills`; Portfolio; Programme; Project; Product; ProductVersion; Service; BusinessProcess (+`process_steps` = ProcessFlow); BusinessCapability; Idea; Opportunity = `ideas` at stage *assessing/discovery* (+`experiments`); Objective; KeyResult; RoadmapItem; Requirement; BacklogItem/WorkItem/Task = `work_items` (work_type); Milestone; Deliverable; ResourceAllocation; Budget; Cost=`cost_entries`; Benefit; Risk; Issue; Assumption; Dependency; ChangeRequest; BIA=`bia_assessments`; BIAImpact=`bia_impacts`; RecoveryStrategy; Vendor; Contract; PurchaseRequest; Invoice; TestPlan; TestCase; TestExecution; Defect; Release; Deployment; Approval; Decision; Document; DocumentVersion; SOP = `documents.doc_type='sop'`; Meeting; ActionItem = `work_items.work_type='action'`; AuditEvent; Notification; Integration (+events); AIInteraction. Additional: applications, environments, architecture_decisions, controls, obligations, audit_findings, impact_assessments, availability, fx_rates, approval_matrix, rag_thresholds, metric_definitions, files, job_runs.

## Constraints worth knowing
- `projects.end_date >= start_date`; allocations `0 < pct ≤ 100`; likelihood/impact 1..5; BIA severity 0..5; confidence 0..1; effort > 0.
- `bia_assessments` must reference a process, service or product.
- One active workflow instance per record (partial unique index).
- `invoices (vendor_id, invoice_number)` unique; `impact_assessments (change_request_id, area)` unique.
- `audit_events` UPDATE/DELETE blocked by trigger.

## Migration 002 – extended capabilities
`investment_scenarios`, `scenario_items`, `stakeholders`, `bc_exercises`, `skill_requirements`, `tenders`, `tender_bids`, `vendor_reviews`, `policies`, `policy_attestations` (immutable), `saved_views`, `requirement_versions` (immutable), `export_snapshots`, `ai_intakes`, `oidc_login_states`; columns `requirements.version/origin`, `users.oidc_subject`, `files.scan_*`, generated `document_versions.tsv` (GIN), `work_items.recurrence_parent_id/sla_breached`.

## Migration 003 – FRS v1.1 gaps
Standard business tables (org_id, code, status, owner, classification, audit fields, row_version, deleted_at): `requests`, `scoring_models`, `sprints`, `time_entries`, `raci_assignments`, `communications`, `announcements`, `quality_reviews`, `non_conformances`, `configuration_items`, `ocm_impacts`, `readiness_assessments`, `training_activities`, `contract_milestones`, `cutover_steps`, `tech_debt_items`, `lessons`, `product_roles`, `personas`, `hypotheses`, `launch_plans`, `product_metrics`, `pricing_plans`.

History/link tables: `scores`, `project_baselines`, `bia_versions`, `roadmap_versions` (all **immutable** via `history_immutable()` trigger), `work_dependencies` (FS/SS/FF/SF, lag, no self-links), `holidays`, `comments`, `watchers`, `announcement_acks`, `document_acks`, `finance_periods`, `coi_declarations` (unique per tender+user), `metric_values` (unique per metric+period+segment).

```mermaid
erDiagram
  REQUESTS }o--|| PROJECTS : converted_to
  SCORING_MODELS ||--o{ SCORES : produces
  PROJECTS ||--o{ PROJECT_BASELINES : versions
  CHANGE_REQUESTS ||--o{ PROJECT_BASELINES : authorises
  WORK_ITEMS ||--o{ WORK_DEPENDENCIES : predecessor
  SPRINTS ||--o{ WORK_ITEMS : contains
  WORK_ITEMS ||--o{ TIME_ENTRIES : logged
  QUALITY_REVIEWS ||--o{ NON_CONFORMANCES : raises
  RELEASES ||--o{ CUTOVER_STEPS : sequenced
  CONTRACTS ||--o{ CONTRACT_MILESTONES : pays
  TENDERS ||--o{ TENDER_BIDS : receives
  TENDERS ||--o{ COI_DECLARATIONS : declared
  BIA_ASSESSMENTS ||--o{ BIA_VERSIONS : approved_as
  PRODUCTS ||--o{ PRODUCT_METRICS : measured_by
  PRODUCT_METRICS ||--o{ METRIC_VALUES : series
  PRODUCTS ||--o{ ROADMAP_VERSIONS : snapshots
  PRODUCTS ||--o{ PRODUCT_ROLES : owned_by
  ANNOUNCEMENTS ||--o{ ANNOUNCEMENT_ACKS : acknowledged
```

Key constraints: `cost_entries.entry_kind` adds `accrual`; reversals reference `reversal_of`; `scores` require `override_reason` when overridden; `time_entries.hours` 0 < h ≤ 24; readiness dimensions 1..5; `finance_periods` keyed by org + `YYYY-MM`.
