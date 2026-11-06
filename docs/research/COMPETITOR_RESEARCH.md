# Competitor & comparable-platform research

Access date 2026-11-06. Source IDs (Sxx) refer to `RESEARCH_SOURCE_REGISTER.md`. Pricing is recorded only where a source stated it and may be out of date; nothing here is a procurement recommendation. We learn from these products; we do not copy their UI, code or documentation.

**Confidence:** H official / M official-via-summary or consistent secondary / L single secondary or prior knowledge not re-verified.

## 1. Strategic & project portfolio management

### ServiceNow Strategic Portfolio Management (ServiceNow) – M (S04–S06)
- **Purpose:** enterprise SPM on the Now Platform: demand → portfolio planning → project/agile execution → financials.
- **Capabilities / workflows:** structured demand workflow (intake, capacity & assessment, financial assessment, approval) with business case, cost estimation and risk evaluation; Portfolio Planning workspace with roadmaps and scenario planning; higher tiers add strategic planning, investment funding and SAFe/PI planning (S05). Demand can be associated with an AI system inside the demand workflow (S04).
- **Strengths:** single platform with ITSM/GRC, demand-to-project hand-off, scenario planning.
- **Limitations (evidence):** practitioners report it is often adopted for demand→project and resource hand-offs first (S06); platform complexity/licence tiers (S05).
- **Integration / AI / security:** platform-native; AI assistants in newer releases (not verified in detail).
- **Adopt:** staged demand intake with assessments; scenario planning vs capacity and funding.
- **Improve:** product-as-first-class object independent of projects; BIA embedded in demand.
- **Avoid:** licence-tier gating of core governance features; configuration sprawl.

### Planview Portfolios (Planview) – M (S32, S33)
- **Capabilities:** capacity planning “in tandem with prioritisation and scenario analysis”; scenarios checked against financial and capacity constraints with automatic and manual ranking; AI assistant (Anvi) generating planning scenarios (third-party listing).
- **Limitations:** scenario quality depends on clean capacity/financial data (third-party review).
- **Adopt:** capacity-constrained scenario ranking. **Improve:** make data gaps explicit rather than hidden. **Avoid:** heavy upfront data loading before value.

### OpenProject (OpenProject GmbH) – M/L (S19, S20)
- **Capabilities:** GPLv3 self-hostable; classic, agile and hybrid PM; multi-project Gantt, budgets, time/cost reporting, agile boards; optional BIM edition.
- **Limitations:** configuration complexity for new admins; focus on PM rather than delivery analytics (S20).
- **Adopt:** self-hosting, open data model, hybrid methods. **Improve:** portfolio finance and resilience depth.

### Microsoft Azure DevOps – Delivery Plans – M (S34)
- Calendar view of team backlog items by sprint, cross-team, with roll-up progress on cards and dependency tracking; read-only stakeholder views.
- **Adopt:** roll-up progress on timeline items; cross-team dependency lines. **Avoid:** team-centric data model as the portfolio source of truth.

### Asana / monday.com / Smartsheet – L (S41)
- Portfolios, workload and goals available at higher plans (Asana Advanced), portfolio templates and scoring columns (monday), grid/Gantt/automation strength (Smartsheet). Portfolio-workload views may show only capacity inside one portfolio (Asana) – a person spread across portfolios may be under-reported.
- **Adopt:** easy boards and automation UX. **Improve:** organisation-wide capacity irrespective of portfolio; governed approvals. **Avoid:** spreadsheets as the system of record.

### Microsoft Project / Planner, ClickUp, Jira Plans – L (prior knowledge, not re-verified)
- Scheduling engines with critical path (Project), lightweight task planning (Planner), all-in-one work management (ClickUp), cross-team plans on Jira (Plans). **Follow-up research required (R-02).**

## 2. Product management

### Jira Product Discovery (Atlassian) – M (S07–S09)
- Ideas with insights (evidence such as quotes, analytics), votes, delivery links and custom fields; formula fields including weighted scoring; matrix (e.g. impact vs effort) and timeline views; links to Jira epics; cross-project roadmap views; fields unique to discovery projects.
- **Adopt:** evidence (insights/feedback) attached to ideas; matrix prioritisation; delivery linkage. **Improve:** link discovery to finance, BIA and benefits. **Avoid:** discovery data siloed from portfolio governance.

