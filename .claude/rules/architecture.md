# Architecture rules
- Modular monolith; folders are module boundaries: `core` ← `domain` ← `resources` ← `app`. No circular imports.
- SQL only with parameters; identifiers only from the static registry.
- One PostgreSQL schema; no per-module databases; no new infrastructure (Redis, queues, microservices) without an ADR.
- API-first: every UI capability must be available through the API and appear in OpenAPI.
