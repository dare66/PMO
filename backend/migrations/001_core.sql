-- =====================================================================
-- Enterprise Strategy, Portfolio, Product, Project & Work Platform
-- Migration 001: shared enterprise data model (single relational model)
-- Conventions (see docs/database/DATA_MODEL.md):
--   * every business table: id uuid PK, org_id tenant boundary, code (human id),
--     status, owner_id, created_*/updated_* audit fields, deleted_at soft delete,
--     row_version optimistic lock, classification for ABAC.
--   * polymorphic context (context_type, context_id) is used ONLY where a record
--     can legitimately belong to several parent kinds (work, risk, budget ...).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); NEW.row_version := COALESCE(OLD.row_version,0) + 1; RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- tenancy & identity
CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'MYR',
  is_synthetic boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1
);

CREATE TABLE code_counters (
  org_id uuid NOT NULL REFERENCES organisations(id),
  prefix text NOT NULL,
  value int NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, prefix)
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  parent_id uuid REFERENCES departments(id),
  head_user_id uuid,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid, classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  title text,
  department_id uuid REFERENCES departments(id),
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'local',
  status text NOT NULL DEFAULT 'active',
  capacity_hours_week numeric(5,1) NOT NULL DEFAULT 40,
  cost_rate_hour numeric(12,2),
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  is_service_account boolean NOT NULL DEFAULT false,
  owner_id uuid, classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;
ALTER TABLE departments ADD CONSTRAINT departments_head_fk FOREIGN KEY (head_user_id) REFERENCES users(id);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, key)
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  scope_type text NOT NULL DEFAULT 'global',  -- global | portfolio | programme | project | product
  scope_id uuid
);
CREATE UNIQUE INDEX user_roles_uq ON user_roles (user_id, role_id, scope_type, (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)));

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  department_id uuid REFERENCES departments(id),
  lead_user_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE team_members (
  team_id uuid NOT NULL REFERENCES teams(id), user_id uuid NOT NULL REFERENCES users(id),
  role text, PRIMARY KEY (team_id, user_id)
);

CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, category text, description text,
  status text NOT NULL DEFAULT 'active', owner_id uuid, classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE user_skills (
  user_id uuid NOT NULL REFERENCES users(id), skill_id uuid NOT NULL REFERENCES skills(id),
  proficiency int NOT NULL CHECK (proficiency BETWEEN 1 AND 5), PRIMARY KEY (user_id, skill_id)
);

-- generic business-table macro is not available in SQL; columns are repeated explicitly.

