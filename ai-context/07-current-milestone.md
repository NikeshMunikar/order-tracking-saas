# Current Milestone

Project phase: MILESTONE 1 ACCEPTED. MILESTONE 2 (Stages 1–3) **ACCEPTED 2026-10-18** subject to a five-item security fix pack, which is IMPLEMENTED and VERIFIED. MILESTONE 3 (Customers) IMPLEMENTED and VERIFIED on 2026-10-18 — **not yet accepted, and not independently audited**. Milestone 4 (Products) not started.

## What exists

- **M1 (accepted):** Next.js App Router + TypeScript + Tailwind foundation, Auth.js v5 Credentials + JWT sessions, `sessionVersion` global invalidation, Argon2id hashing, protected dashboard shell, `User` model. DEC-001 ACCEPTED (amended).
- **M2 Stage 1 (verified):** `Business`, `BusinessMember`, `BusinessInvitation` models + enum `BusinessMemberRole { OWNER, STAFF }` and a committed migration (`20260907120000_add_business_membership`) including a hand-written partial unique index `business_invitations_active_email_key` on `(businessId, email) WHERE "revokedAt" IS NULL AND "acceptedAt" IS NULL`.
- **M2 Stage 2 (verified):** server-side business authorization and domain services in `src/server/business/**` — `createBusiness`, `updateBusinessSettings`, `updateMemberRole`, `removeMember`, `getBusinessForUser`, `listBusinessMembers`, `listBusinessesForUser`, `inviteMember`, `revokeInvitation`, `listInvitations`, `acceptInvitation`.
- **M2 Stage 3 (verified 2026-10-18):** the business UI and Server Actions wrapping those services — `createBusinessAction`, `updateBusinessSettingsAction`, `updateMemberRoleAction`, `removeMemberAction`, `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`; safe error mapping in `action-errors.ts`; routes `/dashboard`, `/dashboard/[businessId]` (redirects OWNER → settings, STAFF → team), `/dashboard/[businessId]/settings`, `/dashboard/[businessId]/team`, `/invite/[token]`; `[businessId]` layout authorization via `getAuthorizedBusiness` (React `cache`) rendering one generic "No access" page; `safeCallbackUrl` guards the post-login destination.
- **M2 acceptance fix pack (verified 2026-10-18):** `15f9366` dot-segment `callbackUrl` guard; `4df7439` baseline security headers + `poweredByHeader: false`; `bf78d33` equalized credential-verification timing against `DUMMY_PASSWORD_HASH` and corrected account-existence claims (DEC-001 note added); `f694582` fail-fast `assertAuthSecret()` at startup via `src/instrumentation.ts` plus `AUTH_SECRET`/`AUTH_TRUST_HOST` documentation; `6b6ad6a` `toSafeActionMessage` unit test + unit tests running through an alias loader.
- **M3 (verified 2026-10-18):** Customer management.
  - Schema/migration: `Customer` model (tenant key `businessId`, `name`, `phone`, optional `email`/`address`/`notes`, timestamps, nullable `deletedAt`) and CLI-generated migration `20261018055702_add_customer` with an FK to `businesses` and indexes on `(businessId, createdAt)` and `(businessId, phone)`.
  - Services `src/server/customer/**`: `listCustomers` (search + pagination, selective projection), `getCustomer`, `createCustomer`, `updateCustomer`, `softDeleteCustomer` (OWNER-only; `lockBusinessOwnerRows(tx)` then `requireOwner(tx)` then a scoped `updateMany`, mirroring the M2 OWNER-only pattern).
  - Validation `src/lib/validation/customer.ts` (`createCustomerSchema`, `updateCustomerSchema`, `customerListQuerySchema`, `CUSTOMER_SEARCH_MAX_LENGTH`).
  - Server Actions `src/server/customer/actions.ts`: `createCustomerAction`, `updateCustomerAction`, `deleteCustomerAction` — `requireSession()`, browser ids treated as navigation data only, structured results, `toSafeActionMessage` mapping (including `CustomerNotFoundError`).
  - UI `/dashboard/[businessId]/customers` (search/pagination table), `/customers/new`, `/customers/[customerId]` (edit form; OWNER-only soft delete), plus a "Customers" nav link for OWNER and STAFF.
