# Architecture

Meridian is a **modular monolith**: one deployable API with clear domain modules over one relational database, plus a static single-page web client. It is API-first, container-packaged and designed to split later only where scale or ownership demands (ADR-0001).

## 1. System context (C4 level 1)

```mermaid
C4Context
title System context – Meridian
Person(exec, "Executives & sponsors", "Decisions, approvals, command centre")
Person(pmo, "PMO, portfolio & project managers", "Governance, delivery, RAID, finance")
Person(prod, "Product managers & BAs", "Discovery, roadmaps, requirements")
Person(bcm, "BC, risk, security, audit", "BIA, controls, audit trail")
Person(ops, "Operations, testers, release", "Operational work, testing, CAB, deployment")
System(meridian, "Meridian platform", "Strategy, portfolio, product, project, work, BIA, finance, GRC, documents, AI")
System_Ext(idp, "Identity provider (Entra ID) – planned", "SSO / SCIM")
System_Ext(dev, "Jira / Azure DevOps / GitHub – mock adapters", "Delivery work sync")
System_Ext(itsm, "ServiceNow / ITSM – mock adapter", "Incidents & changes")
System_Ext(erp, "ERP / HR – mock adapters", "Actuals, leave")
System_Ext(collab, "Teams / Slack / Email – mock adapters", "Notifications")
System_Ext(llm, "LLM provider (optional)", "Anthropic or self-hosted OpenAI-compatible")
Rel(exec, meridian, "Uses", "HTTPS")
Rel(pmo, meridian, "Uses", "HTTPS")
Rel(prod, meridian, "Uses", "HTTPS")
Rel(bcm, meridian, "Uses", "HTTPS")
Rel(ops, meridian, "Uses", "HTTPS")
Rel(meridian, idp, "Authenticates via (planned)", "OIDC")
Rel(meridian, dev, "Events / signed webhooks")
Rel(meridian, itsm, "Events / signed webhooks")
Rel(meridian, erp, "Imports")
Rel(meridian, collab, "Notifies")
Rel(meridian, llm, "Optional, policy-gated prompts", "HTTPS")
```

## 2. Containers (C4 level 2)

```mermaid
flowchart LR
  user([Browser]) -->|HTTPS| web[web: nginx 1.27\nSPA + CSP + /api reverse proxy]
  web -->|HTTP /api| api[api: Node 22 + Fastify 5\nmodular monolith]
  api -->|SQL, TLS optional| db[(PostgreSQL 16\nshared enterprise model)]
  api --> files[(File volume\n/data/files)]
  api -.->|optional| llm[LLM provider]
  api -.->|queue worker in-process| ext[External systems\nmock adapters]
  ext -.->|signed webhooks| api
```

| Container | Technology | Responsibility |
|---|---|---|
| web | React 18 + Vite build, served by nginx | UI, design system, charts; security headers; SPA routing; proxies `/api` |
| api | TypeScript, Fastify 5, pg, zod | Auth, RBAC/ABAC, validation, domain services, workflow/approvals, reporting, AI layer, integrations, jobs |
| db | PostgreSQL 16 | Single relational model (≈60 tables), constraints, audit immutability trigger |
| files | Docker volume | Attachments (scanning pipeline planned) |

## 3. API components (C4 level 3)

```mermaid
flowchart TB
  subgraph http[HTTP layer – app.ts]
    auth[auth: login, JWT, lockout, CSRF]
    routes[routes: /api/r/*, domain endpoints]
  end
  subgraph core[core]
    ctx[context & can()] --- audit[audit hash chain] --- codes[record codes] --- notify[notifications]
  end
  subgraph res[resources]
    registry[registry: field metadata] --> crud[generic CRUD: validate, refs, ABAC, hooks, audit]
  end
  subgraph domain[domain services]
    calc[calc: EVM, NPV/IRR, RICE, MTPD, RAG, load]
    wf[workflow & approvals]
    bia[BIA & traceability]
    fin[finance roll-up & FX]
    resm[capacity]
    rel[release readiness]
    dash[dashboards]
    docs[document generators]
    search[search]
    hooks[entity hooks: CR impact assessments, risk acceptance guard, defects from failures]
  end
  subgraph ai[ai]
    prov[providers: local / anthropic / openai-compatible] --- asst[assistant: retrieval, citations, injection checks, logging]
  end
  integ[integrations: queue, retry, dead-letter, webhooks, mock connectors]
  jobs[jobs: daily checks, queue processor]
  routes --> crud & wf & bia & fin & resm & rel & dash & docs & search & asst & integ
  crud --> hooks --> calc
  wf --> audit
  jobs --> integ & notify
```

Module boundaries are folders with one-way dependencies (`resources` → `domain/hooks` → `domain/*` → `core`). Cross-module calls go through service functions, never through another module's tables directly, except read-only reporting queries (documented in the dashboard module).

## 4. Deployment

```mermaid
flowchart LR
  subgraph host[Docker host / VM / Kubernetes node]
    subgraph net_front[frontend network]
      web
    end
    subgraph net_back[backend network]
      api --- db
    end
    web --- api
  end
  lb[TLS terminator / load balancer] --> web
```

- `docker compose up` runs db, api, web with health checks and restart policies; only the web port is published.
- Secrets come from `.env` (generated with random values by `start.sh`), never from the image.
- Production: put TLS in front (set `COOKIE_SECURE=true`), managed PostgreSQL with PITR, image scanning, and a separate worker container for jobs when running >1 API replica (ADR-0004).

## 5. Key flows

**Governed change request**
```mermaid
sequenceDiagram
  actor PM
  participant API
  participant DB
  PM->>API: POST /api/r/change_requests
  API->>DB: insert CR (tx) + audit
  API->>DB: hook: create impact assessments by rule (schedule, cost, scope, risk, BIA, security, ops, vendor)
  API-->>PM: 201 status=assessing
  Note over API: assessors complete → CR auto-moves to pending_approval
  PM->>API: POST /api/change-requests/:id/submit
  API->>DB: route via approval matrix (amount) + finance in parallel
  actor Approver
  Approver->>API: POST /api/approvals/:id/decide
  API->>API: human? in role? SoD? within authority?
  API->>DB: all approved → CR approved, project end date + impact days, forecast cost entry, audit
```

**AI question**: authenticate → `ai:use` check → injection scan → permission-trimmed search → per-record `getRow` (ABAC) → local summary *or* provider call with only public/internal records inside delimited `<record>` blocks → citations/confidence → `ai_interactions` + audit.

## 6. Data flow & classification
Data classes: public, internal, confidential, restricted (column on every business table). Restricted rows are filtered in SQL for non-owners; confidential/restricted are excluded from external AI providers. Audit events redact secret-like fields. See `docs/database/DATA_MODEL.md` and `docs/security/SECURITY.md`.

## 7. Integration architecture
Outbound: domain/test events → `integration_events` (idempotency key) → in-process processor (every 30s) → connector → delivered / failed (exponential backoff) / dead-letter (after max attempts) → manual retry. Inbound: `POST /api/hooks/:org/:key` → HMAC verification (live) or explicit mock header → de-duplication → field mapping → upsert work item → audit as `integration` actor. Secrets are referenced by name (`secret_ref`) and resolved from the environment.

## 8. Technology decisions
See `docs/decisions/` (ADR-0001…ADR-0009) – including the evaluated Angular + Laravel alternative.
