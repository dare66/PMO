# Security & privacy design

Target: **OWASP ASVS 5.0 Level 2** for the application, WCAG/PDPA considerations noted separately. This is a design target; no third-party verification has been performed.

## Threat model (STRIDE summary)
| Threat | Example | Controls in place | Residual / planned |
|---|---|---|---|
| Spoofing | Credential stuffing | bcrypt(12), generic errors, per-account lockout (5 → 15 min), login rate limit (10/min/IP), timing-equalised unknown-user path | SSO + MFA via IdP (DEC-03) |
| Tampering | Editing records to bypass approval | Guarded statuses only via approvals; strict schemas (unknown fields rejected); optimistic locking; audit hash chain + DB trigger | DB-level row security for multi-tenant SaaS |
| Repudiation | “I didn't approve that” | Every decision audited with user, time, note; append-only chain verified via `/api/audit/verify` | External WORM export of audit (planned) |
| Information disclosure | Seeing restricted records, password hashes, cross-tenant data | org_id on every query; RBAC + ABAC (restricted rows); sensitive perms not granted by wildcards; password hash stripped; restricted/confidential never sent to external AI; log redaction of auth headers | Field-level encryption for selected columns (planned) |
| Denial of service | Request floods | Global rate limit 600/min/IP; body limit 2 MB; page size ≤ 500 | Reverse-proxy/WAF limits in production |
| Elevation of privilege | Admin role self-removal, AI approving | Server-side permission checks per endpoint; AI/system actors cannot decide approvals or deploy; SoD on financial/procurement/risk/change/BIA approvals; delegation checks authority | Periodic access reviews (control seeded) |

## Controls by area
- **Session:** JWT (HS256, `JWT_SECRET` ≥32 chars, 8h). Browser: httpOnly, SameSite=Strict, `Secure` when `COOKIE_SECURE=true`; mutating cookie requests require `x-requested-with: pmo` (CSRF). API clients use bearer tokens.
- **Input/output:** zod validation on every write; parameterised SQL only (identifiers come from the static registry, never from input); sort columns whitelisted; React output encoding; markdown renderer escapes HTML before applying a minimal syntax subset.
- **Headers:** CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (nginx); helmet on API.
- **Secrets:** only environment variables; `.env` git-ignored; `start.sh` generates random secrets; integration secrets referenced by name (`secret_ref`), never stored in DB; no credentials in source or committed config.
- **Containers:** API runs as non-root `node`; multi-stage builds; only web port exposed; DB on internal network.
- **Files:** table includes SHA-256 and `scan_status`; upload endpoint deliberately not exposed until a scanner is integrated (GAP-005).
- **AI:** see `docs/architecture` and FR-AI-*: injection pattern detection, delimited untrusted context, no tools with write access, per-org monthly token budget, interaction log with cost, external transmission flag, provider disabled by default.
- **Supply chain:** exact dependency versions pinned; CI runs `npm audit --audit-level=high` (non-blocking report) and builds; Dependabot/Renovate recommended.

## ASVS 5.0 chapter coverage (self-assessment)
| Area | Status |
|---|---|
| Encoding & sanitisation, validation | Implemented (zod, parameterised SQL, CSP) |
| Authentication | Implemented for local accounts; MFA/SSO planned |
| Session management | Implemented (httpOnly/SameSite/expiry); token revocation list planned |
| Authorisation | Implemented (RBAC/ABAC, server-side, tested) |
| Self-contained tokens | Implemented (signature, expiry); key rotation procedure documented in DEPLOYMENT |
| Web frontend security | Implemented (CSP, frame denial) |
| Logging & error handling | Implemented (structured logs, redaction, generic 500s, audit) |
| Data protection & cryptography | TLS at edge (deployment); at-rest via managed disk/DB encryption (deployment responsibility) |
| File handling | Planned |
| Secure configuration / dependencies | Partial (pinning, audit in CI) |

## Privacy – Malaysia PDPA (as amended 2024)
Platform supports: data classification, minimisation (no unnecessary personal fields), DPO role assignment (role model), breach-notification workflow via issues/obligations, portability via API export, retention rules (above). Commencement details and obligations are recorded from law-firm sources (S15–S18) and **must be confirmed by legal counsel** (DEC-08). Personal data in this repository is synthetic.

## Security testing performed
See `docs/testing/TEST_EVIDENCE.md`: authentication, lockout, CSRF, RBAC/ABAC, wildcard exclusions, validation, optimistic locking, audit immutability/verification, AI permission trimming and approval refusal, signed webhook rejection. Not yet performed: DAST/penetration test, dependency CVE triage, load/DoS testing (Phase 11).
