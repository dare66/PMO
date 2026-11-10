# Test evidence

All results below were produced by commands actually run in the build session on **2026-11-10**
(Node 22.23.4, PostgreSQL 16.15, Chromium via Playwright) against the Docker Compose stack and an
isolated `pmo_test` database seeded with **synthetic** data. Nothing here is projected or estimated.

## 1. Backend unit + integration tests – 102 passed, 0 failed
`cd backend && TEST_DATABASE_URL=postgres://postgres:…@localhost:5433/pmo_test npx vitest run --reporter=verbose`
(3 files, duration 19.15s). `test/frs.test.ts` covers the FRS v1.1 rules and migration-002 capabilities; IDs in test names are the FRS's own. Includes a test that every registered API route is in OpenAPI.
```
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > CPM handles FS/SS/FF/SF with lag and finds the critical path
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > CPM rejects dependency cycles
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > PERT needs all three estimates; working days skip weekends and holidays
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > weighted score is null until every criterion is scored
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > RACI needs exactly one A and at least one R; diff and clustering helpers
✓ test/frs.test.ts > Scheduling & scoring calculations (FR-SCH-003/004/006, FR-PORT-004) > CSV export neutralises spreadsheet formula injection (NFR-004)
✓ test/frs.test.ts > Demand intake pipeline (FR-PORT-003, FR-INIT-003/005/010) > detects duplicates, enforces reasons/SoD and converts to a linked project
✓ test/frs.test.ts > Demand intake pipeline (FR-PORT-003, FR-INIT-003/005/010) > a requester cannot approve their own request (segregation of duties)
✓ test/frs.test.ts > Demand intake pipeline (FR-PORT-003, FR-INIT-003/005/010) > scoring models: weights must sum to 100 and overrides need a reason; scores are immutable
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > baselines lock baseline dates and BAC; re-baselining needs an approved change
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > computes a critical path over dependencies and refuses cycles
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > items requiring evidence cannot be completed without it; blocked needs a reason
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > weighted progress never uses task counts and reports unknown when no weights
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > an approved change on a baselined project creates a new baseline version
✓ test/frs.test.ts > Baselines, dependencies and evidence (FR-SCP-005, FR-SCH-003..008, FR-WRK-008/010) > project export is complete but scoped by permission (NFR-016, AC-14)
✓ test/frs.test.ts > Time, resource requests and RACI (FR-RES-004/005/007/008/011) > people record only their own time; approval is by someone else
✓ test/frs.test.ts > Time, resource requests and RACI (FR-RES-004/005/007/008/011) > allocation requests are approved by the resource manager
✓ test/frs.test.ts > Time, resource requests and RACI (FR-RES-004/005/007/008/011) > only one Accountable per RACI item
✓ test/frs.test.ts > Time, resource requests and RACI (FR-RES-004/005/007/008/011) > access ends automatically after the access end date
✓ test/frs.test.ts > Finance period locks and reversals (FR-FIN-006/014) > locked periods reject postings; actuals are corrected by reversal only
✓ test/frs.test.ts > Quality, release and document controls (FR-QLT, FR-OPS-007/009, FR-DOC, AC-11) > defects are waived only through approval
✓ test/frs.test.ts > Quality, release and document controls (FR-QLT, FR-OPS-007/009, FR-DOC, AC-11) > a go decision without readiness evidence needs a justified exception; AI cannot decide
✓ test/frs.test.ts > Quality, release and document controls (FR-QLT, FR-OPS-007/009, FR-DOC, AC-11) > legal hold blocks deletion; check-out blocks other editors; versions can be compared
✓ test/frs.test.ts > Quality, release and document controls (FR-QLT, FR-OPS-007/009, FR-DOC, AC-11) > approved BIA history is immutable and a material edit re-opens review (§8.2)
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > a declared conflict of interest blocks bid scoring
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > announcements are published via the endpoint and acknowledgements tracked
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > product health is unknown without metric data, and computed once values exist
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > comments notify @mentioned users
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > AI drafts can only be accepted by a person (AI never writes records)
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > BPMN import rejects DTD/entity declarations (XXE)
✓ test/frs.test.ts > Procurement, communications and product controls (FR-PROC, FR-STK-006, PRD-020/034) > uploads with a malware signature are quarantined and cannot be downloaded
✓ test/frs.test.ts > Controlled document generation (FR-DOC-004..007/013/014, FR-BA-009, FR-TST-009, AC-09) > generates SOP, process flow, user guide, PMP, BRD/FRS, UAT report and minutes as drafts with sources and missing markers
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > scenario evaluation flags unpriced items instead of treating them as zero cost
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > tender award requires a justification when not top-ranked and passed due diligence; AI cannot award
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > policy attestation is per person and version, once, and tracked
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > approved requirements re-version on change, return to review and keep immutable history
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > RTM CSV export is checksummed and detects staleness
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > saved views are personal unless shared
✓ test/frs.test.ts > Migration-002 capabilities (scenarios, RTM, tenders, policies, views, skills, requirement versions) > skills matching ranks candidates by proficiency and free capacity and reports gaps
✓ test/frs.test.ts > API-first (architecture rule) > every registered /api route appears in the OpenAPI document
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > rejects unauthenticated access
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > uses a generic error for bad credentials and locks after 5 failures
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > cookie sessions require the anti-CSRF header for writes
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > never returns password hashes
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > a product can have multiple projects and a project can support multiple products
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > closing a project does not close its product
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > the projects status "closed" cannot be set by a direct edit
✓ test/api.test.ts > Operational work is not forced into projects (TC-WRK-001) > creates incidents linked to a service and BAU work with no parent
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > derives MTPD/tier from impacts and validates RTO against MTPD
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > traces business process → service → product → infrastructure → data → vendor → recovery
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > BIA screening on a project records the outcome and can start a BIA
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > project summary equals the sum of approved budgets, actuals, commitments and forecasts
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > converts foreign-currency actuals with recorded FX rates
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > reports missing budget as null, not zero
✓ test/api.test.ts > Change control (TC-CHG-*) > a change request generates the right impact assessments (incl. BIA for critical products)
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > enforces authority limits and segregation of duties
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > prevents self-approval of financial requests
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > rejection requires a reason; conditional approval requires conditions
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > budget status "approved" cannot be set by direct edit
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > risk acceptance cannot be done by direct edit
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > AI actors can never decide approvals (TC-AI-002)
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > delegation passes the approval to another authorised user
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > tester cannot read or create budgets
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > restricted records are hidden from non-owners, including search
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > wildcard read permission does not grant audit-trail access
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > validates input and rejects unknown fields
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > optimistic locking prevents lost updates
✓ test/api.test.ts > AI controls (TC-AI-*) > answers with citations, logs the interaction and respects permissions
✓ test/api.test.ts > AI controls (TC-AI-*) > flags prompt-injection attempts
✓ test/api.test.ts > AI controls (TC-AI-*) > AI suggestions only become records when a human accepts them, as drafts via normal permissions
✓ test/api.test.ts > Reporting integrity (TC-RPT-*) > executive dashboard distinguishes missing data from zero and never shows green for missing data
✓ test/api.test.ts > Reporting integrity (TC-RPT-*) > generated documents mark missing information and cite sources
✓ test/api.test.ts > Release governance (TC-REL-*) > release readiness fails without rollback plan/UAT/CAB and blocks deployment
✓ test/api.test.ts > Release governance (TC-REL-*) > a ready release passes after CAB approval and can be deployed by a human
✓ test/api.test.ts > Release governance (TC-REL-*) > a failed test execution raises a defect automatically
✓ test/api.test.ts > Configurable workflow & gates (TC-WF-*) > blocks a gate when exit criteria fail and requires authority for exceptions
✓ test/api.test.ts > Configurable workflow & gates (TC-WF-*) > workflow definitions are versioned configuration, not code
✓ test/api.test.ts > Audit trail (TC-AUD-*) > records before/after values and the hash chain verifies
✓ test/api.test.ts > Audit trail (TC-AUD-*) > audit events are immutable at database level
✓ test/api.test.ts > Integration framework (TC-INT-*) > mock delivery succeeds and simulated failures retry then dead-letter
✓ test/api.test.ts > Integration framework (TC-INT-*) > inbound webhooks require a signature and de-duplicate
✓ test/api.test.ts > Additional module coverage > TC-PLT-003 organisation structure is configurable (nested departments)
✓ test/api.test.ts > Additional module coverage > TC-VND-003 duplicate invoice numbers per vendor are rejected
✓ test/api.test.ts > Additional module coverage > TC-PLT-008 scheduled checks notify contract owners once (de-duplicated)
✓ test/api.test.ts > Additional module coverage > TC-BA-RQ requirement quality flags are computed server-side
✓ test/api.test.ts > Additional module coverage > TC-RPT-OKR objective progress is the mean of measured key results
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > missing value is unknown, never green
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > applies thresholds in both directions
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > zero is a real value, distinct from missing
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > overall = worst; all unknown => unknown; partial data caps at amber
✓ test/calc.test.ts > Earned value (TC-FIN-001) > computes PV, EV, SPI, CPI, EAC
✓ test/calc.test.ts > Earned value (TC-FIN-001) > returns nulls and a missing list when inputs absent
✓ test/calc.test.ts > Investment appraisal (TC-FIN-002) > NPV, IRR, payback
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > MTPD = earliest horizon reaching tolerance
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > tiers
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > flags RTO > MTPD and dependency gaps
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > screening scales BIA depth to risk
✓ test/calc.test.ts > Other calculations > risk score/rating
✓ test/calc.test.ts > Other calculations > RICE
✓ test/calc.test.ts > Other calculations > benefit realisation
✓ test/calc.test.ts > Other calculations > weekly load detects over-allocation and leave
✓ test/calc.test.ts > Other calculations > requirement quality flags vague, untestable requirements
```