### Aha! Roadmaps – M (S24, S25)
- Strategy (goals, initiatives) linked to releases and features; customisable scorecards (value/effort, RICE/WSJF-style) across initiatives, ideas, epics and features; ideas portal with voting.
- **Adopt:** shared scorecards across object types; strategy-to-feature linkage. **Improve:** governance gates and financial control.

### Productboard (Pulse, Spark) – M (S38)
- AI voice-of-customer layer (Pulse): topic hierarchy (AI + user-defined), trend reports, account context; AI-drafted specs from linked insights; Spark agent (public beta).
- **Adopt:** feedback trends and themes. **Improve:** cite sources in AI drafts; human approval before changes.

### airfocus, ProductPlan, Linear – L (not re-verified)
- Modular prioritisation (airfocus), roadmap presentation (ProductPlan), fast issue tracking with refined UI (Linear, see UX benchmark S48–S49).

## 3. Service management & operations

### Jira Service Management – change management – H (S43, S44)
- CAB approvals by adding a CAB group to the approvals field; default ITSM change workflow has peer and CAB review stages but approvals are **not enforced unless configured** (S44); deployment gating from CI/CD.
- **Adopt:** CAB approval step; deployment gating. **Improve:** enforce approvals by default (our server enforces readiness and CAB before deployment can be recorded). **Avoid:** governance that can be bypassed by workflow transitions.

### ServiceNow ITSM, Freshservice, BMC Helix, ManageEngine – L (prior knowledge)
- Incident/problem/change/request with CMDB. Our platform does not replace ITSM; it links operational work to services/products and integrates (mock adapters) – see ADR-0006.

## 4. GRC

### ServiceNow IRM/GRC – M (S45)
- Control attestations (owners validate control questions, attach evidence), smart assessments, issues closed on passing attestation; risk assessments linked to controls; recurring attestations via configuration.
- **Adopt:** control–risk linkage and evidence. **Improve:** keep mapping ≠ certification explicit. RSA Archer, MetricStream, OneTrust, Riskonnect – L (not re-verified).

## 5. Process, architecture, knowledge, DevOps
- **Camunda 8 (S42 – M):** from 8.6 (Oct 2024) self-managed production use requires a licence; Camunda 7 was Apache-2.0. → We do **not** embed Camunda; our gate workflow engine is native (ADR-0003). BPMN modelling via an open-source modeller is planned after licence verification.
- Sparx EA, Bizzdesign, Signavio, Bizagi, Visio, Miro, Lucidchart, Confluence, SharePoint, Notion, GitBook, Document360, GitHub Projects, GitLab, Jenkins, GitHub Actions – **L, follow-up research R-02**.

## 6. AI-assisted workflows
- **LangGraph (S46 – H):** `interrupt()` saves graph state and waits for human input; resume via `Command` – the model for our human-in-the-loop pattern (AI suggestion → human acceptance).
- **Langfuse (S47 – L):** open-source LLM tracing/evaluation, self-hostable; candidate for AI observability (DEC-07).
- **MCP (S39 – M):** 2025-06-18 spec treats MCP servers as OAuth resource servers, forbids token passthrough; any MCP exposure of this platform must follow it (planned, not built).
- **Claude / Anthropic SDK (S50 – H):** used via an optional provider adapter; default model `claude-opus-5-5` when explicitly enabled.

## 7. Cross-cutting observations
1. Most tools treat **projects as the container**; products and operational work are second-class. → Shared model with products, services and work independent of projects.
2. **Approvals are often configurable but not enforced** (JSM). → Server-side enforcement of authority limits, SoD, guarded statuses.
3. **BIA lives in separate BCM tools** and rarely links to portfolio intake. → BIA screening at intake, gates, traceability.
4. **AI features generate content without provenance.** → Citations, confidence, no write authority.
5. **Missing data renders as zero/green.** → Explicit “no data” states and data-gap lists.
