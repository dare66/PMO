# Master Functional Requirements Specification (MASTER_FRS)

_Generated from `requirements_source.py` – edit the source, not this file._

> **Baseline status:** the existing FRS v1.1 (with Product Management addendum) was not available in this session. This specification was derived from online research, the master prompt and professional assessment. On receipt of v1.1, each original requirement will be imported, keep its original ID in `baseline_id`, and be classified (Retained / Enhanced / Expanded / Replaced / Deferred / Rejected) – see REQUIREMENT_GAP_REGISTER.md.

## Summary

| Module | Requirements | Implemented | Partial | Planned |
|---|---|---|---|---|
| Platform foundation | 10 | 10 | 0 | 0 |
| Strategy & portfolio | 6 | 5 | 0 | 1 |
| Programme & project management | 10 | 9 | 0 | 1 |
| Product management & discovery | 7 | 7 | 0 | 0 |
| Business analysis & process | 4 | 2 | 1 | 1 |
| BIA & operational resilience | 6 | 5 | 1 | 0 |
| Work & operational management | 3 | 2 | 1 | 0 |
| Resource & capacity | 3 | 2 | 1 | 0 |
| Financial & benefits | 6 | 6 | 0 | 0 |
| RAID & change control | 4 | 4 | 0 | 0 |
| Quality, release & transition | 4 | 4 | 0 | 0 |
| Vendor, procurement & contract | 4 | 3 | 0 | 1 |
| Governance, risk & compliance | 4 | 3 | 0 | 1 |
| Documents & knowledge | 4 | 2 | 1 | 1 |
| AI-assisted decision intelligence | 5 | 4 | 0 | 1 |
| Integration framework | 4 | 3 | 0 | 1 |
| Reporting & executive intelligence | 4 | 3 | 1 | 0 |
| Non-functional | 6 | 1 | 4 | 1 |

Total requirements: **94**. “Implemented” means code, API, UI and automated tests exist in this repository (see `tests` column); it does not mean production-accepted.


## Platform foundation

### FR-PLT-001 – Secure authentication & session

