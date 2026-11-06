# Recommended platform capabilities

Prioritised capability set derived from research (S-IDs) and the gap analysis. “Built” = present in this repository with tests.

## Tier 1 – differentiators (built)
1. **Shared enterprise data model** – one relational model for strategy, portfolio, programme, project, product, service, process, BIA, finance, RAID, quality, release, vendor, documents (ADR-0002).
2. **Configurable lifecycle & gate engine** – versioned templates for project (full/agile/AI/regulatory/business change/infrastructure/operational improvement), product, programme, idea, IT change, procurement, service improvement.
3. **Governed approvals** – delegated authority matrix, SoD, parallel/conditional approval, delegation, rounds, escalation, humans-only.
4. **Integrated BIA** – screening at intake, MTPD derivation, RTO/RPO/MBCO validation, dependency capability gaps, recovery evidence, traceability chain, periodic review.
5. **Honest reporting** – live computation, metric registry (formula/source/refresh/owner), configurable RAG, no-green-on-missing.
6. **Controlled AI** – provider abstraction (local default), citations, confidence, injection detection, no authority, audit and token budgets.

## Tier 2 – core management (built)
Product catalogue/discovery/roadmap/RICE/WSJF; projects with EVM; unified work & BAU; capacity; finance & benefits & business cases; RAID & change control with automatic impact assessments; test/UAT/defects/readiness/CAB/human deployment; vendors/contracts/procurement; controls/obligations/findings/decisions; document generation & versioning; integration queue with retry/dead-letter & signed webhooks; tamper-evident audit.

## Tier 3 – next (planned, see IMPLEMENTATION_PLAN.md)
Investment scenarios; SSO (OIDC/SAML) + SCIM; M365/Teams/Jira/Azure DevOps live connectors (after approval); stakeholder register; BPMN modeller; file storage with malware scanning; full-text & vector search (pgvector) for RAG; scheduled/exported reports; BC exercise management; policy attestations; tender scoring; recurring work generator; performance & accessibility certification; multi-node job worker.

## Deliberately avoided
- Microservices before scale requires them (ADR-0001).
- Embedding a BPM engine with production-use licence restrictions (S42) – native gate engine instead.
- Hard-coded single methodology – templates are data.
- AI that writes records or decides – suggestions only.
- Presenting mock connectors as live – every mock is labelled MOCK.
