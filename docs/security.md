# Security

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + applicable accepted decisions  
Last Reviewed: 2026-09-05  
Implementation State: Not Implemented

## 1. Security principles

Security is a release requirement, not a post-MVP enhancement.

Security control IDs:

- SEC-001 — Browser input is untrusted.
- SEC-002 — Authentication and business authorization are separate concerns.
- SEC-003 — Tenant isolation is server-enforced.
- SEC-004 — Public tracking uses a separate unauthenticated trust boundary.
- SEC-005 — Financial authority stays on the server.
- SEC-006 — Public responses are deliberate DTOs, not raw database records.

## 2. Trust boundaries

```text
[Untrusted Browser]
        │
        ├── authenticated business requests
        │        ↓
        │   Authentication
        │        ↓
        │   Membership / Role Authorization
        │        ↓
        │   Zod Validation
        │        ↓
        │   Tenant-Scoped Service
        │        ↓
        │   Prisma/PostgreSQL
        │
        └── public tracking request
                 ↓
            secure token lookup
                 ↓
            public DTO projection
                 ↓
            customer-facing response
```

The public tracking path must never inherit private business-session assumptions.

## 3. Authentication security

The application will use exactly one production-ready authentication solution. Provider selection is DEC-001 OPEN.

Required capabilities:

- Registration.
- Login.
- Logout.
- Password reset.
- Session management.
- Protected application routes.

Do not implement custom password hashing or a custom authentication system.

Sessions must be handled through the selected provider/architecture using secure cookies where applicable. Exact cookie settings depend on the provider and deployment, but production must use HTTPS and must avoid exposing session secrets to client-side application code.

## 4. Authorization and RBAC

Business roles are `OWNER` and `STAFF`.

OWNER capabilities per source: full business management, products, customers, orders, and settings.

STAFF capabilities per source: view/create/update customers, view/create/update orders, view products, and update order statuses.

Do not implement a sophisticated permission engine. Authorization should be explicit in the service layer and tied to the user's current business membership.

## 5A. Closed business role model

The customer-business authorization model contains exactly two roles: `OWNER` and `STAFF`. No `ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`, `SUPER_ADMIN`, `ACCOUNTANT`, or other business role may be introduced.

`OWNER` receives the full capabilities approved by `MASTER_SPEC.md`. `STAFF` receives only the approved operational capabilities: view/create/update customers, view products, view/create/update orders, and update order statuses. Do not replace this with a generic permission engine or role hierarchy.

## 5B. Separate platform/company authorization domain

The SaaS operator/company authorization domain contains exactly two platform roles:

- `SUPER_ADMIN` — highest-trust platform/company administration role.
- `ADMIN` — platform/company administration role below `SUPER_ADMIN`.

These are not business-tenant roles and must never be valid values for `BusinessMember.role`. The platform role capability matrix is intentionally not invented here; detailed platform capabilities remain an OPEN design matter until authoritative platform requirements exist.

Platform authentication/authorization must have its own server-side boundary. A business membership check cannot be used as a substitute for a platform-role check, and a platform role cannot be inferred from browser-controlled `businessId`, `userId`, `role`, or other client input.

Platform-role assignment must not be reachable through ordinary business-member operations. A business `OWNER` or `STAFF` must not gain `ADMIN` or `SUPER_ADMIN` privileges by altering request data. Platform authorization must be checked server-side for every privileged platform operation.

If a platform administrator accesses tenant data, that access must be an explicitly authorized server-side operation with least privilege, tenant-scope validation, and appropriate audit/security controls. Platform authority does not justify disabling tenant isolation.

## 5. Tenant isolation

The browser must never be trusted to select a tenant.

Required flow:

```text
Authenticated User
 → resolve membership
 → authorize requested operation/role
 → establish authorized business context
 → query/write using business scope
 → PostgreSQL
```

Business operations should prefer tenant-scoped functions such as `getOrder(orderId, businessId)` rather than globally-scoped resource fetches such as `getOrder(orderId)`.

The implementation must ensure that Business A cannot read, update, or delete Business B's customers, products, or orders.

Verification must include adversarial cross-tenant tests, not only happy paths.

## 6. IDOR/BOLA resistance

For every resource identifier arriving from the browser:

1. Authenticate the actor.
2. Resolve authorized business membership.
3. Check role capability.
4. Scope the database operation to the authorized business.
5. Verify resource ownership.
6. Only then mutate or return data.

Never rely on hidden inputs or client-side navigation guards for authorization.

## 7. Public tracking security

The public token must be cryptographically secure, sufficiently long, unpredictable, unique, and protected by a database uniqueness constraint. It must not be derived from a sequential internal ID.

The public endpoint should return only approved tracking data:

- Business name/logo.
- Order number.
- Order items, quantities, prices, total.
- Current status and timeline.
- Estimated delivery time when present.
- Delivery/pickup information.
- Basic business contact information.

It must not return:

- Customer email.
- Internal notes.
- Staff information.
- Internal database IDs.
- Authentication data.
- Private business information.
- Internal operational information.

Public tracking links are bearer-style access to intentionally limited data. The system must therefore consider enumeration, scraping, rate abuse, referrer/log leakage, and accidental over-returning of fields.