## 2. Dependency audit (`npm audit`)
| Scope | Before | After | Notes |
|---|---|---|---|
| backend runtime (`--omit=dev`) | 3 critical, 2 high | **0** | fastify 5.12.8, @fastify/jwt 10.2.7 (fast-jwt algorithm confusion / `crit` header), fast-xml-parser 5.12.0, zod 4.6.7 |
| frontend runtime | 3 high | 2 moderate | react-router-dom 6.30.6 fixes the high open-redirect advisories. Remaining moderate (backslash in `<Link>`/`navigate`) needs the v7 major; all navigation targets are internal, server-generated paths. **Accepted risk, tracked for Phase 3.** |
| backend dev-only | vitest 2.1.x chain (tinypool, vite, esbuild) | unchanged | Test runner only; not in any Docker image. vitest 5 blocked by a peer-dependency conflict. **Accepted risk, dev-only.** |

## 3. Performance (NFR-002) – autocannon, 20 connections × 15 s per endpoint, through nginx
Run with `API_RATE_LIMIT=1000000` for the measurement only (the default per-IP limit of 600/min otherwise returns 429, which a first run confirmed). Latencies in ms; all responses 2xx.

| Endpoint | req/s | p50 | p97.5 | p99 | max | non-2xx | errors |
|---|---|---|---|---|---|---|---|
| /api/r/projects | 504 | 37 | 66 | 79 | 175 | 0 | 0 |
| /api/dashboard/executive | 110 | 177 | 238 | 257 | 281 | 0 | 0 |
| /api/projects/:id/schedule | 210 | 93 | 122 | 131 | 159 | 0 | 0 |
| /api/search | 258 | 74 | 132 | 146 | 444 | 0 | 0 |
| /api/r/work_items | 413 | 46 | 70 | 75 | 93 | 0 | 0 |

