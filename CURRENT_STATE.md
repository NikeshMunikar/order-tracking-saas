# CURRENT STATE — Order Tracking SaaS

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + approved decisions; this file records repository reality  
Last Reviewed: 2026-09-06  
Project Phase: MILESTONE 1 ACCEPTED — Milestone 2 not yet started  
Documentation State: Generated / Specified  

## 1. State rule

This file records what is true in the repository at the time of verification. It does not define future requirements and does not convert planned architecture into implementation evidence.

**Authority separation:** [`MASTER_SPEC.md`](MASTER_SPEC.md) defines approved product requirements. `docs/architecture-decisions.md` records the status and rationale of significant technical decisions. The repository is evidence of implementation. Tests and other verification evidence establish confidence in behavior.

## 2. Current repository reality

**M1 STATUS: ACCEPTED (2026-09-06).** Full verification has now passed in the person's local development environment: `prisma generate`, `prisma validate`, `tsc --noEmit`, `npm test` (8/8), `next build`, and `prisma migrate status` (migration `20260905103000_init` applied; "Database schema is up to date!") all PASS. This closes the verification gap recorded in the M1 checkpoint history below (§3 retains that history for reference; do not delete it).

| Area | State | Evidence as of 2026-09-06 |
|---|---|---|
| Repository | Initialized, M1 ACCEPTED | This package; commits `b6bc104`..`5687693` |
| Application implementation | **Implemented (M1 scope)** — Next.js App Router + TypeScript + Tailwind scaffold, authentication UI, protected dashboard shell | `src/app/**`, `src/components/**` |
| Database schema | **Implemented, verified** — minimal `User` model only (`id`, `email`, `passwordHash`, `name`, `sessionVersion`, timestamps); no `Session`/`Account`/`VerificationToken`/business-domain tables. Prisma 7 config compatibility fix applied (`prisma.config.ts` + `@prisma/adapter-pg`) and CLI-verified (`prisma generate`/`validate`/`migrate status` all PASS) — see §3 | `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db/client.ts`, `prisma/migrations/20260905103000_init/` — migration confirmed applied via `prisma migrate status` ("Database schema is up to date!") in the person's local environment (see §3) |
| Authentication | **Implemented, verified** — Auth.js v5, Credentials provider, JWT sessions, `sessionVersion` global invalidation, Argon2id hashing (`@node-rs/argon2`), registration/login/logout, server-side protected-route enforcement via `requireSession()` | `src/server/auth/**`, `src/lib/security/**`, `src/lib/validation/auth.ts`, `src/types/next-auth.d.ts`; decision recorded in `docs/architecture-decisions.md` DEC-001; `tsc --noEmit` and `next build` both PASS (§3) |
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

**M1 ACCEPTANCE VERIFICATION (2026-09-06) — the person's local development environment, full network access:**

