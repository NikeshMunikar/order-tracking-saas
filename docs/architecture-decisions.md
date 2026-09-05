# Architecture Decisions

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + approved decisions  
Last Reviewed: 2026-09-05

This register records significant decisions without turning open questions into fake certainty. OPEN and PROPOSED entries are not implementation authority until accepted.

## Status vocabulary

`PROPOSED` · `OPEN` · `ACCEPTED` · `REJECTED` · `SUPERSEDED` · `DEPRECATED`

## Decision summary

| ID | Title | Status | Scope |
|---|---|---|---|
| DEC-001 | Authentication provider and identity model | ACCEPTED | Authentication |
| DEC-002 | Production hosting provider | OPEN | Deployment |
| DEC-003 | Production PostgreSQL provider | OPEN | Deployment/database operations |
| DEC-004 | Unit/integration test framework | OPEN | Testing |
| DEC-005 | Production monitoring provider | OPEN | Observability |
| DEC-006 | Monetary storage strategy | OPEN | Database/financial correctness |
| DEC-007 | Order-number sequence-generation strategy | OPEN | Orders/concurrency |
| DEC-008 | Closed business role and security governance standard | ACCEPTED | Authorization/security |
| DEC-009 | Separate platform/company authorization domain | ACCEPTED | Platform/business authorization separation |

## DEC-001 — Authentication provider and identity model

**Status:** ACCEPTED  
**Date:** 2026-09-05

**Context:** The MVP requires production-ready registration, login, logout, password reset, sessions, and protected application routes, without custom password/auth infrastructure.

**Decision:** Use **Auth.js (NextAuth v5)** with the `Credentials` provider (email/password), backed by Prisma against the application's single PostgreSQL database.

