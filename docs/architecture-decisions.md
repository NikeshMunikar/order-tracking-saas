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
| DEC-001 | Authentication provider and identity model | ACCEPTED (amended) | Authentication |
| DEC-002 | Production hosting provider | OPEN | Deployment |
| DEC-003 | Production PostgreSQL provider | OPEN | Deployment/database operations |
| DEC-004 | Unit/integration test framework | OPEN | Testing |
| DEC-005 | Production monitoring provider | OPEN | Observability |
| DEC-006 | Monetary storage strategy | OPEN | Database/financial correctness |
| DEC-007 | Order-number sequence-generation strategy | OPEN | Orders/concurrency |
| DEC-008 | Closed business role and security governance standard | ACCEPTED | Authorization/security |
| DEC-009 | Separate platform/company authorization domain | ACCEPTED | Platform/business authorization separation |
| DEC-011 | Invite-by-link invitation model | ACCEPTED | Business membership/invitations |
| DEC-012 | Invitation token hashing strategy | ACCEPTED | Security/token storage |

> Numbering note: `DEC-010` is intentionally skipped here. `DEC-001` already
> refers forward to a future, not-yet-registered `DEC-010` for the
> transactional email provider required by the password-reset flow. To avoid
> colliding with that existing reference, the two ADRs above are registered as
> `DEC-011` and `DEC-012`. `DEC-010` remains reserved for the transactional
> email provider.

## DEC-001 — Authentication provider and identity model

**Status:** ACCEPTED (amended)  
**Date:** 2026-09-05  
**Amended:** 2026-09-05

**Context:** The MVP requires production-ready registration, login, logout, password reset, sessions, and protected application routes, without custom password/auth infrastructure.

**Decision:** Use **Auth.js (NextAuth v5)** with the `Credentials` provider (email/password), backed by Prisma against the application's single PostgreSQL database.

- **Session strategy (AMENDED):** JWT-based sessions via Auth.js, not database-backed sessions. This amends the session-strategy element of the original DEC-001 decision. See "Amendment record" below for why.
- **Global session invalidation:** An application-level `sessionVersion` (a.k.a. `tokenVersion`) integer column on `User`, checked in the Auth.js JWT callback against the value embedded in the token at issuance. Incrementing `User.sessionVersion` invalidates every previously issued JWT for that user on their next request. This is the smallest mechanism that restores a meaningful, whole-account "sign this user out everywhere" capability without database-backed per-session storage. It is **not equivalent to individual database-backed session revocation** — it invalidates all of a user's sessions at once, not one specific session/device; there is no per-session record to revoke individually. This mechanism must be triggered at minimum on: password change, password reset completion, and business-membership/staff removal.
- **Password hashing:** Argon2id via a maintained, reputable library, called from the `Credentials` provider's `authorize()` callback. Exact parameters (memory, iterations, parallelism) are not architecturally fixed here; they are a deployment-tuned implementation decision documented in `docs/security.md` or implementation notes.
- **Schema scope:** Only `User` (with the added `sessionVersion` column) is required by this configuration. No `Session` table is required, since sessions are JWT-based, not database-backed. `Account` and `VerificationToken` remain **not included** — this MVP uses neither OAuth/social login nor email verification/magic-link sign-in, per `MASTER_SPEC.md` §3's explicit feature list. Their omission is deliberate, not an oversight; introducing them later requires a new approved requirement (e.g., OAuth support), not a silent schema restoration.
- **Authorization source of truth (unchanged, reaffirmed):** JWT claims are not the sole source of truth for current account status, role, or business membership. Every authorization-sensitive server operation must still verify current state against the database (membership resolution, role check, tenant scoping) per DEC-008/DEC-009, exactly as if sessions were database-backed. The JWT establishes *who is asking*; the database still establishes *what they're currently allowed to do*.
- **Password reset:** Required by `MASTER_SPEC.md` §3 but is a distinct, gated follow-on implementation task, not bundled into Milestone 1's "Authentication" line item. It requires its own `PasswordResetToken` table (tenant-agnostic, hashed token, expiry, single-use) and must satisfy: cryptographically random token, hashed-at-rest storage, short expiry, atomic single-use consumption, identical response regardless of account existence (no enumeration), and no token/secret leakage in logs or errors. On successful reset, `User.sessionVersion` must be incremented so any previously issued JWT is invalidated. Full property list recorded in `docs/security.md`.
- **Rate limiting:** Login and password-reset endpoints require minimum abuse controls (attempt caps per account and per source, generic failure messaging, reset-request throttling per email/IP) — thresholds recorded in `docs/security.md`, not fixed here.
- **Transactional email provider:** Required to deliver password-reset emails. This is a new external service dependency and requires its own decision record (proposed `DEC-010`) before the reset flow is implemented — not treated as a bare implementation detail.

