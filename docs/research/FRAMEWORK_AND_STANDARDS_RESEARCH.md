# Frameworks & standards research

Access date 2026-11-06. Sources in `RESEARCH_SOURCE_REGISTER.md`. **The platform supports practices aligned to these frameworks; it does not confer certification or compliance.**

| Framework | Current status found | Confidence | How the platform uses it |
|---|---|---|---|
| PMBOK Guide – 8th edition (PMI) | Published Nov 2025; 6 principles (holistic view, focus on value, embed quality, lead accountably, integrate sustainability, build empowered teams) and 7 performance domains (Governance, Scope, Schedule, Finance, Stakeholders, Resources, Risk); secondary sources report 5 focus areas, 40 non-prescriptive processes, AI & PMO coverage (S01–S03) | Principles/domains M; processes L | Mapping below; tailoring via workflow templates |
| PMI programme / portfolio standards, PMI Guide to Business Analysis | Not re-verified (R-02) | L | Programme & portfolio objects; BA requirements |
| Agile Practice Guide; Scrum Guide 2020; Kanban | Scrum Guide 2020 remains current per 2024–25 sources (Product Goal; single Scrum Team) (S28) | M | Agile template, boards, story points |
| PRINCE2 7 (2023) | 7 principles, 7 practices (business case, organising, plans, quality, risk, issues, progress), 7 processes + people element; sustainability performance target (S26, S27) | M | Stage gates, business case, exception handling (gate exceptions) |
| ISO 21502:2020 / 21503:2022 / 21504:2022 | Current editions; no revisions announced (S21–S23) | M | Project, programme, portfolio objects and governance |
| ISO 22301:2019 + Amd 1:2024 | Amendment (Feb 2024) adds climate-change consideration to 4.1/4.2 (S10, S11) | M | BIA module; climate is a configurable impact consideration (backlog) |
| ISO/TS 22317:2021 | 2nd edition BIA guidelines; prioritised activities, MTPD/RTO/MBCO concepts (S12–S14) | M (structure) / L (clause wording) | MTPD derivation, RTO ≤ MTPD validation, MBCO, dependency capability |
| ISO 31000:2018 | Not re-verified | L | Risk register, appetite, treatment, residual |
| ISO 9001 | 2015 current; 2026 revision at FDIS, publication expected Sept 2026 – status at access date unconfirmed (S40) | M | Quality plans, CAPA via findings |
| ISO/IEC 27001:2022 | Annex A 93 controls (prior knowledge, not re-verified) | L | Controls register references; security design |
| ISO/IEC 20000, ITIL 4 | ITIL 4: 34 practices; change enablement, release & deployment management in “Plan, Implement and Control” group (S35, S36) | M | Change control, CAB, release/deployment, service transition |
| COBIT 2019 | 40 governance & management objectives in 5 domains (EDM, APO, BAI, DSS, MEA) (S37) | M | Governance forums, controls |
| TOGAF, C4 model | Not re-verified | L | ADRs, application portfolio; C4 diagrams in architecture docs |
| BPMN 2.0 | – | L | Process steps with start/task/decision/end; BPMN XML storage |
| OWASP ASVS 5.0.0 | Released 30 May 2025 at Global AppSec EU (S29, S30) | H | Security verification target L2 – `docs/security/SECURITY.md` |
| WCAG 2.2 | W3C Recommendation 5 Oct 2023; 9 new SC incl. 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size (24px); 4.1.1 removed (S31) | H | AA target – board drag alternative, 24px targets, focus |
| Malaysia PDPA (Amendment) Act 2024 | Phased commencement (gazetted 24 Dec 2024): DPO, breach notification and data portability effective 1 June 2025; sources differ on whether the first phase was 1 Jan or 1 Apr 2025; 72-hour breach window was only a consultation proposal (S15–S18) | M | Obligations register seeded; legal confirmation required (DEC-08) |
| MCP (2025-06-18) | OAuth resource-server model; token passthrough prohibited (S39) | M | Constraints for any future MCP server |

## PMBOK 8 performance-domain mapping

| Domain | Platform capability (requirement IDs) |
|---|---|
| Governance | Workflow gates, approvals, decision register, audit (FR-PLT-006/007, FR-GOV-001/003, FR-PLT-004) |
| Scope | Requirements, deliverables, change control (FR-BA-001, FR-PRJ-004, FR-RSK-004) |
| Schedule | Milestones, Gantt, SPI (FR-PRJ-004/006) |
| Finance | Budgets, actuals, EVM, business case, benefits (FR-FIN-001..006) |
| Stakeholders | Decisions, meetings; stakeholder register planned (FR-GOV-001, FR-PRJ-008/009) |
| Resources | Allocations, capacity, skills (FR-RES-001..003) |
| Risk | RAID, risk acceptance, BIA (FR-RSK-001..004, FR-BIA-*) |

Principles are reflected as design rules: *focus on value* → benefits realisation and value/effort prioritisation; *embed quality* → quality gates and readiness; *lead accountably* → owners on every record, approvals with identity; *integrate sustainability* → (backlog) sustainability fields aligned to PRINCE2 7 and ISO 22301 Amd 1; *holistic view* → shared enterprise model; *empowered teams* → configurable lifecycles and boards.

## BIA method implemented (ISO/TS 22317-aligned concepts)
1. Identify prioritised activities (business processes/services).
2. Assess impact severity over time across five categories.
3. MTPD = earliest horizon at which any category reaches the organisation's tolerance threshold (configurable per BIA, default 4/5). Justified overrides allowed.
4. RTO must be ≤ MTPD; RPO and MBCO recorded.
5. Dependencies with demonstrated recovery/data-loss capability are compared with RTO/RPO; gaps and single points of failure flagged.
6. Recovery strategies with test evidence; untested/failed strategies flagged.
7. Approval and periodic review; edits after approval require re-approval.
Exact clause wording of ISO/TS 22317 was not reviewed (paywalled); method is consistent with the secondary sources and should be validated by the BC function (DEC-09).
