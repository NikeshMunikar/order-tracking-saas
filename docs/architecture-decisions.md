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
| DEC-006 | Monetary storage strategy | ACCEPTED | Database/financial correctness |
| DEC-007 | Order-number sequence-generation strategy | ACCEPTED (2026-10-18) | Orders/concurrency |
| DEC-008 | Closed business role and security governance standard | ACCEPTED | Authorization/security |
| DEC-009 | Separate platform/company authorization domain | ACCEPTED | Platform/business authorization separation |
| DEC-011 | Invite-by-link invitation model | ACCEPTED | Business membership/invitations |
| DEC-012 | Invitation token hashing strategy | ACCEPTED | Security/token storage |
| DEC-013 | Order status transition and cancellation matrix (resolves AMB-002) | ACCEPTED (2026-10-18) | Orders/workflow |
| DEC-014 | Dashboard "today" timezone, count semantics, and Milestone 8 search/filter scope | ACCEPTED (2026-10-18) | Dashboard/search/authorization |
| DEC-015 | Milestone 9 scope and interim abuse protection (in-process fixed-window rate limiting) | ACCEPTED (2026-10-19) | Security/testing |

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

**Security implications:** The Auth.js boundary is part of the identity trust boundary and must support secure session handling. Sessions are JWT-based; whole-account session invalidation is available via `sessionVersion`, but there is no per-session/per-device database record and therefore no way to revoke a single specific session while leaving others active — only "invalidate everything issued to this user so far." Internal business/platform authorization remains fully application-owned in the server-side service layer regardless of provider, per DEC-008/DEC-009 — unaffected by this decision. Provider authentication is not a substitute for business membership checks, and JWT claims must never be treated as current authorization truth — every authorization-sensitive operation re-verifies against the database. Account deactivation, staff removal, and role changes are enforced through current server-side authorization checks at request time, not through waiting for a JWT to expire. One consequence of this decision is that account existence is **not** fully hidden at the authentication boundary: registration reports an already-registered email and there is no email-verification step (this decision), so existence remains probeable through registration. Sign-in itself does not reveal it — the provider runs an Argon2id verification against a fixed dummy hash (same cost parameters) on the unknown-email branch so both branches cost comparably and login timing is not an enumeration signal.

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

**Status:** ACCEPTED  
**Date:** 2026-09-04  
**Context:** Monetary values must avoid floating-point correctness problems and use a database-safe numeric/decimal approach. The strategy was selected through the ADR process by the owner on 2026-10-18, when the first monetary persistence (`Product.price`, M4) became necessary.

**Alternatives considered:**

- PostgreSQL `numeric/decimal` mapped through Prisma Decimal semantics.
- Integer minor-unit representation where currency and product requirements make minor units unambiguous.

**Decision (accepted 2026-10-18):** PostgreSQL decimal storage mapped through Prisma `Decimal` — monetary columns use `@db.Decimal(12, 2)`. This is MASTER_SPEC.md §29's "appropriate decimal/money handling": fixed-scale `DECIMAL` never performs binary floating-point arithmetic, and Prisma delivers `Decimal` values to application code as string-backed values, keeping IEEE-754 doubles out of the authoritative path. Chosen over integer minor units because rupee prices in this product are decimal-native (e.g. `NPR 1800`, `NPR 700`) and a decimal representation needs no ×100 conversion in any display or future server-side total calculation; the trade-off (decimal arithmetic speed) is irrelevant at this scale. Application-visible serialization of `Decimal` must be treated as a string, not a number. `Product.price` is the first column using it; later money columns (`Order.subtotal/discount/deliveryFee/total`, `OrderItem.unitPrice/subtotal`) must use the same representation unless this decision is SUPERSEDED.

**Required properties:** No authoritative binary floating-point arithmetic; deterministic server-side calculation; consistent persistence and serialization; adequate precision for the supported currency model.

**Security implications:** Financial correctness is a release requirement. Tests must prove calculation and persistence behavior.

**Migration implications:** Once data exists, changing representation is a data-migration concern.

**Reconsideration conditions:** Currency expansion, precision requirements, or ORM/database limitations.

## DEC-007 — Order-number sequence-generation strategy

**Status:** ACCEPTED (2026-10-18)  
**Date:** 2026-09-04  
**Accepted:** 2026-10-18  
**Context:** Order numbers must be human-readable, unique within a business, and safe under concurrent creation. The source gives `ORD-1001` as illustrative style but does not select the algorithm.

**Options considered were:**

