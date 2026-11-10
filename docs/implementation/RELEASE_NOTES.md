# Release notes

## 0.2.0 – 2026-11-10 (FRS v1.1 reconciliation build, unreleased)
Reconciled against the customer's FRS-EPMO-001 v1.1 (301 items, original IDs kept). See `docs/requirements/FRS_V11_RECONCILIATION.md`: 244 Implemented, 55 Partial, 2 Deferred, 0 removed.

**New (migrations 002 and 003, 89 registered resources)**
- Demand & intake pipeline (10 states) with duplicate detection, segregation of duties, conversion to projects from templates; configurable weighted scoring models with audited overrides and immutable score history.
- Immutable project baselines; baseline fields locked behind change control; approved changes create new baseline versions.
- Critical-path scheduling (FS/SS/FF/SF, lag, holidays, PERT, status date), sprints with burndown/velocity, weighted progress, cycle-safe dependencies.
- Time entries (own time only, approval by someone else), resource-request approval, RACI with one-Accountable rule, access end dates for contractors.
- Comments with @mentions and watchers; scanned evidence files with quarantine; evidence required before completion.
- Finance period lock and sign-off, reversal-only correction of actuals, accruals, contingency/management reserve.
- Quality reviews and CAPA, defect waivers/known errors via approval, quality gate metrics; OCM impacts, readiness and training; communications and acknowledged announcements.
- Procurement: tenders and weighted bid scoring, conflict-of-interest declarations, contract milestone acceptance, vendor reviews; policies with versioned attestations.
- Release: cutover checklist, go/no-go with justified exceptions, service acceptance, hypercare exit; configuration items.
- Product: hierarchy, ownership roles, personas, hypotheses, launch plans, metrics with values and metric-based health, pricing (restricted), technical debt, immutable roadmap versions.
- BIA: safety/data/strategic/environmental categories, deputy owner, immutable approved versions, material edits reopen review.
- Documents: check-out/in, version compare, retention and legal hold, acknowledgements; generators for SOP, user guide, process flow (Mermaid), project management plan, BRD/FRS with RTM, UAT/test report and minutes – all DRAFT with a controlled-metadata header.
- AI: intake workspace (clarify → draft → human acceptance), read-only idea clustering. OIDC SSO (PKCE).
- Full permission-scoped project export; requirement versioning; BPMN 2.0 import/export; checksummed RTM CSV with staleness detection; saved views; CSV export of any list.

**Quality & security**
- 102 automated tests passing (was 62). OpenAPI now generated from the live route table (339 paths), enforced by a test.
- Runtime dependency advisories patched (fastify, @fastify/jwt/fast-jwt, fast-xml-parser, zod 4, react-router-dom).
- CSV formula-injection guard fixed (was skipped for cells containing quotes/commas).
- Accessibility: axe-core scan of 58 page states, 64 → 0 violations.
- Backup/restore scripts and drill; load-test evidence; route-level code splitting.

## 0.1.0 – 2026-11-06 (initial baseline, unreleased)
Initial modular-monolith platform: shared data model, auth/RBAC/ABAC, audit chain, workflow & approvals engine, strategy/portfolio/programme/project/product/discovery, unified work, capacity, finance & benefits, RAID & change control, BIA & resilience, quality & release, vendors, GRC, documents, controlled AI, integrations, executive command centre and 25 workspaces; Docker Compose packaging; 62 automated tests.
