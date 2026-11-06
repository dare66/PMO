# Requirement gap register

| ID | Gap | Impact | Action | Owner | Status |
|---|---|---|---|---|---|
| GAP-000 | Existing FRS `Enterprise_Project_Management_PMO_FRS_v1.1_Product_Management_Included.docx` not present in the repository or session. Its requirement IDs, workflows, roles, entities and acceptance criteria could not be extracted or classified. | Traceability to the original baseline is incomplete; possible omissions or ID conflicts. | User to upload the docx. Import procedure: extract requirements → add `baseline_id` → classify each as Retained / Enhanced / Expanded / Replaced (with justification) / Deferred / Rejected (with justification) → map to FR-IDs → regenerate MASTER_FRS and traceability. No v1.1 requirement will be dropped silently. | Product owner (user) | **Open – blocking for baseline sign-off, not for build** |
| GAP-001 | Scenario planning (portfolio what-if) | Portfolio optimisation | FR-STR-005 planned Phase 3 | PMO | Planned |
| GAP-002 | SSO / SCIM / Entra ID | Enterprise identity | FR-INT-004; needs tenant and app registration (DEC-03) | Security | Planned |
| GAP-003 | Stakeholder & communications register | PMBOK Stakeholders domain | FR-PRJ-008 | PMO | Planned |
| GAP-004 | BPMN 2.0 import/export | Process interoperability | FR-BA-003; verify modeller licence | BA | Planned |
| GAP-005 | File storage with malware scanning | Evidence attachments | FR-DOC-003; select scanner (ClamAV) and object storage (DEC-05) | Platform | Planned |
| GAP-006 | Vector search / RAG over documents | AI knowledge search | FR-AI-005; pgvector; data-residency approval (DEC-07) | AI | Planned |
| GAP-007 | BC exercise management | ISO 22301 evidence | FR-BIA-006 | BC | Partial |
| GAP-008 | Policy register & attestations | GRC | FR-GOV-004 | Compliance | Planned |
| GAP-009 | Tender evaluation & vendor performance reviews | Procurement | FR-VND-004 | Procurement | Planned |
| GAP-010 | Accessibility audit, load test, backup automation | NFR acceptance | FR-NFR-002/003/004 Phase 11 | QA | Planned |
| GAP-011 | Malaysia PDPA interpretation (breach timelines, DPO duties) | Legal compliance | Legal review; obligations seeded as synthetic examples | Legal | Open (DEC-08) |
| GAP-012 | Climate-change consideration in BIA/risk (ISO 22301 Amd 1:2024) | Standard alignment | Add climate impact category / risk category option | BC | Planned |