1. Sequential per business, protected by transactional allocation and a unique database constraint
2. Globally sequential, if later required
3. Another explicitly documented strategy if product requirements change

**Decision:** Option 1 — a per-business counter table (`business_order_sequences`, one row per business, `lastNumber` starting such that the first order is `ORD-1001`). Inside the order-creation transaction the next number is allocated by a single atomic `INSERT … ON CONFLICT ("businessId") DO UPDATE SET "lastNumber" = "lastNumber" + 1 RETURNING` statement; the `DO UPDATE` takes the row lock, so concurrent creations serialize and allocation is transactional (a rolled-back order creation releases its number). This satisfies the required properties: no dependency on internal database IDs, uniqueness within a business (with the `(businessId, orderNumber)` composite unique constraint as the persistence backstop), deterministic formatting (`ORD-` + counter), and concurrency safety.

**Consequences:** order creation depends on the sequence row lock, so per-business throughput of order creation is serialized by design; numbers are roughly sequential per business but not guaranteed gap-free the way a global sequence would be.

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

## DEC-013 — Order status transition and cancellation matrix (resolves AMB-002)

**Status:** ACCEPTED (2026-10-18)  
**Date:** 2026-09-04 (recorded as ambiguity AMB-002 during state normalization)  
**Accepted:** 2026-10-18  
**Scope:** Milestone 6 order workflow — status transitions and cancellation

**Source status (spec vs. implementation):** `MASTER_SPEC.md` §12 defines the statuses and the recommended forward workflow and states "Cancellation can occur before delivery"; it also requires "Prevent nonsensical status transitions" (its example is `DELIVERED → PREPARING`). §13 requires a history row for every status change, §28 requires invalid transitions to be rejected, and §4 grants STAFF "Update order statuses". The source does not enumerate the exact cancellation edges, so the matrix was recorded as the open ambiguity **AMB-002** and is now decided explicitly by the owner rather than chosen silently.

**Decision (owner, 2026-10-18):**

1. `CANCELLED` is reachable from **every** pre-delivery status: `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`. Cancellation from `DELIVERED` is **not** allowed.
2. Forward transitions move **exactly one step** along `PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`. Skipped steps and backwards transitions are rejected.
3. `DELIVERED` and `CANCELLED` are **terminal** — no transitions out of either state.
4. A note on a status change (including cancellation) is **optional free text**; a cancellation reason is not required.
5. **Both OWNER and STAFF** may update order statuses and cancel orders, subject to the existing tenant-membership and authorization checks (MASTER_SPEC §4).

**Authoritative transition matrix:**

| Current status | Allowed next statuses |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY`, `CANCELLED` |
| `READY` | `OUT_FOR_DELIVERY`, `CANCELLED` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `CANCELLED` |
| `DELIVERED` | — (terminal) |
| `CANCELLED` | — (terminal) |

**Implementation:** the matrix is encoded once in `src/lib/order-status.ts` and shared by the server and the UI. The server enforces it in `updateOrderStatus` regardless of which controls the UI renders. The write is a conditional `updateMany` guarded on the expected current status inside a transaction, followed by the history insert in the same transaction, so a stale or concurrent change cannot write an incorrect history row (a losing racer receives an invalid-transition error and writes nothing). `CANCELLED` is added to the `OrderStatus` enum by migration `20261018144203_add_cancelled_order_status`. The UI offers only server-valid next statuses.

**Consequences:** delivered and cancelled orders cannot be reopened or corrected through the workflow (`DELIVERED`/`CANCELLED` are final); a delivered order can never be cancelled; every accepted change appends exactly one history row. There is deliberately no backward-correction path in the product model.

**Alternatives considered:**

- **Narrower cancellation set** (e.g. only before `OUT_FOR_DELIVERY`) — rejected by the owner: the source says cancellation may occur at any point before delivery.
- **Forward jumps within the chain** (e.g. `PENDING → PREPARING`) — rejected: "prevent nonsensical status transitions" and the recommended valid workflow imply step-by-step progress.
- **Required cancellation reason** — rejected: `OrderStatusHistory.note` is nullable and requiring a reason would invent a source rule.
- **OWNER-only cancellation** — rejected: MASTER_SPEC §4 explicitly grants STAFF "Update order statuses".

**Rationale:** give the business an obvious, mobile-friendly status workflow while keeping every accepted transition explicable, auditable (one history row per change), and impossible to reverse after delivery or cancellation.

**Security implications:** status changes require membership of the order's own business (tenant-scoped query + authorization); a foreign or missing order id collapses to a not-found condition, and an invalid or stale transition never produces a history record, so the audit trail cannot be corrupted by a race.

**Operational implications:** status history is append-only and audit-friendly; a status change is a single transaction.

**Migration implications:** one enum-value migration (`ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED'`); no table or column changes are required — `OrderStatusHistory` already stores `oldStatus`/`newStatus`/`changedBy`/`note`/`createdAt`.

