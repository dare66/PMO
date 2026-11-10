
-- ---------------------------------------------------------------- non-standard tables
CREATE TABLE scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  model_id uuid NOT NULL REFERENCES scoring_models(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
  input_values jsonb NOT NULL, breakdown jsonb NOT NULL, computed_total numeric(7,2), override_total numeric(7,2), override_reason text,
  scored_by uuid REFERENCES users(id), scored_at timestamptz NOT NULL DEFAULT now(),
  CHECK (override_total IS NULL OR override_reason IS NOT NULL)
);
CREATE INDEX scores_entity_idx ON scores(entity_type, entity_id, scored_at DESC);
CREATE TABLE project_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  project_id uuid NOT NULL REFERENCES projects(id), version int NOT NULL, snapshot jsonb NOT NULL, reason text NOT NULL,
  change_request_id uuid REFERENCES change_requests(id), approved_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE TABLE work_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  predecessor_id uuid NOT NULL REFERENCES work_items(id), successor_id uuid NOT NULL REFERENCES work_items(id),
  dep_type text NOT NULL DEFAULT 'FS' CHECK (dep_type IN ('FS','SS','FF','SF')), lag_days int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE (predecessor_id, successor_id), CHECK (predecessor_id <> successor_id)
);
CREATE TABLE holidays (
  org_id uuid NOT NULL REFERENCES organisations(id), holiday_date date NOT NULL, name text NOT NULL, calendar text NOT NULL DEFAULT 'default',
  PRIMARY KEY (org_id, calendar, holiday_date)
);
CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  entity_type text NOT NULL, entity_id uuid NOT NULL, body text NOT NULL, mentions uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz, deleted_at timestamptz
);
CREATE INDEX comments_entity_idx ON comments(entity_type, entity_id, created_at);
CREATE TABLE watchers (entity_type text NOT NULL, entity_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY (entity_type, entity_id, user_id));
CREATE TABLE announcement_acks (announcement_id uuid NOT NULL REFERENCES announcements(id), user_id uuid NOT NULL REFERENCES users(id), acked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (announcement_id, user_id));
CREATE TABLE document_acks (document_id uuid NOT NULL REFERENCES documents(id), version int NOT NULL, user_id uuid NOT NULL REFERENCES users(id), acked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (document_id, version, user_id));
CREATE TABLE finance_periods (
  org_id uuid NOT NULL REFERENCES organisations(id), period char(7) NOT NULL, -- YYYY-MM
  locked boolean NOT NULL DEFAULT false, locked_by uuid REFERENCES users(id), locked_at timestamptz,
  signed_off_by uuid REFERENCES users(id), signed_off_at timestamptz, PRIMARY KEY (org_id, period)
);
CREATE TABLE coi_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  tender_id uuid NOT NULL REFERENCES tenders(id), user_id uuid NOT NULL REFERENCES users(id), has_conflict boolean NOT NULL, details text,
  declared_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tender_id, user_id)
);
CREATE TABLE bia_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  bia_id uuid NOT NULL REFERENCES bia_assessments(id), version int NOT NULL, snapshot jsonb NOT NULL,
  approved_by uuid REFERENCES users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (bia_id, version)
);
CREATE TABLE roadmap_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  product_id uuid NOT NULL REFERENCES products(id), version int NOT NULL, snapshot jsonb NOT NULL, rationale text NOT NULL,
  created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (product_id, version)
);
CREATE TABLE metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id),
  metric_id uuid NOT NULL REFERENCES product_metrics(id), period_date date NOT NULL, value numeric NOT NULL, segment text NOT NULL DEFAULT 'all',
  recorded_by uuid REFERENCES users(id), recorded_at timestamptz NOT NULL DEFAULT now(), UNIQUE (metric_id, period_date, segment)
);
CREATE TRIGGER project_baselines_immutable BEFORE UPDATE OR DELETE ON project_baselines FOR EACH ROW EXECUTE FUNCTION history_immutable();
CREATE TRIGGER bia_versions_immutable BEFORE UPDATE OR DELETE ON bia_versions FOR EACH ROW EXECUTE FUNCTION history_immutable();
CREATE TRIGGER roadmap_versions_immutable BEFORE UPDATE OR DELETE ON roadmap_versions FOR EACH ROW EXECUTE FUNCTION history_immutable();
CREATE TRIGGER scores_immutable BEFORE UPDATE OR DELETE ON scores FOR EACH ROW EXECUTE FUNCTION history_immutable();

-- ---------------------------------------------------------------- column additions on existing tables
ALTER TABLE projects ADD COLUMN governance_tier text, ADD COLUMN complexity text, ADD COLUMN regulatory_category text,
  ADD COLUMN business_owner_id uuid REFERENCES users(id), ADD COLUMN status_reason text, ADD COLUMN baseline_version int NOT NULL DEFAULT 0,
  ADD COLUMN source_request_id uuid REFERENCES requests(id), ADD COLUMN progress_method text NOT NULL DEFAULT 'manual'; -- manual|weighted_effort|milestones
