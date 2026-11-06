# Executive summary – Meridian enterprise delivery platform (baseline 0.1.0)

## What the platform does
One governed system from **strategy to service**: objectives & OKRs → portfolios & investment → programmes & projects (predictive, agile, hybrid, custom) → **products as first-class, long-lived assets** → operational/BAU work → **BIA and operational resilience** → finance, benefits, resources, RAID, change, quality, release, vendors, GRC, documents – with an AI assistant that cites its sources and never acts without a human.

## What the existing FRS was missing
The FRS v1.1 docx was **not available** in the repository or session, so it could not be read or classified (GAP-000 – please upload it; the import procedure preserves every original ID). Against the master prompt and market research, typical PMO specifications miss: products independent of projects; non-project work; BIA at intake with MTPD derivation and dependency gaps; server-enforced approvals (authority, SoD, humans-only); honest RAG for missing data; automatic change impact assessment; reconciled finance with FX; generated documents with provenance; controlled AI.

## What was added
94 detailed functional/non-functional requirements (`docs/requirements/MASTER_FRS.md`, traceability XLSX/CSV), 50-source research register, competitor & standards research, benchmark matrix, gap analysis – **and working software**: ~60-table shared data model, ~55 resources via one validated/audited API, 143 API paths, 14 configurable lifecycle templates, 25 workspaces, executive command centre, Docker packaging, 62 passing automated tests, 25 QA screenshots.

## What we recommend changing
Treat products, services and operational work as peers of projects; make BIA screening an intake gate; enforce governance in the server, not the UI; adopt “no data ≠ green”; keep AI local-first and suggestion-only; integrate with (not replace) ITSM and BPM tools.

## Recommended stack & architecture
Modular monolith, API-first: **TypeScript – Fastify 5 API + React 18 SPA, PostgreSQL 16**, nginx, Docker Compose (ADR-0001/0002). Angular + Laravel was evaluated and remains a viable alternative; the data model and API contract are framework-neutral. Native data-driven workflow engine (no BPM licence dependency, ADR-0003); local AI by default with pluggable Anthropic / self-hosted providers (ADR-0008).

## Core modules
Platform & security · Strategy & portfolio · Programme & project · Product & discovery · Business analysis & process · BIA & resilience · Work & operations · Resources · Finance & benefits · RAID & change · Quality, release & transition · Vendors & procurement · Governance, risk & compliance · Documents & knowledge · AI intelligence · Integrations · Reporting.

## Implementation phases
Phases 0–10 delivered at MVP depth (see IMPLEMENTATION_PLAN.md for what remains in each); Phase 11 hardening (accessibility audit, load, DAST, backup drills, UAT) not started.

## Major risks
1. FRS v1.1 reconciliation may surface requirements not yet covered. 2. SSO, live integrations and external AI depend on approvals/credentials. 3. PDPA interpretation needs legal confirmation. 4. Production hardening (performance, security testing, accessibility audit) outstanding. 5. Synthetic demo data must never be enabled in production.

## Complexity & dependencies
High complexity; critical dependencies: identity tenant, hosting/data residency, legal review, integration credentials. **Decisions awaiting you:** `docs/decisions/DECISIONS_FOR_APPROVAL.md` (DEC-00…DEC-11).