-- ---------------------------------------------------------------- strategy & portfolio
CREATE TABLE objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  parent_id uuid REFERENCES objectives(id),
  level text NOT NULL DEFAULT 'corporate', -- corporate | portfolio | product | team
  period_start date, period_end date,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  objective_id uuid NOT NULL REFERENCES objectives(id),
  unit text, baseline_value numeric, target_value numeric, current_value numeric,
  measured_at date,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE business_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  parent_id uuid REFERENCES business_capabilities(id),
  maturity int CHECK (maturity BETWEEN 1 AND 5), target_maturity int CHECK (target_maturity BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  investment_theme text,
  funding_envelope numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  objective_id uuid REFERENCES objectives(id),
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  portfolio_id uuid REFERENCES portfolios(id),
  objective_id uuid REFERENCES objectives(id),
  start_date date, end_date date,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- products (independent of projects)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_line text,
  portfolio_id uuid REFERENCES portfolios(id),
  lifecycle_stage text NOT NULL DEFAULT 'concept', -- concept|discovery|development|launch|growth|mature|decline|retired
  vision text, strategy text, target_users text, pricing_model text,
  criticality text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  health_score int CHECK (health_score BETWEEN 0 AND 100),
  tech_debt_score int CHECK (tech_debt_score BETWEEN 0 AND 100),
  active_users int, nps numeric(5,1),
  objective_id uuid REFERENCES objectives(id),
  retirement_date date,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  version_label text NOT NULL, released_on date, support_ends_on date, notes text,
  status text NOT NULL DEFAULT 'planned',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  portfolio_id uuid REFERENCES portfolios(id),
  programme_id uuid REFERENCES programmes(id),
  objective_id uuid REFERENCES objectives(id),
  department_id uuid REFERENCES departments(id),
  project_type text NOT NULL DEFAULT 'technology', -- technology|business_change|infrastructure|ai|regulatory|operational_improvement|product_development
  delivery_approach text NOT NULL DEFAULT 'hybrid', -- predictive|agile|hybrid|custom
  lifecycle_stage text NOT NULL DEFAULT 'intake',
  sponsor_id uuid REFERENCES users(id),
  start_date date, end_date date, baseline_start date, baseline_end date, actual_end date,
  budget_at_completion numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  percent_complete numeric(5,2) CHECK (percent_complete BETWEEN 0 AND 100),
  strategic_score int CHECK (strategic_score BETWEEN 0 AND 100),
  risk_score int CHECK (risk_score BETWEEN 0 AND 100),
  criticality text NOT NULL DEFAULT 'medium',
  bia_required boolean,          -- NULL = screening not done
  business_case text, scope_statement text, success_criteria text,
  closure_summary text, lessons_learned text,
  status text NOT NULL DEFAULT 'active', -- active|on_hold|closed|cancelled
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX projects_portfolio_idx ON projects(portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX projects_programme_idx ON projects(programme_id) WHERE deleted_at IS NULL;

-- Many-to-many: a product can have many projects; a project can support many products.
CREATE TABLE project_products (
  project_id uuid NOT NULL REFERENCES projects(id),
  product_id uuid NOT NULL REFERENCES products(id),
  relationship text NOT NULL DEFAULT 'delivers', -- delivers|enhances|retires|supports
  PRIMARY KEY (project_id, product_id)
);

CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  project_id uuid NOT NULL REFERENCES projects(id),
  due_date date NOT NULL, baseline_date date, actual_date date,
  is_gate boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned', -- planned|at_risk|achieved|missed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  project_id uuid NOT NULL REFERENCES projects(id),
  milestone_id uuid REFERENCES milestones(id),
  due_date date, acceptance_criteria text,
  status text NOT NULL DEFAULT 'planned', -- planned|in_progress|submitted|accepted|rejected
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- services & processes (BIA spine)
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  service_type text NOT NULL DEFAULT 'business', -- business|technical
  product_id uuid REFERENCES products(id),
  criticality text NOT NULL DEFAULT 'medium',
  support_model text, sla_target text,
  status text NOT NULL DEFAULT 'live',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE business_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  department_id uuid REFERENCES departments(id),
  service_id uuid REFERENCES services(id),
  capability_id uuid REFERENCES business_capabilities(id),
  process_state text NOT NULL DEFAULT 'as_is', -- as_is|to_be
  version_label text NOT NULL DEFAULT '1.0',
  bpmn_xml text,
  automation_potential text, -- low|medium|high
  criticality text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  process_id uuid NOT NULL REFERENCES business_processes(id),
  seq int NOT NULL, lane text, step_type text NOT NULL DEFAULT 'task', -- start|task|decision|end
  next_step_seq int[],
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- discovery & requirements
CREATE TABLE ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_id uuid REFERENCES products(id),
  portfolio_id uuid REFERENCES portfolios(id),
  source text, -- customer|employee|market|regulatory|ai_suggested
  problem_statement text, hypothesis text, evidence text,
  reach numeric, impact numeric, confidence numeric CHECK (confidence BETWEEN 0 AND 1), effort numeric CHECK (effort > 0),
  cost_of_delay numeric(16,2),
  stage text NOT NULL DEFAULT 'new', -- new|assessing|discovery|validated|approved|in_delivery|parked|rejected
  promoted_to_type text, promoted_to_id uuid,
  status text NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_id uuid REFERENCES products(id), idea_id uuid REFERENCES ideas(id),
  channel text, customer_segment text, sentiment text, -- positive|neutral|negative
  status text NOT NULL DEFAULT 'new',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  idea_id uuid REFERENCES ideas(id), product_id uuid REFERENCES products(id),
  hypothesis text NOT NULL, metric text, success_threshold text, result text,
  outcome text, -- validated|invalidated|inconclusive
  start_date date, end_date date,
  status text NOT NULL DEFAULT 'planned',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_id uuid NOT NULL REFERENCES products(id),
  objective_id uuid REFERENCES objectives(id),
  idea_id uuid REFERENCES ideas(id),
  lane text NOT NULL DEFAULT 'Now', -- Now|Next|Later or theme
  start_date date, end_date date,
  confidence text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'planned',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL, -- project|product
  req_type text NOT NULL DEFAULT 'functional', -- business|functional|non_functional|regulatory|bc_dr
  priority text NOT NULL DEFAULT 'should', -- must|should|could|wont
  acceptance_criteria text,
  process_id uuid REFERENCES business_processes(id),
  objective_id uuid REFERENCES objectives(id),
  source text,
  quality_flags jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft|reviewed|approved|implemented|verified|deferred|rejected
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE INDEX requirements_ctx_idx ON requirements(context_type, context_id);

-- ---------------------------------------------------------------- unified work (project + BAU + ops)
CREATE TABLE work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  work_type text NOT NULL DEFAULT 'task',
  -- task|story|epic|bug|incident|service_request|problem|maintenance|infrastructure_change|application_change|security_remediation|compliance_action|recurring|service_improvement|bau|action
  context_type text, -- project|product|programme|portfolio|service|none
  context_id uuid,
  parent_id uuid REFERENCES work_items(id),
  requirement_id uuid REFERENCES requirements(id),
  team_id uuid REFERENCES teams(id),
  assignee_id uuid REFERENCES users(id),
  priority text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  start_date date, due_date date, completed_at timestamptz,
  estimate_hours numeric(8,1), actual_hours numeric(8,1),
  story_points int,
  recurrence_rule text, -- e.g. FREQ=WEEKLY
  sla_due_at timestamptz,
  board_rank numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'todo', -- todo|in_progress|blocked|review|done|cancelled
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK ((context_type IS NULL AND context_id IS NULL) OR (context_type IS NOT NULL))
);
CREATE INDEX work_items_ctx_idx ON work_items(context_type, context_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_assignee_idx ON work_items(assignee_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- resources
CREATE TABLE resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  context_type text NOT NULL, context_id uuid, -- project|product|programme|bau
  role_name text,
  start_date date NOT NULL, end_date date NOT NULL,
  allocation_pct numeric(5,1) NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 100),
  allocation_type text NOT NULL DEFAULT 'hard', -- soft (demand) | hard (committed)
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (end_date >= start_date)
);
CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  start_date date NOT NULL, end_date date NOT NULL,
  availability_type text NOT NULL DEFAULT 'leave', -- leave|training|public_holiday
  status text NOT NULL DEFAULT 'approved',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code), CHECK (end_date >= start_date)
);

