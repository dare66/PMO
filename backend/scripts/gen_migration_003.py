"""Generates migrations/003_frs_v11_gaps.sql from a compact table spec (keeps conventions uniform)."""
STD_HEAD = "  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  org_id uuid NOT NULL REFERENCES organisations(id),\n  code text NOT NULL, name text NOT NULL,"
def std_tail(status, cls='internal'):
    return (f"  status text NOT NULL DEFAULT '{status}',\n  owner_id uuid REFERENCES users(id), classification text NOT NULL DEFAULT '{cls}',\n"
            "  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),\n"
            "  created_by uuid, updated_by uuid, deleted_at timestamptz, row_version int NOT NULL DEFAULT 1,\n  UNIQUE (org_id, code)")
T = [
 ('requests', 'submitted', 'internal', """description text,
  request_type text NOT NULL DEFAULT 'new_project', -- new_project|enhancement|operational_improvement|compliance|infrastructure|product|emergency
  pipeline_stage text NOT NULL DEFAULT 'submitted', -- submitted|screening|discovery|proposed|approved|deferred|rejected|active|suspended|closed
  problem_statement text, current_state text, proposed_outcome text,
  urgency text NOT NULL DEFAULT 'medium', requester_id uuid REFERENCES users(id), sponsor_id uuid REFERENCES users(id),
  department_id uuid REFERENCES departments(id), portfolio_id uuid REFERENCES portfolios(id), product_id uuid REFERENCES products(id),
  business_process_id uuid REFERENCES business_processes(id), related_system text, impacted_customers text, target_date date,
  estimated_cost numeric(16,2), score numeric(7,2), deferral_date date, decision_reason text,
  converted_project_id uuid REFERENCES projects(id),"""),
 ('scoring_models', 'active', 'internal', """description text,
  applies_to text NOT NULL, -- requests|ideas|projects
  criteria jsonb NOT NULL DEFAULT '[]', -- [{key,name,weight,direction:'higher'|'lower'}]"""),
 ('sprints', 'planned', 'internal', """team_id uuid REFERENCES teams(id),
  context_type text, context_id uuid, goal text, start_date date NOT NULL, end_date date NOT NULL,
  capacity_points int, CHECK (end_date >= start_date),"""),
 ('time_entries', 'submitted', 'confidential', """work_item_id uuid NOT NULL REFERENCES work_items(id), user_id uuid NOT NULL REFERENCES users(id),
  entry_date date NOT NULL, hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24), notes text,
  approved_by uuid REFERENCES users(id), approved_at timestamptz,"""),
 ('raci_assignments', 'active', 'internal', """context_type text NOT NULL, context_id uuid,
  item_type text NOT NULL DEFAULT 'deliverable', -- deliverable|process|decision|work_package|requirement
  item_ref text, user_id uuid NOT NULL REFERENCES users(id),
  responsibility char(1) NOT NULL CHECK (responsibility IN ('R','A','C','I')),"""),
 ('communications', 'planned', 'internal', """context_type text NOT NULL, context_id uuid,
  audience text NOT NULL, message text, channel text, frequency text, next_due date, last_sent date, evidence_ref text,"""),
 ('announcements', 'draft', 'internal', """context_type text, context_id uuid, body text NOT NULL, requires_ack boolean NOT NULL DEFAULT true,
  audience_roles text[] NOT NULL DEFAULT '{}', published_at timestamptz,"""),
 ('quality_reviews', 'planned', 'internal', """context_type text NOT NULL, context_id uuid,
  review_type text NOT NULL DEFAULT 'qa_review', -- qa_review|process_audit|peer_review|inspection
  deliverable_id uuid REFERENCES deliverables(id), standard_ref text, scheduled_on date, conducted_on date,
  result text, findings text,"""),
 ('non_conformances', 'open', 'internal', """context_type text NOT NULL, context_id uuid,
  quality_review_id uuid REFERENCES quality_reviews(id), description text, severity text NOT NULL DEFAULT 'medium',
  root_cause text, corrective_action text, preventive_action text, due_date date,
  effectiveness_check text, effectiveness_result text, -- effective|not_effective"""),
 ('configuration_items', 'active', 'internal', """description text,
  ci_type text NOT NULL DEFAULT 'application', -- application|component|infrastructure|database|interface|document|configuration
  product_id uuid REFERENCES products(id), environment_id uuid REFERENCES environments(id), release_id uuid REFERENCES releases(id),
  parent_ci_id uuid REFERENCES configuration_items(id), version_label text,"""),
 ('ocm_impacts', 'open', 'internal', """context_type text NOT NULL, context_id uuid,
  impacted_group text NOT NULL, group_type text NOT NULL DEFAULT 'team', -- role|team|location|process|policy|system|customer
  dimension text NOT NULL DEFAULT 'process', -- people|process|technology|data|policy|culture|service
  magnitude int NOT NULL DEFAULT 3 CHECK (magnitude BETWEEN 1 AND 5), headcount int, description text, mitigation text,"""),
 ('readiness_assessments', 'recorded', 'internal', """context_type text NOT NULL, context_id uuid,
  gate_key text, assessed_on date NOT NULL, respondents int,
  awareness int CHECK (awareness BETWEEN 1 AND 5), understanding int CHECK (understanding BETWEEN 1 AND 5),
  willingness int CHECK (willingness BETWEEN 1 AND 5), ability int CHECK (ability BETWEEN 1 AND 5),
  reinforcement int CHECK (reinforcement BETWEEN 1 AND 5), notes text,"""),
 ('training_activities', 'planned', 'internal', """context_type text NOT NULL, context_id uuid,
  audience text, delivery_method text, planned_date date, delivered_date date,
  attendees_planned int, attendees_actual int, assessment_pass_pct numeric(5,2) CHECK (assessment_pass_pct BETWEEN 0 AND 100), materials_ref text,"""),
 ('contract_milestones', 'planned', 'confidential', """contract_id uuid NOT NULL REFERENCES contracts(id), due_date date, amount numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  deliverable text, accepted_on date, accepted_by uuid REFERENCES users(id), invoice_id uuid REFERENCES invoices(id),"""),
 ('cutover_steps', 'planned', 'internal', """release_id uuid NOT NULL REFERENCES releases(id), seq int NOT NULL, step_owner_id uuid REFERENCES users(id),
  planned_at timestamptz, done_at timestamptz, validation text, rollback_criteria text,"""),
 ('tech_debt_items', 'open', 'internal', """description text, product_id uuid REFERENCES products(id), project_id uuid REFERENCES projects(id),
  component text, risk text NOT NULL DEFAULT 'medium', impact text, remediation_estimate_days numeric(7,1), planned_quarter text, raised_on date NOT NULL DEFAULT current_date,"""),
 ('lessons', 'draft', 'internal', """context_type text, context_id uuid, category text NOT NULL DEFAULT 'delivery',
  what_happened text, recommendation text, validated boolean NOT NULL DEFAULT false, reusable boolean NOT NULL DEFAULT true, tags text,"""),
 ('product_roles', 'active', 'internal', """product_id uuid NOT NULL REFERENCES products(id), user_id uuid NOT NULL REFERENCES users(id),
  role_type text NOT NULL, -- product_manager|product_owner|business_owner|technical_owner|service_owner|data_owner|commercial_owner
  effective_from date NOT NULL DEFAULT current_date, effective_to date, delegated_from uuid REFERENCES users(id),"""),
 ('personas', 'active', 'confidential', """description text, product_id uuid REFERENCES products(id), segment text, goals text, pains text, jobs_to_be_done text,
  research_source text, consent_basis text,"""),
 ('hypotheses', 'open', 'internal', """product_id uuid REFERENCES products(id), idea_id uuid REFERENCES ideas(id), statement text NOT NULL, segment text,
  expected_outcome text, measurement text, baseline_value numeric, target_value numeric, actual_value numeric, evidence text,"""),
 ('launch_plans', 'planned', 'internal', """product_id uuid NOT NULL REFERENCES products(id), release_id uuid REFERENCES releases(id), audience text, channels text,
  launch_date date, communications text, training text, support_ready boolean NOT NULL DEFAULT false, faq_ref text, launch_risks text, post_launch_review_date date,"""),
 ('product_metrics', 'active', 'internal', """product_id uuid NOT NULL REFERENCES products(id), metric_key text NOT NULL, definition text, data_source text,
  unit text, baseline_value numeric, target_value numeric, refresh text, direction text NOT NULL DEFAULT 'higher_is_better',"""),
 ('pricing_plans', 'draft', 'restricted', """product_id uuid NOT NULL REFERENCES products(id), tier text, price numeric(16,2), currency char(3) NOT NULL DEFAULT 'MYR',
  billing_period text, discounts text, effective_from date, effective_to date,"""),
]
out = ["-- =====================================================================",
       "-- Migration 003: gaps identified against FRS-EPMO-001 v1.1 (generated by scripts/gen_migration_003.py)",
       "-- =====================================================================", ""]
for name, status, cls, cols in T:
    out.append(f"CREATE TABLE {name} (\n{STD_HEAD}\n  {cols.strip()}\n{std_tail(status, cls)}\n);")
    out.append(f"CREATE TRIGGER {name}_touch BEFORE UPDATE ON {name} FOR EACH ROW EXECUTE FUNCTION touch_updated_at();")
out.append(open(__file__.replace('gen_migration_003.py', 'migration_003_tail.sql')).read())
open(__file__.replace('scripts/gen_migration_003.py', 'migrations/003_frs_v11_gaps.sql'), 'w').write('\n'.join(out))
print('ok', len(T), 'tables')
