# Test plan

## Strategy
| Level | Tooling | Scope | Where |
|---|---|---|---|
| Unit | Vitest | Pure calculations: RAG, EVM, NPV/IRR/payback, RICE/WSJF, MTPD/tier/BIA validation, screening, capacity load, requirement quality | `backend/test/calc.test.ts` |
| Integration (API + real PostgreSQL) | Vitest + Fastify inject, isolated `*_test` database recreated per run, synthetic seed | Auth, RBAC/ABAC, workflows, approvals, finance reconciliation, BIA, change control, release, AI controls, reporting integrity, audit, integrations | `backend/test/api.test.ts` |
| Type safety | `tsc --noEmit` (backend & frontend) | Whole codebase | CI |
| Build/packaging | Docker images build; compose health checks | Deployability | CI / local |
| Visual QA & responsive | Playwright (`scripts/screenshots.mjs`) | 24 desktop screens + mobile; fails on page/console errors; checks horizontal overflow at 390px | Manual run / CI optional |
| Planned (Phase 11) | axe-core, k6, OWASP ZAP, restore drill, UAT | Accessibility, performance, DAST, backup/restore, business acceptance | – |

## Mandatory scenario coverage (from the master prompt)
| Scenario | Test |
|---|---|
| A product can have multiple projects | `Products vs projects › a product can have multiple projects and a project can support multiple products` |
| One project supports multiple products | same |
| Closing a project does not close a product | `closing a project does not close its product` |
| Operational tasks not forced into projects | `Operational work is not forced into projects` |
| BIA impacts traced to processes and technical dependencies | `traces business process → service → product → infrastructure → data → vendor → recovery`; `derives MTPD/tier…` |
| Budgets reconcile with funding, actuals, forecasts | `project summary equals the sum of approved budgets, actuals, commitments and forecasts`; FX test |
| Change request triggers impact assessments | `a change request generates the right impact assessments` |
| Approvals respect role and authority limits | `enforces authority limits and segregation of duties`; self-approval; delegation |
| AI cannot bypass permissions or approvals | `AI actors can never decide approvals`; `answers with citations… respects permissions`; suggestion acceptance |
| Reports distinguish missing data from zero | `executive dashboard distinguishes missing data from zero…`; `reports missing budget as null, not zero`; unit RAG tests |

## Test ID → automated test mapping
TC-SEC-001..004 authentication block · TC-SEC-RBAC-* permissions block · TC-SEC-VAL / TC-PLT-VAL input validation · TC-SEC-OPT optimistic locking · TC-AUD-001..002 audit trail · TC-WF-001..002 workflow · TC-GOV-001..006 approvals · TC-PRD-001..002 products vs projects · TC-WRK-001 operational work · TC-BIA-001..004 BIA · TC-FIN-001..004 calc + finance reconciliation · TC-CHG-001 change control · TC-REL-001..003 release · TC-AI-001..003 AI controls · TC-RPT-001/DOC/OKR/HEAT reporting · TC-INT-001..002 integrations · TC-PLT-003/008, TC-VND-003, TC-BA-RQ additional coverage · TC-CALC-* unit tests · TC-UX-MOB screenshot script overflow check.
Requirements whose test IDs are marked “manual / not yet automated” in the traceability matrix are exercised through generic CRUD and UI but have no dedicated automated assertion yet (tracked in TECH_DEBT TD-03).

## How to run
```bash
cd backend && npm ci
docker run -d --name pmo-test-db -e POSTGRES_PASSWORD=devpass -p 5433:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:devpass@localhost:5433/pmo_test npm test
```
The global setup refuses to reset any database whose name does not contain `test`.
