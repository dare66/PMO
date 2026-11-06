# Requirement gap register

Item-level reconciliation of the customer's FRS v1.1 (all 301 IDs, original numbering kept) is in
[FRS_V11_RECONCILIATION.md](FRS_V11_RECONCILIATION.md) / `.csv`. Partial and deferred items there carry their own gap notes.

| ID | Gap | Impact | Action | Owner | Status |
|---|---|---|---|---|---|
| GAP-000 | FRS v1.1 docx not available at first build. | Baseline traceability. | Customer uploaded the docx; 301 items extracted (GO-01..10, FR-PORT…FR-INT, NFR-001..016, AC-01..14, PRD-001..045) and reconciled one by one. | Product owner | **Closed** |
| GAP-013 | Customer states the uploaded FRS v1.1 is **partial** ("not the complete info"). Sections, roles, workflows or data definitions not in the upload could not be reconciled. | Possible unreconciled requirements. | Supply the remaining sections; they will be added to `frs_v11_items.json` and the script fails until each new ID is classified. | Product owner (customer) | **Open** |
| GAP-001 | Portfolio what-if scenarios | Portfolio optimisation | investment_scenarios + evaluate (migration 002). Sequencing what-if still open (FR-PORT-005). | PMO | Partial |
| GAP-002 | SSO / SCIM / Entra ID | Enterprise identity | OIDC SSO with PKCE + JIT built (env-configured, no secrets in repo). SCIM provisioning still open. | Security | Partial |
| GAP-003 | Stakeholder & communications register | PMBOK Stakeholders domain | stakeholders, communications, announcements + acknowledgements | PMO | Closed |
| GAP-004 | BPMN 2.0 import/export | Process interoperability | Built with XXE guard; bpmn.io modeller not embedded (licence watermark condition) | BA | Closed |
| GAP-005 | File storage with malware scanning | Evidence attachments | Built: allow-list + magic bytes + ClamAV (if CLAMAV_HOST) or builtin signatures, quarantine. Object storage for multi-node still open (DEC-05). | Platform | Partial |
| GAP-006 | Vector search / RAG over documents | AI knowledge search | Not built; needs pgvector and data-residency approval (DEC-07). Full-text search is available. | AI | Planned |
| GAP-007 | BC exercise management | ISO 22301 evidence | bc_exercises with achieved RTO/RPO and evidence | BC | Closed |
| GAP-008 | Policy register & attestations | GRC | policies + immutable attestations per version | Compliance | Closed |
| GAP-009 | Tender evaluation & vendor reviews | Procurement | tenders, bids, weighted scoring, award rules, COI declarations, vendor reviews | Procurement | Closed |
| GAP-010 | Accessibility audit, load test, backup automation | NFR acceptance | Local evidence in docs/testing/TEST_EVIDENCE.md; formal assessments in the target environment still required | QA | Partial |
| GAP-011 | Malaysia PDPA interpretation (breach timelines, DPO duties) | Legal compliance | Legal review; obligations seeded as synthetic examples | Legal | Open (DEC-08) |
| GAP-012 | Climate consideration in BIA/risk (ISO 22301 Amd 1:2024) | Standard alignment | BIA category 'environmental' and risk category 'climate' | BC | Closed |
| GAP-014 | Resource levelling / schedule compression (FR-SCH-010) | Advanced scheduling | Deferred to Phase 4; CPM, float and scenarios available now | PMO | Deferred |
| GAP-015 | Onboarding/offboarding checklists (FR-RES-010) | People process | Deferred to Phase 4; recurring work templates as interim | Resource mgmt | Deferred |
