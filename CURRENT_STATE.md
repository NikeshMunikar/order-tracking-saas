# CURRENT STATE — Order Tracking SaaS

Document Status: Active  
Source Authority: `MASTER_SPEC.md` + approved decisions; this file records repository reality  
Last Reviewed: 2026-10-18  
Project Phase: MILESTONE 1 ACCEPTED; MILESTONE 2 (Stages 1–3) ACCEPTED 2026-10-18 subject to a five-item security fix pack, which is IMPLEMENTED and VERIFIED; MILESTONE 3 (Customers) IMPLEMENTED and VERIFIED — awaiting the owner's M3 acceptance decision  
Documentation State: Generated / Specified  

## 1. State rule

This file records what is true in the repository at the time of verification. It does not define future requirements and does not convert planned architecture into implementation evidence.

**Authority separation:** [`MASTER_SPEC.md`](MASTER_SPEC.md) defines approved product requirements. `docs/architecture-decisions.md` records the status and rationale of significant technical decisions. The repository is evidence of implementation. Tests and other verification evidence establish confidence in behavior.

## 2. Current repository reality

**M1 STATUS: ACCEPTED (2026-09-06).** Full verification has now passed in the person's local development environment: `prisma generate`, `prisma validate`, `tsc --noEmit`, `npm test` (8/8), `next build`, and `prisma migrate status` (migration `20260905103000_init` applied; "Database schema is up to date!") all PASS. This closes the verification gap recorded in the M1 checkpoint history below (§3 retains that history for reference; do not delete it).