**Reconsideration conditions:** new product requirements for reopening/correcting orders, partial cancellation or refunds, per-role workflow refinement, or customer-initiated cancellation.

## DEC-014 — Dashboard "today" timezone, count semantics, and Milestone 8 search/filter scope

**Status:** ACCEPTED (2026-10-18)  
**Date:** 2026-10-18  
**Accepted:** 2026-10-18  
**Scope:** Milestone 8 — business dashboard (order counts + recent orders), order search/filter/pagination, product search, and the order-creation customer/product pickers

**Source status (spec vs. implementation):** `MASTER_SPEC.md` §17 requires the dashboard to show **Today's Orders**, **Pending**, **In Progress**, **Delivered** and **recent orders**, "Keep analytics intentionally basic" and "Do not build advanced reporting". §18 (`[Search customer]` when creating an order), §19 (customer search — delivered), §20 (product Features include **Search**), §34 (mobile-usable dashboard), §35 (testing) and §44/Milestone 8 ("Dashboard: Order counts / Recent orders / Search/filter") define the surrounding expectations. The source does not fix (a) which timezone "today" means, (b) which statuses map to "In Progress", or (c) whether the deferred product/picker searches belong to M8. Those were recorded as blocking decisions D1–D4 and are now decided explicitly by the owner rather than chosen silently.

**Decision (owner, 2026-10-18):**

1. **D1 — Business-local day ("Today's Orders").** Compute the local calendar-day window from the business's stored `Business.timezone` (IANA) and query with a **start-inclusive, end-exclusive** UTC timestamp range. If the stored timezone is missing or not a valid IANA zone, **fall back to UTC safely** rather than throwing. No hardcoded Nepal-specific (or any other region) assumptions.
2. **D2 — Count semantics.** Count orders **created during the business-local calendar day**, grouped by their current status: **Pending** = `PENDING`; **In Progress** = `CONFIRMED` + `PREPARING` + `READY` + `OUT_FOR_DELIVERY`; **Delivered** = `DELIVERED`; `CANCELLED` is excluded from all three counts. (If the approved specification had defined a conflicting interpretation, it was to be flagged before implementation — it was not; this matches §17.)
3. **D3 — Expanded M8 scope.** Include (a) the per-business dashboard with today's counts and a limited recent-orders list; (b) order-list search by order number and customer name, status filtering, and pagination; (c) product-list search; and (d) searchable customer and product pickers in the order-creation form. The simplest maintainable solution on the existing stack, with no new dependencies and no overengineered picker UI. Server-side validation, membership authorization, tenant isolation, literal search escaping, and the existing soft-delete/active-product rules are preserved; picker results and pagination stay scoped to the authorized business.
4. **D4 — Order filters and page size.** Order search covers order number and customer name plus a status filter only; no date-range or payment-status filter in M8. Reuse the M3 customer-list page-size and pagination conventions.

**Implementation:** "today" is computed by a small pure helper (`src/lib/business-day.ts`) that validates the zone with `Intl` (safe UTC fallback) and returns the local-day `[start, end)` window as UTC instants. Order search/filter/pagination extends `listOrders` behind `requireMembership`, escaping `LIKE` metacharacters via `escapeLikePattern` and matching `orderNumber` or `customer.name`. Dashboard counts use `prisma.order.count` grouped by the D2 status sets inside the day window, plus a fixed-limit newest-first recent-orders query. Product search and the order-creation pickers reuse the same membership-gated, escaped, tenant-scoped service pattern (active, non-deleted products for the picker). See the M8 milestone record in `ai-context/07-current-milestone.md` and §2/§3 of `CURRENT_STATE.md` for the concrete commits.

