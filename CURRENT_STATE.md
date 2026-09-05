# CURRENT STATE — Order Tracking SaaS

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + approved decisions; this file records repository reality  
Last Reviewed: 2026-09-05  
Project Phase: MILESTONE 1 IN PROGRESS — implementation checkpoint reached, full verification not yet complete  
Documentation State: Generated / Specified  

## 1. State rule

This file records what is true in the repository at the time of verification. It does not define future requirements and does not convert planned architecture into implementation evidence.

**Authority separation:** [`MASTER_SPEC.md`](MASTER_SPEC.md) defines approved product requirements. `docs/architecture-decisions.md` records the status and rationale of significant technical decisions. The repository is evidence of implementation. Tests and other verification evidence establish confidence in behavior.

## 2. Current repository reality

**M1 STATUS: NOT YET COMPLETE/ACCEPTED.** Implementation described below is complete in this isolated repository, but full verification could not be completed in the environment that produced it (see §3). Do not treat "implemented" as "verified" or "accepted" anywhere in this section.

| Area | State | Evidence as of 2026-09-05 |
|---|---|---|
| Repository | Initialized, M1 implementation checkpoint reached | This package; commits `b6bc104`..`02510c6` |
| Application implementation | **Implemented (M1 scope)** — Next.js App Router + TypeScript + Tailwind scaffold, authentication UI, protected dashboard shell | `src/app/**`, `src/components/**` |
| Database schema | **Implemented, partially verified** — minimal `User` model only (`id`, `email`, `passwordHash`, `name`, `sessionVersion`, timestamps); no `Session`/`Account`/`VerificationToken`/business-domain tables | `prisma/schema.prisma`; migration applied and confirmed against a local dev PostgreSQL instance via `psql \d users` — this is a **database-level check only and is NOT equivalent to `prisma migrate dev` CLI verification** (see §3) |
| Authentication | **Implemented, not fully verified** — Auth.js v5, Credentials provider, JWT sessions, `sessionVersion` global invalidation, Argon2id hashing (`@node-rs/argon2`), registration/login/logout, server-side protected-route enforcement via `requireSession()` | `src/server/auth/**`, `src/lib/security/**`, `src/lib/validation/auth.ts`, `src/types/next-auth.d.ts`; decision recorded in `docs/architecture-decisions.md` DEC-001 |
| Business management | Not Started | No implementation |
| Customer management | Not Started | No implementation |
| Product management | Not Started | No implementation |
| Order management | Not Started | No implementation |
| Status workflow | Not Started | No implementation |
| Public tracking | Not Started | No implementation |
| Dashboard | **Implemented (placeholder only)** — protected shell with no business data yet | `src/app/(dashboard)/**` |
| Automated tests | **Implemented, passing** — `npm test` (Node's built-in `node:test`, zero new dependency; DEC-004 remains OPEN) — **8/8 pass**: Argon2id hash/verify round-trip, wrong-password rejection, malformed-hash safety, salt randomness, `sessionVersion` match/mismatch/missing-value cases | `tests/unit/password.test.ts`, `tests/unit/session-version.test.ts` |
| Infrastructure | Not Configured | No production provider/configuration exists |
| Production deployment | Not Deployed | No deployment evidence |
| Documentation | Specified, kept current through M1 checkpoint | This file, `docs/architecture-decisions.md` |

## 3. Verification baseline

- Last Verified Commit: `02510c6` (tip of the five M1 implementation commits; see §11 for the full list)
- Last Verified Branch: `main`
- Last Verified Environment: Sandboxed implementation environment with local PostgreSQL 16 and restricted outbound network access (no access to `binaries.prisma.sh`)
- Last Verified By: AI coding agent, M1 implementation session
- Last Verification Date: 2026-09-05
- **Application verification evidence — itemized, do not summarize as a single pass/fail:**

| Check | Result | Detail |
|---|---|---|
| `npm test` | **PASS — 8/8** | Node's built-in `node:test` runner (zero new dependency; does not resolve DEC-004). Covers Argon2id hash/verify round-trip, wrong-password rejection, malformed-hash safety, salt randomness, and `sessionVersion` match/mismatch/missing-value cases. |
| ESLint (`npx eslint .`) | **PASS — clean** | Zero errors, zero warnings. |
| `npx tsc --noEmit` | **FAIL — exactly one error** | `src/lib/db/client.ts(3,10): Module '"@prisma/client"' has no exported member 'PrismaClient'`. Root cause: `@prisma/client` has no generated types (see next row). Not a code defect — isolated and confirmed to this single line. |
| `npx next build` | **PARTIAL — compiles, fails at typecheck** | Turbopack bundling succeeds ("Compiled successfully"); the build's TypeScript-checking phase fails on the exact same single error as above. No other build issues found. |
| `npx prisma generate` / `validate` / `migrate dev` | **BLOCKED — unverified** | All Prisma CLI operations require fetching the schema-engine binary from `binaries.prisma.sh`, which is not reachable from this environment's allowed network domains (403 Forbidden). Confirmed repeatedly, including with the documented checksum-bypass environment variable and Prisma 7's driver-adapter/query-compiler preview mode — neither avoids the network dependency in this Prisma version. **This is the sole root cause of the `tsc`/`next build` failures above.** |
| Database migration | **Database-level check only — NOT CLI-verified** | `prisma/migrations/20260905103000_init/migration.sql` was hand-authored to match `prisma/schema.prisma` exactly (since `prisma migrate dev` could not run), applied directly via `psql` against a local dev PostgreSQL 16 instance, and the resulting `users` table was confirmed via `\d users` to match the schema field-for-field. **This is explicitly not equivalent to a `prisma migrate dev`-generated and CLI-verified migration.** The migration file itself carries this same provenance note. |

**To close the remaining gap, in a network-unrestricted environment:**
```
npm install
npx prisma generate
npx prisma migrate dev   # or: npx prisma migrate resolve --applied 20260905103000_init
npx tsc --noEmit          # expected to pass cleanly based on the isolation above
npx next build            # expected to pass cleanly based on the isolation above
npm test                  # already passing here, should remain so
```

**M1 must not be marked COMPLETE or ACCEPTED until the above Prisma-dependent checks are actually run and pass.** Implemented-but-unverified functionality must never be represented as verified.

## 4. Approved baseline, not implemented

The approved architectural baseline is a modular monolith using Next.js App Router, React, TypeScript, Tailwind CSS, PostgreSQL, Prisma, Zod, Server Components, Server Actions, and Route Handlers only where an actual HTTP endpoint is needed. The tenancy model is pooled PostgreSQL with server-side authorization and tenant-scoped data access; PostgreSQL RLS is not required for MVP. This is design state, not implementation evidence.

See [`docs/architecture.md`](docs/architecture.md), [`docs/database.md`](docs/database.md), and [`docs/security.md`](docs/security.md).

## 5. MVP scope state

The approved MVP includes authentication, business onboarding/profile/membership, OWNER and STAFF roles, customers, products, orders, status history, secure public tracking, basic dashboard, search/filtering, responsive UI, manual payment status, delivery/pickup data, server-side authorization and validation, critical automated testing, development seed data, basic production deployment, and basic logging/monitoring.

Messaging APIs, AI, payment gateways, inventory/stock/warehouse/purchasing, advanced delivery management, analytics/forecasting, customer accounts, subscription billing, white-labeling, and complex permission systems are out of MVP scope. See [`DO_NOT_BUILD.md`](DO_NOT_BUILD.md) and [`docs/roadmap.md`](docs/roadmap.md).

## 6. Open decisions

| ID | Decision | Status | What it blocks |
|---|---|---|---|
| DEC-001 | Authentication provider and identity model | ACCEPTED (amended) | Authentication design settled (Auth.js, Credentials provider, JWT sessions with `sessionVersion` global invalidation, Argon2id hashing); amended from database-backed sessions due to a discovered Auth.js Credentials-provider/database-session incompatibility; authentication code is now implemented (§2, §11) but not fully verified — Prisma-dependent checks remain blocked (§3) |
| DEC-002 | Production hosting provider | OPEN | Final production deployment configuration |
| DEC-003 | Production PostgreSQL provider | OPEN | Final production database configuration |
| DEC-004 | Unit/integration testing framework | OPEN | Final unit/integration test tooling |
| DEC-005 | Production monitoring provider | OPEN | Provider-specific monitoring configuration |
| DEC-006 | Monetary storage strategy | OPEN | Final ORM/database money mapping |
| DEC-007 | Order-number sequence-generation strategy | OPEN | Final concurrent order-number implementation |
| DEC-008 | Closed business role and security governance standard | ACCEPTED | Authorization implementation and security verification |
| DEC-009 | Separate platform/company authorization domain | ACCEPTED | Future platform authorization design/implementation |

An open decision does not block unrelated work. Authentication selection blocks authentication implementation; provider selection for production infrastructure can remain open while local application work proceeds.

## 7. Platform/company authorization standard

The project formally recognizes two separate authorization domains:

```text
SaaS Platform / Company
├── SUPER_ADMIN
└── ADMIN

Customer Business / Tenant
├── OWNER
└── STAFF
```

`SUPER_ADMIN` and `ADMIN` are platform/company roles and must never be stored in `BusinessMember.role`. `BusinessMember.role` remains exactly `OWNER | STAFF`. Platform authorization has its own server-side boundary and cannot be inferred from browser-controlled tenant identifiers or business roles. A platform role does not automatically grant customer-business membership, and a business `OWNER`/`STAFF` does not confer platform authority. Any platform operation touching tenant data must be explicitly authorized server-side and preserve tenant isolation.

Platform authentication, platform persistence, platform APIs, and platform UI are **not implemented** in this repository. Exact platform-role capabilities remain intentionally unspecified/open and must not be invented.

## 8. Known ambiguities / decisions requiring explicit resolution

### AMB-001 — Order calculation formula wording

`MASTER_SPEC.md` section 29 contains a malformed calculation presentation. Elsewhere in the supplied project state, the conceptual rule is `subtotal + delivery fee - discount = total`. Because financial semantics are security- and correctness-critical, the implementation must not silently choose a different interpretation. The exact discount semantics must be reconciled before authoritative order-calculation code is finalized.

**Impact:** Order calculation implementation.  
**Status:** OPEN / implementation blocker for final financial-calculation semantics.  
**Work that can proceed:** Repository setup, UI structure, non-financial modules, documentation, and test scaffolding.

### AMB-002 — Cancellation transition matrix

The specification requires the normal forward status workflow and states cancellation may occur before delivery, while also requiring invalid transitions to be rejected. It does not enumerate every allowed pre-delivery cancellation edge. The implementation must define and test an explicit transition matrix before status workflow implementation is considered complete; it must not invent post-delivery reopening behavior.

**Impact:** Status-transition implementation.  
**Status:** OPEN, not a repository-initialization blocker.

## 9. Known source-state normalization

The supplied pre-existing `CURRENT_STATE.md` contained both `Current Milestone: PRE-IMPLEMENTATION` and `Current Milestone: Milestone 3 — Customers`, while its implementation section stated the repository and application were not initialized. Because implementation evidence is absent, this generated state records the evidenced state as **PRE-IMPLEMENTATION** and does not represent Milestone 3 as completed or active.

## 10. Risks

| ID | Severity | Risk | Required control |
|---|---|---|---|
| RISK-001 | Critical | Tenant isolation failure | Centralized authorization, tenant-scoped queries, cross-tenant automated tests |
| RISK-002 | High | AI-assisted development drift | Read authority documents first; reject unapproved scope/technology changes |
| RISK-003 | High | Scope creep | Maintain MVP firewall and roadmap separation |
| RISK-004 | High | Financial calculation errors | Server-authoritative calculation, money-safe representation, automated tests |
| RISK-005 | Medium | Public tracking abuse | Secure random tokens, unique constraint, deliberate public DTO, abuse protection review |
| RISK-006 | Medium | Documentation drift | Update current state after meaningful changes and require verification evidence |
| RISK-007 | Critical | Platform/business authorization conflation | Separate authorization domains, server-side role checks, escalation tests, and tenant-scope verification |

## 11. M1 checkpoint — implementation commits

The following five commits implement M1 scope (scaffold, database schema, authentication, UI, tests). None of them may be treated as "M1 complete" — see §3 for exactly what remains unverified.

| Commit | Description |
|---|---|
| `b6bc104` | chore: scaffold Next.js App Router, TypeScript, and Tailwind foundation |
| `d60ff3d` | feat(db): add M1 Prisma schema and initial migration |
| `7d82546` | feat(auth): implement Auth.js Credentials authentication per amended DEC-001 |
| `1534288` | feat(ui): add authentication pages and protected dashboard layout |
| `02510c6` | test: add unit tests for password hashing and sessionVersion invalidation |

These sit on top of the governance commits `4ef6c4e` (DEC-001 accepted), `163d452` (M1-readiness state correction), and `cb6ac7f` (DEC-001 amended to JWT sessions).

## 12. Immediate next step

1. **Resolve the Prisma CLI network blocker** (§3): in an environment with access to `binaries.prisma.sh`, run `npm install && npx prisma generate && npx prisma migrate dev` (or `prisma migrate resolve --applied 20260905103000_init` against the already-matching local database), then re-run `npx tsc --noEmit` and `npx next build` and confirm both pass cleanly.
2. Only after step 1 passes: perform the full M1 completion gate (security review re-confirmation, manual auth-flow smoke test against a real running app) and update this file to mark M1 **COMPLETE**, replacing the "not yet complete/accepted" framing in §2 and this section.
3. Resolve AMB-001 before final authoritative financial-calculation implementation (Milestone 5).
4. Resolve AMB-002 before the status workflow milestone is marked complete (Milestone 6).
5. Do not begin Milestone 2 until step 2 above is satisfied.

## 13. Reality rule for AI agents

Do not use this file to infer that a planned feature exists, and do not treat "implemented" (§2) as equivalent to "verified" or "complete" — this checkpoint explicitly distinguishes the two per §3. Read the source code, schema, migrations, configuration, and verification evidence before changing any implementation-state claim.