| Check | Result |
|---|---|
| `npx prisma generate` | **PASS** |
| `npx prisma validate` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm test` | **PASS — 8/8** |
| `npx next build` | **PASS** |
| `npx prisma migrate status` | **PASS** — migration `20260905103000_init` applied; "Database schema is up to date!" |
| Database | `order_tracking_dev` |

This closes every gap identified in the sandbox-environment history below. **M1 is formally ACCEPTED as of this verification.** The history below is retained for provenance and must not be deleted or reframed as if the sandbox itself had produced these passing results — it did not; the person's separate local environment did.

---

**Sandbox-environment verification history (2026-09-05, prior to acceptance) — retained for provenance:**

- Last Verified Commit: `5687693` (Prisma 7 compatibility fix commit; tip of the six M1 checkpoint commits — see §11). "Verified" here means the itemized checks below were actually run against this commit, not that all of them passed — see the itemized table for exactly which did and did not.
- Last Verified Branch: `main`
- Last Verified Environment: Sandboxed implementation environment with local PostgreSQL 16 and restricted outbound network access (no access to `binaries.prisma.sh`)
- Last Verified By: AI coding agent, M1 Prisma 7.10 compatibility fix session
- Last Verification Date: 2026-09-05
- **Prisma 7.10 compatibility fix applied:** Prisma 7 removed `datasource.url` support from `schema.prisma` (error P1012, confirmed independently in the person's own local environment with full network access — this is a schema-config incompatibility, separate from and in addition to this sandbox's network restriction below). Fixed per Prisma's own v7 documentation: `url` removed from `schema.prisma`'s `datasource` block; a new `prisma.config.ts` supplies the connection URL for CLI operations; `src/lib/db/client.ts` now constructs a `@prisma/adapter-pg` driver adapter and passes it to the `PrismaClient` constructor for the application runtime. Confirmed fixed: `prisma generate`/`validate` now load `prisma.config.ts` successfully and get past the P1012 error entirely in this environment too — the only remaining failure here is the pre-existing, unchanged network block below.
- **Application verification evidence — itemized, do not summarize as a single pass/fail:**

| Check | Result | Detail |
|---|---|---|
| `npm test` | **PASS — 8/8** | Node's built-in `node:test` runner (zero new dependency; does not resolve DEC-004). Unaffected by the Prisma config fix. |
| ESLint (`npx eslint .`) | **PASS — clean** | Zero errors, zero warnings. |
| `npx tsc --noEmit` | **FAIL — exactly one error, unchanged** | `src/lib/db/client.ts: Module '"@prisma/client"' has no exported member 'PrismaClient'`. Root cause unchanged: `@prisma/client` still has no generated types in this environment (see next row) — not a code defect, and not caused by the P1012 issue (that is now fixed). |
| `npx next build` | **PARTIAL — compiles, fails at typecheck, unchanged** | Turbopack bundling succeeds; the build's TypeScript-checking phase fails on the exact same single error as above. |
| `npx prisma generate` / `validate` | **P1012 FIXED; still BLOCKED on network** | Both commands now load `prisma.config.ts` successfully and no longer hit P1012. They still fail in this sandbox only because the Prisma CLI needs to fetch its schema-engine binary from `binaries.prisma.sh`, which remains outside this environment's allowed network domains (403 Forbidden) — unchanged from before this fix. |
| `npx prisma migrate dev` | **NOT RUN — reconciliation was needed first** | The local dev database's `users` table was created via hand-authored SQL, not through Prisma Migrate, so `_prisma_migrations` bookkeeping did not yet exist at the time of this record. Reconciliation via `prisma migrate resolve --applied 20260905103000_init` (or equivalent) has since been completed in the person's local environment — see the acceptance verification above (`migrate status` now reports the migration applied and schema up to date). |
| Database migration | **Database-level check only — NOT CLI-verified at the time of this record** | `prisma/migrations/20260905103000_init/migration.sql` was hand-authored to match `prisma/schema.prisma` exactly, applied directly via `psql` against a local dev PostgreSQL 16 instance, and confirmed via `\d users` to match the schema field-for-field. This has since been superseded by the CLI-verified `migrate status` result above. |
| PostgreSQL connectivity (non-destructive) | **PASS** | Direct `pg` driver connection (same driver Prisma's adapter uses) confirmed: connects to `order_tracking_dev`, lists existing tables (`users` only), confirms `_prisma_migrations` does not yet exist at that time. |

**Migration bookkeeping finding (resolved):** the dev database had the correct `users` table (matching the schema) but no Prisma migration history at the time of the sandbox record above. This has since been reconciled in the person's local environment (`prisma migrate status` now reports it applied and up to date, per the acceptance verification above).

## 4. Approved baseline, not implemented

The approved architectural baseline is a modular monolith using Next.js App Router, React, TypeScript, Tailwind CSS, PostgreSQL, Prisma, Zod, Server Components, Server Actions, and Route Handlers only where an actual HTTP endpoint is needed. The tenancy model is pooled PostgreSQL with server-side authorization and tenant-scoped data access; PostgreSQL RLS is not required for MVP. This is design state, not implementation evidence.

See [`docs/architecture.md`](docs/architecture.md), [`docs/database.md`](docs/database.md), and [`docs/security.md`](docs/security.md).

## 5. MVP scope state

The approved MVP includes authentication, business onboarding/profile/membership, OWNER and STAFF roles, customers, products, orders, status history, secure public tracking, basic dashboard, search/filtering, responsive UI, manual payment status, delivery/pickup data, server-side authorization and validation, critical automated testing, development seed data, basic production deployment, and basic logging/monitoring.

Messaging APIs, AI, payment gateways, inventory/stock/warehouse/purchasing, advanced delivery management, analytics/forecasting, customer accounts, subscription billing, white-labeling, and complex permission systems are out of MVP scope. See [`DO_NOT_BUILD.md`](DO_NOT_BUILD.md) and [`docs/roadmap.md`](docs/roadmap.md).

## 6. Open decisions

| ID | Decision | Status | What it blocks |
|---|---|---|---|
| DEC-001 | Authentication provider and identity model | ACCEPTED (amended) | Authentication design settled (Auth.js, Credentials provider, JWT sessions with `sessionVersion` global invalidation, Argon2id hashing); amended from database-backed sessions due to a discovered Auth.js Credentials-provider/database-session incompatibility; authentication code is implemented and verified (§2, §3, §11) — M1 accepted |
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

The following six commits implement the ACCEPTED M1 scope (scaffold, database schema, authentication, UI, tests, Prisma 7 compatibility fix). See §3 for the acceptance verification evidence.

| Commit | Description |
|---|---|
| `b6bc104` | chore: scaffold Next.js App Router, TypeScript, and Tailwind foundation |
| `d60ff3d` | feat(db): add M1 Prisma schema and initial migration |
| `7d82546` | feat(auth): implement Auth.js Credentials authentication per amended DEC-001 |
| `1534288` | feat(ui): add authentication pages and protected dashboard layout |
| `02510c6` | test: add unit tests for password hashing and sessionVersion invalidation |
| `5687693` | fix(db): Prisma 7 datasource.url compatibility (P1012) — `prisma.config.ts` + `@prisma/adapter-pg`; no architecture change |

These sit on top of the governance commits `4ef6c4e` (DEC-001 accepted), `163d452` (M1-readiness state correction), and `cb6ac7f` (DEC-001 amended to JWT sessions).

## 12. Immediate next step

M1 is ACCEPTED (§2, §3). The verification and reconciliation steps previously listed here (configure `DATABASE_URL`, reconcile migration bookkeeping, re-run typecheck/build) have all been completed and passed — see §3's acceptance verification table. They are not repeated here as pending work.

1. Begin Milestone 2 — Business onboarding (business creation, business settings, `OWNER`/`STAFF` membership) per `MASTER_SPEC.md` §44 and `docs/roadmap.md`. No new architecture decision is required to begin: DEC-008 (closed business-role model) and DEC-009 (separate platform/business authorization domains) are already ACCEPTED, and the `Business`/`BusinessMember` schema shape is already specified in `docs/database.md`.
2. Resolve AMB-001 before final authoritative financial-calculation implementation (Milestone 5).
3. Resolve AMB-002 before the status workflow milestone is marked complete (Milestone 6).
4. DEC-002, DEC-003, DEC-004, DEC-005 remain OPEN but do not block Milestone 2 (they concern production hosting/database/monitoring and the test framework, none of which Milestone 2 requires); DEC-006/DEC-007 remain OPEN but concern the `Order` table, out of Milestone 2 scope.

## 13. Reality rule for AI agents

Do not use this file to infer that a planned feature exists, and do not treat "implemented" (§2) as equivalent to "verified" or "complete" — this checkpoint explicitly distinguishes the two per §3. Read the source code, schema, migrations, configuration, and verification evidence before changing any implementation-state claim.
