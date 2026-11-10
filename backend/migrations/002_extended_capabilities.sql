-- =====================================================================
-- Migration 002: completes planned / partial capabilities
-- scenarios, stakeholders, BC exercises, skill requirements, tenders & bids,
-- vendor reviews, policies & attestations, saved views, requirement versions,
-- export snapshots, AI intake workspace, OIDC SSO, document full-text search,
-- recurring work lineage.
-- =====================================================================

-- ---------------------------------------------------------------- portfolio scenarios (FR-STR-005)
CREATE TABLE investment_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  portfolio_id uuid REFERENCES portfolios(id),
  fiscal_year int,
  funding_limit numeric(16,2),          -- NULL = use portfolio funding envelope
  capacity_limit_fte numeric(8,2),      -- NULL = use current active headcount
  status text NOT NULL DEFAULT 'draft', -- draft|proposed|selected|archived
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE scenario_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  scenario_id uuid NOT NULL REFERENCES investment_scenarios(id),
  project_id uuid REFERENCES projects(id),
  idea_id uuid REFERENCES ideas(id),
  included boolean NOT NULL DEFAULT true,
  cost_override numeric(16,2),          -- NULL = project BAC or idea cost estimate
  fte_demand numeric(8,2),
  value_score int CHECK (value_score BETWEEN 0 AND 100),
  rank int,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code),
  CHECK (project_id IS NOT NULL OR idea_id IS NOT NULL)
);

-- ---------------------------------------------------------------- stakeholders (FR-PRJ-008)
CREATE TABLE stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text NOT NULL, context_id uuid,
  user_id uuid REFERENCES users(id),
  organisation_name text, role_title text,
  influence int CHECK (influence BETWEEN 1 AND 5),
  interest int CHECK (interest BETWEEN 1 AND 5),
  attitude text, -- supportive|neutral|resistant|unknown
  engagement_current text, engagement_desired text, -- unaware|resistant|neutral|supportive|leading
  communication_plan text, frequency text, channel text,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- BC exercises (FR-BIA-006)
CREATE TABLE bc_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  bia_id uuid NOT NULL REFERENCES bia_assessments(id),
  recovery_strategy_id uuid REFERENCES recovery_strategies(id),
  exercise_type text NOT NULL DEFAULT 'tabletop', -- tabletop|walkthrough|simulation|full_failover
  scenario text,
  scheduled_on date, conducted_on date,
  achieved_rto_hours numeric, achieved_rpo_hours numeric,
  result text, -- passed|partial|failed
  findings text, corrective_actions text, evidence_ref text,
  status text NOT NULL DEFAULT 'planned', -- planned|conducted|closed
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- skills demand (FR-RES-003)
CREATE TABLE skill_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text NOT NULL, context_id uuid,
  skill_id uuid NOT NULL REFERENCES skills(id),
  min_proficiency int NOT NULL DEFAULT 3 CHECK (min_proficiency BETWEEN 1 AND 5),
  fte_pct numeric(5,1) NOT NULL DEFAULT 100 CHECK (fte_pct > 0 AND fte_pct <= 100),
  start_date date, end_date date,
  status text NOT NULL DEFAULT 'open', -- open|filled|cancelled
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- tenders & vendor reviews (FR-VND-004)
CREATE TABLE tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  context_type text, context_id uuid,
  purchase_request_id uuid REFERENCES purchase_requests(id),
  criteria jsonb NOT NULL DEFAULT '[]', -- [{key, name, weight}] weights sum to 100; 'price' scored automatically
  closing_date date,
  awarded_vendor_id uuid REFERENCES vendors(id),
  status text NOT NULL DEFAULT 'draft', -- draft|open|evaluating|awarded|cancelled
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE tender_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  tender_id uuid NOT NULL REFERENCES tenders(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  price numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  scores jsonb NOT NULL DEFAULT '{}', -- {criterionKey: 0..10}
  compliant boolean NOT NULL DEFAULT true, notes text,
  status text NOT NULL DEFAULT 'received',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code), UNIQUE (tender_id, vendor_id)
);
CREATE TABLE vendor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  contract_id uuid REFERENCES contracts(id),
  period_start date, period_end date,
  quality_score int CHECK (quality_score BETWEEN 1 AND 5),
  delivery_score int CHECK (delivery_score BETWEEN 1 AND 5),
  cost_score int CHECK (cost_score BETWEEN 1 AND 5),
  relationship_score int CHECK (relationship_score BETWEEN 1 AND 5),
  sla_met_pct numeric(5,2) CHECK (sla_met_pct BETWEEN 0 AND 100),
  comments text,
  status text NOT NULL DEFAULT 'draft',
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'confidential',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- policies & attestations (FR-GOV-004)
CREATE TABLE policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL, description text,
  version_label text NOT NULL DEFAULT '1.0',
  body text,
  effective_date date, review_due date,
  requires_attestation boolean NOT NULL DEFAULT true,
  applies_to_roles text[] NOT NULL DEFAULT '{}', -- empty = everyone
  status text NOT NULL DEFAULT 'draft', -- draft|published|retired
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);
CREATE TABLE policy_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  policy_id uuid NOT NULL REFERENCES policies(id),
  user_id uuid NOT NULL REFERENCES users(id),
  policy_version text NOT NULL,
  statement text NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, user_id, policy_version)
);