**Consequences:** "Today's Orders" is meaningful for a business in any timezone and degrades safely to UTC for a bad stored zone; `CANCELLED` orders never inflate the three §17 counters; order and picker searches stay literal (`%`/`_`/`\` are matched, not interpreted) and cannot read across tenants. Basic-only analytics is preserved — no charts or advanced reporting.

**Alternatives considered:**

- **Server/UTC day** — rejected by the owner: a business near a date boundary would see the wrong day's orders.
- **Hardcoded region timezone (e.g. `Asia/Kathmandu`)** — rejected: not a general rule; the stored `Business.timezone` is authoritative and may legitimately be any IANA zone.
- **`In Progress` including `CANCELLED` or excluding `OUT_FOR_DELIVERY`** — rejected: §17 names a fulfilment-progress metric; cancelled orders are outside it and `OUT_FOR_DELIVERY` is still in progress.
- **Deferring product search and the order-creation pickers** — rejected by the owner: they are the search gaps §18/§20 tie to this milestone.
- **Date-range / payment-status filters** — rejected for M8 as scope not required by the source.

**Rationale:** keep the dashboard's headline numbers correct for the business's own clock, make every count explicable from the spec's status vocabulary, and close the search gaps the spec already names — without expanding into reporting, integrations, or new dependencies.

**Security implications:** every count, list, search and picker result is membership-gated (`requireMembership`) and tenant-scoped; search terms are length-bounded and `LIKE`-escaped so a hostile term cannot broaden a query; picker option reads exclude soft-deleted rows and, for products, inactive rows.

**Operational implications:** the day window is computed per request from the stored timezone; no schema change or migration is required (the `(businessId, createdAt)` and `(businessId, status)` indexes already exist).

**Migration implications:** none.

**Reconsideration conditions:** a product requirement for a different day boundary, new dashboard metrics or reporting, additional order filters (date range, payment status), or a change to the active-product/soft-delete rules.

## DEC-015 — Milestone 9 scope and interim abuse protection (in-process fixed-window rate limiting)

**Status:** ACCEPTED (2026-10-19)  
**Date:** 2026-10-19  
**Accepted:** 2026-10-19 (scope approval by the owner)  
**Scope:** Milestone 9 — Security testing, safe error handling, E2E and mobile verification

**Context:** `docs/roadmap.md` defines Milestone 9 as "Security/testing — Tenant isolation, validation, safe error handling, E2E testing, and mobile testing". M1–M8 delivered strong service-level security controls but no automated E2E suite, no app-router-wide safe error boundaries, and no abuse protection on the three unauthenticated/unauthed boundary surfaces (`/track/[token]`, sign-in, invitation acceptance — recorded as pre-production items in `CURRENT_STATE.md` §10A and `docs/security.md` §7/§15). `MASTER_SPEC.md` §26 requires rate limiting for the public tracking endpoint ("if practical"), §35 requires a Playwright E2E critical path (Register → Create Business → Add Product → Add Customer → Create Order → Copy Tracking URL → Open Tracking URL → Update Order Status → Verify Customer Sees New Status), and `docs/testing.md` §8/§9 define the critical path and the responsive/keyboard expectations.

**Decision (owner, 2026-10-19):**

1. **Approved M9 scope:** Playwright E2E testing of the critical workflow (`docs/testing.md` §8); a dedicated `order_tracking_e2e` database with explicit guards that refuse dev/`_test`/production databases; tenant-isolation and authorization regression coverage; safe App Router error boundaries and safe server-side error logging (no logging framework; the `toSafeActionMessage` contract preserved unless inspection finds a real defect); responsive/browser verification at 375/768/1440 px; the focused keyboard/accessibility checks `docs/testing.md` §9 requires; the "1 orders" → "1 order" pagination-footer pluralization fix; and documentation updates that accurately reflect implementation and verification evidence. `@playwright/test` is approved as the only new dependency (development-only; unrelated dependencies stay out).
2. **Rate limiting — option O-A, all three boundaries:** implement an **in-process, fixed-window limiter with bounded memory** (no new runtime dependency; no Redis or other shared store in M9) for (a) the public `/track/[token]` page, (b) the sign-in Server Action, and (c) the invitation-acceptance action.
3. **Interim control with an explicit deployment dependency:** this limiter does **not** provide shared enforcement across application instances, and its state resets on restart and per instance. The selected hosting architecture at **M10 (Deployment)** must determine production-grade abuse protection. DEC-002 (hosting) is NOT resolved by M9.
4. **Non-goals:** the limiter must not bypass existing authentication, invitation-token validation, tenant authorization, or session behavior; must not leak account existence, tokens, internal errors, or other sensitive information; must not allow one user's activity to lock out unrelated users unnecessarily; and its state must not grow without bound, including under malformed or attacker-controlled input.

**Selected parameters (documented before implementation; tunable constants in `src/lib/security/rate-limit.ts`):**

- **Window:** fixed windows, not sliding. `windowMs` per boundary.
- **Thresholds (per client IP per boundary):** `/track/[token]` → **60 requests / 10 minutes** (all requests count — the page is cheap public content and no success/failure distinction exists at SSR time); sign-in → **10 *failed* attempts / 10 minutes** (successes never consume the budget, so a busy shared-office IP of legitimate users is not locked by one account's failures); invitation acceptance → **10 failed attempts / 10 minutes**. Rationale: thresholds are generous for humans but cap automated enumeration; counting only failures for the auth surfaces follows the owner's "don't let one user's activity lock out unrelated users" constraint.
- **Keying:** `boundary + client IP`. The IP is read from the first hop of `x-forwarded-for` **only** (no other spoofable header), falling back to a constant local key when the header is absent (e.g. local dev). Without a trusted reverse proxy the IP is best-effort; this is recorded as part of the M10 dependency (the host must supply the real client IP and/or terminate abuse protection).
- **Memory bounds:** buckets live in a single bounded `Map` capped at **10,000 keys**. When the cap is reached, the buckets with the **oldest** `windowStart` values are evicted first (oldest-window eviction, deterministic, O(1) amortized via an ordered deletion scan per insert batch). A cap hit therefore bounds memory even when keys are attacker-controlled (e.g. forged `x-forwarded-for` values); eviction can cause a re-window for unrelated evicted keys, which is accepted for the interim control.
- **Response semantics:** `/track/[token]` when limited renders a generic "Too many requests — try again shortly" state (identical for limited requests regardless of token validity; a server component cannot emit HTTP 429 — an M10 host/proxy returning real 429s is part of the production design). Sign-in and invitation acceptance keep the existing generic action-error shapes: the rate-limited paths return "Too many attempts. Please try again later.", the wrong-password path keeps "Invalid email or password." and the invitation-invalid outcome keeps its single generic state — none of these reveals whether an account or token exists, and throttled requests perform no token/credential work.
- **Clock:** the limiter uses the existing `src/lib/time.ts` (`nowMs`) clock; tests inject time rather than sleeping.

**Implementation:** a pure, framework-free module `src/lib/security/rate-limit.ts` (`consume(key) → { allowed, retryAfterMs }` plus reset/inspection helpers for tests), unit-tested for threshold edges, window expiration, bounded removal, and malformed-key safety; wired at the three boundaries with per-boundary integration/behavior tests. Existing authentication, invitation-token validation, tenant authorization, and session behavior remain the first and authoritative gates — the limiter runs in addition to them, never instead.

**Consequences:** automated token/hit floods on the public route, credential stuffing on sign-in, and invitation-acceptance probing all become rate-limited long before M10; the control is conservative and provider-neutral, so no hosting decision is pre-empted. The interim nature is explicitly documented: per-instance state, reset on restart, content-level (not HTTP 429) throttling on the tracking page, and eviction behavior under key flooding.

**Alternatives considered:**

- **O-B (tracking route only)** — rejected by the owner: sign-in and invitation acceptance need the interim control too; all three §10A boundary leaks close together.
- **O-C (defer everything to an M10 host-side limiter)** — rejected: leaves `docs/security.md` §15's release-gate item OPEN after the last pre-deployment coding milestone, and a provider-neutral interim control does not depend on (or pre-empt) DEC-002.
- **Redis / shared store now** — rejected: `DO_NOT_BUILD.md` §2 forbids unjustified queuing/cache infrastructure; DEC-002 stays open to M10.
- **Sliding-window / token-bucket algorithm** — rejected for M9 simplicity: a fixed window is trivial to reason about and test; reconsider only if production evidence demands it.
- **Keying by account email** — rejected: enables locking a victim's account out of sign-in (denial against unrelated users/fail-locked victims) and leaks nothing useful; per-IP is the owner-approved strategy.

**Security implications:** the limiter runs *after* existing gates and adds throttling only; generic messaging on all limited paths; no account-existence, token, or internal-error leakage; bounded memory under attacker-controlled key input; the multi-instance and reset-on-restart limitations are recorded here and as an explicit M10 deployment dependency in `CURRENT_STATE.md` §10A.

**Operational implications:** thresholds live as named constants in `src/lib/security/rate-limit.ts` and are restated in `docs/security.md` §7 so operations can retune them without code archaeology. No schema change; limiter state is process-local memory (intentionally not persisted).

**Migration implications:** none.

**Reconsideration conditions:** M10 hosting selection (DEC-002) choosing a shared-store or edge/proxy limiter; evidence that the interim thresholds wrongly throttle legitimate traffic; or a requirement for HTTP-429 semantics at the application tier.