ALTER TABLE work_items ADD COLUMN sprint_id uuid REFERENCES sprints(id), ADD COLUMN release_id uuid REFERENCES releases(id), ADD COLUMN meeting_id uuid REFERENCES meetings(id),
  ADD COLUMN requires_evidence boolean NOT NULL DEFAULT false, ADD COLUMN completion_evidence text, ADD COLUMN remaining_hours numeric(8,1),
  ADD COLUMN optimistic_days numeric(6,1), ADD COLUMN most_likely_days numeric(6,1), ADD COLUMN pessimistic_days numeric(6,1),
  ADD COLUMN progress_weight numeric(6,2), ADD COLUMN blocked_reason text, ADD COLUMN escalated boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN employment_type text NOT NULL DEFAULT 'employee', ADD COLUMN access_end_date date, ADD COLUMN manager_id uuid REFERENCES users(id),
  ADD COLUMN location text, ADD COLUMN phone text;
ALTER TABLE risks ADD COLUMN risk_type text NOT NULL DEFAULT 'threat', ADD COLUMN proximity_date date, ADD COLUMN velocity text, ADD COLUMN trigger_event text,
  ADD COLUMN contingency_plan text, ADD COLUMN cost_impact numeric(16,2), ADD COLUMN probability_pct numeric(5,2) CHECK (probability_pct BETWEEN 0 AND 100),
  ADD COLUMN secondary_risk text, ADD COLUMN acceptance_rationale text, ADD COLUMN last_reviewed_on date, ADD COLUMN escalated boolean NOT NULL DEFAULT false;
ALTER TABLE issues ADD COLUMN converted_work_item_id uuid REFERENCES work_items(id), ADD COLUMN escalated boolean NOT NULL DEFAULT false;
ALTER TABLE defects ADD COLUMN root_cause text, ADD COLUMN fix_version text, ADD COLUMN reopen_count int NOT NULL DEFAULT 0, ADD COLUMN found_in_env text,
  ADD COLUMN priority text NOT NULL DEFAULT 'medium', ADD COLUMN waiver_reason text, ADD COLUMN waived_by uuid REFERENCES users(id);
ALTER TABLE test_executions ADD COLUMN build_version text;
ALTER TABLE change_requests ADD COLUMN emergency boolean NOT NULL DEFAULT false, ADD COLUMN retrospective_review text, ADD COLUMN origin text, ADD COLUMN urgency text,
  ADD COLUMN alternatives text, ADD COLUMN recommendation text, ADD COLUMN requested_effective_date date, ADD COLUMN implemented_at timestamptz, ADD COLUMN verified_at timestamptz,
  ADD COLUMN impact_benefits text, ADD COLUMN impact_resources text;
ALTER TABLE budgets ADD COLUMN budget_type text NOT NULL DEFAULT 'original', ADD COLUMN funding_source text, ADD COLUMN department_id uuid REFERENCES departments(id),
  ADD COLUMN estimate_basis text, ADD COLUMN confidence_range text, ADD COLUMN release_date date, ADD COLUMN funding_restrictions text;
ALTER TABLE cost_entries DROP CONSTRAINT cost_entries_entry_kind_check;
ALTER TABLE cost_entries ADD CONSTRAINT cost_entries_entry_kind_check CHECK (entry_kind IN ('actual','commitment','forecast','accrual'));
ALTER TABLE cost_entries ADD COLUMN reversal_of uuid REFERENCES cost_entries(id), ADD COLUMN reversed boolean NOT NULL DEFAULT false;
ALTER TABLE bia_assessments ADD COLUMN deputy_owner_id uuid REFERENCES users(id), ADD COLUMN version int NOT NULL DEFAULT 1, ADD COLUMN review_trigger text,
  ADD COLUMN data_integrity_requirements text, ADD COLUMN critical_outputs text, ADD COLUMN operating_hours text;
ALTER TABLE documents ADD COLUMN folder text, ADD COLUMN tags text, ADD COLUMN retention_category text, ADD COLUMN retention_until date, ADD COLUMN legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN checked_out_by uuid REFERENCES users(id), ADD COLUMN checked_out_at timestamptz, ADD COLUMN distribution text, ADD COLUMN requires_ack boolean NOT NULL DEFAULT false;
ALTER TABLE meetings ADD COLUMN meeting_type text NOT NULL DEFAULT 'project', ADD COLUMN apologies text, ADD COLUMN materials text;
ALTER TABLE releases ADD COLUMN deployment_window text, ADD COLUMN go_no_go_decision text, ADD COLUMN go_no_go_at timestamptz, ADD COLUMN go_no_go_conditions text,
  ADD COLUMN hypercare_exit_criteria text, ADD COLUMN service_accepted_by uuid REFERENCES users(id), ADD COLUMN residual_risks text, ADD COLUMN release_notes text,
  ADD COLUMN backup_evidence text, ADD COLUMN monitoring_evidence text, ADD COLUMN security_evidence text, ADD COLUMN access_evidence text;
ALTER TABLE products ADD COLUMN parent_id uuid REFERENCES products(id), ADD COLUMN product_type text NOT NULL DEFAULT 'product', ADD COLUMN mission text,
  ADD COLUMN value_proposition text, ADD COLUMN business_unit text, ADD COLUMN geography text, ADD COLUMN customer_segments text, ADD COLUMN next_review_date date;
ALTER TABLE business_cases ADD COLUMN dis_benefits text, ADD COLUMN feasibility text, ADD COLUMN sensitivity_pct numeric(5,2) NOT NULL DEFAULT 20, ADD COLUMN version int NOT NULL DEFAULT 1;
ALTER TABLE lessons ADD COLUMN source_project_id uuid REFERENCES projects(id);
CREATE INDEX requests_text_idx ON requests USING gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(problem_statement,'')));