-- ---------------------------------------------------------------- finance & benefits
CREATE TABLE fx_rates (
  org_id uuid NOT NULL REFERENCES organisations(id),
  currency char(3) NOT NULL, rate_to_base numeric(18,8) NOT NULL CHECK (rate_to_base > 0),
  effective_date date NOT NULL, PRIMARY KEY (org_id, currency, effective_date)
);
CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text NOT NULL, context_id uuid NOT NULL, -- portfolio|programme|project|product
  fiscal_year int NOT NULL,
  expenditure_type text NOT NULL DEFAULT 'capex', -- capex|opex
  cbs_code text,
  amount numeric(16,2) NOT NULL CHECK (amount >= 0), currency char(3) NOT NULL DEFAULT 'MYR',
  status text NOT NULL DEFAULT 'draft', -- draft|submitted|approved|rejected|superseded
  approved_by uuid REFERENCES users(id), approved_at timestamptz,
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE INDEX budgets_ctx_idx ON budgets(context_type, context_id);
CREATE TABLE cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text NOT NULL, context_id uuid NOT NULL,
  entry_kind text NOT NULL, -- actual|commitment|forecast
  expenditure_type text NOT NULL DEFAULT 'capex',
  cost_category text NOT NULL DEFAULT 'external', -- internal_labour|external|licence|hardware|cloud|other
  cbs_code text,
  amount numeric(16,2) NOT NULL, currency char(3) NOT NULL DEFAULT 'MYR',
  entry_date date NOT NULL,
  vendor_id uuid, contract_id uuid, invoice_ref text, po_ref text,
  status text NOT NULL DEFAULT 'posted',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (entry_kind IN ('actual','commitment','forecast'))
);
CREATE INDEX cost_entries_ctx_idx ON cost_entries(context_type, context_id, entry_kind);
CREATE TABLE benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL,
  benefit_type text NOT NULL DEFAULT 'financial', -- financial|non_financial
  measure text, unit text, measurement_method text,
  baseline_value numeric, target_value numeric, actual_value numeric,
  realisation_start date, realisation_end date, last_measured_at date,
  status text NOT NULL DEFAULT 'planned', -- planned|tracking|realised|at_risk|not_realised
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE business_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text NOT NULL, context_id uuid NOT NULL, -- project|product|idea
  problem text, options_considered text, recommended_option text,
  discount_rate numeric(6,4) NOT NULL DEFAULT 0.08,
  cash_flows numeric[] NOT NULL DEFAULT '{}', -- year0..n net cash flow (year0 usually negative)
  total_cost_of_ownership numeric(16,2),
  status text NOT NULL DEFAULT 'draft',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- RAID & change