-- ---------------------------------------------------------------- saved views (FR-RPT-004)
CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  resource text NOT NULL, name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (user_id, resource, name)
);

-- ---------------------------------------------------------------- requirement versioning & change impact (prior spec 2.10–2.12)
ALTER TABLE requirements ADD COLUMN version int NOT NULL DEFAULT 1;
ALTER TABLE requirements ADD COLUMN origin text NOT NULL DEFAULT 'human'; -- human|ai
CREATE TABLE requirement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  impact jsonb NOT NULL DEFAULT '[]', -- linked items affected when an approved version was superseded
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE (requirement_id, version)
);
-- version rows are history: immutable
CREATE OR REPLACE FUNCTION history_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER requirement_versions_immutable BEFORE UPDATE OR DELETE ON requirement_versions FOR EACH ROW EXECUTE FUNCTION history_immutable();
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION history_immutable();
CREATE TRIGGER policy_attestations_immutable BEFORE UPDATE OR DELETE ON policy_attestations FOR EACH ROW EXECUTE FUNCTION history_immutable();

-- ---------------------------------------------------------------- export snapshots (prior spec 2.14)
CREATE TABLE export_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  kind text NOT NULL, -- traceability_csv|resource_csv
  context_type text, context_id uuid,
  checksum text NOT NULL,       -- sha256 of the exported bytes
  source_hash text NOT NULL,    -- sha256 of the source rows at export time (stale detection)
  row_count int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id)
);

-- ---------------------------------------------------------------- AI intake workspace (prior spec 2.2–2.8)
CREATE TABLE ai_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  code text NOT NULL, name text NOT NULL,
  context_type text NOT NULL, context_id uuid,
  source_text text NOT NULL,
  source_file_id uuid REFERENCES files(id),
  intake_classification jsonb, -- {type, domains, confidence}
  facts jsonb NOT NULL DEFAULT '[]',
  questions jsonb NOT NULL DEFAULT '[]', -- [{key, question, required, answer, skipped}]
  generated jsonb,      -- {brief, requirements[], work_items[], risks[]}
  provider text NOT NULL DEFAULT 'local', model text NOT NULL DEFAULT 'rules-v1',
  injection_flags jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'clarifying', -- clarifying|ready|generated|accepted|discarded
  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT 'internal',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,
  UNIQUE (org_id, code)
);

-- ---------------------------------------------------------------- OIDC single sign-on (FR-INT-004)
ALTER TABLE users ADD COLUMN oidc_subject text;
CREATE UNIQUE INDEX users_oidc_uq ON users (oidc_subject) WHERE oidc_subject IS NOT NULL;
CREATE TABLE oidc_login_states (
  state text PRIMARY KEY,
  nonce text NOT NULL, code_verifier text NOT NULL, return_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- files: link + scan engine (FR-DOC-003)
ALTER TABLE files ADD COLUMN scan_engine text;
ALTER TABLE files ADD COLUMN scan_detail text;
ALTER TABLE files ADD COLUMN owner_id uuid REFERENCES users(id);
CREATE INDEX files_entity_idx ON files(entity_type, entity_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- full-text search (FR-DOC-004 / FR-AI-005)
ALTER TABLE document_versions ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX document_versions_tsv_idx ON document_versions USING gin (tsv);

-- ---------------------------------------------------------------- recurring work lineage (FR-WRK-003)
ALTER TABLE work_items ADD COLUMN recurrence_parent_id uuid REFERENCES work_items(id);
ALTER TABLE work_items ADD COLUMN sla_breached boolean NOT NULL DEFAULT false;

-- touch triggers for the new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['investment_scenarios','scenario_items','stakeholders','bc_exercises','skill_requirements','tenders','tender_bids','vendor_reviews','policies','saved_views','ai_intakes']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;
