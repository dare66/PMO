# ADR-0005 – Authentication: local accounts now, OIDC/SAML SSO next
**Status:** Accepted · Local bcrypt accounts with lockout, JWT in httpOnly SameSite=Strict cookie (browser) or bearer (API), CSRF header. SSO via Entra ID (OIDC) + SCIM is the next identity milestone and needs tenant registration (DEC-03). MFA is delegated to the IdP.