**M3 STATUS: IMPLEMENTED AND VERIFIED (2026-10-18); READ-ONLY ACCEPTANCE AUDIT PERFORMED (2026-10-18, at `e2061b0` — findings F1–F5, 0 Critical / 0 High); REMEDIATION OF F1/F2/F3 IMPLEMENTED AND VERIFIED (2026-10-18) — NOT YET ACCEPTED (awaiting the owner's re-review of the remediation).** Milestone 3 (Customers) adds the `Customer` model and a committed migration, tenant-scoped customer services (list with search + pagination, read, create, update, soft delete), Server Actions and UI under `/dashboard/[businessId]/customers`, and automated tests including the mandatory negative cases. Verification is recorded in §3D (implementation) and §3E (audit remediation). Audit finding F4 (the `AUTH_SECRET` fail-fast validation logs loudly but does not terminate the process) is deferred for an explicit owner decision (§10A). Milestone 4 (Products) has not started.

**M2 STATUS: ACCEPTED 2026-10-18 (Stages 1–3), subject to the fix pack below — FIX PACK IMPLEMENTED AND VERIFIED.** The milestone audit returned **PASS WITH FINDINGS (no Critical/High)** and the owner accepted M2 Stages 1–3 on 2026-10-18 subject to five remediation items (dot-segment `callbackUrl` guard, baseline security headers, credential-verification timing, fail-fast `AUTH_SECRET` validation, and a `toSafeActionMessage` unit test). All five are implemented and verified — see §3C. Stage 1 (business / membership / invitation schema + migration) and Stage 2 (business authorization and membership + invitation domain services) were implemented and passed the verification recorded in §3A; an independent re-audit at `ed3cf59` returned PASS WITH MINOR FINDINGS (no security defect in the code), remediated by `1ccabe1` (lock-serialization regression test), `b50a5f1` (deterministic `ORDER BY id` lock order), and a documentation update. Stage 3 — the M2 business UI and Server Actions — was implemented and verified on 2026-10-18 (§3B).

**Provenance:** the M2 Stage 2 re-audit record (2026-10-17, `ed3cf59`, PASS WITH MINOR FINDINGS — no security defect found) and the Stage 3 verification record (2026-10-18, `0437275`) are retained in §3A and §3B. The M2 milestone audit subsequently returned **PASS WITH FINDINGS with no Critical/High severity finding**; the five remediation items are recorded in §3C and every accepted state in this file remains subject to the owner's decision.

| Area | State | Evidence / latest verification |
|---|---|---|
| Repository | Initialized; M1 ACCEPTED; M2 (Stages 1–3) ACCEPTED 2026-10-18 subject to a fix pack (now applied); M3 (Customers) implemented and verified (not accepted) | This package; M1 checkpoint `b6bc104`..`5687693`, M2 remediation `e7f9f31`..`ed3cf59`, post-re-audit cleanup `1ccabe1`..`b50a5f1`, Next.js security upgrade `e587611`, M2 Stage 3 `0437275`/`c3a76fe`, M2 fix pack `6b6ad6a`..`15f9366`, M3 `5177ae3`/`d175bdb`/`4b58e37`, audit base `e2061b0`, M3 audit remediation `112d0ac` (F2) / `07514bc` (F1) / `e0b234f` (F3) |
| Application implementation | **Implemented (M1 + M2 + M3 scope)** — Next.js App Router + TypeScript + Tailwind scaffold, authentication UI, protected dashboard shell, business onboarding/settings/team UI, customer list/detail/create/edit UI | `src/app/**`, `src/components/**`, `src/server/**` |
| Database schema | **Implemented, verified** — `User` (`id`, `email` unique, `passwordHash`, `name?`, `sessionVersion`, timestamps); `Business`; `BusinessMember`; `BusinessInvitation`; `Customer`; and enum `BusinessMemberRole { OWNER, STAFF }`. No `Session`/`Account`/`VerificationToken` (DEC-001 uses JWT sessions). Prisma 7 config compatibility fix applied (`prisma.config.ts` + `@prisma/adapter-pg`); three committed migrations (the M3 one is CLI-generated) | `prisma/schema.prisma`, `prisma/migrations/20260905103000_init/`, `prisma/migrations/20260907120000_add_business_membership/` (including the hand-written partial unique index `business_invitations_active_email_key`), `prisma/migrations/20261018055702_add_customer/`, `prisma.config.ts`, `src/lib/db/client.ts`; verification in §3, §3A and §3D |
| Authentication | **Implemented, verified** — Auth.js v5, Credentials provider, JWT sessions, `sessionVersion` global invalidation, Argon2id hashing (`@node-rs/argon2`), registration/login/logout, server-side protected-route enforcement via `requireSession()` | `src/server/auth/**`, `src/lib/security/**`, `src/lib/validation/auth.ts`, `src/types/next-auth.d.ts`; decision recorded in `docs/architecture-decisions.md` DEC-001; `tsc --noEmit` and `next build` both PASS (§3) |
| Business management | **Implemented (M2 Stages 1–3), verified, ACCEPTED 2026-10-18 (fix pack applied)** — `Business` / `BusinessMember` / `BusinessInvitation` schema and migration; server-side services for business creation, settings update, member listing / role change / removal, and OWNER-only invitations; server-side authorization in every mutation; these services are wrapped by Server Actions with a UI in Stage 3 (§3B) | `prisma/schema.prisma`, `prisma/migrations/20260907120000_add_business_membership/`, `src/server/business/**`, `src/lib/validation/business.ts`; verification in §3A, §3B and §3C |
| Business invitations | **Implemented (M2 Stage 2), verified** — invite-by-link model (DEC-011): 256-bit token, SHA-256 hash at rest (DEC-012), 7-day expiry, OWNER-only invite/revoke, single active invitation per (business, email) enforced by a partial unique index, acceptance by authenticated email match with a conditional claim | `src/server/business/invitation-service.ts`, `src/lib/security/token.ts`; ADRs DEC-011 / DEC-012 in `docs/architecture-decisions.md`; verification in §3A |
| Customer management | **Implemented (M3), verified; audit remediation applied** — tenant-owned customers with soft deletion: server-side list (name/phone search, pagination, selective projection), detail read, create, update, and OWNER-only soft delete, all behind `requireMembership`/`requireOwner`; Server Actions + UI under `/dashboard/[businessId]/customers`; local migrations applied through the CLI. M3 audit remediation: page bound + clamp (`112d0ac`), literal LIKE search (`07514bc`), independent `q`/`page` parsing + truthful out-of-range page state (`e0b234f`) — see §3E | `prisma/schema.prisma` (`Customer`), `prisma/migrations/20261018055702_add_customer/`, `src/server/customer/**`, `src/lib/validation/customer.ts`, `src/lib/db/like.ts`, `src/app/(dashboard)/dashboard/[businessId]/customers/**`, `src/components/customer/**`; verification in §3D and §3E |
| Product management | Not Started | No implementation |
| Order management | Not Started | No implementation |
| Status workflow | Not Started | No implementation |
| Public tracking | Not Started | No implementation |
| Business UI / dashboard | **Implemented (M2 Stage 3), verified** — business onboarding (create business), business settings form, team page (members + invitations), invite acceptance page, `callbackUrl`-aware sign-in; server-side authorization on every route; dashboard business list | `src/app/(dashboard)/**`, `src/app/invite/**`, `src/components/business/**`, `src/components/auth/**`, `src/server/business/actions.ts`, `src/lib/security/redirect.ts`, `src/lib/time.ts`; verification in §3B |
| Automated tests | **Implemented, passing** — Node's built-in `node:test` (zero new dependency; **DEC-004 remains OPEN and is NOT resolved by this**). Unit: **56/56** (`npm test`, run through `tests/helpers/register-unit.mjs`, which registers the `@/*` alias loader and an inert `server-only` stub without requiring a database) — auth/password/session/redirect/token/slug/action-error/customer-validation (including the page bound and independent `q`/`page` parsing)/like-escaping suites. DB-backed integration: **39/39** (`npm run test:integration`) covering OWNER/STAFF authorization for all five M2 OWNER-only mutations, tenant isolation, the closed business-role invariant, OWNER-row locking / re-verification (including deterministic lock serialization), invitation acceptance / P2002 paths, and M3 customer authorization, cross-tenant denial, soft-delete preservation, search (including literal `%`/`_`/`\` LIKE behaviour and unchanged tenant scoping), pagination (including out-of-range page normalization) and the OWNER-row-re-verification path for customer deletion. The M2 Stage 3 Server Action layer has **no automated test** — its authorization delegates to this tested service layer and was exercised manually (§3B); the M3 Server Actions delegate the same way | `tests/unit/**`, `tests/integration/**`, `tests/helpers/**`, `tests/README.md`; results in §3A, §3B, §3D and §3E |
| Infrastructure | Not Configured | No production provider/configuration exists |
| Production deployment | Not Deployed | No deployment evidence |
| Documentation | Specified, kept current through M3 (Customers) | This file, `docs/architecture-decisions.md`, `ai-context/07-current-milestone.md` |

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

## 3A. M2 Stage 2 remediation verification (2026-10-17)

**M2 STAGE 2 REMEDIATION VERIFICATION (2026-10-17) — local development environment:**

| Check | Command | Result |
|---|---|---|
| Prisma client generation | `npx prisma generate` | **PASS** (v7.10.0) |
| Schema validation | `npx prisma validate` | **PASS** — "The schema at prisma\schema.prisma is valid" |
| Migrations applied to the dedicated test DB | `npm run test:db:setup` (targets `order_tracking_dev_test`; runs `prisma migrate deploy`) | **PASS** — the recorded run reported the database already existed and "2 migrations found ... No pending migrations to apply"; the suite's bootstrap creates and migrates this database when it is absent. The development database `order_tracking_dev` was not touched |
| Type checking | `npx tsc --noEmit` | **PASS** — exit 0 |
| Unit tests | `npm test` | **PASS — 22/22** |
| Integration tests | `npm run test:integration` | **PASS — 28/28** |
| Linting | `npm run lint` | **PASS** — exit 0 (no errors or warnings) |
| Production build | `npm run build` (Next.js 16.3.4, Turbopack) | **PASS** — exit 0 |

Last verified commit for this evidence: `b50a5f1` (post-re-audit cleanup; the earlier remediation/test evidence was recorded at `ad41f1a`, with the documentation update as a subsequent commit). The test database `order_tracking_dev_test` is a dedicated database derived from `DATABASE_URL` by appending `_test`; it is never the development database.

**Honest scope of the evidence:** these checks establish that the code type-checks, lints, builds, and that the Node tests pass against a real PostgreSQL. They do **not** constitute an independent security audit or milestone acceptance. They also do not decide DEC-004.

**Re-audit (2026-10-17):** an independent read-only security/governance re-audit of M2 Stage 2 at commit `ed3cf59` returned **PASS WITH MINOR FINDINGS** — no security defect was found in the code. Findings: (1) a test-power gap (a lock-removal regression was not detectable), (2) stale documentation, (3) informational lock-order hardening, (4) dependency advisories (informational), and (5) carry-forward notes for Stage 3. Findings (1) and (3) are remediated by `1ccabe1` (lock-serialization regression test) and `b50a5f1` (deterministic `ORDER BY id` lock order); finding (2) by this documentation update. Status remains **awaiting the owner's acceptance decision** — this file does not mark Stage 2 accepted.

**Known issues (recorded, not fixed):** `npm audit` now reports **no critical** advisory — the previously reported **critical** advisory on `next` 16.3.4 (GHSA-vcvr-r3jv-pc5j, RCE in `next/og` `ImageResponse`) was fixed on 2026-10-18 by upgrading `next` and `eslint-config-next` to `16.4.2` (the first non-major fixed release; commit `e587611`), taking the report from 14 advisories (1 critical) to 12 (0 critical). The remaining advisories are **high**/**moderate** and transitive/tooling (`prisma`, `sharp`, `source-map-js`, `fast-uri`; `mysql2` is unused). The application does not import `next/og` and does not use `"use cache"`.

## 3B. M2 Stage 3 (business UI + Server Actions) verification (2026-10-18)

**M2 STAGE 3 IMPLEMENTATION — local development environment:**

| Check | Command | Result |
|---|---|---|
| Prisma client generation | `npx prisma generate` | **PASS** (v7.10.0) |
| Schema validation | `npx prisma validate` | **PASS** — "The schema at prisma\schema.prisma is valid" |
| Migrations applied to the dedicated test DB | `npm run test:db:setup` | **PASS** — "2 migrations found ... No pending migrations to apply". Stage 3 introduced **no schema change and no new migration**. |
| Type checking | `npx tsc --noEmit` | **PASS** — exit 0 |
| Unit tests | `npm test` | **PASS — 31/31** (22 pre-existing + 9 new `safeCallbackUrl` open-redirect tests) |
| Integration tests | `npm run test:integration` | **PASS — 28/28** |
| Linting | `npm run lint` | **PASS** — exit 0 |
| Production build | `npm run build` (Next.js 16.4.2, Turbopack) | **PASS** — exit 0; routes `/`, `/api/auth/[...nextauth]`, `/dashboard`, `/dashboard/[businessId]`, `/dashboard/[businessId]/settings`, `/dashboard/[businessId]/team`, `/invite/[token]`, `/login`, `/register` |

**Last verified commit for this evidence: `0437275`** (the M2 Stage 3 implementation commit; this documentation update is a subsequent commit). The Next.js security upgrade `e587611` (`next` 16.3.4 → 16.4.2) precedes it.

**Manual end-to-end verification (production build via `next start`, real HTTP, browser-driven):** register → sign in → onboarding ("Set up your business"; the timezone field auto-filled) → create a business → redirected to that business's settings → an edit was saved ("Settings saved.") and **persisted across a hard reload** → the team page listed the OWNER with role controls → an invitation was created and its one-time link shown (listed as PENDING with Revoke) → a cross-tenant probe (`/dashboard/<unknown-id>/settings`) returned the single generic "You don't have permission to access this business." (no existence leak) → a wrong-email acceptance attempt returned the single generic invalid message → the invitee registered and signed in through the `callbackUrl` carried on the invite link, accepted, and landed on the dashboard as STAFF → STAFF saw the team list but **no** settings form and **no** invitation section (`/settings` offered no editing; "Only owners can change business settings.") → demoting the last OWNER was rejected ("A business must always have at least one owner.") → promoting STAFF to OWNER succeeded. All steps behaved as specified. These actions were also driven online against the real PostgreSQL development database.

**Environment findings (not code defects; recorded for deployment):** serving the production build requires `AUTH_TRUST_HOST=true` (or equivalent trusted-host configuration); without it Auth.js v5 rejects requests with `UntrustedHost` and the sign-in callback returns HTTP 500. `AUTH_SECRET` must be a non-empty value — `.env.example` ships `AUTH_SECRET=` empty, which produced Auth.js `MissingSecret`. Neither finding is caused by the Next.js upgrade; both are pre-existing local/configuration gaps.

**Honest scope of this evidence:** these checks establish type checking, linting, build, unit/integration tests against a real PostgreSQL, and manual end-to-end behaviour. They do **not** constitute an independent security audit or milestone acceptance, and they do not decide DEC-004. The Server Action layer itself has no automated test (its authorization delegates to the already-tested service layer and was exercised manually). Manual smoke-test data was created in the development database `order_tracking_dev` (business "Smoke Bakery Co" and two `smoke*@example.com` users) and was not removed. The Next.js upgrade was adopted as a security fix at the owner's explicit instruction, which is why a previously "separately-approved change" dependency update appears here.

## 3C. M2 acceptance fix pack verification (2026-10-18)

M2 (Stages 1–3) was accepted by the owner on 2026-10-18 subject to five remediation items from the milestone audit (PASS WITH FINDINGS; no Critical/High severity finding). All five are implemented and verified:

| Item | Change | Commit |
|---|---|---|
| Dot-segment `callbackUrl` payloads | `safeCallbackUrl` (`src/lib/security/redirect.ts`) now additionally requires the normalized path to be a single leading `/` (not `//` and not `/\`), closing a protocol-relative open-redirect path that the origin check alone did not catch (`/.//evil.com`, `/a/..//evil.com`, and similar). Percent-encoded variants are intentionally left un-decoded | `15f9366` |
| Security headers | `next.config.ts` sets `poweredByHeader: false` plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Referrer-Policy: no-referrer` on `/login` and `/invite/:path*` | `4df7439` |
| Credential-verification timing | `authorize()` now verifies against a fixed Argon2id dummy hash when the email is unknown, so the unknown-email and wrong-password paths cost the same. Comments in `config.ts`/`login.ts` and DEC-001's consequences were corrected: sign-in timing no longer discloses existence, but registration still reports that an email is registered (no email verification, per DEC-001) | `bf78d33` |
| `AUTH_SECRET` validation | `src/instrumentation.ts` calls `assertAuthSecret()` at server start and fails fast when `AUTH_SECRET` is missing or shorter than 32 characters; `.env.example`, `README.md` and `docs/deployment.md` document `AUTH_SECRET` and `AUTH_TRUST_HOST` | `f694582` |
| `toSafeActionMessage` unit test | Pins each known domain-error mapping and the single generic fallback (Prisma-P2002-shaped, deadlock/code-40P01-shaped and unknown errors leak no internal text). Unit tests now run through an alias loader so server modules can be imported | `6b6ad6a` |

Verification evidence for these commits (2026-10-18, local): `npx tsc --noEmit` exit 0; `npm test` **41/41**; `npm run lint` exit 0; `npm run build` exit 0 (Next.js 16.4.2, Turbopack); `curl -I` against `next start` confirmed the headers above on `/`, `Referrer-Policy: no-referrer` on `/login` and `/invite/*`, and the absence of `X-Powered-By`.

## 3D. M3 (Customers) verification (2026-10-18)

**MILESTONE 3 IMPLEMENTATION — local development environment:**

| Check | Command | Result |
|---|---|---|
| Prisma client generation | `npx prisma generate` | **PASS** (v7.10.0) |
| Schema validation | `npx prisma validate` | **PASS** — "The schema at prisma\schema.prisma is valid" |
| Migration state (development DB) | `npx prisma migrate status` | **PASS** — "3 migrations found ... Database schema is up to date!" |
| Migrations applied to the dedicated test DB | `npm run test:db:setup` | **PASS** — applied `20261018055702_add_customer`; "All migrations have been successfully applied." |
| Type checking | `npx tsc --noEmit` | **PASS** — exit 0 |
| Unit tests | `npm test` | **PASS — 51/51** (was 41; +10 customer-validation tests) |
| Integration tests | `npm run test:integration` | **PASS — 37/37** (was 28; +9 customer-service tests) |
| Linting | `npm run lint` | **PASS** — exit 0 (no errors or warnings) |
| Production build | `npm run build` (Next.js 16.4.2, Turbopack) | **PASS** — exit 0; routes now also include `/dashboard/[businessId]/customers`, `/dashboard/[businessId]/customers/[customerId]`, `/dashboard/[businessId]/customers/new` |

**Last verified commit for this evidence: `4b58e37`** (the M3 test commit; the implementation commits are `5177ae3`, `d175bdb`, and this documentation update is a subsequent commit).

**What the integration suite actually asserts (M3):** an OWNER can create/read/list/update/soft-delete; STAFF can view/create/update but deletion throws `BusinessAuthorizationError` and leaves the row untouched; a browser-supplied `businessId` cannot switch tenant context (all five entry points throw `BusinessNotFoundError` for a non-member and the other tenant's row is unmodified); a customer id from another tenant cannot be used with this businessId (`getCustomer` → null, update/delete → `CustomerNotFoundError`, and an own id through the other business → `BusinessNotFoundError`); a removed member is denied and the row is unchanged; a soft-deleted customer disappears from list/view/search while the row is preserved with `deletedAt` set, and re-updating it throws `CustomerNotFoundError`; search matches name case-insensitively and phone substrings, scoped to the tenant; pagination returns 20 per page with correct totals and no overlap; and a deterministic OWNER-row-lock test shows `softDeleteCustomer` does not settle while the lock is held and is rejected after the acting OWNER is concurrently demoted.

**Honest scope of this evidence:** these checks establish type checking, linting, building, migration application and the automated suites against a real PostgreSQL. They do **not** constitute an independent security audit or milestone acceptance, and they do not decide DEC-004. The M3 Server Actions and UI have **no direct automated test** (their authorization delegates to the tested service layer), and **no manual browser end-to-end pass of the customer UI was performed in this milestone** — unlike M2 Stage 3.

**Interpretations recorded (derived from the source, not invented silently):**

- **Customer deletion is OWNER-only.** MASTER_SPEC §4 grants STAFF "view/create/update customers" and does not list deletion, so deletion requires OWNER. The `STAFF` capability list was treated as exhaustive for that role.
- **Search matches name (case-insensitive contains) or phone (contains).** MASTER_SPEC §19 shows a single search box without naming fields; `docs/database.md` §4 lists `Customer.businessId` and `Customer.phone` as the customer access paths. A contains search cannot use a b-tree index, so it is deliberately unindexed at MVP scale.
- **The `Orders` count, `Last Order` column and customer order history are not implemented.** MASTER_SPEC §19 and `docs/ui-ux.md` §8 describe them, but they require the `Order` model (Milestone 5). They are omitted rather than rendered as zeros. **Open item for M5.**
- **No uniqueness constraint on customer name or phone.** The approved `Customer` field list defines none and the source does not require deduplication; duplicates are permitted.
- **No customer hard-deletion path exists.** Deletion is soft (`deletedAt`) per `docs/database.md` DB-003 and MASTER_SPEC §7, and the UI copy avoids implying irreversible erasure (`docs/ui-ux.md` §225).

## 3E. M3 acceptance-audit remediation verification (2026-10-18)

**Context:** a read-only M3 acceptance audit was performed at `e2061b0` (nothing modified during the audit; working tree verified clean before and after). Severity roll-up: **0 Critical, 0 High, 2 Medium (F1, F2), 2 Low (F3, F4), 1 Info (F5)**. The owner approved remediating F1–F3 only; F4 is deferred for an explicit owner decision; F5 (M2 fix-pack recheck) required no change.

**Remediation commits (one finding per commit, in the recorded order):**

| Commit | Finding | Change |
|---|---|---|
| `112d0ac` | F2 (Medium) — unbounded `page` reached Prisma | `customerListQuerySchema` caps the page at `CUSTOMER_PAGE_MAX = 10_000`; `normalizePage` clamps to `[1, CUSTOMER_PAGE_MAX]` as defense in depth. Regression tests: unit (`"10000"` accepted, `"10001"`/`"1e6"`/`"1e21"`/`"2147483648"`/`"9007199254740991"` rejected) and integration (`page: 1e21` and `CUSTOMER_PAGE_MAX + 1` both resolve to page 1 instead of throwing; `page: CUSTOMER_PAGE_MAX` returns the real total with zero rows). 10,000 pages × 20 = 200,000 customers per tenant — far beyond MVP scale — while keeping `skip` well inside the range Prisma/PostgreSQL accept; the existing pagination contract (page size, `createdAt`+`id` order, `total`, `totalPages`) is unchanged |
| `07514bc` | F1 (Medium) — `%`/`_` acted as LIKE wildcards in search | New `escapeLikePattern` in `src/lib/db/like.ts` escapes `\`, `%`, `_` before Prisma `contains` (PostgreSQL LIKE/ILIKE default escape character is the backslash; no raw SQL, standard Prisma query API). Unit tests pin the escaping; a PostgreSQL integration test proves literal `%`/`_`/`\` matching, unchanged ordinary-text and case-insensitive (`mode: "insensitive"`) search, and unchanged tenant scoping |
| `e0b234f` | F3 (Low) — invalid `page` discarded a valid `q`; past-the-end page looked empty | The customer list page parses `q`/`page` independently via `parseCustomerListQuery` (unit-tested), shows each parameter's validation notice (`role="alert"`), renders an explicit "Page N is past the end of this list" state with a link back to page 1 when matching customers exist, and suppresses the false "Page X of Y" footer there; the genuine no-customers and no-match states are unchanged |

**Reproduction evidence (dedicated `_test` database, seeded phones `A%b`, `A_b`, `Axb`, `plain`):**

| Query | Before F1 (at `112d0ac`) | After F1 (at `07514bc`) |
|---|---|---|
| `%` | all 4 rows | only `A%b` |
| `_` | all 4 rows | only `A_b` |
| `A%b` | 3 rows (`Axb`, `A_b`, `A%b`) | only `A%b` |
| `A_b` | 3 rows | only `A_b` |
| `Axb` (ordinary) | 1 row (correct) | 1 row (unchanged) |

**Verification at `e0b234f` (local development environment):**

| Check | Command | Result |
|---|---|---|
| Type checking | `npx tsc --noEmit` | **PASS** — exit 0 |
| Linting | `npm run lint` | **PASS** — exit 0 |
| Unit tests | `npm test` | **PASS — 56/56** (+2 F2 tests, +3 F1 escaping tests) |
| Integration tests | `npm run test:integration` (dedicated `_test` DB) | **PASS — 39/39** (+1 F2, +1 F1 test) |
| Production build | `npm run build` | **PASS** — exit 0 |
| Migration state | `npx prisma migrate status` | **PASS** — 3 migrations, "Database schema is up to date!" |

**Changes NOT made:** audit finding F4 is untouched (`src/instrumentation.ts` `assertAuthSecret()` still logs and does not terminate the process) pending the owner's decision — `process.exit(1)` after the fail-fast log vs documenting that the host must health-check a real HTTP 200 (`GET /login` currently returns 500 in that state). No dependency was added and `MASTER_SPEC.md` was not modified; DEC-004 remains open.

**Honest scope of this evidence:** the F1 and F2 remediations are verified against real PostgreSQL (reproduction before the fix, corrected behaviour after). The F3 *render states* (out-of-range page, validation notices, empty states) are verified by code review plus the committed `parseCustomerListQuery` unit tests — there is **no automated render test and no manual browser pass of the remediated UI**. The remediation does not change authorization, tenant scoping, or soft-deletion behaviour, and the earlier §3D evidence still stands for the rest of M3.

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
| DEC-011 | Invite-by-link invitation model | ACCEPTED | Business-invitation implementation (implemented in M2 Stage 2) |
| DEC-012 | Invitation token hashing strategy (SHA-256 for high-entropy tokens; Argon2id for low-entropy secrets such as passwords) | ACCEPTED | How high-entropy bearer tokens are stored at rest (implemented in M2 Stage 2) |

`DEC-010` is intentionally reserved and unused: DEC-001 refers forward to a future `DEC-010` transactional email provider. Do not reuse the number.

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

The supplied pre-existing `CURRENT_STATE.md` contained both `Current Milestone: PRE-IMPLEMENTATION` and `Current Milestone: Milestone 3 — Customers`, while its implementation section stated the repository and application were not initialized. Because implementation evidence was absent at the time, that generated state recorded the evidenced state as **PRE-IMPLEMENTATION** and did not represent Milestone 3 as completed or active. (Superseded — see §2 and §3A for the current evidenced state.)

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

### 10A. Known pre-production items (accepted, not built)

These are explicitly **not implemented**. They are recorded here so no later reader mistakes their absence for an oversight, and they must be addressed before a production release that is claimed to be secure:

| Item | Why it is not done now |
|---|---|
| Rate limiting / account lockout for sign-in | Belongs with deployment hardening; requires a store appropriate to the chosen hosting (DEC-002 OPEN) |
| Rate limiting for invitation acceptance | Same; the token is 256-bit and email-bound, so guessing is infeasible, but abuse controls are still a release gate |
| Full `script-src` Content-Security-Policy | Requires nonce/hash plumbing for Next.js inline bootstrap scripts; the currently shipped policy is `frame-ancestors 'none'` only |
| HSTS | Must be set by the TLS-terminating host/proxy, not by the application (a header sent from a non-HTTPS environment would be wrong) |
| Email verification | Not part of DEC-001 as accepted; registration therefore reveals whether an email is already registered |
| `AUTH_SECRET` fail-fast does not terminate the process (M3 audit F4) | `assertAuthSecret()` logs a clear error at startup, but `next start` keeps running and authenticated routes return 500. Remediation is an owner decision — `process.exit(1)` after the log vs documented host health-check requirement |

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

M1 is ACCEPTED (§2, §3). Milestone 2 (Stages 1–3) is **ACCEPTED (2026-10-18)** subject to the fix pack, which is implemented and verified (§3C). Milestone 3 (Customers) is **implemented and verified and NOT yet accepted** (§2, §3D) — acceptance is the owner's decision.

1. **Await the owner's re-review / acceptance of the M3 audit remediation.** The read-only M3 audit (at `e2061b0`) returned 0 Critical / 0 High; F1 (LIKE wildcards in search), F2 (unbounded list page) and F3 (independent `q`/`page` parsing + truthful out-of-range page state) are remediated and verified in `112d0ac`, `07514bc` and `e0b234f` respectively (§3E). **F4 is deferred for an explicit owner decision** (§10A). This file does not mark Milestone 3 accepted.
2. **Do not begin Milestone 4 (Products)** until M3 is accepted.
3. **Not done for M3:** no manual browser end-to-end pass of the **remediated** customer UI (the F3 render states are covered by code review and `parseCustomerListQuery` unit tests only — see §3E); the automated suites, the migration check and the production build are the evidence for this milestone. No customer hard-deletion path and no customer deduplication exist (both deliberate — see §3D). Search still does not cover email; no uniqueness constraint on name/phone.
4. **Not built, recorded as pre-production items (§10A):** rate limiting / lockout for sign-in and invitation acceptance, a full `script-src` Content-Security-Policy, HSTS at the host/proxy, and email verification.
5. **Milestone 5 must add:** the customer `Orders` count, `Last Order` column and customer order-history view that M3 deliberately omitted because they need the `Order` model.
6. Resolve AMB-001 before authoritative financial-calculation implementation (Milestone 5) and AMB-002 before the status workflow milestone is marked complete (Milestone 6).
7. Deferred, out of M2 scope and not implemented: business deletion; per-session revocation (global `sessionVersion` invalidation remains the accepted mechanism, per DEC-001).
8. DEC-002, DEC-003, DEC-004, DEC-005, DEC-006 and DEC-007 remain OPEN — including the test framework (the tests use `node:test` without deciding DEC-004). None block awaiting the M3 audit.

## 13. Reality rule for AI agents

Do not use this file to infer that a planned feature exists, and do not treat "implemented" (§2) as equivalent to "verified" or "complete" — this checkpoint explicitly distinguishes the two per §3. Read the source code, schema, migrations, configuration, and verification evidence before changing any implementation-state claim.