CREATE TABLE risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid, -- enterprise|portfolio|programme|project|product|service
  category text NOT NULL DEFAULT 'delivery', -- delivery|operational|security|privacy|compliance|financial|vendor|strategic
  cause text, effect text,
  likelihood int NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact int NOT NULL CHECK (impact BETWEEN 1 AND 5),
  residual_likelihood int CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact int CHECK (residual_impact BETWEEN 1 AND 5),
  treatment text NOT NULL DEFAULT 'mitigate', -- avoid|mitigate|transfer|accept
  mitigation_plan text, due_date date,
  acceptance_status text, -- NULL|pending|approved|rejected  (acceptance requires human approval)
  status text NOT NULL DEFAULT 'open', -- open|monitoring|closed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE INDEX risks_ctx_idx ON risks(context_type, context_id) WHERE deleted_at IS NULL;
CREATE TABLE issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid,
  severity text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  resolution text, due_date date, raised_from_risk_id uuid REFERENCES risks(id),
  status text NOT NULL DEFAULT 'open', -- open|in_progress|resolved|closed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid,
  validation_method text, validate_by date, validation_result text,
  status text NOT NULL DEFAULT 'unvalidated', -- unvalidated|validated|invalid
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  from_type text NOT NULL, from_id uuid NOT NULL,
  to_type text NOT NULL, to_id uuid NOT NULL,
  dependency_type text NOT NULL DEFAULT 'finish_to_start', -- finish_to_start|deliverable|resource|technical|vendor
  need_by date,
  status text NOT NULL DEFAULT 'open', -- open|at_risk|met|broken
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (NOT (from_type = to_type AND from_id = to_id))
);
CREATE TABLE change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL,
  change_type text NOT NULL DEFAULT 'scope', -- scope|schedule|budget|business_change|it_change|infrastructure_change
  justification text,
  impact_schedule_days int, impact_cost numeric(16,2), impact_scope text,
  risk_level text NOT NULL DEFAULT 'medium',
  decision text, decided_at timestamptz,
  status text NOT NULL DEFAULT 'submitted', -- draft|submitted|assessing|pending_approval|approved|rejected|implemented|withdrawn
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE impact_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  change_request_id uuid NOT NULL REFERENCES change_requests(id),
  area text NOT NULL, -- schedule|cost|scope|risk|bia|security|operations|vendor|quality
  assessor_role text, assessor_id uuid REFERENCES users(id),
  rating text, -- none|low|medium|high
  notes text,
  status text NOT NULL DEFAULT 'pending', -- pending|completed|not_applicable
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code), UNIQUE (change_request_id, area)
);

