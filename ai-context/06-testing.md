# Testing Context

- Critical behavior requires evidence, not merely compilation.
- Negative tenant tests: A cannot read/update/delete B orders; cannot read B customers/products; browser `businessId` changes cannot switch authorization context.
- Test business roles exactly `OWNER` and `STAFF`; test platform roles exactly `SUPER_ADMIN` and `ADMIN` in the separate platform authorization domain. Never place platform roles in business-role tests or `BusinessMember.role`.
- Test cross-domain escalation rejection, browser-controlled authorization-domain switching, platform-role checks, and tenant isolation during authorized platform operations.
- Test auth boundaries, IDOR/BOLA, public DTO leakage, tracking tokens, financial calculations, invalid status transitions, transaction atomicity, uniqueness under concurrency, and migrations.
- E2E: register → business setup → product → customer → order → tracking → status change → public verification.
- Playwright is approved for E2E; unit/integration framework remains DEC-004 OPEN.
- Check pagination, selective projection, and N+1 behavior for growing-list services.
- Verify typecheck/lint/build/migrations/mobile/accessibility as applicable.
