# ADR-0001 – Modular monolith, API-first
**Status:** Accepted (pending your approval of the baseline – DEC-01) · **Date:** 2026-11-06
**Context:** 22 tightly-related management domains share entities (project, product, risk, budget…) and need transactional integrity (approval + effect + audit in one transaction).
**Decision:** One API process with domain modules and one PostgreSQL database; REST/JSON with generated OpenAPI; web SPA separate.
**Consequences:** simple deployment, ACID across domains, one audit chain. Scaling is vertical + read replicas first; modules can be extracted (e.g. AI, integrations worker) when load or team ownership requires.
**Rejected:** microservices from day one (distributed transactions for approvals, operational cost without demonstrated need).