| Attribute | Specification |
|---|---|
| Business objective | Only authenticated users access the platform |
| Description | Local email/password sign-in issuing a JWT (bearer for API clients, httpOnly SameSite=Strict cookie for browsers); lockout after 5 failures for 15 min; generic error messages; anti-CSRF header for cookie writes. SSO via OIDC/SAML is a planned adapter. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User submits credentials |
| Main workflow | 1 Enter email/password 2 Server verifies bcrypt hash 3 Issue token/cookie 4 Load roles & permissions |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Passwords >=12 chars with letters+digits; 5 failures => 423 lock; tokens expire after SESSION_HOURS |
| Data fields | email, password_hash, failed_logins, locked_until, last_login_at |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Valid credentials return 200 and a session; 5 wrong attempts lock the account; cookie is httpOnly+SameSite=Strict; writes via cookie without x-requested-with are rejected 403; password hashes never returned |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/auth/* |
| Ui | Login |
| Tests | TC-SEC-001..004 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-002 – Role-based and attribute-based access control

| Attribute | Specification |
|---|---|
| Business objective | Least-privilege access to every record |
| Description | Permissions are strings resource:action granted via roles; wildcards (*:read) supported except for sensitive permissions (restricted:read, audit:read, releases:deploy, workflow:override) which must be explicit. Records classified restricted are visible only to owner/creator or holders of restricted:read. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Every API request |
| Main workflow | 1 Resolve user roles 2 Check permission 3 Apply row-level classification filter 4 Return or 403 |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Org boundary enforced on every query; ABAC on classification |
| Data fields | roles.permissions, user_roles, classification |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Tester receives 403 on budgets; restricted document hidden from PMO search but visible to owner; portfolio manager (with *:read) denied audit trail |
| Priority | Must |
| Dependencies | FR-PLT-001 |
| Implementation status | Implemented |
| Api | all |
| Ui | Admin → Users & roles |
| Tests | TC-SEC-RBAC-* |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-003 – Organisation structure configuration

| Attribute | Specification |
|---|---|
| Business objective | Model the real organisation without code changes |
| Description | Organisations (tenant boundary), departments (hierarchical), teams, members, skills and proficiencies are configurable records. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Administrator maintains structure |
| Main workflow | CRUD via data browser |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Unique codes per org; parent must exist |
| Data fields | departments, teams, team_members, skills, user_skills |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Departments and teams can be created, nested and assigned without deployment |
| Priority | Must |
| Dependencies | FR-PLT-002 |
| Implementation status | Implemented |
| Api | /api/r/departments/teams/skills |
| Ui | Admin → Data browser |
| Tests | TC-PLT-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-004 – Tamper-evident audit trail

| Attribute | Specification |
|---|---|
| Business objective | Every change is attributable and verifiable |
| Description | Every create/update/delete/transition/approval/login/AI query writes an audit event with actor (user/ai/system/integration), before/after values and a SHA-256 hash chained to the previous event. UPDATE/DELETE on the audit table are rejected by a database trigger. A verify endpoint recomputes the chain. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Any state change |
| Main workflow | 1 Mutate record in transaction 2 Append audit event with chained hash |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Secrets redacted; append-only |
| Data fields | audit_events(actor, action, before, after, hash, prev_hash) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Audit verify reports intact; UPDATE audit_events raises error; updates store changed fields before/after |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/audit, /api/audit/verify |
| Ui | Governance → Audit trail; record History tab |
| Tests | TC-AUD-001..002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-005 – Optimistic concurrency & soft delete

| Attribute | Specification |
|---|---|
| Business objective | Prevent lost updates and keep history |
| Description | Every business record carries row_version; updates supplying a stale version return 409. Deletes are soft (deleted_at) and audited. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User saves an edit |
| Main workflow | Compare row_version → update or 409 |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | row_version, deleted_at |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Two concurrent edits: second returns 409 with current version |
| Priority | Must |
| Dependencies | FR-PLT-004 |
| Implementation status | Implemented |
| Api | PATCH /api/r/* |
| Ui | All forms |
| Tests | TC-SEC-OPT |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-006 – Configurable workflow engine

| Attribute | Specification |
|---|---|
| Business objective | Govern any lifecycle without hard-coding |
| Description | Workflow definitions are versioned data (stages, entry/exit criteria, deliverables, approvals, field sets). Instances attach to any record type; advancing evaluates criteria; stages with approvals raise parallel approvals; rejection returns the instance; resubmission opens a new round; authorised users can record justified gate exceptions. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User starts/advances a workflow |
| Main workflow | 1 Start from template 2 Evaluate exit+entry criteria 3 Raise approvals or move 4 Apply stage field sets 5 Audit |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | New versions never alter in-flight instances; exceptions need workflow:override + justification |
| Data fields | workflow_definitions, workflow_instances(history) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Gate blocked with unmet criteria (422 listing them); exception without permission 403; with permission advances and audits gate_exception; definitions version on save |
| Priority | Must |
| Dependencies | FR-PLT-004 |
| Implementation status | Implemented |
| Api | /api/workflows/* |
| Ui | Workflow & approvals tab; Admin → Workflows |
| Tests | TC-WF-001..002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-007 – Approval engine with delegated authority

| Attribute | Specification |
|---|---|
| Business objective | Decisions respect authority, SoD and humans-only |
| Description | Approvals support parallel approvers, approve / approve-with-conditions / reject (reason mandatory), delegation and change of approver, rounds, due dates and escalation. Amount-bearing approvals are checked against the approval matrix; requesters cannot approve their own financial/procurement/risk/change/BIA requests; AI and system actors can never decide. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Submission of a governed record or gate |
| Main workflow | Route by matrix → notify approvers → decide → apply effect |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Conditional approval requires conditions; rejection requires reason; delegate must hold authority |
| Data fields | approvals, approval_matrix |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Finance controller cannot approve RM 1.5M (>250k); self-approval blocked; AI actor rejected; delegation transfers decision right |
| Priority | Must |
| Dependencies | FR-PLT-006 |
| Implementation status | Implemented |
| Api | /api/approvals/* |
| Ui | Governance → My approvals |
| Tests | TC-GOV-001..006 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-008 – Notifications

| Attribute | Specification |
|---|---|
| Business objective | Users learn of work requiring action |
| Description | In-app notifications for assignment, approval requests/decisions, impact assessments, BIA required/review due, contract expiry, overdue milestones and approval escalation; de-duplicated; read/unread. Email/Teams delivery via integration framework (mock). |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Domain events and scheduled checks |
| Main workflow | Create notification → bell badge → mark read |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | De-duplication key per event |
| Data fields | notifications |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Approver receives a notification when an approval is raised; scheduled job raises contract expiry notice once |
| Priority | Should |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented (in-app) |
| Api | /api/notifications |
| Ui | Topbar bell |
| Tests | TC-PLT-008 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-009 – Global search & command palette

| Attribute | Specification |
|---|---|
| Business objective | Find any record quickly |
| Description | Ctrl/Cmd-K palette searches codes, names and descriptions across all searchable resources the user can read, plus page navigation. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User types ≥2 characters |
| Main workflow | Permission-trimmed union query → ranked results |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Restricted rows excluded unless owner |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Search returns only permitted records; restricted record excluded for non-owners |
| Priority | Must |
| Dependencies | FR-PLT-002 |
| Implementation status | Implemented |
| Api | /api/search |
| Ui | Command palette |
| Tests | TC-SEC-RBAC-restricted |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PLT-010 – Metadata-driven records & validation

| Attribute | Specification |
|---|---|
| Business objective | Consistent, validated CRUD everywhere |
| Description | A resource registry defines fields, types, enums, references and contexts; the API validates strictly (unknown fields rejected), verifies references within the organisation, and the UI renders forms/tables from the same metadata. |
| User roles | Administrator; all users |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Any create/update |
| Main workflow | Schema validate → ref check → hooks → persist → audit |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Guarded statuses (e.g. budget approved) cannot be set directly |
| Data fields | registry |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | plt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Security events to administrators |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Admin usage, audit verification |
| Integration | Identity provider (SSO, planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Unknown field 400; likelihood 9 → 400; guarded status 422 |
| Priority | Must |
| Dependencies | FR-PLT-004 |
| Implementation status | Implemented |
| Api | /api/meta/resources, /api/r/* |
| Ui | All workspaces |
| Tests | TC-SEC-VAL |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Strategy & portfolio

### FR-STR-001 – Strategic objectives & key results

| Attribute | Specification |
|---|---|
| Business objective | Make strategy measurable |
| Description | Objectives (corporate→team cascade) with key results (baseline, target, current, unit). Progress = clamped (current−baseline)/(target−baseline); unmeasured KRs are excluded and shown as no data. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Planning cycle |
| Main workflow | Define objective → KRs → link portfolios/products/projects |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Target ≠ baseline for progress |
| Data fields | objectives, key_results |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Objective progress equals mean of measured KR progress; objective with no measured KR shows “—” |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/objectives/key_results |
| Ui | Strategy & OKRs |
| Tests | TC-RPT-OKR |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-STR-002 – Business capability map

| Attribute | Specification |
|---|---|
| Business objective | Align investment to capabilities |
| Description | Hierarchical capabilities with current and target maturity, linkable to processes. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Architecture/strategy review |
| Main workflow | CRUD |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Maturity 1..5 |
| Data fields | business_capabilities |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Capability with maturity outside 1..5 rejected |
| Priority | Should |
| Dependencies | FR-STR-001 |
| Implementation status | Implemented |
| Api | /api/r/business_capabilities |
| Ui | Strategy → Capabilities |
| Tests | TC-PLT-VAL |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-STR-003 – Portfolio definition & funding envelope

| Attribute | Specification |
|---|---|
| Business objective | Govern investment by portfolio |
| Description | Portfolios with investment theme, funding envelope, currency and objective; roll-up of programmes, projects and products. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Annual planning |
| Main workflow | Create portfolio → assign programmes/projects/products |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | portfolios |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Portfolio card shows envelope, approved, actual and forecast demand from records |
| Priority | Must |
| Dependencies | FR-STR-001 |
| Implementation status | Implemented |
| Api | /api/r/portfolios |
| Ui | Portfolio |
| Tests | TC-FIN-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-STR-004 – Portfolio prioritisation & alignment map

| Attribute | Specification |
|---|---|
| Business objective | Fund the right work |
| Description | Projects carry strategic and risk scores; a bubble/quadrant map plots alignment vs risk sized by BAC and coloured by health; ideas carry RICE/WSJF. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Portfolio board |
| Main workflow | Score → visualise → decide (decision register) |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Scores 0..100 |
| Data fields | strategic_score, risk_score |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Portfolio map renders only scored projects; unscored projects listed as excluded |
| Priority | Must |
| Dependencies | FR-STR-003 |
| Implementation status | Implemented |
| Api | /api/dashboard/executive |
| Ui | Command centre, Portfolio |
| Tests | TC-RPT-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-STR-005 – Investment scenarios (what-if)

| Attribute | Specification |
|---|---|
| Business objective | Compare funding options |
| Description | Scenario sets that include/exclude candidate investments against envelopes and capacity. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Portfolio planning |
| Main workflow | Create scenario → toggle items → compare |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) scenarios |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned for Phase 3 |
| Priority | Should |
| Dependencies | FR-STR-004 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-STR-006 – Programme management

| Attribute | Specification |
|---|---|
| Business objective | Coordinate related projects |
| Description | Programmes group projects under a portfolio with objective, dates and aggregate progress/BAC; programme lifecycle template available. |
| User roles | Executive; Portfolio manager; PMO manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Programme mandate |
| Main workflow | Create programme → link projects → track |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | programmes |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | str resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners notified of approvals and threshold breaches |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Command centre, portfolio dashboard |
| Integration | BI export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Programme card aggregates BAC and average progress of its projects |
| Priority | Must |
| Dependencies | FR-STR-003 |
| Implementation status | Implemented |
| Api | /api/r/programmes |
| Ui | Programmes |
| Tests | TC-PRJ-PGM (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Programme & project management

### FR-PRJ-001 – Project initiation & charter data

| Attribute | Specification |
|---|---|
| Business objective | Capture what is needed to start well |
| Description | Project record with portfolio, programme, objective, sponsor, manager, type, delivery approach (predictive/agile/hybrid/custom), dates, baselines, BAC, scope, business case, success criteria, criticality. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Approved idea or mandate |
| Main workflow | Create project → complete charter fields → generate charter document |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | end_date ≥ start_date |
| Data fields | projects |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Charter document lists every missing field explicitly |
| Priority | Must |
| Dependencies | FR-STR-003 |
| Implementation status | Implemented |
| Api | /api/r/projects |
| Ui | Projects; Project workspace |
| Tests | TC-RPT-DOC |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-002 – Configurable project lifecycle & stage gates

| Attribute | Specification |
|---|---|
| Business objective | Proportionate governance per project type |
| Description | Templates: full lifecycle (18 stages idea→PIR), agile, AI, regulatory, business change, infrastructure, operational improvement. Each gate has entry/exit criteria, deliverables and approvals. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | PM advances stage |
| Main workflow | See PLT-006 |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Templates are configuration |
| Data fields | workflow_definitions |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planning gate requires approved budget, benefits, reviewed risks and BIA if required |
| Priority | Must |
| Dependencies | FR-PLT-006 |
| Implementation status | Implemented |
| Api | /api/workflows/* |
| Ui | Governance & gates tab |
| Tests | TC-WF-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-003 – Projects support many products (M:N)

| Attribute | Specification |
|---|---|
| Business objective | Products are not projects |
| Description | A project links to one or more products with relationship (delivers/enhances/retires/supports); a product has many projects over its life. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | PM links product |
| Main workflow | Link/unlink → audit |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | No duplicate link |
| Data fields | project_products |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Product shows ≥3 projects; project shows ≥2 products |
| Priority | Must |
| Dependencies | FR-PRD-001 |
| Implementation status | Implemented |
| Api | /api/projects/:id/products |
| Ui | Project → Overview; Product → Projects |
| Tests | TC-PRD-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-004 – Schedule: milestones, deliverables, Gantt

| Attribute | Specification |
|---|---|
| Business objective | Plan and track time |
| Description | Milestones (gates, baseline vs forecast), deliverables with acceptance criteria, dated work items; SVG Gantt with baseline markers and today line. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Planning |
| Main workflow | Create milestones/work → view timeline |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | milestones, deliverables, work_items |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Overdue milestone flagged red with days overdue on command centre |
| Priority | Must |
| Dependencies | FR-PRJ-001 |
| Implementation status | Implemented |
| Api | /api/r/milestones |
| Ui | Plan & timeline tab |
| Tests | TC-RPT-MS (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-005 – Agile & kanban delivery

| Attribute | Specification |
|---|---|
| Business objective | Support adaptive teams |
| Description | Kanban board with drag-and-drop and single-pointer/keyboard move buttons (WCAG 2.5.7), story points, epics/stories/bugs, teams. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Team works items |
| Main workflow | Move card → optimistic update → audit |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Version conflict reverts the card |
| Data fields | work_items.status, board_rank |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Moving a card updates status and is audited; conflict shows error and reverts |
| Priority | Must |
| Dependencies | FR-WRK-001 |
| Implementation status | Implemented |
| Api | PATCH /api/r/work_items |
| Ui | Board tab |
| Tests | TC-WRK-BOARD (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-006 – Earned value & health

| Attribute | Specification |
|---|---|
| Business objective | Objective schedule/cost status |
| Description | PV (linear planned %), EV, AC (base currency), SV, CV, SPI, CPI, EAC, ETC, VAC; health = worst of schedule/cost/risk/milestone RAG with configurable thresholds; missing inputs listed as data gaps. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | On demand |
| Main workflow | Compute from records |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Never green on missing data |
| Data fields | projects, cost_entries, milestones, risks |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Project without BAC/dates shows unknown and lists gaps |
| Priority | Must |
| Dependencies | FR-FIN-002 |
| Implementation status | Implemented |
| Api | /api/projects/:id/evm |
| Ui | Project KPIs |
| Tests | TC-FIN-001, TC-RPT-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-007 – Project closure without closing products

| Attribute | Specification |
|---|---|
| Business objective | Close cleanly, keep products alive |
| Description | Closure requires summary; open high/critical issues or open work need a justification; benefits move to tracking; linked products untouched. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | PM closes project |
| Main workflow | Validate → close → audit |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Status closed only via closure endpoint |
| Data fields | closure_summary, lessons_learned, actual_end |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Closing PRJ leaves product status/lifecycle unchanged; direct PATCH status=closed → 422 |
| Priority | Must |
| Dependencies | FR-PRJ-003 |
| Implementation status | Implemented |
| Api | /api/projects/:id/close |
| Ui | Close action |
| Tests | TC-PRD-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-008 – Stakeholders & communications

| Attribute | Specification |
|---|---|
| Business objective | Engage the right people |
| Description | Stakeholder register with influence/interest and communication plan. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Initiation |
| Main workflow | CRUD |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) stakeholders |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 4 |
| Priority | Should |
| Dependencies | FR-PRJ-001 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-009 – Meetings, minutes & actions

| Attribute | Specification |
|---|---|
| Business objective | Close the loop on decisions |
| Description | Meetings with agenda/minutes; AI extraction of action lines into candidate work items (human accepts). |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Meeting held |
| Main workflow | Record minutes → extract → accept |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | meetings, work_items(action) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Minutes containing “Action:” lines produce suggestions; nothing created until accepted |
| Priority | Should |
| Dependencies | FR-AI-002 |
| Implementation status | Implemented |
| Api | /api/ai/analyse/meeting_actions |
| Ui | AI centre |
| Tests | TC-AI-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRJ-010 – Lessons learned & PIR

| Attribute | Specification |
|---|---|
| Business objective | Organisational learning |
| Description | Lessons learned on closure; post-implementation review stage in lifecycle. |
| User roles | Project manager; PMO manager; Sponsor; Team member |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Closure |
| Main workflow | Capture → closure report |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | lessons_learned |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prj resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignees, owners and approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Project workspace, status report, portfolio health |
| Integration | Jira / Azure DevOps (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Closure report includes lessons or flags MISSING |
| Priority | Should |
| Dependencies | FR-PRJ-007 |
| Implementation status | Implemented |
| Api | /api/documents/generate |
| Ui | Documents |
| Tests | TC-RPT-DOC |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Product management & discovery

### FR-PRD-001 – Product catalogue & lifecycle

| Attribute | Specification |
|---|---|
| Business objective | Manage products over their lifetime |
| Description | Products with line, portfolio, lifecycle stage (concept→retired), vision, strategy, target users, pricing, criticality, health, tech-debt, adoption, NPS, retirement date; product versions. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Product created |
| Main workflow | Create → progress lifecycle via New product workflow |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Independent of projects |
| Data fields | products, product_versions |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Product persists after all its projects close |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/products |
| Ui | Products |
| Tests | TC-PRD-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-002 – Idea intake & feedback

| Attribute | Specification |
|---|---|
| Business objective | Capture demand with evidence |
| Description | Ideas (source incl. ai_suggested, problem, hypothesis, evidence), customer feedback linked to ideas with sentiment. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Idea submitted |
| Main workflow | Capture → triage → link feedback |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | ideas, feedback |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Feedback linked to idea appears in product discovery |
| Priority | Must |
| Dependencies | FR-PRD-001 |
| Implementation status | Implemented |
| Api | /api/r/ideas/feedback |
| Ui | Discovery |
| Tests | TC-PRD-IDEA (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-003 – Prioritisation (RICE, WSJF)

| Attribute | Specification |
|---|---|
| Business objective | Transparent prioritisation |
| Description | RICE = R×I×C÷E and WSJF = CoD÷effort computed server-side; unscored ideas excluded from matrix and declared. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Scoring |
| Main workflow | Score → matrix → top list |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Effort > 0, confidence 0..1 |
| Data fields | reach, impact, confidence, effort, cost_of_delay |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | RICE matches formula; unscored ideas counted separately |
| Priority | Must |
| Dependencies | FR-PRD-002 |
| Implementation status | Implemented |
| Api | decorated list |
| Ui | Discovery matrix |
| Tests | TC-CALC-RICE |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-004 – Discovery: hypotheses & experiments

| Attribute | Specification |
|---|---|
| Business objective | Validate before building |
| Description | Experiments with hypothesis, metric, threshold, result and outcome (validated/invalidated/inconclusive). |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Discovery |
| Main workflow | Design → run → record outcome |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | experiments |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Validated experiment visible on idea |
| Priority | Should |
| Dependencies | FR-PRD-002 |
| Implementation status | Implemented |
| Api | /api/r/experiments |
| Ui | Discovery |
| Tests | TC-PRD-EXP (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-005 – Product roadmap

| Attribute | Specification |
|---|---|
| Business objective | Communicate intent |
| Description | Roadmap items by lane (Now/Next/Later) with dates, confidence, objective and source idea; lane board and timeline. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Roadmap review |
| Main workflow | Plan → publish |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | roadmap_items |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Roadmap shows lanes and timeline from records |
| Priority | Must |
| Dependencies | FR-PRD-003 |
| Implementation status | Implemented |
| Api | /api/r/roadmap_items |
| Ui | Product → Roadmap |
| Tests | TC-PRD-RM (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-006 – Product financials, analytics & health

| Attribute | Specification |
|---|---|
| Business objective | Run products as investments |
| Description | Run budgets/costs per product, health and tech-debt scores, active users, NPS; operational work by product. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Monthly review |
| Main workflow | Record → review |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | budgets/cost_entries (context=product) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Product financials tab reconciles like projects |
| Priority | Should |
| Dependencies | FR-FIN-001 |
| Implementation status | Implemented |
| Api | /api/finance/summary |
| Ui | Product → Financials |
| Tests | TC-FIN-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-PRD-007 – Product retirement

| Attribute | Specification |
|---|---|
| Business objective | Retire deliberately |
| Description | Retirement stage in product workflow requiring portfolio approval; retiring projects linked with relationship=retires. |
| User roles | Product manager; Business analyst; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Decline stage |
| Main workflow | Workflow → approval |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | retirement_date |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | prd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Product owner on new feedback/ideas |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Product workspace, discovery funnel |
| Integration | Product analytics import (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Retirement requires approval gate |
| Priority | Should |
| Dependencies | FR-PLT-006 |
| Implementation status | Implemented (workflow) |
| Api | /api/workflows/* |
| Ui | Product record → Workflow |
| Tests | TC-WF-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Business analysis & process

### FR-BA-001 – Requirements management with quality checks

| Attribute | Specification |
|---|---|
| Business objective | Testable, traceable requirements |
| Description | Requirements (business/functional/NFR/regulatory/BC-DR) per project or product with MoSCoW, acceptance criteria, process and objective links; deterministic quality flags (vague terms, missing AC, no imperative, compound). |
| User roles | Business analyst; Process owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | BA writes requirement |
| Main workflow | Save → quality flags computed |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | requirements.quality_flags |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ba resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Requirement owners on review |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Requirement quality, process repository |
| Integration | BPMN import/export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | “fast and user-friendly” without AC flagged; well-formed requirement scores 100 |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/requirements |
| Ui | Requirements tab |
| Tests | TC-CALC-RQ |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BA-002 – Business process repository & maps

| Attribute | Specification |
|---|---|
| Business objective | Understand how work flows |
| Description | Processes with owner, department, service, capability, as-is/to-be, version, automation potential, criticality; steps with lanes/types/next steps rendered as swimlane map. |
| User roles | Business analyst; Process owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Process modelling |
| Main workflow | Define steps → render map |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | business_processes, process_steps |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ba resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Requirement owners on review |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Requirement quality, process repository |
| Integration | BPMN import/export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Swimlane renders start/task/decision/end from steps |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/business_processes/process_steps |
| Ui | Processes |
| Tests | TC-BA-PROC (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BA-003 – BPMN 2.0 import/export

| Attribute | Specification |
|---|---|
| Business objective | Interoperate with BPM tools |
| Description | Store BPMN XML; import/export with a BPMN modeller (bpmn-js candidate, licence to verify). |
| User roles | Business analyst; Process owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Modelling |
| Main workflow | Upload XML → render |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | bpmn_xml |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ba resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Requirement owners on review |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Requirement quality, process repository |
| Integration | BPMN import/export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 8 |
| Priority | Could |
| Dependencies | FR-BA-002 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BA-004 – End-to-end traceability

| Attribute | Specification |
|---|---|
| Business objective | Prove coverage |
| Description | Objective → requirement → work item → test case → execution → evidence → approval links held in the shared model. |
| User roles | Business analyst; Process owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Audit/UAT |
| Main workflow | Link records → trace |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | requirement_id on work_items/test_cases |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ba resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Requirement owners on review |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Requirement quality, process repository |
| Integration | BPMN import/export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Test cases reference requirements; matrix export planned |
| Priority | Must |
| Dependencies | FR-BA-001 |
| Implementation status | Partial |
| Api | /api/r/* |
| Ui | Requirements & quality tab |
| Tests | TC-QRL-TRACE (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## BIA & operational resilience

### FR-BIA-001 – Integrated BIA screening

| Attribute | Specification |
|---|---|
| Business objective | BIA from the beginning, proportionately |
| Description | Project screening (6 questions) scores BIA need → none/light/full, records bia_required and auto-creates a draft BIA linked to the project/product; notifies BC managers; lifecycle gates enforce screening and approval when required. |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Project intake |
| Main workflow | Answer → score → draft BIA → gate check |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Score ≥5 full, ≥2 light |
| Data fields | projects.bia_required |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Screening with 3 positive answers creates draft BIA; planning gate blocks until BIA approved |
| Priority | Must |
| Dependencies | FR-PLT-006 |
| Implementation status | Implemented |
| Api | /api/projects/:id/bia-screening |
| Ui | Project → BIA screening |
| Tests | TC-BIA-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BIA-002 – Impact-over-time assessment & MTPD derivation

| Attribute | Specification |
|---|---|
| Business objective | Evidence-based recovery objectives |
| Description | Severity (0..5) by category (financial, operational, regulatory, customer, reputational) × horizon; MTPD derived as earliest horizon reaching tolerance; criticality tier from MTPD; override requires justification. |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | BC analyst edits matrix |
| Main workflow | Edit → recompute MTPD/tier → re-approval if approved |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | RTO must be ≤ MTPD |
| Data fields | bia_impacts, mtpd_hours, criticality_tier |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Raising regulatory@24h to 5 sets MTPD 24h and flags RTO 72h > MTPD |
| Priority | Must |
| Dependencies | FR-BIA-001 |
| Implementation status | Implemented |
| Api | /api/bia/:id/impacts |
| Ui | BIA detail → Impact |
| Tests | TC-BIA-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BIA-003 – Dependencies & recovery strategies

| Attribute | Specification |
|---|---|
| Business objective | Know what recovery depends on |
| Description | People/application/infrastructure/data/third-party/facility dependencies with demonstrated recovery and data-loss capability and SPOF flag; recovery strategies with achievable RTO and test evidence. |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | BIA |
| Main workflow | Add deps/strategies → validate gaps |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Dependency recovery > RTO is an error |
| Data fields | bia_dependencies, recovery_strategies |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Dependency recovering in 12h vs RTO 8h flagged DEP_RTO_GAP |
| Priority | Must |
| Dependencies | FR-BIA-002 |
| Implementation status | Implemented |
| Api | /api/bia/:id/dependencies |
| Ui | BIA detail |
| Tests | TC-BIA-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BIA-004 – Resilience traceability chain

| Attribute | Specification |
|---|---|
| Business objective | Process → service → product → infrastructure → data → vendor → recovery |
| Description | Traceability view assembles chains and lists gaps (no service, no product, no BIA, no strategy). |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | On demand |
| Main workflow | Compute chain |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Card payment authorisation chain complete including vendor and recovery |
| Priority | Must |
| Dependencies | FR-BIA-003 |
| Implementation status | Implemented |
| Api | /api/bia/traceability |
| Ui | Resilience → Traceability map |
| Tests | TC-BIA-004 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BIA-005 – BIA approval & periodic review

| Attribute | Specification |
|---|---|
| Business objective | Governed, current BIAs |
| Description | BIA submission blocked while blocking findings exist; approval by BC manager sets next review date; review-due notifications; edits after approval revert to draft. |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Submission / schedule |
| Main workflow | Submit → approve → schedule review |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | approved_by, next_review_date |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Submit with RTO>MTPD → 422; overdue review counted on dashboard |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/bia/:id/submit |
| Ui | BIA → Details & approval |
| Tests | TC-BIA-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-BIA-006 – BC/DR test management

| Attribute | Specification |
|---|---|
| Business objective | Prove recovery works |
| Description | Exercise plans, scenarios, results and corrective actions linked to strategies. |
| User roles | BC manager; Process owner; Operations |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Exercise cycle |
| Main workflow | Plan → run → record |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) bc_exercises |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | bia resources: read/write/delete per role; governed transitions via approval only |
| Notifications | BC function when a BIA is required or review is due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Resilience dashboard, BIA report |
| Integration | CMDB / monitoring (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Strategy test date/result recorded today; full exercise module planned |
| Priority | Should |
| Dependencies | FR-BIA-003 |
| Implementation status | Partial |
| Api | /api/r/recovery_strategies |
| Ui | Recovery tab |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Work & operational management

### FR-WRK-001 – Unified work items incl. BAU and operations

| Attribute | Specification |
|---|---|
| Business objective | Not all work is a project |
| Description | Work types: task, story, epic, bug, incident, service request, problem, maintenance, infrastructure/application change, security remediation, compliance action, recurring, service improvement, BAU, action. Context may be project, product, programme, portfolio, service or none. |
| User roles | Team member; Operations; Service owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Work arises |
| Main workflow | Create with context → assign → track |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | context none ⇒ no parent |
| Data fields | work_items |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | wrk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignee on assignment |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | My work, operations dashboard |
| Integration | ServiceNow / Jira SM (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Incident linked to a service and BAU item with no parent both save |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/work_items |
| Ui | Operational work; My work |
| Tests | TC-WRK-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-WRK-002 – My work & role landing pages

| Attribute | Specification |
|---|---|
| Business objective | Focus on what needs me |
| Description | My work page: approvals awaiting me, assigned items, due soon, personal board; dashboard default by permission. |
| User roles | Team member; Operations; Service owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Sign-in |
| Main workflow | Load personal queues |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | wrk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignee on assignment |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | My work, operations dashboard |
| Integration | ServiceNow / Jira SM (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | User without dashboard permission lands on My work |
| Priority | Should |
| Dependencies | FR-WRK-001 |
| Implementation status | Implemented |
| Api | /api/approvals?scope=mine |
| Ui | My work |
| Tests | TC-UX-LAND (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-WRK-003 – SLA & recurring work

| Attribute | Specification |
|---|---|
| Business objective | Operational discipline |
| Description | SLA due timestamp and recurrence rule (RFC 5545 subset) on work items; auto-generation of recurrences planned. |
| User roles | Team member; Operations; Service owner |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Operations |
| Main workflow | Set SLA/recurrence |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | sla_due_at, recurrence_rule |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | wrk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assignee on assignment |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | My work, operations dashboard |
| Integration | ServiceNow / Jira SM (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned: recurrence generator job |
| Priority | Should |
| Dependencies | FR-WRK-001 |
| Implementation status | Partial |
| Api | /api/r/work_items |
| Ui | Operational work |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Resource & capacity

### FR-RES-001 – Allocations across projects, products, programmes and BAU

| Attribute | Specification |
|---|---|
| Business objective | One view of demand |
| Description | Allocations by person, context, role, % and dates; soft (requested) vs hard (committed). |
| User roles | Resource manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Resource request |
| Main workflow | Allocate → capacity check |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | 0<%≤100 per allocation |
| Data fields | resource_allocations |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | res resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Resource manager on conflicts (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Capacity heatmap, demand |
| Integration | HR system (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Allocation to BAU without context id saves |
| Priority | Must |
| Dependencies | FR-PLT-003 |
| Implementation status | Implemented |
| Api | /api/r/resource_allocations |
| Ui | Resources |
| Tests | TC-RES-001 (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RES-002 – Capacity, utilisation & conflict detection

| Attribute | Specification |
|---|---|
| Business objective | Avoid burnout and slippage |
| Description | Weekly allocated % vs available % (leave removes 20%/working day); over-allocation conflicts listed; demand by context. |
| User roles | Resource manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | On demand |
| Main workflow | Compute weekly load |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | availability |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | res resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Resource manager on conflicts (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Capacity heatmap, demand |
| Integration | HR system (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Two overlapping 70%+50% allocations flagged as 120% conflict |
| Priority | Must |
| Dependencies | FR-RES-001 |
| Implementation status | Implemented |
| Api | /api/resources/capacity |
| Ui | Capacity heatmap |
| Tests | TC-CALC-LOAD |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RES-003 – Skills & competency matching

| Attribute | Specification |
|---|---|
| Business objective | Staff work with the right skills |
| Description | Skills and proficiency per user; skills-gap analysis vs demand planned. |
| User roles | Resource manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Staffing |
| Main workflow | Match |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | user_skills |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | res resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Resource manager on conflicts (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Capacity heatmap, demand |
| Integration | HR system (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 7 |
| Priority | Could |
| Dependencies | FR-RES-001 |
| Implementation status | Partial |
| Api | /api/r/skills |
| Ui | Admin |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Financial & benefits

### FR-FIN-001 – Budgets (capex/opex) with financial approval

| Attribute | Specification |
|---|---|
| Business objective | Control spend |
| Description | Budget lines per portfolio/programme/project/product, fiscal year, capex/opex, CBS; approval via delegated authority; approved status only via approval. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Budget submission |
| Main workflow | Draft → submit → approve/reject |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Guarded status |
| Data fields | budgets |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Submitting 1.5M routes to portfolio manager; direct PATCH approved → 422 |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/budgets/:id/submit |
| Ui | Finance; Project finance tab |
| Tests | TC-GOV-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-FIN-002 – Actuals, commitments, forecasts & reconciliation

| Attribute | Specification |
|---|---|
| Business objective | Know where money goes |
| Description | Cost entries by kind, category, CBS, vendor/contract/PO/invoice; EAC = actual + commitments + forecast; VAC = approved − EAC; roll-up portfolio→programme→project/product. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Monthly close / ERP import |
| Main workflow | Post entries → reconcile |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Missing approved budget ⇒ null, not 0 |
| Data fields | cost_entries |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Summary equals SQL sums; no-budget project returns null |
| Priority | Must |
| Dependencies | FR-FIN-001 |
| Implementation status | Implemented |
| Api | /api/finance/summary |
| Ui | Finance |
| Tests | TC-FIN-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-FIN-003 – Multi-currency

| Attribute | Specification |
|---|---|
| Business objective | Operate across currencies |
| Description | Entries in any currency converted with latest recorded FX rate to base currency; unconverted entries counted, never silently dropped into totals as zero without disclosure. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Posting |
| Main workflow | Convert at report time |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | fx_rates |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | USD entry converted at 4.45; unconverted count 0 |
| Priority | Must |
| Dependencies | FR-FIN-002 |
| Implementation status | Implemented |
| Api | /api/finance/summary |
| Ui | Finance |
| Tests | TC-FIN-004 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-FIN-004 – Business case appraisal

| Attribute | Specification |
|---|---|
| Business objective | Invest on evidence |
| Description | Business cases with options, recommendation, discount rate, cash flows, TCO; NPV, IRR (undefined if no sign change), payback, ROI. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Investment request |
| Main workflow | Enter → evaluate → approve |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | business_cases |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | NPV/IRR/payback match reference calculations |
| Priority | Must |
| Dependencies | FR-FIN-001 |
| Implementation status | Implemented |
| Api | /api/business-cases/:id/evaluate |
| Ui | Finance → Business cases |
| Tests | TC-FIN-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-FIN-005 – Benefits realisation

| Attribute | Specification |
|---|---|
| Business objective | Deliver value, not just outputs |
| Description | Benefits (financial/non-financial) with baseline, target, actual, measurement method, owner, realisation window; % realisation; handover to tracking at closure. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Benefit planning / measurement |
| Main workflow | Define → measure → report |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | benefits |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Realisation % null when actual missing; closure moves planned→tracking |
| Priority | Must |
| Dependencies | FR-PRJ-007 |
| Implementation status | Implemented |
| Api | /api/r/benefits |
| Ui | Finance → Benefits |
| Tests | TC-RPT-BEN (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-FIN-006 – Cost of delay & TCO

| Attribute | Specification |
|---|---|
| Business objective | Economic prioritisation |
| Description | Cost of delay on ideas (WSJF) and TCO on business cases. |
| User roles | Finance controller; Portfolio manager; Project manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Prioritisation |
| Main workflow | Record → compute |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | cost_of_delay, total_cost_of_ownership |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | fin resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers on submission; requester on decision |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Finance workspace, EVM, benefits |
| Integration | ERP actuals import (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | WSJF computed when CoD and effort present |
| Priority | Should |
| Dependencies | FR-PRD-003 |
| Implementation status | Implemented |
| Api | decorated |
| Ui | Discovery |
| Tests | TC-CALC-RICE |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## RAID & change control

### FR-RSK-001 – Risk register (all levels) with scoring & residual

| Attribute | Specification |
|---|---|
| Business objective | Manage uncertainty |
| Description | Risks at enterprise/portfolio/programme/project/product/service level; category; cause/effect; L×I inherent and residual scores; treatment; heatmap drill-down. |
| User roles | PMO manager; Project manager; Risk owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Risk identified |
| Main workflow | Log → assess → treat → review |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Likelihood/impact 1..5 |
| Data fields | risks |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rsk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assessors on CR creation; approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Risk heatmap, change dashboard |
| Integration | GRC export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Heatmap counts equal open risks; cell click filters register |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/risks |
| Ui | RAID |
| Tests | TC-RPT-HEAT |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RSK-002 – Risk acceptance requires human approval

| Attribute | Specification |
|---|---|
| Business objective | No silent risk acceptance |
| Description | Treatment “accept” only after an approved acceptance request; score ≥15 escalates to executive. |
| User roles | PMO manager; Project manager; Risk owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Owner requests acceptance |
| Main workflow | Request → approve → treatment=accept |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Direct edit to accept rejected |
| Data fields | acceptance_status |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rsk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assessors on CR creation; approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Risk heatmap, change dashboard |
| Integration | GRC export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | PATCH treatment=accept → 422; approval sets accept |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/risks/:id/request-acceptance |
| Ui | Record → Workflow |
| Tests | TC-GOV-005 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RSK-003 – Issues, assumptions & dependencies

| Attribute | Specification |
|---|---|
| Business objective | Complete RAID |
| Description | Issues (severity, resolution, from risk), assumptions (validation), dependencies between projects/products/milestones/releases/vendors with need-by dates. |
| User roles | PMO manager; Project manager; Risk owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | RAID review |
| Main workflow | CRUD |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | No self-dependency |
| Data fields | issues, assumptions, dependencies |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rsk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assessors on CR creation; approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Risk heatmap, change dashboard |
| Integration | GRC export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Self-dependency rejected by constraint |
| Priority | Must |
| Dependencies | FR-RSK-001 |
| Implementation status | Implemented |
| Api | /api/r/* |
| Ui | RAID |
| Tests | TC-PLT-VAL |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RSK-004 – Change requests with automatic impact assessments

| Attribute | Specification |
|---|---|
| Business objective | Controlled change |
| Description | A CR (scope/schedule/budget/business/IT/infrastructure) creates impact assessments by rule: schedule, cost, scope, risk always; BIA for critical contexts or IT/business change; security & operations for IT/infra; vendor where contracts exist. CR moves to pending approval when all complete; submission routes by cost to change authority with finance in parallel; approval applies schedule impact and records forecast cost. |
| User roles | PMO manager; Project manager; Risk owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | CR raised |
| Main workflow | Create → assess → submit → approve → apply |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Submit blocked while assessments pending |
| Data fields | change_requests, impact_assessments |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rsk resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Assessors on CR creation; approvers |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Risk heatmap, change dashboard |
| Integration | GRC export (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | IT change on payments creates 8 areas incl. BIA; approval extends project end date by impact days |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/change-requests/:id/submit |
| Ui | Change control |
| Tests | TC-CHG-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Quality, release & transition

### FR-QRL-001 – Test planning, cases & execution

| Attribute | Specification |
|---|---|
| Business objective | Evidence-based quality |
| Description | Test plans per project/product/release and level (unit…UAT, OAT) with thresholds and business owner; cases linked to requirements; executions with evidence; failed execution auto-raises a defect. |
| User roles | Tester; Release manager; Business owner; Operations; CAB |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Testing |
| Main workflow | Plan → design → execute → defect |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | UAT sign-off by business owner, not PMO |
| Data fields | test_plans, test_cases, test_executions, defects |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | qrl resources: read/write/delete per role; governed transitions via approval only |
| Notifications | CAB and operations on submission |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Release readiness, test progress |
| Integration | CI/CD, GitHub/GitLab (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Failed execution creates one defect |
| Priority | Must |
| Dependencies | FR-BA-004 |
| Implementation status | Implemented |
| Api | /api/r/test_* |
| Ui | Quality & release |
| Tests | TC-REL-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-QRL-002 – Release readiness & CAB

| Attribute | Specification |
|---|---|
| Business objective | Release safely |
| Description | Readiness computed from linked plans meeting thresholds, UAT signed off, no open critical/high defects, rollback and deployment plans, CAB approval, business validation and operational acceptance. CAB approval via cab + operations roles. |
| User roles | Tester; Release manager; Business owner; Operations; CAB |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Release candidate |
| Main workflow | Compute → submit CAB → approve |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | releases |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | qrl resources: read/write/delete per role; governed transitions via approval only |
| Notifications | CAB and operations on submission |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Release readiness, test progress |
| Integration | CI/CD, GitHub/GitLab (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Mobile 3.0 not ready (rollback, CAB, UAT, defects); Field 1.0 ready after CAB |
| Priority | Must |
| Dependencies | FR-QRL-001 |
| Implementation status | Implemented |
| Api | /api/releases/:id/readiness/submit-cab |
| Ui | Release readiness |
| Tests | TC-REL-001..002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-QRL-003 – Human-authorised deployment & hypercare

| Attribute | Specification |
|---|---|
| Business objective | No automatic production deployment |
| Description | Deployment recorded only by a human with releases:deploy when readiness passes; hypercare days and support model captured. |
| User roles | Tester; Release manager; Business owner; Operations; CAB |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Go decision |
| Main workflow | Authorise → record → hypercare |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | AI/system actors refused |
| Data fields | deployments, releases.status |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | qrl resources: read/write/delete per role; governed transitions via approval only |
| Notifications | CAB and operations on submission |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Release readiness, test progress |
| Integration | CI/CD, GitHub/GitLab (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Deploy without readiness → 422; without permission → 403 |
| Priority | Must |
| Dependencies | FR-QRL-002 |
| Implementation status | Implemented |
| Api | /api/releases/:id/deploy |
| Ui | Release readiness |
| Tests | TC-REL-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-QRL-004 – Operational handover / service transition

| Attribute | Specification |
|---|---|
| Business objective | Operations ready to run it |
| Description | Operational acceptance and knowledge-transfer flags gate lifecycle handover stage (operations approval). |
| User roles | Tester; Release manager; Business owner; Operations; CAB |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Pre-go-live |
| Main workflow | Accept → handover gate |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | operational_acceptance, knowledge_transfer_done |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | qrl resources: read/write/delete per role; governed transitions via approval only |
| Notifications | CAB and operations on submission |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Release readiness, test progress |
| Integration | CI/CD, GitHub/GitLab (mock adapters) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Handover gate fails until all releases accepted |
| Priority | Must |
| Dependencies | FR-QRL-002 |
| Implementation status | Implemented |
| Api | /api/workflows/* |
| Ui | Governance tab |
| Tests | TC-WF-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Vendor, procurement & contract

### FR-VND-001 – Vendor catalogue & due diligence

| Attribute | Specification |
|---|---|
| Business objective | Know your third parties |
| Description | Vendors with category, country, risk rating, due-diligence status/date, performance score, exit plan. |
| User roles | Procurement officer; Finance controller |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Onboarding |
| Main workflow | Register → diligence → approve |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | vendors |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | vnd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Contract owner before renewal notice window |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Contract runway, vendor risk |
| Integration | Procurement / ERP (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Expired due diligence visible |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/vendors |
| Ui | Vendors |
| Tests | TC-VND-001 (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-VND-002 – Contract register & renewal alerts

| Attribute | Specification |
|---|---|
| Business objective | No surprise expiries |
| Description | Contracts with value, currency, dates, notice period, SLA, auto-renew; days to expiry computed; job marks expiring/expired and notifies owners. |
| User roles | Procurement officer; Finance controller |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Daily job |
| Main workflow | Check → notify |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | contracts |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | vnd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Contract owner before renewal notice window |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Contract runway, vendor risk |
| Integration | Procurement / ERP (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Contract inside notice window notified once and set expiring |
| Priority | Must |
| Dependencies | FR-VND-001 |
| Implementation status | Implemented |
| Api | /api/r/contracts |
| Ui | Vendors |
| Tests | TC-PLT-008 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-VND-003 – Purchase requests & invoices

| Attribute | Specification |
|---|---|
| Business objective | Controlled procurement |
| Description | Purchase requests with quotations and evaluation, procurement approval by amount, PO number; invoices unique per vendor+number. |
| User roles | Procurement officer; Finance controller |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Purchase need |
| Main workflow | Request → evaluate → approve → order → invoice |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Duplicate invoice number rejected |
| Data fields | purchase_requests, invoices |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | vnd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Contract owner before renewal notice window |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Contract runway, vendor risk |
| Integration | Procurement / ERP (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Second invoice with same number → 409 |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/purchase-requests/:id/submit |
| Ui | Finance/Vendors |
| Tests | TC-VND-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-VND-004 – Tender evaluation & vendor performance reviews

| Attribute | Specification |
|---|---|
| Business objective | Objective selection |
| Description | Weighted tender scoring and periodic performance reviews. |
| User roles | Procurement officer; Finance controller |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Tender |
| Main workflow | Score |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | vnd resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Contract owner before renewal notice window |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Contract runway, vendor risk |
| Integration | Procurement / ERP (mock adapter) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 7 |
| Priority | Could |
| Dependencies | FR-VND-003 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Governance, risk & compliance

### FR-GOV-001 – Decision register & governance forums

| Attribute | Specification |
|---|---|
| Business objective | Decisions are recorded and visible |
| Description | Decisions with forum, rationale, decided by/on, needs-attention flag and due date; executive attention list. |
| User roles | Auditor; Security officer; PMO manager; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Forum meeting |
| Main workflow | Record → track |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | decisions |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | gov resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers; escalation to PMO when overdue |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Governance workspace, audit trail |
| Integration | GRC tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Pending decisions needing attention appear on command centre |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/r/decisions |
| Ui | Governance |
| Tests | TC-RPT-DEC (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-GOV-002 – Controls, obligations & findings

| Attribute | Specification |
|---|---|
| Business objective | Compliance evidence, not claims |
| Description | Controls (framework reference only), effectiveness and test dates; obligations (e.g. Malaysia PDPA 2024 amendments) with status; audit findings with CAPA. Mapping is not a certification claim. |
| User roles | Auditor; Security officer; PMO manager; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Compliance cycle |
| Main workflow | Register → assess → evidence |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | controls, obligations, audit_findings, risk_controls |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | gov resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers; escalation to PMO when overdue |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Governance workspace, audit trail |
| Integration | GRC tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | UI states mapping ≠ compliance |
| Priority | Must |
| Dependencies | FR-RSK-001 |
| Implementation status | Implemented |
| Api | /api/r/controls/obligations/audit_findings |
| Ui | Governance |
| Tests | TC-GOV-CTL (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-GOV-003 – Delegation of authority matrix

| Attribute | Specification |
|---|---|
| Business objective | Clear approval limits |
| Description | Configurable role × approval type × max amount; used by routing and decision checks. |
| User roles | Auditor; Security officer; PMO manager; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Admin |
| Main workflow | Configure |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Unlimited = null |
| Data fields | approval_matrix |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | gov resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers; escalation to PMO when overdue |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Governance workspace, audit trail |
| Integration | GRC tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Routing picks lowest role with sufficient limit |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/admin/approval-matrix |
| Ui | Admin → Thresholds & authority |
| Tests | TC-GOV-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-GOV-004 – Policy register & attestations

| Attribute | Specification |
|---|---|
| Business objective | Policy lifecycle |
| Description | Policies with owners, review cycles and periodic attestations. |
| User roles | Auditor; Security officer; PMO manager; Executive |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Policy cycle |
| Main workflow | Publish → attest |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) policies |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | gov resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Approvers; escalation to PMO when overdue |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Governance workspace, audit trail |
| Integration | GRC tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 8 |
| Priority | Should |
| Dependencies | FR-GOV-002 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Documents & knowledge

### FR-DOC-001 – Document generation from structured data

| Attribute | Specification |
|---|---|
| Business objective | Documents without invented facts |
| Description | Generators: project charter, status report, RAID log, closure report, BIA report, business case, release readiness/CAB pack. Missing data rendered as MISSING markers and listed; source records cited; output is a new draft version. |
| User roles | All roles (per permission); Document owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User generates |
| Main workflow | Assemble → render → version |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Never fabricate values |
| Data fields | documents, document_versions(source_refs, missing_fields) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | doc resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners on review due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Document library |
| Integration | SharePoint / OneDrive (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Charter for project without sponsor lists “Sponsor” missing; regenerate increments version |
| Priority | Must |
| Dependencies | FR-PLT-004 |
| Implementation status | Implemented |
| Api | /api/documents/generate |
| Ui | Documents |
| Tests | TC-RPT-DOC |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-DOC-002 – Versioning, classification & approval

| Attribute | Specification |
|---|---|
| Business objective | Controlled documents |
| Description | Versions with change notes, classification, owner, review due, approval via document approval. |
| User roles | All roles (per permission); Document owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Edit / submit |
| Main workflow | New version → submit → approve |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Approved status via approval only |
| Data fields | documents |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | doc resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners on review due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Document library |
| Integration | SharePoint / OneDrive (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Submitting moves to in_review; approval sets approved |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/documents/:id/versions/submit |
| Ui | Documents |
| Tests | TC-DOC-002 (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-DOC-003 – File attachments with scanning

| Attribute | Specification |
|---|---|
| Business objective | Evidence storage |
| Description | Object/file storage with SHA-256, MIME validation and malware scanning status before release. |
| User roles | All roles (per permission); Document owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Upload |
| Main workflow | Upload → scan → link |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Infected files quarantined |
| Data fields | files |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | doc resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners on review due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Document library |
| Integration | SharePoint / OneDrive (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 8 (table exists) |
| Priority | Should |
| Dependencies | FR-DOC-002 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-DOC-004 – SOPs, user guides & knowledge search

| Attribute | Specification |
|---|---|
| Business objective | Operational knowledge |
| Description | SOP and user-guide document types; full-text search planned (PostgreSQL FTS). |
| User roles | All roles (per permission); Document owners |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Authoring |
| Main workflow | Write → approve → publish |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | documents |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | doc resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Owners on review due |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Document library |
| Integration | SharePoint / OneDrive (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | SOP stored as approved document version |
| Priority | Should |
| Dependencies | FR-DOC-002 |
| Implementation status | Partial |
| Api | /api/r/documents |
| Ui | Documents |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## AI-assisted decision intelligence

### FR-AI-001 – Controlled AI assistant with citations

| Attribute | Specification |
|---|---|
| Business objective | Faster insight without losing control |
| Description | Ask questions; retrieval is permission-trimmed; answers cite record codes with confidence; disclaimer; providers pluggable (local rules default; Anthropic; self-hosted OpenAI-compatible). |
| User roles | All roles with ai:use |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User asks |
| Main workflow | Retrieve → (optional LLM) → cite → log |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | External providers only when explicitly allowed; restricted/confidential never sent externally; monthly token budget |
| Data fields | ai_interactions |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ai resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None (pull-based) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | AI interaction log |
| Integration | Model providers via abstraction (local default) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Answer has citations; tester cannot retrieve budgets; interaction logged |
| Priority | Must |
| Dependencies | FR-PLT-002 |
| Implementation status | Implemented |
| Api | /api/ai/ask |
| Ui | AI centre |
| Tests | TC-AI-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-AI-002 – Guided analyses

| Attribute | Specification |
|---|---|
| Business objective | Repeatable intelligence |
| Description | Portfolio insights, project insight, risk identification, requirement quality, release readiness, meeting action extraction – deterministic and cited. |
| User roles | All roles with ai:use |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | User runs analysis |
| Main workflow | Compute → suggestions |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Suggestions are not records |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ai resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None (pull-based) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | AI interaction log |
| Integration | Model providers via abstraction (local default) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Risk identification on AI project suggests privacy/security risks |
| Priority | Must |
| Dependencies | FR-AI-001 |
| Implementation status | Implemented |
| Api | /api/ai/analyse/:capability |
| Ui | AI centre; Project AI insight |
| Tests | TC-AI-003 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-AI-003 – Human-in-the-loop for AI suggestions & no AI authority

| Attribute | Specification |
|---|---|
| Business objective | AI never decides |
| Description | AI cannot approve, accept risk, change finance or deploy (server-enforced); accepting a suggestion is a human action that creates a draft via normal permissions. |
| User roles | All roles with ai:use |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Accept suggestion |
| Main workflow | Human accepts → createRow as user |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Only own interactions |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ai resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None (pull-based) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | AI interaction log |
| Integration | Model providers via abstraction (local default) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | AI actor decide → error; another user cannot accept your interaction |
| Priority | Must |
| Dependencies | FR-PLT-007 |
| Implementation status | Implemented |
| Api | /api/ai/accept-suggestion |
| Ui | Project AI insight |
| Tests | TC-AI-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-AI-004 – Prompt-injection & data controls

| Attribute | Specification |
|---|---|
| Business objective | Safe retrieval |
| Description | Detection of injection patterns in questions and retrieved content; retrieved text treated as delimited untrusted data; flags shown and logged. |
| User roles | All roles with ai:use |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Each query |
| Main workflow | Scan → flag |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | injection_flags |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ai resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None (pull-based) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | AI interaction log |
| Integration | Model providers via abstraction (local default) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | “Ignore previous instructions…” flagged |
| Priority | Must |
| Dependencies | FR-AI-001 |
| Implementation status | Implemented |
| Api | /api/ai/ask |
| Ui | AI centre |
| Tests | TC-AI-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-AI-005 – RAG over documents with embeddings

| Attribute | Specification |
|---|---|
| Business objective | Deeper knowledge search |
| Description | Vector index (pgvector) over approved documents with permission filters. |
| User roles | All roles with ai:use |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | (planned) |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | ai resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None (pull-based) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | AI interaction log |
| Integration | Model providers via abstraction (local default) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned Phase 10 – needs approval (DEC-07) |
| Priority | Should |
| Dependencies | FR-DOC-004 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Integration framework

### FR-INT-001 – Outbound event queue with retry & dead-letter

| Attribute | Specification |
|---|---|
| Business objective | Reliable integration |
| Description | Events queued per integration with idempotency keys, exponential backoff, max attempts, dead-letter and manual retry; logs per event. |
| User roles | Administrator; Integration service account |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Domain event / test |
| Main workflow | Enqueue → deliver → retry/dead-letter |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Duplicate idempotency key ignored |
| Data fields | integrations, integration_events |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | int resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Administrators on dead letters (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Integration health |
| Integration | All connectors |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Simulated failure retries then dead-letters; retry re-queues |
| Priority | Must |
| Dependencies | - |
| Implementation status | Implemented |
| Api | /api/integrations/* |
| Ui | Admin → Integrations |
| Tests | TC-INT-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-INT-002 – Signed inbound webhooks with mapping & de-duplication

| Attribute | Specification |
|---|---|
| Business objective | Safe inbound sync |
| Description | HMAC-SHA256 signatures (live) / explicit mock header; field mapping; de-duplication by external id+version; upsert work items. |
| User roles | Administrator; Integration service account |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | External system posts |
| Main workflow | Verify → map → upsert |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Unsigned 403 |
| Data fields | field_mapping |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | int resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Administrators on dead letters (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Integration health |
| Integration | All connectors |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Unsigned 403; duplicate ignored |
| Priority | Must |
| Dependencies | FR-INT-001 |
| Implementation status | Implemented |
| Api | /api/hooks/:org/:key |
| Ui | - |
| Tests | TC-INT-002 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-INT-003 – Connector catalogue (mock until approved)

| Attribute | Specification |
|---|---|
| Business objective | Honest integration status |
| Description | Connectors for Jira, Azure DevOps, GitHub, Teams, Slack, ServiceNow, ERP, HR, email are MOCK and labelled; generic signed webhook can run live with secrets from environment. Secrets never stored in the database. |
| User roles | Administrator; Integration service account |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Admin |
| Main workflow | Configure secret_ref |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | secret_ref |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | int resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Administrators on dead letters (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Integration health |
| Integration | All connectors |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | UI shows MOCK badge; no credentials in repo |
| Priority | Must |
| Dependencies | FR-INT-001 |
| Implementation status | Implemented |
| Api | /api/integrations |
| Ui | Admin → Integrations |
| Tests | TC-INT-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-INT-004 – Microsoft 365 / Entra ID SSO & Graph

| Attribute | Specification |
|---|---|
| Business objective | Enterprise identity & collaboration |
| Description | OIDC SSO, SCIM provisioning, Teams/Outlook notifications via Graph. |
| User roles | Administrator; Integration service account |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | int resources: read/write/delete per role; governed transitions via approval only |
| Notifications | Administrators on dead letters (planned) |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | Integration health |
| Integration | All connectors |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Planned – requires approved tenant (DEC-03) |
| Priority | Must |
| Dependencies | FR-PLT-001 |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Reporting & executive intelligence

### FR-RPT-001 – Executive command centre

| Attribute | Specification |
|---|---|
| Business objective | Board-ready live view |
| Description | KPIs, health donut, portfolio map, investment by portfolio, spend trend, risk heatmap, top risks/issues, objectives, benefits, milestones, decisions, product health, BC readiness, project health table – all computed live. |
| User roles | Executive; PMO; Portfolio manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Open dashboard |
| Main workflow | Compute → render with drill-down |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Missing ≠ zero ≠ green |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rpt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | All dashboards |
| Integration | BI tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Distribution sums to projects; heatmap sum = open risks; P10 unknown |
| Priority | Must |
| Dependencies | FR-PRJ-006 |
| Implementation status | Implemented |
| Api | /api/dashboard/executive |
| Ui | Command centre |
| Tests | TC-RPT-001 |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RPT-002 – Metric definitions & RAG thresholds

| Attribute | Specification |
|---|---|
| Business objective | Trustworthy metrics |
| Description | Every metric has formula, source, refresh and owner; thresholds configurable per organisation. |
| User roles | Executive; PMO; Portfolio manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | Admin |
| Main workflow | Configure |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | Green stricter than amber |
| Data fields | metric_definitions, rag_thresholds |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rpt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | All dashboards |
| Integration | BI tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Invalid threshold rejected |
| Priority | Must |
| Dependencies | FR-RPT-001 |
| Implementation status | Implemented |
| Api | /api/meta/metrics, /api/admin/rag-thresholds |
| Ui | Governance → Metric definitions |
| Tests | TC-RPT-THR (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RPT-003 – Accessible charts with data tables

| Attribute | Specification |
|---|---|
| Business objective | Charts everyone can read |
| Description | Every chart provides a table view, legend for ≥2 series, tooltips, validated colour palette, status shown with icon+label. |
| User roles | Executive; PMO; Portfolio manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rpt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | All dashboards |
| Integration | BI tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Table toggle present on charts |
| Priority | Must |
| Dependencies | FR-RPT-001 |
| Implementation status | Implemented |
| Api | - |
| Ui | All charts |
| Tests | TC-A11Y (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-RPT-004 – Saved views & export

| Attribute | Specification |
|---|---|
| Business objective | Personal productivity |
| Description | Saved status/sort per table (local); CSV/XLSX export and scheduled reports planned. |
| User roles | Executive; PMO; Portfolio manager |
| Preconditions | User authenticated with required permission; parent records exist in the same organisation |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | Validation or business-rule failure returns the record unchanged with field-level messages; user corrects and resubmits |
| Business rules | - |
| Data fields | - |
| Validations | Server-side schema validation (types, enums, ranges, required), reference integrity within organisation, unknown fields rejected |
| Permissions | rpt resources: read/write/delete per role; governed transitions via approval only |
| Notifications | None |
| Audit | Create/update/delete/transition events with actor, before/after and hash chain |
| Reports dashboard impact | All dashboards |
| Integration | BI tools (planned) |
| Error scenarios | 400 validation; 403 permission; 404 not found/not visible; 409 version conflict; 422 business rule (e.g. gate criteria, guarded status) |
| Acceptance criteria | Saved filter persists per browser |
| Priority | Should |
| Dependencies | FR-RPT-001 |
| Implementation status | Partial |
| Api | - |
| Ui | Tables |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |


## Non-functional

### FR-NFR-001 – Security baseline (OWASP ASVS 5.0 L2 target)

| Attribute | Specification |
|---|---|
| Business objective | Defensible security |
| Description | Input validation, parameterised SQL, output encoding, CSP and security headers, rate limiting, secrets from environment, non-root containers, dependency scanning in CI. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | Security tests pass; no secrets in repo; CSP header present |
| Priority | Must |
| Dependencies | - |
| Implementation status | Partial |
| Api | - |
| Ui | - |
| Tests | TC-SEC-* |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-NFR-002 – Accessibility (WCAG 2.2 AA target)

| Attribute | Specification |
|---|---|
| Business objective | Inclusive use |
| Description | Keyboard navigation, visible focus, labels, contrast, reduced motion, 24px targets, drag alternatives, chart tables. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | Automated + manual audit planned Phase 11 |
| Priority | Must |
| Dependencies | - |
| Implementation status | Partial |
| Api | - |
| Ui | - |
| Tests | TC-A11Y (manual / not yet automated) |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-NFR-003 – Performance

| Attribute | Specification |
|---|---|
| Business objective | Responsive at enterprise scale |
| Description | p95 API < 500ms for lists up to 500 rows; dashboard < 2s at 1k projects; indexes on context and status. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | Load test planned Phase 11 |
| Priority | Should |
| Dependencies | - |
| Implementation status | Planned |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-NFR-004 – Backup, restore & DR of the platform

| Attribute | Specification |
|---|---|
| Business objective | Platform resilience |
| Description | Daily PostgreSQL backups, tested restore, documented RTO 4h/RPO 24h for the platform itself. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | Restore drill documented in deployment guide; automation planned |
| Priority | Must |
| Dependencies | - |
| Implementation status | Partial |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-NFR-005 – Privacy (Malaysia PDPA as amended 2024)

| Attribute | Specification |
|---|---|
| Business objective | Lawful processing |
| Description | Data minimisation, classification, retention rules, breach-notification support, DPO role, portability export; legal review required. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | Obligations register seeded; legal confirmation pending (DEC-08) |
| Priority | Must |
| Dependencies | FR-GOV-002 |
| Implementation status | Partial |
| Api | - |
| Ui | - |
| Tests | - |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |

### FR-NFR-006 – Responsive & mobile

| Attribute | Specification |
|---|---|
| Business objective | Approvals on the go |
| Description | Desktop-first, usable on tablet/phone for approvals, notifications, status and tasks. |
| User roles | All |
| Preconditions | n/a |
| Trigger | - |
| Main workflow | - |
| Alternative workflow | n/a |
| Business rules | - |
| Data fields | - |
| Validations | n/a |
| Permissions | n/a |
| Notifications | n/a |
| Audit | n/a |
| Reports dashboard impact | n/a |
| Integration | n/a |
| Error scenarios | n/a |
| Acceptance criteria | No horizontal overflow at 390px |
| Priority | Should |
| Dependencies | - |
| Implementation status | Implemented |
| Api | - |
| Ui | All |
| Tests | TC-UX-MOB |
| Baseline id | Pending FRS v1.1 import |
| Baseline classification | New (gap-derived) – reconcile on import |
