# Decisions requiring your approval

| ID | Decision | Recommendation | Why it needs you | Blocking? |
|---|---|---|---|---|
| DEC-00 | Provide FRS v1.1 docx | Upload to repo `docs/requirements/source/` | Baseline reconciliation (GAP-000) | Blocks baseline sign-off |
| DEC-01 | Approve architecture & implementation baseline | Modular monolith, single PostgreSQL model (ADR-0001) | Material architecture decision | Yes, before Phase 3+ expansion |
| DEC-02 | Approve stack | TypeScript Fastify/React (ADR-0002); Angular+Laravel kept as documented alternative | Skills/standards in your organisation | Yes |
| DEC-03 | Identity provider for SSO/SCIM | Microsoft Entra ID (OIDC) | Needs tenant app registration & consent | No (local auth works) |
| DEC-04 | Hosting target | Containers on your cloud/on-prem (managed PostgreSQL with PITR) | Cost, data residency (Malaysia) | Before production |
| DEC-05 | Object storage + malware scanning | S3-compatible storage + ClamAV | New components/cost | Before file uploads |
| DEC-06 | Which live integrations first | Entra ID, Teams notifications, Jira/Azure DevOps | Credentials, external data transmission | No |
| DEC-07 | External LLM use | Keep `local`; pilot Anthropic or self-hosted model with confidential data excluded; add Langfuse tracing | Data leaves platform; paid service | No |
| DEC-08 | PDPA interpretation & retention periods | Legal review of obligations register and retention table | Legal accountability | Before production |
| DEC-09 | BIA method & tolerance scale | Adopt implemented ISO/TS 22317-aligned method; BC manager to validate severity scale & horizons | Organisational risk appetite | No |
| DEC-10 | Delegated-authority limits | Review seeded matrix (e.g. finance controller ≤ RM 250k) | Governance policy | Before production |
| DEC-11 | Repository target | Code pushed to `dare66/PMO` branch `claude/wonderful-einstein-own7ir` with a draft PR | Merge to main is yours | No |