-- ---------------------------------------------------------------- BIA & resilience
CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  category text, country text, registration_no text,
  risk_rating text NOT NULL DEFAULT 'medium',
  due_diligence_status text NOT NULL DEFAULT 'not_started', -- not_started|in_progress|passed|failed|expired
  due_diligence_date date,
  performance_score int CHECK (performance_score BETWEEN 0 AND 100),
  exit_plan text,
  status text NOT NULL DEFAULT 'active', -- prospect|onboarding|active|suspended|exited
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE bia_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  process_id uuid REFERENCES business_processes(id),
  service_id uuid REFERENCES services(id),
  product_id uuid REFERENCES products(id),
  project_id uuid REFERENCES projects(id),
  assessment_level text NOT NULL DEFAULT 'full', -- screening|light|full
  tolerance_threshold int NOT NULL DEFAULT 4 CHECK (tolerance_threshold BETWEEN 1 AND 5),
  mtpd_hours numeric,            -- derived from impacts unless overridden
  mtpd_override_reason text,
  rto_hours numeric, rpo_hours numeric, mbco_pct numeric CHECK (mbco_pct BETWEEN 0 AND 100),
  criticality_tier int,          -- derived 1..4
  peak_periods text, manual_workarounds text,
  bc_requirements text, dr_requirements text,
  review_frequency_months int NOT NULL DEFAULT 12,
  next_review_date date,
  approved_by uuid REFERENCES users(id), approved_at timestamptz,
  status text NOT NULL DEFAULT 'draft', -- draft|in_review|approved|expired
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (process_id IS NOT NULL OR service_id IS NOT NULL OR product_id IS NOT NULL)
);
CREATE TABLE bia_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  bia_id uuid NOT NULL REFERENCES bia_assessments(id) ON DELETE CASCADE,
  category text NOT NULL, -- financial|operational|regulatory|customer|reputational
  horizon_hours numeric NOT NULL CHECK (horizon_hours > 0),
  severity int NOT NULL CHECK (severity BETWEEN 0 AND 5),
  financial_amount numeric(16,2),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (bia_id, category, horizon_hours)
);
CREATE TABLE bia_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  bia_id uuid NOT NULL REFERENCES bia_assessments(id) ON DELETE CASCADE,
  dependency_type text NOT NULL, -- people|application|infrastructure|data|third_party|facility
  name text NOT NULL,
  product_id uuid REFERENCES products(id),
  service_id uuid REFERENCES services(id),
  vendor_id uuid REFERENCES vendors(id),
  recovery_capability_hours numeric, -- demonstrated recovery time of this dependency
  data_loss_capability_hours numeric,
  single_point_of_failure boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1
);
CREATE TABLE recovery_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  bia_id uuid NOT NULL REFERENCES bia_assessments(id),
  strategy_type text NOT NULL DEFAULT 'technical', -- technical|manual_workaround|alternate_site|third_party|people
  procedure text, achievable_rto_hours numeric,
  last_tested_on date, test_result text, -- passed|partial|failed
  evidence_ref text,
  status text NOT NULL DEFAULT 'draft',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- vendor & procurement
CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  context_type text, context_id uuid,
  contract_value numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  start_date date, end_date date, renewal_notice_days int NOT NULL DEFAULT 90,
  sla_summary text, auto_renew boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active', -- draft|active|expiring|expired|terminated
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
ALTER TABLE cost_entries ADD CONSTRAINT cost_vendor_fk FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE cost_entries ADD CONSTRAINT cost_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id);
CREATE TABLE purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL,
  vendor_id uuid REFERENCES vendors(id),
  amount numeric(16,2) NOT NULL CHECK (amount > 0), currency char(3) NOT NULL DEFAULT 'MYR',
  quotations_count int NOT NULL DEFAULT 0, evaluation_summary text,
  po_number text,
  status text NOT NULL DEFAULT 'draft', -- draft|submitted|approved|rejected|ordered|received|closed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  contract_id uuid REFERENCES contracts(id), purchase_request_id uuid REFERENCES purchase_requests(id),
  invoice_number text NOT NULL, amount numeric(16,2) NOT NULL, currency char(3) NOT NULL DEFAULT 'MYR',
  invoice_date date NOT NULL, due_date date, paid_date date,
  status text NOT NULL DEFAULT 'received', -- received|approved|paid|disputed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code), UNIQUE (vendor_id, invoice_number)
);

-- ---------------------------------------------------------------- quality, release, transition
CREATE TABLE test_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL,
  release_id uuid,
  test_level text NOT NULL DEFAULT 'system', -- unit|integration|system|uat|regression|performance|security|oat
  entry_criteria text, exit_criteria text,
  pass_threshold_pct numeric(5,2) NOT NULL DEFAULT 95,
  business_owner_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  test_plan_id uuid NOT NULL REFERENCES test_plans(id),
  requirement_id uuid REFERENCES requirements(id),
  preconditions text, steps text, expected_result text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'ready',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE test_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  test_case_id uuid NOT NULL REFERENCES test_cases(id),
  result text NOT NULL, -- passed|failed|blocked|not_run
  executed_by uuid REFERENCES users(id), executed_at timestamptz NOT NULL DEFAULT now(),
  environment text, evidence_ref text, notes text,
  status text NOT NULL DEFAULT 'recorded',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid NOT NULL,
  test_execution_id uuid REFERENCES test_executions(id),
  release_id uuid,
  severity text NOT NULL DEFAULT 'medium', -- low|medium|high|critical
  assignee_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'open', -- open|in_progress|fixed|retest|closed|deferred
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  env_type text NOT NULL DEFAULT 'test', -- dev|test|uat|staging|production|dr
  product_id uuid REFERENCES products(id), hosting text, -- cloud|on_premise|hybrid
  status text NOT NULL DEFAULT 'available',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_id uuid REFERENCES products(id),
  project_id uuid REFERENCES projects(id),
  version_label text, planned_date date, actual_date date,
  release_type text NOT NULL DEFAULT 'minor', -- major|minor|patch|emergency
  rollback_plan text, deployment_plan text, support_model text,
  hypercare_days int NOT NULL DEFAULT 14,
  cab_status text NOT NULL DEFAULT 'not_submitted', -- not_submitted|pending|approved|rejected
  operational_acceptance boolean NOT NULL DEFAULT false,
  business_validation boolean NOT NULL DEFAULT false,
  knowledge_transfer_done boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned', -- planned|in_test|ready|deployed|hypercare|closed|rolled_back
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
ALTER TABLE test_plans ADD CONSTRAINT test_plans_release_fk FOREIGN KEY (release_id) REFERENCES releases(id);
ALTER TABLE defects ADD CONSTRAINT defects_release_fk FOREIGN KEY (release_id) REFERENCES releases(id);
CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  release_id uuid NOT NULL REFERENCES releases(id),
  environment_id uuid REFERENCES environments(id),
  scheduled_at timestamptz, completed_at timestamptz,
  technical_validation boolean NOT NULL DEFAULT false,
  outcome text, -- success|partial|failed|rolled_back
  status text NOT NULL DEFAULT 'scheduled',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- architecture & GRC
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  product_id uuid REFERENCES products(id),
  technology_stack text, hosting text, vendor_id uuid REFERENCES vendors(id),
  lifecycle text NOT NULL DEFAULT 'active', -- plan|active|sunset|end_of_life
  end_of_life_date date,
  data_classification text NOT NULL DEFAULT 'internal',
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE architecture_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text, context_id uuid,
  context text, decision text, consequences text, alternatives text,
  status text NOT NULL DEFAULT 'proposed', -- proposed|accepted|superseded|rejected
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  framework text, framework_ref text, -- e.g. ISO27001 A.5.1 (reference only, no compliance claim)
  control_type text NOT NULL DEFAULT 'preventive',
  test_frequency_months int NOT NULL DEFAULT 12,
  last_tested_on date, effectiveness text, -- effective|partially_effective|ineffective|not_tested
  evidence_ref text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE risk_controls (
  risk_id uuid NOT NULL REFERENCES risks(id), control_id uuid NOT NULL REFERENCES controls(id),
  PRIMARY KEY (risk_id, control_id)
);
CREATE TABLE obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  source_regulation text, jurisdiction text, effective_date date,
  control_id uuid REFERENCES controls(id),
  compliance_status text NOT NULL DEFAULT 'not_assessed', -- compliant|partially|non_compliant|not_assessed
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text, context_id uuid, control_id uuid REFERENCES controls(id),
  severity text NOT NULL DEFAULT 'medium',
  corrective_action text, preventive_action text, due_date date,
  status text NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text, context_id uuid,
  forum text, -- e.g. Portfolio Board, ARB, CAB, Steering Committee
  decision text, rationale text, decided_on date, decided_by uuid REFERENCES users(id),
  needs_attention boolean NOT NULL DEFAULT false, due_date date,
  status text NOT NULL DEFAULT 'pending', -- pending|decided|deferred
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text, context_id uuid,
  meeting_at timestamptz, attendees text, agenda text, minutes text,
  status text NOT NULL DEFAULT 'scheduled',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- workflow & approvals
