# CLAUDE.md – working on Meridian

Meridian is an enterprise strategy/portfolio/product/project/work platform. Modular monolith: `backend/` (Fastify 5, TypeScript, PostgreSQL via `pg`, zod) and `frontend/` (React 18, Vite, Recharts, custom design system). Docs in `docs/` are part of the product – keep them in sync.

## Commands
- Backend typecheck: `cd backend && npx tsc --noEmit -p .`
- Backend tests (needs Postgres): `cd backend && TEST_DATABASE_URL=postgres://postgres:devpass@localhost:5433/pmo_test npm test`
- Frontend typecheck/build: `cd frontend && npx tsc --noEmit -p . && npx vite build`
- Full stack: `./start.sh` (Docker). Visual QA: `BASE_URL=… DEMO_PASSWORD=… node scripts/screenshots.mjs`
- Regenerate FRS/traceability: `python3 docs/requirements/requirements_source.py`

## Architecture rules (see .claude/rules/)
1. One shared data model – new entities go in a **new** migration file; never edit an applied migration.
2. Register every business entity in `backend/src/resources/registry.ts`; use generic CRUD + hooks before writing custom endpoints.
3. Governed transitions (approvals, closure, deployment, risk acceptance) are server-enforced – add statuses to `GUARDED_STATUS` and an approval effect in `workflow.ts`.
4. Every mutation is audited inside the same transaction (`core/audit.ts`).
5. Missing data is `null`/“unknown”, never 0 or green.
6. AI never writes records or decides; suggestions require human acceptance.
7. Never commit secrets; integrations reference secrets by env-var name; mock connectors stay labelled MOCK.
8. Products are not projects; operational work is not forced into projects.

## Definition of done
Migration + registry + validation + permissions + audit + UI (loading/empty/error) + tests + docs + requirement ID updated in `requirements_source.py`.
