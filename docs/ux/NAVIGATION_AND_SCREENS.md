# Navigation architecture, user journeys & screen inventory

## Navigation model
Sidebar groups (permission-filtered): **Overview** (Command centre, My work) · **Strategy & portfolio** (Strategy & OKRs, Portfolio, Programmes) · **Delivery** (Projects, RAID, Change control, Quality & release) · **Product** (Products, Discovery & ideas) · **Operations** (Operational work, BIA & resilience, Processes) · **Enablers** (Finance & benefits, Resources, Vendors & contracts, Documents) · **Governance** (Governance & audit, Architecture, AI intelligence, Administration). Top bar: global search/command palette, Create (quick-create), theme, notifications, user. Breadcrumbs on workspaces. Max depth: section → workspace → drawer.

Role landing: users with `dashboard:read` land on the Command centre; others on My work.

## Key journeys
1. **Executive weekly review:** Command centre → click red bubble → Project workspace → AI insight → Governance → approve with conditions.
2. **PM intake to planning:** Create project → BIA screening (draft BIA auto-created) → Governance & gates → generate charter (missing fields flagged) → submit planning gate.
3. **Product manager:** Discovery → score ideas (RICE) → roadmap lanes → link project to product → releases.
4. **BC manager:** Resilience → traceability gaps → BIA detail → edit impact matrix (MTPD recalculated) → add dependency → submit (blocked until consistent).
5. **Finance controller:** My approvals → authority-checked decision → Finance roll-up → waterfall/variance.
6. **Release manager:** Quality & release → readiness checks → submit CAB → authorise deployment.
7. **Operations:** Operational work → incident linked to service (no project) → board.

## Screen inventory (implemented; screenshots in `docs/screenshots/`)
| # | Screen | Route | Key visuals |
|---|---|---|---|
| 1 | Sign-in | `/` (unauthenticated) | Brand hero illustration |
| 2 | Executive command centre | `/` | Hero KPIs, health donut, portfolio bubble map, investment bars, spend trend, risk heatmap, objectives rings, benefits ring, milestone timeline, decisions, product health, BC tiers, project health table |
| 3 | My work | `/my-work` | Personal board, KPIs |
| 4 | Strategy & OKRs | `/strategy` | Objective cards with rings and KR progress |
| 5 | Portfolio | `/portfolio` | Portfolio cards, allocation donut, quadrant, health heatmap |
| 6 | Programmes | `/programmes` | Programme cards with rings |
| 7 | Projects | `/projects` | Table / portfolio Gantt |
| 8 | Project workspace | `/projects/:id` | KPIs, AI insight, 11 tabs incl. Gantt, board, RAID, change, finance (waterfall, monthly, EVM), resources, quality, gates, documents, history |
| 9 | Products | `/products` | Lifecycle distribution, product cards with health rings |
| 10 | Product workspace | `/products/:id` | Roadmap lanes + timeline, discovery funnel/matrix, projects & releases, ops, finance, resilience |
| 11 | Discovery & ideas | `/discovery` | Funnel, value/effort matrix, top RICE |
| 12 | RAID | `/raid` | Heatmap drill-down, category chart, registers |
| 13 | Change control | `/changes` | Pending assessments chart, CR register |
| 14 | Quality & release | `/quality` | Release calendar, readiness checklist, test progress |
| 15 | Operational work | `/operations` | Type donut, filter chips, table/board |
| 16 | BIA & resilience | `/resilience` | Tier chart, MTPD vs RTO bars, traceability graphs, register |
| 17 | BIA detail | `/resilience/bia/:id` | Impact heatmap editor, dependencies, recovery timeline, findings, approval |
| 18 | Processes | `/processes` | BPMN-style swimlane map |
| 19 | Finance & benefits | `/finance` | Portfolio roll-up, waterfall, monthly, business-case appraisal |
| 20 | Resources | `/resources` | Capacity heatmap, conflicts, demand |
| 21 | Vendors & contracts | `/vendors` | Expiry runway, renewal attention |
| 22 | Documents | `/documents` | Generator, library, versioned viewer with MISSING highlights |
| 23 | Governance & audit | `/governance` | Approval inbox, decisions, controls, obligations, findings, metric definitions, audit trail + verification |
| 24 | Architecture | `/architecture` | Hosting mix, EOL watch, ADRs |
| 25 | AI intelligence centre | `/ai` | Chat with citations/confidence, guided analyses, controls, interaction log |
| 26 | Administration | `/admin` | Users & roles, workflows, thresholds & authority, integrations (MOCK/LIVE), data browser |
| 27 | Generic record page | `/r/:key` | Metadata table + drawer for any resource |