CREATE TABLE workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  key text NOT NULL, name text NOT NULL, description text,
  entity_type text NOT NULL,
  stages jsonb NOT NULL, -- [{key,name,entry:[criteria],exit:[criteria],deliverables:[..],approvals:[{role,parallel_group}]}]
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, key, version)
);
CREATE TABLE workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  definition_id uuid NOT NULL REFERENCES workflow_definitions(id),
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  current_stage text NOT NULL,
  state text NOT NULL DEFAULT 'in_stage', -- in_stage|awaiting_approval|returned|completed|cancelled
  requested_by uuid REFERENCES users(id),
  history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX workflow_instances_active_uq ON workflow_instances(entity_type, entity_id) WHERE state NOT IN ('completed','cancelled');
CREATE TABLE approval_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  role_key text NOT NULL,
  approval_type text NOT NULL, -- financial|gate|risk_acceptance|change|document|procurement|bia
  max_amount numeric(16,2), -- NULL = unlimited
  currency char(3) NOT NULL DEFAULT 'MYR',
  UNIQUE (org_id, role_key, approval_type)
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL,
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  workflow_instance_id uuid REFERENCES workflow_instances(id),
  stage_key text,
  approval_type text NOT NULL DEFAULT 'gate',
  approver_role text,
  approver_id uuid REFERENCES users(id),
  delegated_from uuid REFERENCES users(id),
  amount numeric(16,2),
  requested_by uuid REFERENCES users(id),
  round int NOT NULL DEFAULT 1,
  conditions text,
  decision_note text,
  status text NOT NULL DEFAULT 'pending', -- pending|approved|approved_with_conditions|rejected|delegated|cancelled
  due_at timestamptz, decided_at timestamptz, decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE INDEX approvals_pending_idx ON approvals(status, approver_role) WHERE status = 'pending';

