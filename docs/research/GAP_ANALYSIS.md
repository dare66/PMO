# Gap analysis

Compares (a) the expectations in the master prompt and research, (b) typical capabilities in comparable products, and (c) what is implemented in this repository. The original FRS v1.1 could not be analysed because it was not supplied (GAP-000).

| # | Gap observed in the market / typical PMO tooling | Evidence | Platform response | Status |
|---|---|---|---|---|
| G1 | Products modelled as projects or as fields on projects | Most PPM tools are project-centric (COMPETITOR_RESEARCH §7) | Product is an independent entity; M:N project↔product; closing a project never closes a product | Implemented, tested |
| G2 | Operational/BAU work forced into project containers | PPM vs ITSM split | Unified work items with context project/product/service/none | Implemented, tested |
| G3 | BIA done late in separate BCM tools | BCM separate from intake | BIA screening at intake, lifecycle gates, MTPD derivation, traceability chain | Implemented, tested |
| G4 | Approvals configurable but bypassable | JSM approvals not enforced by default (S44) | Server-enforced guarded statuses, authority limits, SoD, human-only decisions | Implemented, tested |
| G5 | RAG computed as green when data is missing | Common dashboard practice | Unknown state, data-gap lists, partial data capped at amber (ADR-0007) | Implemented, tested |
| G6 | AI generates content without provenance or limits | Vendor AI features (S38) | Citations, confidence, permission-trimmed retrieval, no write authority, audit | Implemented, tested |
| G7 | Change requests without systematic impact analysis | – | Rule-based automatic impact assessments incl. BIA/security/ops/vendor | Implemented, tested |
| G8 | Finance not reconciled to approved funding | – | Budget→actual→commitment→forecast reconciliation with roll-up and FX | Implemented, tested |
| G9 | Capacity seen per portfolio only | Asana portfolio workload note (S41) | Organisation-wide capacity incl. BAU and leave | Implemented |
| G10 | Documents written by hand, drifting from data | – | Generated from records with MISSING markers and source citations | Implemented, tested |
| G11 | Audit trails mutable | – | Append-only table + hash chain verification | Implemented, tested |
| G12 | Scenario planning vs funding & capacity | ServiceNow/Planview strength | Not yet built | Planned (Phase 3) |
| G13 | Full BPMN modelling | Camunda/Signavio strength | Swimlane maps from steps; BPMN XML import planned | Partial |
| G14 | SSO/SCIM, M365 integration | Enterprise expectation | Adapter planned; needs tenant approval | Planned (DEC-03) |
| G15 | Stakeholder register, policy attestations, tender scoring, BC exercises | – | Data model extension planned | Planned |
| G16 | Accessibility & performance certification | WCAG 2.2, NFRs | Built to AA patterns; formal audit and load test pending | Partial |
