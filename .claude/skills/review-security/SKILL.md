---
name: review-security
description: Security review of a change against docs/security/SECURITY.md and OWASP ASVS 5.0
---
Check authn/authz on every new endpoint, ABAC filtering, input validation, SQL parameterisation, secrets, audit coverage, AI authority limits, error leakage, dependency changes. Report findings with file:line and severity; propose fixes; add tests for each fix.
