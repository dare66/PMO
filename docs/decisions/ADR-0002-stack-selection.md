# ADR-0002 – Technology stack: TypeScript (Fastify + React) on PostgreSQL
**Status:** Proposed for approval (DEC-02) · **Date:** 2026-11-06

| Criterion | Angular + Laravel (PHP) | **Fastify + React (TypeScript)** | Spring Boot + Angular | .NET + Blazor/React |
|---|---|---|---|---|
| One language front/back, shared types | No | **Yes** | No | Partly |
| Enterprise structure out of the box | Strong (both) | Medium (we impose modules) | Strong | Strong |
| Throughput / footprint | Good | **Very good, small images** | Good, heavier JVM | Good |
| Charting / UI ecosystem for premium dashboards | Good | **Largest** | Good | Good |
| Talent availability (MY region, general) | Good | **Very good** | Good | Good |
| Fit for metadata-driven generic CRUD + domain services | Good (Eloquent) | **Good (zod + registry)** | Good | Good |
| Ops in containers | Good (php-fpm+nginx) | **Simple (node)** | Good | Good |

**Decision:** TypeScript end-to-end: Node 22, Fastify 5, `pg` (SQL-first, explicit migrations), zod validation; React 18 + Vite; Recharts + custom SVG; PostgreSQL 16. No ORM to keep SQL reviewable and portable.
**Consequences:** one language, shared domain types possible later; we own the module discipline (enforced by folder boundaries and review rules). Angular + Laravel remains a credible alternative if your organisation standardises on PHP/Angular – the data model and API contract are framework-neutral.
