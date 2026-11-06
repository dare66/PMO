# Phased implementation plan

| Phase | Scope | Status in this repository | Exit criteria |
|---|---|---|---|
| 0 Repository & FRS assessment, research | Repo inspection, online research, gap analysis, master FRS, traceability | **Done** except FRS v1.1 import (GAP-000) | v1.1 reconciled; DEC-00 |
| 1 Product definition & architecture | Vision, personas/journeys (UX docs), domain model, ERD, C4, API, security design, ADRs | **Done** – awaiting approval DEC-01/02 | Baseline approved |
| 2 Foundation | Auth, org, users/roles/permissions, audit, configuration, workflow engine, notifications, search, design system | **Built (MVP)** – SSO, file storage pending | SSO + file scanning |
| 3 Strategy & portfolio | Objectives/KRs, portfolios, programmes, prioritisation, executive reporting | **Built** – scenarios pending | Scenario planning (FR-STR-005) |
| 4 Project management | Lifecycle, gates, plan, RAID, change, finance, resources, quality, closure | **Built** – stakeholder register pending | FR-PRJ-008 |
| 5 Product management | Catalogue, discovery, ideas, roadmap, releases, analytics, lifecycle | **Built** | Product analytics import |
| 6 BIA & resilience | BIA, processes, dependencies, recovery, traceability, readiness | **Built** – BC exercises pending | FR-BIA-006 |
| 7 Work, resource, finance | Unified work, capacity, budgets/actuals/forecast, benefits | **Built** – skills matching, recurrence generator | FR-RES-003, FR-WRK-003 |
| 8 Documents & knowledge | Generation, versions, approvals; SOP/user guides | **Built (core)** – BPMN, files, FTS | FR-BA-003, FR-DOC-003/004 |
| 9 Quality, release, transition | Tests, UAT, defects, readiness, CAB, deployment, handover | **Built** | – |
| 10 AI & integrations | Assistant, analyses, provider abstraction, queue, webhooks, mock connectors | **Built (local AI, mock connectors)** – live connectors, RAG/pgvector, MCP | DEC-06/07 |
| 11 Hardening | Security testing, performance, accessibility, backup/restore, UAT | **Not started** | All NFR acceptance |

## Research backlog
- R-01 Import and reconcile FRS v1.1.
- R-02 Verify the products and standards listed as “not verified” in RESEARCH_SOURCE_REGISTER.md.

## Complexity & dependencies
Overall complexity: **high** (≈60 entities, 20+ workspaces). Critical external dependencies: identity provider tenant (DEC-03), hosting (DEC-04), legal PDPA review (DEC-08), integration credentials (DEC-06). Indicative effort for Phases 2–11 to production grade with a team of 6–8: 9–12 months; this repository provides a working foundation covering most functional scope at MVP depth.
