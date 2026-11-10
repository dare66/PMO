# Meridian – Enterprise Strategy, Portfolio, Product, Project & Work Platform

A unified, governed platform from strategy to service: portfolios, programmes, projects, **products**, operational work, **BIA & resilience**, finance & benefits, resources, RAID & change, quality & release, vendors, GRC, documents and a controlled AI assistant – on one shared data model.

![Command centre](docs/screenshots/01-command-centre.jpg)

## Run it locally (Docker)
**Needs:** Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux), about 2 GB free disk, and internet access for the first build.

```bash
git clone -b claude/wonderful-einstein-own7ir https://github.com/dare66/PMO.git
cd PMO
./start.sh                                   # macOS / Linux / WSL
```
On Windows PowerShell use `powershell -ExecutionPolicy Bypass -File .\start.ps1` instead.

The first run creates `.env` with random secrets, builds the images (a few minutes), starts PostgreSQL + API + web, and loads a **synthetic** demo organisation. Open **http://localhost:8080** and sign in as `ceo@demo.example`, `pmo@demo.example`, `pm1@demo.example`, `product@demo.example`, `bcm@demo.example`, `finance@demo.example` or `admin@demo.example` with the demo password the script prints (also in `.env` as `DEMO_PASSWORD`).

| Task | Command |
|---|---|
| Stop (keep data) | `docker compose down` |
| Start again | `docker compose up -d` |
| Reset everything (deletes data) | `docker compose down -v` then `./start.sh` |
| Logs | `docker compose logs -f api` |
| Port 8080 busy | set `WEB_PORT=8090` in `.env`, then `docker compose up -d` |
| Behind a corporate proxy with its own CA | `docker build --secret id=npm_ca,src=/path/ca.pem …` (see Dockerfiles) |
| Backup / restore | `scripts/backup.sh`, `scripts/restore.sh` |

For production settings (no demo data, first admin, HTTPS) see `docs/deployment/DEPLOYMENT.md`.

## What's inside
| Path | Contents |
|---|---|
| `backend/` | Fastify 5 + TypeScript API, SQL migrations, domain services, AI layer, integrations, tests |
| `frontend/` | React 18 + Vite SPA (route-level code splitting), Meridian design system, accessible charts, 26 workspaces, nginx config |
| `docker-compose.yml`, `start.sh` | db + api + web stack with health checks |
| `docs/` | Executive summary, research, Master FRS & traceability, architecture (C4), ERD, API, security, UX, testing evidence, deployment, user guide, SOPs, ADRs, decisions for approval, implementation plan |
| `scripts/` | `screenshots.mjs` visual QA · `a11y.mjs` axe-core scan · `backup.sh` / `restore.sh` / `restore-drill.sh` |
| `CLAUDE.md`, `.claude/` | Claude Code operating model: rules, skills, subagents, hooks |

Start with **[docs/EXECUTIVE_SUMMARY.md](docs/EXECUTIVE_SUMMARY.md)**, the **[FRS v1.1 reconciliation](docs/requirements/FRS_V11_RECONCILIATION.md)** (all 301 original IDs) and **[docs/decisions/DECISIONS_FOR_APPROVAL.md](docs/decisions/DECISIONS_FOR_APPROVAL.md)**.

## Develop
```bash
docker run -d --name pmo-db -e POSTGRES_PASSWORD=devpass -p 5433:5432 postgres:16-alpine
cd backend && npm ci && DATABASE_URL=postgres://postgres:devpass@localhost:5433/postgres JWT_SECRET=$(openssl rand -hex 24) SEED_DEMO=true DEMO_PASSWORD=Demo-Pass-2026 npm run dev
cd frontend && npm ci && API_URL=http://localhost:8080 npm run dev
```
Tests: `cd backend && TEST_DATABASE_URL=postgres://postgres:devpass@localhost:5433/pmo_test npm test` (102 tests). Regenerate the OpenAPI document with `npm run openapi` and the requirement documents with `python3 docs/requirements/requirements_source.py && python3 docs/requirements/frs_v11_reconciliation.py`.

## Honesty notes
Integrations other than the generic signed webhook are **mock** and labelled as such. AI runs in **local rules mode** unless an external provider is explicitly enabled. The uploaded FRS v1.1 is partial per the customer (GAP-013); every supplied item is reconciled. Test, load, accessibility and restore results are in `docs/testing/TEST_EVIDENCE.md` – formal penetration and accessibility assessments are still required before production. Framework alignment (ISO, PMBOK, ITIL…) is not a certification claim.