Rate limiting or equivalent abuse protection must be evaluated before production release and implemented where required by the security review.

## 8. Validation

Use Zod for server-side validation of important inputs. Validation includes, as applicable:

- Positive quantity.
- Non-negative price.
- At least one order item.
- Valid discount semantics.
- Non-negative delivery fee.
- Required customer fields.
- Valid status transitions.

Validation is not authorization. Both are required.

## 9. Financial security

Authoritative financial values are computed server-side. Client totals are hints for UX only.

The server must validate product references, current prices, quantities, discounts, delivery fees, and payment status according to the approved business rules before persistence.

Use a money-safe database strategy and avoid JavaScript floating-point arithmetic as the authoritative source.

The exact discount semantics must be reconciled before order calculation code is finalized (AMB-001).

## 10A. Security threat coverage standard

The review must explicitly consider IDOR/BOLA, authorization bypass, cross-tenant access, authentication abuse, CSRF, XSS, SQL injection, SSRF where server-side URL fetching exists, information disclosure, credential/session attacks, brute-force/rate abuse, and public tracking enumeration.

Controls are not complete until the applicable threat has a verification strategy. Security-sensitive failures must be logged server-side without leaking secrets, tokens, stack traces, SQL/provider errors, or other sensitive implementation details to users.

## 10. Common application threats

| Threat | Primary control | Verification |
|---|---|---|
| Cross-tenant read/write | Membership + tenant-scoped data access | Negative isolation tests |
| IDOR/BOLA | Server ownership checks | Resource authorization tests |
| Session abuse | Managed auth + secure session handling | Auth/session tests |
| Brute-force login | Provider controls and deployment review | Security review |
| Public token enumeration | High-entropy tokens + rate limiting review | Token/abuse tests |
| SQL injection | Prisma parameterization + validation | Integration/security tests |
| XSS | React escaping + validation + careful HTML handling | UI/security tests |
| CSRF | Framework/server action/session protections plus explicit review for state-changing endpoints | Security tests appropriate to auth architecture |
| Error leakage | Safe user-facing errors + server-side logs | Error-path tests |
| Sensitive log leakage | Structured/log filtering review | Log review |
| Secret exposure | Environment-based secret management | Repository/secrets scan |
| Dependency vulnerabilities | Dependency review/update workflow | CI/security checks |

## 10A. Platform authorization security requirements

At minimum, the security design must account for:

- Platform-role escalation resistance.
- Separation of platform and business authorization domains.
- Prevention of browser-controlled promotion to `ADMIN` or `SUPER_ADMIN`.
- Prevention of treating business `OWNER`/`STAFF` identities as platform administrators.
- Server-side platform-role checks.
- Least privilege for platform operations.
- Preservation of tenant isolation during any authorized platform operation.
- Auditability of sensitive platform administration where appropriate.
- Secure platform sessions/credentials according to the final authentication architecture.

## 11. Preventive, detective, corrective, verification controls

### Preventive

Authentication, membership authorization, tenant-scoped queries, validation, database constraints, foreign keys, secure cookies, HTTPS, secret isolation, secure tokens, public DTO projection, and role checks.

### Detective

Application/error logging, monitoring, failed authorization events where appropriate, test failures, dependency/security scanning, and migration verification.

### Corrective

Session invalidation/recovery, rollback of failed migrations or releases through the approved deployment process, remediation of authorization defects, credential rotation, and data correction through controlled migrations.

### Verification

Tenant-isolation tests, status-transition tests, financial tests, tracking data-boundary tests, authentication tests, E2E tests, migration checks, type/lint/build gates, and release smoke tests.

## 12. Error handling

Do not expose raw database or server errors. Return safe, user-oriented messages and log the diagnostic context on the server without leaking secrets or unnecessary sensitive data.

Public tracking should use an intentionally generic invalid/unavailable response rather than revealing whether a token pattern is valid for a private resource.

## 13. Security headers / HTTPS

Production must use HTTPS. Secure cookie behavior is required where applicable. Standard secure response headers should be enabled appropriate to the final hosting/framework configuration without inventing a custom security stack.

Exact provider-specific header and CSP choices remain implementation details and must not weaken the approved trust model.

## 14A. Production security headers and transport

Production must use HTTPS and appropriate security headers for the selected deployment architecture. Review and verify controls such as frame-embedding protection, content-type sniffing protection, referrer policy, and a suitable Content Security Policy strategy where practical. Cookie/session attributes must match the selected authentication architecture.

## 14. Database security

Use least-privilege production database credentials where the provider/runtime supports it. Keep credentials out of source control. Use migration-controlled schema changes. Maintain backups and an understood restore process before production launch.

## 15. Security release gate

The release cannot be considered security-ready until the implementation has evidence for:

- Tenant isolation.
- Business authorization and OWNER/STAFF behavior.
- Authentication protection.
- Public tracking token safety.
- Public DTO data boundary.
- Server-authoritative financial calculation.
- Input validation.
- Safe error handling.
- Secret handling.
- Production HTTPS and session controls.
- Public endpoint abuse protection assessment.
