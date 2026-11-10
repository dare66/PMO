# UI design benchmark & design decisions

| Reference | What we studied | Evidence | What we adopted (original implementation) | Avoided |
|---|---|---|---|---|
| Linear | Information density with low visual noise; dimmed navigation; native feel across platforms; principle “don't compete for attention you haven't earned” | S48, S49 (M) | Quiet translucent sidebar, restrained borders, keyboard command palette (Ctrl/Cmd-K), fast tables | Dark-by-default |
| Stripe Dashboard | Calm financial UI, tabular numerals, clear KPI hierarchy | Not verified online (L) | Tabular numbers, compact currency formatting, KPI tiles with context footers | – |
| Atlassian / Jira Product Discovery | Matrix and timeline views for prioritisation | S07 (M) | Value-vs-effort bubble matrix, Now/Next/Later lanes + timeline | Field sprawl |
| ServiceNow workspaces | Record-centric workspaces with related lists & playbooks | S04 (M) | Record drawers with Details / Workflow & approvals / History tabs; related tables per workspace | Deep nested navigation |
| Azure DevOps Delivery Plans | Roll-up progress on timeline cards | S34 (M) | Gantt bars with progress fill and baseline markers | – |
| Microsoft Fluent, Datadog, Tableau, Power BI, Vercel, Notion, monday, ClickUp, Asana | Navigation, dashboards, empty states | Not verified in this pass (L) | General patterns only (skeleton loading, empty-state illustrations, toasts) | Copying any brand asset or layout |

**Design principles:** (1) Truth before decoration – every visual is computed from records; missing data is visible. (2) One system – tokens, components and chart rules shared by all modules. (3) Dense but calm – 13–14px base, tabular numerals, subtle elevation. (4) Context over navigation – drawers and tabs keep users in the workspace. (5) Accessible by construction – keyboard paths, focus rings, chart tables, colour never alone. (6) Purposeful motion – ≤350ms ease-out, disabled under `prefers-reduced-motion`.
