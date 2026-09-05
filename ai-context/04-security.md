# Security Context

- Browser is untrusted. Never trust browser `businessId`, `userId`, role, resource IDs, prices, totals, discounts, delivery fee, or payment status.
- Authentication and authorization are separate. Exactly one approved auth provider; no custom password/auth infrastructure.
- Authorization flow: authentication → membership resolution → role authorization → authorized business context → validation → tenant-scoped service → Prisma.
- Platform/company roles are exactly `SUPER_ADMIN`, `ADMIN`; business roles are exactly `OWNER`, `STAFF`. Never merge the domains.
- `BusinessMember.role` accepts only `OWNER | STAFF`; no generic permission engine or role hierarchy.
- Platform authorization has its own server-side boundary; platform roles do not automatically grant tenant access or bypass tenant isolation.
- Reject browser-controlled attempts to escalate from business roles to platform roles; test cross-domain IDOR/BOLA and platform authorization boundaries.
- Protect against IDOR/BOLA and cross-tenant access.
- Public tracking: secure random token + DB uniqueness + minimal allow-listed DTO; no internal IDs/private fields.
- Review CSRF, XSS, SQL injection, SSRF where applicable, auth abuse, information disclosure, enumeration, and rate abuse.
- Production: HTTPS, secure session/cookies, appropriate security headers, secrets outside source control.
- Never expose stack traces, SQL/provider errors, secrets, tokens, or sensitive diagnostics.