**Amendment record (2026-09-05):** During Milestone 1 pre-implementation reconciliation, a genuine platform-level incompatibility was discovered: Auth.js enforces that the `Credentials` provider can only be used with `session.strategy: "jwt"`; configuring `session.strategy: "database"` alongside a `Credentials` provider is unsupported and fails at runtime (`UnsupportedStrategy`, documented by the library itself). This is not a configuration preference but a hard constraint of the accepted library, discoverable only at the implementation-detail level. The original database-backed-session element of this ADR is therefore infeasible as written without either (a) building custom session-management infrastructure alongside Auth.js — rejected, as it reintroduces exactly the "no custom authentication/session infrastructure" risk `MASTER_SPEC.md` §3 warns against — or (b) dropping the `Credentials` provider in favor of OAuth/magic-link — rejected, as both are explicitly out of scope. The session-strategy element of DEC-001 is amended to JWT, paired with the `sessionVersion` mechanism above to preserve the original goal (revoking access, e.g. for a removed `STAFF` member) as closely as the library allows. Every other element of the original DEC-001 decision (Auth.js, Credentials provider, Argon2id, Prisma/PostgreSQL, minimal schema scope, deferred password reset, deferred email provider, application-owned tenant authorization) is unchanged and reaffirmed.

**Alternatives considered:**

- Supabase Auth — managed authentication with an existing PostgreSQL ecosystem; rejected primarily because it couples identity to Supabase's managed Postgres, pre-empting DEC-003, and splits the system of record for users outside the Prisma schema.
- Clerk — managed authentication with a polished developer experience; rejected on recurring per-MAU cost grounds for a pre-revenue MVP.
- Auth.js — application-integrated authentication approach; accepted.
- (Amendment-stage alternatives) Custom session-management infrastructure bridging `Credentials` login to a database session table — rejected as custom auth infrastructure. Dropping `Credentials` for an OAuth/magic-link provider to preserve database sessions — rejected as explicitly out-of-scope authentication methods.

**Rationale:** Auth.js keeps identity data (`User`) inside the same Prisma-modeled PostgreSQL database as all tenant data — one codebase, one database, no second managed identity system — matching `MASTER_SPEC.md`'s cost/simplicity priorities (§7, §39, §42) and avoiding pre-committing DEC-002/DEC-003 (hosting/database provider) to a vendor-specific auth platform. JWT sessions, paired with the `sessionVersion` invalidation mechanism, preserve this while working within Auth.js's actual constraints for the `Credentials` provider.

**Selection constraints:** Secure production sessions, registration/login/logout/password reset, protected routes, manageable cost, clear identity mapping, no custom password hashing, and no unnecessary architectural complexity.

**Security implications:** The Auth.js boundary is part of the identity trust boundary and must support secure session handling. Sessions are JWT-based; whole-account session invalidation is available via `sessionVersion`, but there is no per-session/per-device database record and therefore no way to revoke a single specific session while leaving others active — only "invalidate everything issued to this user so far." Internal business/platform authorization remains fully application-owned in the server-side service layer regardless of provider, per DEC-008/DEC-009 — unaffected by this decision. Provider authentication is not a substitute for business membership checks, and JWT claims must never be treated as current authorization truth — every authorization-sensitive operation re-verifies against the database. Account deactivation, staff removal, and role changes are enforced through current server-side authorization checks at request time, not through waiting for a JWT to expire.

**Operational implications:** No new hosted identity platform to operate, and no `Session` table/storage to maintain. Adds one new dependency once the reset flow ships (transactional email provider, tracked separately as proposed `DEC-010`).

**Migration implications:** Low vendor lock-in — identity data lives in our own database; switching auth libraries later does not require exporting from or migrating off an external identity system.