- **Invitations:** invite-by-link (DEC-011 ACCEPTED) with 256-bit tokens, SHA-256 at rest (DEC-012 ACCEPTED), 7-day expiry, OWNER-only invite/revoke. `DEC-010` is reserved (future transactional email provider referenced by DEC-001).
- **Tests:** `node:test`. Unit `tests/unit/**` (**51**, `npm test`); DB-backed `tests/integration/**` (**37**, `npm run test:integration`) against a dedicated `_test` database (`npm run test:db:setup`). **DEC-004 remains OPEN** — using `node:test` does not decide it.
- **Not built, recorded as pre-production items:** rate limiting / lockout for sign-in and invitation acceptance; a full `script-src` CSP; HSTS at the host/proxy; email verification. See `CURRENT_STATE.md` §10A.

## Last verified commit

`4b58e37` — M3 (Customers) tests (implementation commits `5177ae3`, `d175bdb`; `4b58e37` is the last of the three). Verification (2026-10-18, local): `prisma generate` ✓, `prisma validate` ✓, `prisma migrate status` (dev DB, 3 migrations, "Database schema is up to date!") ✓, `npm run test:db:setup` (applied `20261018055702_add_customer`) ✓, `tsc --noEmit` (exit 0) ✓, `npm test` (51/51) ✓, `npm run test:integration` (37/37) ✓, `npm run lint` (exit 0) ✓, `npm run build` (exit 0, Next.js 16.4.2) ✓. See `CURRENT_STATE.md` §3D. Preceded by the M2 fix pack `6b6ad6a`..`15f9366` (§3C), M2 Stage 3 `0437275`/`c3a76fe` (§3B), and the Next.js security upgrade `e587611` (§3A known issues).

Honest caveats: **no manual browser end-to-end pass of the M3 customer UI was performed**; the M3 Server Actions and UI have no direct automated test (their authorization delegates to the tested service layer); M3 has **not** been independently audited; M2 manual smoke data ("Smoke Bakery Co" and two `smoke*@example.com` users) remains in the development database `order_tracking_dev`.

## Exact next task

Await the **owner's** Milestone 3 (Customers) audit / acceptance decision. **Do not start Milestone 4 (Products) unasked, and do not mark anything accepted yourself.**

## Not done / deferred (M3)

- Customer `Orders` count, `Last Order` column and customer order-history view — they require the `Order` model (Milestone 5). Deliberately omitted rather than rendered as zeros.
- No customer hard-deletion path (deletion is soft, per `docs/database.md` DB-003) and no customer deduplication (the approved field list defines no uniqueness).
- No manual browser verification of the customer UI.
- Business deletion; per-session revocation (global `sessionVersion` invalidation is the accepted mechanism).
- Pre-production items listed above.

## Interpretations recorded for M3 (derived from the source, not invented)

- **Customer deletion is OWNER-only**: MASTER_SPEC §4 grants STAFF "view/create/update customers" and does not list deletion, so the STAFF capability list was treated as exhaustive.
- **Search = name (case-insensitive contains) OR phone (contains)**: MASTER_SPEC §19 shows a single search box without naming fields; `docs/database.md` §4 lists `Customer.businessId` and `Customer.phone` as the customer access paths. A contains search cannot use a b-tree index.

## Open questions (not decided here)

1. Should customer deletion ever be a hard delete? (Currently soft-only, per DB-003.)
2. Should duplicate customers (same phone/name) be prevented or surfaced? (No source requirement.)
3. Should search also cover email? (The source names no fields; only `phone` is indexed.)
4. Should the `Orders` / `Last Order` columns appear (as zeros) before Milestone 5? (Decided: omit.)

## Open decisions (do NOT resolve silently)

DEC-002 (hosting), DEC-003 (production PostgreSQL), DEC-004 (test framework), DEC-005 (monitoring), DEC-006 (money storage), DEC-007 (order numbering). ACCEPTED: DEC-001, DEC-008, DEC-009, DEC-011, DEC-012. Ambiguities AMB-001 (order-calculation wording) and AMB-002 (cancellation matrix) remain OPEN.

Do not infer implementation from architecture documentation.