Target "p95 < 3 s at agreed load" is met locally with large margin. **The agreed production load profile must still be tested in the target environment.**

## 4. Backup & restore drill (NFR-005) – `scripts/restore-drill.sh`
Backup with `pg_dump -Fc` and SHA-256, restore into a scratch database, compare:
| Table | Live | Restored | Match |
|---|---|---|---|
| organisations | 1 | 1 | yes |
| users | 24 | 24 | yes |
| projects | 10 | 10 | yes |
| products | 6 | 6 | yes |
| work_items | 29 | 29 | yes |
| risks | 18 | 18 | yes |
| budgets | 23 | 23 | yes |
| cost_entries | 67 | 67 | yes |
| bia_assessments | 5 | 5 | yes |
| documents | 6 | 6 | yes |
| document_versions | 5 | 5 | yes |
| requests | 4 | 4 | yes |
| project_baselines | 1 | 1 | yes |
| audit_events | 30 | 30 | yes |
| audit chain head | 9748de2cb20d26ca… | 9748de2cb20d26ca… | yes |

Dump size: 556K · elapsed 6s · result: PASS

## 5. Accessibility (NFR-007) – `scripts/a11y.mjs` (axe-core 4.10.2, WCAG 2.0/2.1/2.2 A+AA rules)
29 routes/tabs × light and dark = 58 page states. **First run: 64 violations (6 rules). After fixes: 0.**
Fixed: heatmap row semantics, risk-badge/muted-text/primary-button contrast, theme-aware heatmap ink, chart SVGs hidden behind always-present data tables, keyboard-operable legends, focusable scroll regions, labelled reference selects; data tables added to every chart.
Automated rules find only part of WCAG issues; **a formal manual assessment (screen reader, keyboard, zoom) is still required.**