**Reconsideration conditions:** A future approved requirement for OAuth/social login or email verification would require adding `Account`/`VerificationToken` via a superseding or amending decision, not silent schema growth. A future requirement for genuine per-session (not whole-account) revocation would require reconsidering the session strategy again, potentially via a provider/approach not constrained by the `Credentials`+database-session limitation found here. Also reconsider on security limitation, unacceptable cost, unacceptable operational dependency, or material mismatch with MVP requirements.

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

## DEC-011 — Invite-by-link invitation model

**Status:** ACCEPTED  
**Date:** 2026-10-17  
**Accepted:** 2026-10-17  
**Scope:** Business membership invitations (Milestone 2)

**Acceptance record:** Accepted 2026-10-17 after verifying the decision matches the implementation: OWNER-only invite/revoke (`requireOwner`), 7-day expiry (`INVITATION_EXPIRY_MS`), 256-bit CSPRNG token (`TOKEN_BYTES = 32`), SHA-256-at-rest with no raw-token logging or persistence, and the database partial unique index `business_invitations_active_email_key`. It was also confirmed that `MASTER_SPEC.md` does not mandate these specifics (see "Source status" below).

**Context:** Milestone 2 adds individual business membership using the closed business role domain (`OWNER | STAFF`, DEC-008). `MASTER_SPEC.md` requires OWNER/STAFF membership but does not prescribe how a second person is added. An invitation mechanism is needed so an existing OWNER can bring in additional OWNER or STAFF members without platform-side account creation and without any automated messaging (messaging/SMS/email are out of MVP scope; transactional email is a separate, not-yet-registered decision — see the numbering note above).

**Decision:** Use an **invite-by-link** model:

- An OWNER creates an invitation for a specific email address and a role of `OWNER` or `STAFF` (the closed business role domain only). Initiating and revoking invitations are OWNER-only server-side operations.
- The server generates the invitation token with a CSPRNG (256-bit entropy) and persists only its SHA-256 hash (`BusinessInvitation.tokenHash @unique`). The raw token is returned exactly once, to the creating OWNER, to relay out of band (e.g. as a copyable link). It is never logged and never persisted in raw form.
- Invitations expire 7 days after creation.
- At most one *database-active* invitation (`revokedAt IS NULL AND acceptedAt IS NULL`) may exist per `(businessId, normalized email)`. This invariant is enforced by the PostgreSQL partial unique index `business_invitations_active_email_key`, not merely by the service's revoke-then-insert sequence.
- Re-inviting the same `(businessId, email)` revokes the previous active invitation and issues a new one, retried (bounded) on a partial-unique collision.
- Acceptance requires an **authenticated user whose account email equals the invitation email** (normalized). Acceptance claims the invitation with a conditional update (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()`) and creates the `BusinessMember` in the **same transaction**. A zero-row claim yields a single generic `invalid` outcome — accepted / revoked / expired / nonexistent / email-mismatch are never distinguished externally (no enrollment-state enumeration).

**Source status (spec vs. implementation):** `MASTER_SPEC.md` does **not** specify an invitation mechanism, an invitation expiry, an invitation-token length, or that invite/revoke are OWNER-only. The OWNER-only restriction is *derived* from §4 (membership and settings are OWNER capabilities and are absent from the STAFF capability list), not stated explicitly. The 7-day expiry, the 256-bit token, and SHA-256-at-rest are implementation decisions recorded by this ADR, not source requirements. (Separately, §15 specifies the *public order-tracking* token — a different token with its own requirements; it does not govern invitation tokens.)

**Alternatives considered:**

- **Automated email delivery of the invitation** — deferred. Requires an email-provider decision (the reserved `DEC-010`); out of MVP scope and not implemented.
- **Non-email-bound invite code** — rejected. A code not bound to an identity lets any bearer join as the invited role; strictly weaker than binding to the invitee's account email.
- **Manual membership creation by an OWNER** — rejected as a poor onboarding experience and inconsistent with the approved M2 shape.

**Rationale:** Keeps identity inside the application's own database (DEC-001), adds no external service, matches the simple `OWNER | STAFF` model, and is safe under concurrency by leaning on existing database constraints rather than application pre-checks alone.

**Consequences:** Registration in this MVP does **not** verify email ownership (DEC-001 explicitly excludes email verification / magic-link sign-in). Therefore the acceptance-time email-equality check is a *consistency* check — it confirms the accepting account's email matches the invited address — and is **not** proof that the invitee controls that mailbox. The invitation token is the effective **bearer credential**: possession of the link, combined with being authenticated as an account bearing the matching email, is what grants acceptance. A leaked invitation link should be treated as a compromised credential and revoked; delivery is out of band and depends on the creating OWNER not exposing the raw link (the raw token is shown once and never persisted or logged). Anyone able to register an account with the invited email address (subject to the authentication system's own controls) could accept an invitation intended for that address.

**Security implications:** The token is a bearer credential — hashed at rest, single-use via conditional claim, 7-day expiry, bound to the invitee's account email (a consistency check, not mailbox-ownership proof, per Consequences). No enumeration of invitation state. Role is restricted to the closed business role domain. Authorization for invite/revoke is server-side and re-verified within the mutation transaction.

**Operational implications:** No new external dependency. Until an email provider is decided, the OWNER must deliver the link out of band.

**Migration implications:** Introduced by the M2 Stage 1 schema (`BusinessInvitation`) and migration `20260907120000_add_business_membership`. This decision requires no further migration.

**Reconsideration conditions:** Adding automated email delivery (reserved `DEC-010`), introducing a different onboarding model (e.g. domain-based auto-join), or changing the single-use/expiry semantics would require revisiting this decision.

## DEC-012 — Invitation token hashing strategy

**Status:** ACCEPTED  
**Date:** 2026-10-17  
**Accepted:** 2026-10-17  
**Scope:** Invitation tokens (Milestone 2); stated as the general rule for high-entropy bearer tokens

**Source status (spec vs. implementation):** `MASTER_SPEC.md` does not specify a hashing algorithm for bearer tokens and does not describe invitation tokens at all. This decision resolves an implementation choice, not a source requirement.

**Acceptance record:** Accepted 2026-10-17 after verifying the implementation stores only `sha256(token)` (`src/lib/security/token.ts`, `BusinessInvitation.tokenHash`) and that the raw token is never logged or persisted, and that passwords remain Argon2id (`src/lib/security/password.ts`). `DEC-010` remains reserved.

**Context:** Invitation tokens are bearer credentials stored server-side. The project already uses Argon2id for passwords (`@node-rs/argon2`, per DEC-001). It must not be assumed that the password-hashing choice also applies to randomly generated tokens, or vice versa. The token store's algorithm must match the secret's entropy.

**Decision:**

- **High-entropy, randomly generated bearer tokens** (invitation tokens: 32 CSPRNG bytes / 256-bit entropy) are stored at rest as a **plain SHA-256 hash** (`sha256(token)`, hex). A fast cryptographic hash is correct here: the input space is far too large to brute-force, so a slow key-derivation function would add latency and denial-of-service surface without adding meaningful protection.
- **Low-entropy, human-chosen secrets** (passwords) continue to use **Argon2id** via the approved password module (`src/lib/security/password.ts`).
- The two are not interchangeable: SHA-256 must not be used for passwords, and Argon2id must not be used for high-entropy tokens.
- The entropy guarantee is a precondition of this decision. It is valid only while tokens are generated with a CSPRNG at sufficient length (currently 256-bit). If any token type's entropy is reduced, this decision must be revisited before that token type ships.

**Alternatives considered:**

- **Argon2id for tokens** — rejected: unnecessary and slower, adding CPU/DoS cost per lookup with no brute-force benefit at 256-bit entropy.
- **Store the raw token (no hashing)** — rejected: a database read compromise would yield directly usable, still-valid bearer tokens.
- **No stored hash, token-as-primary-key by hash only** — subsumed by the decision (the SHA-256 hex digest is the unique lookup key, `tokenHash @unique`).

**Rationale:** Match the cost of hashing to the guessability of the secret: cheap hashing where the secret is already unguessable; expensive hashing where the secret is guessable.

**Security implications:** Storage is `sha256(token)`, looked up by indexed hash equality (the stored value is itself a high-entropy digest, so a fast comparison is appropriate — this is not a low-entropy secret comparison). Raw tokens must never be logged or persisted. The token generator must always use a CSPRNG with sufficient length.

**Operational implications:** Token hashing is a pure function with no key management.

**Migration implications:** Already reflected in the M2 Stage 1 schema (`BusinessInvitation.tokenHash @unique`); no migration required.

**Reconsideration conditions:** Any low-entropy invitation/tracking token, shorter token length, or a future bearer-token type with a small input space.

