# Technical debt register
| ID | Item | Impact | Plan |
|---|---|---|---|
| TD-01 | No frontend unit/component tests (only typecheck + visual capture) | Regressions in UI logic | Add Vitest + Testing Library; Playwright E2E for key journeys |
| TD-02 | Large page modules (Knowledge.tsx, demo seed) | Maintainability | Split per workspace |
| TD-03 | Some requirements lack dedicated automated tests (marked in traceability) | Evidence gaps | Add tests per FR |
| TD-04 | In-process jobs | Scale | Worker container |
| TD-05 | Route-level code splitting | Initial load | React.lazy per workspace |
| TD-06 | OpenAPI generated without per-endpoint request schemas for domain routes | API consumers | Generate from zod schemas |