## 6. Visual QA – `scripts/screenshots.mjs`
35 screens captured at 1440×900 plus a mobile check: 0 page errors, no horizontal overflow at phone width.
(Only console entries were the expected 401 from the session probe before sign-in.)

---

## Previous run (2026-11-06, before the FRS v1.1 work)
Executed in the build session on 2026-11-06 against PostgreSQL 16 (isolated `pmo_test` database, synthetic seed).

## Backend (Vitest, unit + integration)
```
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > rejects unauthenticated access
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > uses a generic error for bad credentials and locks after 5 failures 1603ms
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > cookie sessions require the anti-CSRF header for writes 332ms
✓ test/api.test.ts > Authentication & session security (TC-SEC-*) > never returns password hashes
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > a product can have multiple projects and a project can support multiple products 665ms
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > closing a project does not close its product
✓ test/api.test.ts > Products vs projects (TC-PRD-001..003) > the projects status "closed" cannot be set by a direct edit 322ms
✓ test/api.test.ts > Operational work is not forced into projects (TC-WRK-001) > creates incidents linked to a service and BAU work with no parent 338ms
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > derives MTPD/tier from impacts and validates RTO against MTPD 376ms
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > traces business process → service → product → infrastructure → data → vendor → recovery
✓ test/api.test.ts > BIA integrated with lifecycle (TC-BIA-*) > BIA screening on a project records the outcome and can start a BIA
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > project summary equals the sum of approved budgets, actuals, commitments and forecasts 327ms
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > converts foreign-currency actuals with recorded FX rates
✓ test/api.test.ts > Finance reconciliation (TC-FIN-003) > reports missing budget as null, not zero
✓ test/api.test.ts > Change control (TC-CHG-*) > a change request generates the right impact assessments (incl. BIA for critical products) 532ms
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > enforces authority limits and segregation of duties 380ms
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > prevents self-approval of financial requests
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > rejection requires a reason; conditional approval requires conditions
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > budget status "approved" cannot be set by direct edit
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > risk acceptance cannot be done by direct edit
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > AI actors can never decide approvals (TC-AI-002)
✓ test/api.test.ts > Approvals & delegated authority (TC-GOV-*) > delegation passes the approval to another authorised user
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > tester cannot read or create budgets 326ms
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > restricted records are hidden from non-owners, including search 361ms
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > wildcard read permission does not grant audit-trail access 340ms
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > validates input and rejects unknown fields
✓ test/api.test.ts > Permissions & data protection (TC-SEC-RBAC/ABAC) > optimistic locking prevents lost updates
✓ test/api.test.ts > AI controls (TC-AI-*) > answers with citations, logs the interaction and respects permissions
✓ test/api.test.ts > AI controls (TC-AI-*) > flags prompt-injection attempts
✓ test/api.test.ts > AI controls (TC-AI-*) > AI suggestions only become records when a human accepts them, as drafts via normal permissions
✓ test/api.test.ts > Reporting integrity (TC-RPT-*) > executive dashboard distinguishes missing data from zero and never shows green for missing data 395ms
✓ test/api.test.ts > Reporting integrity (TC-RPT-*) > generated documents mark missing information and cite sources
✓ test/api.test.ts > Release governance (TC-REL-*) > release readiness fails without rollback plan/UAT/CAB and blocks deployment 344ms
✓ test/api.test.ts > Release governance (TC-REL-*) > a ready release passes after CAB approval and can be deployed by a human 391ms
✓ test/api.test.ts > Release governance (TC-REL-*) > a failed test execution raises a defect automatically
✓ test/api.test.ts > Configurable workflow & gates (TC-WF-*) > blocks a gate when exit criteria fail and requires authority for exceptions
✓ test/api.test.ts > Configurable workflow & gates (TC-WF-*) > workflow definitions are versioned configuration, not code
✓ test/api.test.ts > Audit trail (TC-AUD-*) > records before/after values and the hash chain verifies
✓ test/api.test.ts > Audit trail (TC-AUD-*) > audit events are immutable at database level
✓ test/api.test.ts > Integration framework (TC-INT-*) > mock delivery succeeds and simulated failures retry then dead-letter
✓ test/api.test.ts > Integration framework (TC-INT-*) > inbound webhooks require a signature and de-duplicate
✓ test/api.test.ts > Additional module coverage > TC-PLT-003 organisation structure is configurable (nested departments)
✓ test/api.test.ts > Additional module coverage > TC-VND-003 duplicate invoice numbers per vendor are rejected
✓ test/api.test.ts > Additional module coverage > TC-PLT-008 scheduled checks notify contract owners once (de-duplicated)
✓ test/api.test.ts > Additional module coverage > TC-BA-RQ requirement quality flags are computed server-side 323ms
✓ test/api.test.ts > Additional module coverage > TC-RPT-OKR objective progress is the mean of measured key results
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > missing value is unknown, never green
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > applies thresholds in both directions
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > zero is a real value, distinct from missing
✓ test/calc.test.ts > RAG (TC-RPT-001..004) > overall = worst; all unknown => unknown; partial data caps at amber
✓ test/calc.test.ts > Earned value (TC-FIN-001) > computes PV, EV, SPI, CPI, EAC
✓ test/calc.test.ts > Earned value (TC-FIN-001) > returns nulls and a missing list when inputs absent
✓ test/calc.test.ts > Investment appraisal (TC-FIN-002) > NPV, IRR, payback
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > MTPD = earliest horizon reaching tolerance
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > tiers
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > flags RTO > MTPD and dependency gaps
✓ test/calc.test.ts > BIA calculations (TC-BIA-001..004) > screening scales BIA depth to risk
✓ test/calc.test.ts > Other calculations > risk score/rating
✓ test/calc.test.ts > Other calculations > RICE
✓ test/calc.test.ts > Other calculations > benefit realisation
✓ test/calc.test.ts > Other calculations > weekly load detects over-allocation and leave
✓ test/calc.test.ts > Other calculations > requirement quality flags vague, untestable requirements
Tests  62 passed (62)
Duration  12.52s (transform 440ms, setup 0ms, collect 1.08s, tests 10.90s, environment 0ms, prepare 112ms)
```

## Static checks
- `backend: npx tsc --noEmit` – 0 errors
- `frontend: npx tsc --noEmit` – 0 errors; `vite build` – success

## Packaging
- `docker compose` stack (db, api, web) – all three containers reported **healthy**; `GET /api/health` → `{"status":"ok"}`; CSP and X-Frame-Options headers present on SPA routes.

## Visual QA
- `scripts/screenshots.mjs` captured 25 screens (24 desktop at 1440×900 @2x, 1 mobile 390×844) with **0 page/console errors** after sign-in and **no horizontal overflow** on mobile. Images: `docs/screenshots/*.jpg`.

## Not executed (honest gaps)
Formal accessibility audit, load/performance tests, DAST/penetration test, backup/restore drill, user acceptance testing.

