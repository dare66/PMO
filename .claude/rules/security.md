# Security rules
- Check permissions server-side with `requirePerm`/`can` for every endpoint; sensitive permissions are explicit-only.
- Respect ABAC (`visibilityClause`) in every new query that returns business rows.
- No secrets in code, config, tests or fixtures. Use `.env` (git-ignored).
- AI/system actors must not decide approvals, accept risk, change finance or deploy.
- Validate all input with zod; reject unknown fields.