-- ---------------------------------------------------------------- documents & knowledge
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text, context_id uuid,
  doc_type text NOT NULL, -- project_charter|status_report|raid_report|bia_report|business_case|closure_report|release_readiness|sop|user_guide|process_flow|brd|frs|test_strategy|meeting_minutes|other
  current_version int NOT NULL DEFAULT 0,
  review_due date,
  status text NOT NULL DEFAULT 'draft', -- draft|in_review|approved|superseded|archived
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  version int NOT NULL,
  content text NOT NULL,
  generated boolean NOT NULL DEFAULT false,
  source_refs jsonb NOT NULL DEFAULT '[]',
  missing_fields jsonb NOT NULL DEFAULT '[]',
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE (document_id, version)
);
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  entity_type text, entity_id uuid,
  filename text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL,
  sha256 text NOT NULL, storage_key text NOT NULL,
  scan_status text NOT NULL DEFAULT 'pending', -- pending|clean|infected|skipped
  classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), deleted_at timestamptz
);

-- ---------------------------------------------------------------- platform services
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  actor_id uuid, actor_type text NOT NULL DEFAULT 'user', -- user|ai|system|integration
  action text NOT NULL, -- create|update|delete|login|approve|reject|transition|generate|ai_query|...
  entity_type text, entity_id uuid, entity_code text,
  before jsonb, after jsonb, meta jsonb,
  ip text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  prev_hash text, hash text NOT NULL
);
CREATE INDEX audit_entity_idx ON audit_events(entity_type, entity_id);
CREATE INDEX audit_time_idx ON audit_events(occurred_at DESC);
-- audit is append-only: block UPDATE/DELETE at database level
CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_immutable();

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL, title text NOT NULL, body text, link text,
  dedupe_key text,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notifications_dedupe_uq ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  key text NOT NULL, name text NOT NULL, connector text NOT NULL,
  mode text NOT NULL DEFAULT 'mock', -- mock|live  (live requires secret reference configured outside DB)
  secret_ref text, -- name of env var / vault path; never the secret itself
  field_mapping jsonb NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz, last_status text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, key)
);
CREATE TABLE integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  integration_id uuid NOT NULL REFERENCES integrations(id),
  direction text NOT NULL, -- outbound|inbound
  event_type text NOT NULL, external_id text, payload jsonb NOT NULL,
  idempotency_key text,
  status text NOT NULL DEFAULT 'queued', -- queued|delivered|failed|dead_letter|duplicate
  attempts int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5,
  last_error text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX integration_events_idem_uq ON integration_events(integration_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  capability text NOT NULL,
  provider text NOT NULL, model text NOT NULL,
  prompt text NOT NULL, response text,
  citations jsonb NOT NULL DEFAULT '[]',
  confidence text, -- low|medium|high
  tokens_in int NOT NULL DEFAULT 0, tokens_out int NOT NULL DEFAULT 0,
  cost_estimate numeric(12,6) NOT NULL DEFAULT 0,
  injection_flags jsonb NOT NULL DEFAULT '[]',
  external_transmission boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rag_thresholds (
  org_id uuid NOT NULL REFERENCES organisations(id),
  metric_key text NOT NULL,
  direction text NOT NULL DEFAULT 'higher_is_better',
  green_at numeric NOT NULL, amber_at numeric NOT NULL,
  PRIMARY KEY (org_id, metric_key)
);
CREATE TABLE metric_definitions (
  org_id uuid NOT NULL REFERENCES organisations(id),
  key text NOT NULL, name text NOT NULL,
  formula text NOT NULL, source_data text NOT NULL,
  refresh text NOT NULL DEFAULT 'on request (live query)',
  owner_role text NOT NULL,
  PRIMARY KEY (org_id, key)
);
CREATE TABLE job_runs (
  id bigserial PRIMARY KEY, job text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, status text, detail jsonb
);

-- attach updated_at/row_version trigger to every table that has both columns
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.columns c
           WHERE c.table_schema='public' AND c.column_name='row_version'
             AND EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema='public' AND c2.table_name=c.table_name AND c2.column_name='updated_at')
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t.table_name || '_touch', t.table_name);
  END LOOP;
END $$;