- **Session strategy:** Database-backed sessions via the Auth.js Prisma adapter (not JWT), to support session revocability (e.g., removing a `STAFF` member's access), consistent with the mandatory "secure sessions" requirement.
- **Password hashing:** Argon2id via a maintained, reputable library, called from the `Credentials` provider's `authorize()` callback. Exact parameters (memory, iterations, parallelism) are not architecturally fixed here; they are a deployment-tuned implementation decision documented in `docs/security.md` or implementation notes.
- **Schema scope:** Only `User` and `Session` are required by this configuration. `Account` and `VerificationToken` are **not included** — this MVP uses neither OAuth/social login nor email verification/magic-link sign-in, per `MASTER_SPEC.md` §3's explicit feature list. Their omission is deliberate, not an oversight; introducing them later requires a new approved requirement (e.g., OAuth support), not a silent schema restoration.
- **Password reset:** Required by `MASTER_SPEC.md` §3 but is a distinct, gated follow-on implementation task, not bundled into Milestone 1's "Authentication" line item. It requires its own `PasswordResetToken` table (tenant-agnostic, hashed token, expiry, single-use) and must satisfy: cryptographically random token, hashed-at-rest storage, short expiry, atomic single-use consumption, identical response regardless of account existence (no enumeration), and no token/secret leakage in logs or errors. Full property list recorded in `docs/security.md`.
- **Rate limiting:** Login and password-reset endpoints require minimum abuse controls (attempt caps per account and per source, generic failure messaging, reset-request throttling per email/IP) — thresholds recorded in `docs/security.md`, not fixed here.
- **Transactional email provider:** Required to deliver password-reset emails. This is a new external service dependency and requires its own decision record (proposed `DEC-010`) before the reset flow is implemented — not treated as a bare implementation detail.

**Alternatives considered:**

- Supabase Auth — managed authentication with an existing PostgreSQL ecosystem; rejected primarily because it couples identity to Supabase's managed Postgres, pre-empting DEC-003, and splits the system of record for users outside the Prisma schema.
- Clerk — managed authentication with a polished developer experience; rejected on recurring per-MAU cost grounds for a pre-revenue MVP.
- Auth.js — application-integrated authentication approach; accepted.

**Rationale:** Auth.js keeps identity data (`User`, `Session`) inside the same Prisma-modeled PostgreSQL database as all tenant data — one codebase, one database, no second managed identity system — matching `MASTER_SPEC.md`'s cost/simplicity priorities (§7, §39, §42) and avoiding pre-committing DEC-002/DEC-003 (hosting/database provider) to a vendor-specific auth platform.

**Selection constraints:** Secure production sessions, registration/login/logout/password reset, protected routes, manageable cost, clear identity mapping, no custom password hashing, and no unnecessary architectural complexity.

**Security implications:** The Auth.js/Prisma boundary is part of the identity trust boundary and must support secure session handling. Internal business/platform authorization remains fully application-owned in the server-side service layer regardless of provider, per DEC-008/DEC-009 — unaffected by this decision. Provider authentication is not a substitute for business membership checks.

**Operational implications:** No new hosted identity platform to operate. Adds one new dependency once the reset flow ships (transactional email provider, tracked separately as proposed `DEC-010`).

**Migration implications:** Low vendor lock-in — identity data lives in our own database; switching auth libraries later does not require exporting from or migrating off an external identity system.

**Reconsideration conditions:** A future approved requirement for OAuth/social login or email verification would require adding `Account`/`VerificationToken` via a superseding or amending decision, not silent schema growth. Also reconsider on security limitation, unacceptable cost, unacceptable operational dependency, or material mismatch with MVP requirements.

## DEC-002 — Production hosting provider

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** The source requires a simple managed Next.js deployment and explicitly states that the exact provider remains an implementation decision.

**Alternatives considered:** Managed platforms suitable for Next.js, with Vercel named by the source as an inexpensive example.

**Current decision:** No provider accepted.

**Constraints:** Must support the approved Next.js runtime model, secure secrets, production HTTPS, predictable deployment/migration flow, and reasonable early-stage cost without architectural dependence on a free tier.

**Reconsideration conditions:** Material runtime limitations, cost growth, deployment friction, or security concerns.

## DEC-003 — Production PostgreSQL provider

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** PostgreSQL is approved, but the provider is not.

**Current decision:** Provider unselected.

**Constraints:** Managed PostgreSQL, backups, secure credentials, compatibility with Prisma migrations, sensible restore/recovery workflow, and acceptable cost.

**Migration implications:** Provider changes must preserve relational data, unique constraints, migration history, and production verification.

## DEC-004 — Unit/integration testing framework

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** Playwright is explicitly approved for E2E testing, but the unit/integration framework is TBD.

**Current decision:** Unselected.

**Constraints:** Must test service/data logic, validation, financial calculations, status transitions, and tenant-isolation behaviors without adding excessive tooling.

**Reconsideration conditions:** Tooling becomes burdensome, fails to support database/service tests, or conflicts with the final runtime/toolchain.

## DEC-005 — Production monitoring provider

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** MVP requires basic error monitoring and basic uptime monitoring where practical.

**Current decision:** Unselected.

**Constraints:** Low operational complexity, useful error/uptime visibility, secret-safe configuration, and reasonable early-stage cost.

## DEC-006 — Monetary storage strategy

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** Monetary values must avoid floating-point correctness problems and use a database-safe numeric/decimal approach. The exact strategy is not fully chosen.

**Alternatives considered:**

- PostgreSQL `numeric/decimal` mapped through Prisma Decimal semantics.
- Integer minor-unit representation where currency and product requirements make minor units unambiguous.

**Current decision:** No strategy accepted.

**Required properties:** No authoritative binary floating-point arithmetic; deterministic server-side calculation; consistent persistence and serialization; adequate precision for the supported currency model.

**Security implications:** Financial correctness is a release requirement. Tests must prove calculation and persistence behavior.

**Migration implications:** Once data exists, changing representation is a data-migration concern.

**Reconsideration conditions:** Currency expansion, precision requirements, or ORM/database limitations.

## DEC-007 — Order-number sequence-generation strategy

**Status:** OPEN  
**Date:** 2026-09-04  
**Context:** Order numbers must be human-readable, unique within a business, and safe under concurrent creation. The source gives `ORD-1001` as illustrative style but does not select the algorithm.

**Alternatives considered:**

- Sequential per business, protected by transactional allocation and a unique database constraint.
- Globally sequential, if later required.
- Another explicitly documented strategy if product requirements change.

**Current decision:** No strategy accepted.

**Required properties:** No dependency on internal database IDs, uniqueness within business, deterministic formatting, and concurrency safety.

**Security implications:** The number is a public/business-facing identifier and must not expose internal database identity.

**Operational implications:** Sequence gaps may occur depending on transaction semantics; the product decision should distinguish “unique/monotonic style” from strict gapless numbering if that distinction matters.

**Reconsideration conditions:** New numbering requirements, multi-region constraints, or materially different reporting needs.

## Decision governance

An accepted decision should include the same fields used above plus an explicit acceptance record. When a decision changes, mark the prior decision SUPERSEDED rather than rewriting history. Update dependent architecture, database, security, testing, development, deployment, AI-context, and current-state documents as necessary.


## DEC-008 — Closed business role and security governance standard

**Status:** ACCEPTED  
**Date:** 2026-09-05

**Context:** The MVP uses a deliberately simple business authorization model. The project-wide engineering standard makes that simplicity and its security boundaries explicit.

**Decision:** `BusinessMember.role` is exactly `OWNER | STAFF`. No additional business roles or generic permission engine are permitted. Authorization and tenant isolation are server-side and follow authentication → membership resolution → role authorization → authorized business context → validation → tenant-scoped service → Prisma → PostgreSQL. Platform/internal administration is a separate trust domain and must not be encoded as a business role.

Security is a first-class engineering requirement. Critical tenant, authorization, public-data, authentication/session, and financial invariants require appropriate negative tests and verification. Production requires HTTPS, appropriate security headers, protected secrets, secure session/cookie settings for the selected auth architecture, and public-endpoint abuse/rate-limit review.

**Rationale:** The decision preserves the source-approved simple role model, reduces authorization ambiguity, and supports future scale through modularity, efficient queries, pagination, indexing, transaction correctness, and measurement rather than premature distributed infrastructure.

**Alternatives rejected:** Additional business roles, a generic permission engine, client-side authorization, and distributed infrastructure for hypothetical scale.

**Consequences:** Authorization tests, persistence constraints, documentation, and AI context must remain aligned. Any material change requires a new or superseding ADR.

**Security implications:** Closed-world role validation; explicit server-derived tenant context; cross-tenant negative testing; public DTO minimization; security-focused release verification.

**Operational implications:** Deployment checks must cover HTTPS, headers, secrets, logging leakage, public abuse controls, and migration safety.

**Migration implications:** No schema migration is required while pre-implementation. Future schema/authorization changes must preserve the closed role domain unless this ADR is explicitly superseded.

**Reconsideration conditions:** A validated product or security requirement must demonstrate a material need for a different authorization model; business and platform administration must remain separate.

## DEC-009 — Separate platform/company authorization domain

**Status:** ACCEPTED  
**Date:** 2026-09-05

**Context:** The project requires a strict distinction between the SaaS operator/company authorization domain and the customer-business tenant authorization domain. Existing governance already protected `BusinessMember.role` as `OWNER | STAFF` but only described platform administration generically.

**Problem:** Without an explicit platform authorization domain, platform administration concepts can be confused with tenant/business membership and create privilege-escalation or authorization-bypass risk.

**Alternatives considered:** Keep platform administration as an undefined future concept; merge platform and tenant roles into one role enum; or create a generic permission engine. These alternatives were rejected because they preserve ambiguity, conflate trust domains, or add unnecessary complexity.

**Decision:** Establish two separate authorization domains:

```text
SaaS Platform / Company
├── SUPER_ADMIN
└── ADMIN

Customer Business / Tenant
├── OWNER
└── STAFF
```

`SUPER_ADMIN` is the highest-trust platform/company administration role. `ADMIN` is the platform/company administration role below `SUPER_ADMIN`. `OWNER` and `STAFF` are the only customer-business roles. `BusinessMember.role` is restricted to `OWNER | STAFF` and must never contain `ADMIN` or `SUPER_ADMIN`.

Platform authentication/authorization and business membership/authorization are separate security domains. Platform role checks are server-side. Platform authority cannot be established through browser-controlled `businessId`, `userId`, role, or similar parameters. A platform role does not automatically grant customer-business membership or business permissions; a business role does not grant platform authority. Any platform operation touching tenant data must be explicitly authorized server-side, preserve tenant isolation, use least privilege, and receive appropriate audit/security controls.

No generic permission engine, global mixed role enum, or role hierarchy is introduced merely to support these four roles.

**Platform capability scope:** The exact operational capability matrix for `ADMIN` and `SUPER_ADMIN` remains intentionally unspecified/open. This ADR establishes the authorization-domain boundary and role semantics only; it does not invent platform dashboards, APIs, workflows, or permissions.

**Rationale:** Separate domains prevent privilege confusion, reduce escalation risk, preserve the closed business role model, and provide a clean application/service boundary that can evolve independently if platform administration later becomes substantial.

**Security implications:** Business-to-platform escalation must be rejected; platform-role checks are server-side; tenant isolation remains mandatory during platform-authorized operations; sensitive platform administration should be auditable where appropriate.

**Operational implications:** Platform authorization must remain behind a dedicated server-side boundary and must not be mixed into ordinary tenant membership operations.

**Migration implications:** No implementation migration is required in the documentation-only/pre-implementation repository. The eventual platform identity/persistence schema must be explicitly decided before implementation and must not alter `BusinessMember.role`.

**Reconsideration conditions:** A concrete platform requirement may refine the capability model or persistence design, but any change that merges the domains or changes the business role set requires a new/superseding ADR and cannot silently change `BusinessMember.role`.

