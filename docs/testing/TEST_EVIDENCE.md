# Test evidence

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
