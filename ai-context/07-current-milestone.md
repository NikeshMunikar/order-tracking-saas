# Current Milestone

Project phase: MILESTONE 1 ACCEPTED. MILESTONE 2 (Stages 1–3) **ACCEPTED 2026-10-18** subject to a five-item security fix pack, which is IMPLEMENTED and VERIFIED. MILESTONE 3 (Customers) IMPLEMENTED and VERIFIED 2026-10-18, then AUDITED 2026-10-18 (read-only audit at `e2061b0`; findings F1–F5, 0 Critical / 0 High), with F1 (LIKE wildcards in search), F2 (unbounded list page) and F3 (query parsing / out-of-range page states) **REMEDIATED and VERIFIED 2026-10-18** — **not yet accepted**; audit F4 (AUTH_SECRET fail-fast logs but does not stop the process) is DEFERRED for an owner decision. Milestone 4 (Products) not started.

## What exists

- **M1 (accepted):** Next.js App Router + TypeScript + Tailwind foundation, Auth.js v5 Credentials + JWT sessions, `sessionVersion` global invalidation, Argon2id hashing, protected dashboard shell, `User` model. DEC-001 ACCEPTED (amended).
- **M2 Stage 1 (verified):** `Business`, `BusinessMember`, `BusinessInvitation` models + enum `BusinessMemberRole { OWNER, STAFF }` and a committed migration (`20260907120000_add_business_membership`) including a hand-written partial unique index `business_invitations_active_email_key` on `(businessId, email) WHERE "revokedAt" IS NULL AND "acceptedAt" IS NULL`.
- **M2 Stage 2 (verified):** server-side business authorization and domain services in `src/server/business/**` — `createBusiness`, `updateBusinessSettings`, `updateMemberRole`, `removeMember`, `getBusinessForUser`, `listBusinessMembers`, `listBusinessesForUser`, `inviteMember`, `revokeInvitation`, `listInvitations`, `acceptInvitation`.
- **M2 Stage 3 (verified 2026-10-18):** the business UI and Server Actions wrapping those services — `createBusinessAction`, `updateBusinessSettingsAction`, `updateMemberRoleAction`, `removeMemberAction`, `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`; safe error mapping in `action-errors.ts`; routes `/dashboard`, `/dashboard/[businessId]` (redirects OWNER → settings, STAFF → team), `/dashboard/[businessId]/settings`, `/dashboard/[businessId]/team`, `/invite/[token]`; `[businessId]` layout authorization via `getAuthorizedBusiness` (React `cache`) rendering one generic "No access" page; `safeCallbackUrl` guards the post-login destination.
- **M2 acceptance fix pack (verified 2026-10-18):** `15f9366` dot-segment `callbackUrl` guard; `4df7439` baseline security headers + `poweredByHeader: false`; `bf78d33` equalized credential-verification timing against `DUMMY_PASSWORD_HASH` and corrected account-existence claims (DEC-001 note added); `f694582` fail-fast `assertAuthSecret()` at startup via `src/instrumentation.ts` plus `AUTH_SECRET`/`AUTH_TRUST_HOST` documentation; `6b6ad6a` `toSafeActionMessage` unit test + unit tests running through an alias loader.
- **M3 (verified 2026-10-18):** Customer management.
  - Schema/migration: `Customer` model (tenant key `businessId`, `name`, `phone`, optional `email`/`address`/`notes`, timestamps, nullable `deletedAt`) and CLI-generated migration `20261018055702_add_customer` with an FK to `businesses` and indexes on `(businessId, createdAt)` and `(businessId, phone)`.
  - Services `src/server/customer/**`: `listCustomers` (search + pagination, selective projection), `getCustomer`, `createCustomer`, `updateCustomer`, `softDeleteCustomer` (OWNER-only; `lockBusinessOwnerRows(tx)` then `requireOwner(tx)` then a scoped `updateMany`, mirroring the M2 OWNER-only pattern).
  - Validation `src/lib/validation/customer.ts` (`createCustomerSchema`, `updateCustomerSchema`, `customerListQuerySchema` + independent `customerSearchFieldSchema`/`customerPageFieldSchema`, `CUSTOMER_SEARCH_MAX_LENGTH`, `CUSTOMER_PAGE_MAX = 10_000`, `parseCustomerListQuery`).
  - Server Actions `src/server/customer/actions.ts`: `createCustomerAction`, `updateCustomerAction`, `deleteCustomerAction` — `requireSession()`, browser ids treated as navigation data only, structured results, `toSafeActionMessage` mapping (including `CustomerNotFoundError`).
  - UI `/dashboard/[businessId]/customers` (search/pagination table), `/customers/new`, `/customers/[customerId]` (edit form; OWNER-only soft delete), plus a "Customers" nav link for OWNER and STAFF.
- **M3 acceptance-audit remediation (verified 2026-10-18):**
  - `112d0ac` (F2): `customerListQuerySchema` caps the page at `CUSTOMER_PAGE_MAX = 10_000` (10,000 × 20 = 200,000 customers, far beyond MVP scale, `skip` stays well inside Prisma/PostgreSQL range; `Number.isInteger(1e21)` is true so `.int()` alone was never a bound) and `normalizePage` clamps to `[1, CUSTOMER_PAGE_MAX]` as defense in depth; regression tests cover `1e6`/`1e21`/`2147483648`/`9007199254740991` and a direct service call no longer throws.
  - `07514bc` (F1): `escapeLikePattern` in `src/lib/db/like.ts` escapes `\`, `%`, `_` before Prisma `contains` (PostgreSQL LIKE/ILIKE default escape character is the backslash; no raw SQL). Verified against the `_test` DB: pre-fix, `%`/`_` matched all seeded rows and `A%b` returned 3 of 4; post-fix each query returns only its literal row, and ordinary text, case-insensitive name search and tenant scoping are unchanged.
  - `e0b234f` (F3): the customer list page parses `q`/`page` independently via `parseCustomerListQuery`, so a malformed `page` falls back to page 1 with a `role="alert"` notice without discarding the search term; `page > totalPages` with matching customers renders an explicit out-of-range state with a link back to page 1 and the false "Page X of Y" footer is suppressed there; the genuine no-customers / no-match states are unchanged.
- **Invitations:** invite-by-link (DEC-011 ACCEPTED) with 256-bit tokens, SHA-256 at rest (DEC-012 ACCEPTED), 7-day expiry, OWNER-only invite/revoke. `DEC-010` is reserved (future transactional email provider referenced by DEC-001).
- **Tests:** `node:test`. Unit `tests/unit/**` (**56**, `npm test`); DB-backed `tests/integration/**` (**39**, `npm run test:integration`) against a dedicated `_test` database (`npm run test:db:setup`). **DEC-004 remains OPEN** — using `node:test` does not decide it.
- **Not built, recorded as pre-production items:** rate limiting / lockout for sign-in and invitation acceptance; a full `script-src` CSP; HSTS at the host/proxy; email verification. See `CURRENT_STATE.md` §10A.

## Last verified commit

`e0b234f` — M3 acceptance-audit remediation F3 (independent `q`/`page` parsing + truthful out-of-range page state), on top of `07514bc` (F1, literal LIKE search) and `112d0ac` (F2, bounded page). Full verification (2026-10-18, local): `npx tsc --noEmit` (exit 0) ✓, `npm run lint` (exit 0) ✓, `npm test` (**56/56**) ✓, `npm run test:integration` (**39/39**, dedicated `_test` DB) ✓, `npm run build` (exit 0) ✓, `npx prisma migrate status` (3 migrations, "Database schema is up to date!") ✓. Between F1 and F2 the audit absence was reproduced live against the `_test` DB (search `%`/`_` returned every seeded row; `A%b` returned 3 of 4) and the corrected behaviour (`%` → only "A%b", `_` → only "A_b", `A%b`/`A_b` → only their literal row) was demonstrated with a seeded script. See `CURRENT_STATE.md` §3D/§3E. Preceded by the audit base `e2061b0`, M3 `4b58e37`/`d175bdb`/`5177ae3`, M2 Stage 3 `0437275`/`c3a76fe`, and the M2 fix pack `6b6ad6a`..`15f9366`.

Honest caveats: the F3 *render* states (out-of-range page, error notices, empty states) are verified by code review plus the committed `parseCustomerListQuery` unit tests — there is no automated render test and no manual browser pass was made of the remediated UI; the M3 Server Actions and UI still have no direct automated test; F4 remains deferred (see below); M2 manual smoke data ("Smoke Bakery Co", `smoke*@example.com`) remains in the development database `order_tracking_dev`.

## Exact next task

Await the **owner's** re-review / acceptance of the M3 audit remediation (F1, F2, F3 fixed and verified; F4 deferred pending an owner decision — `process.exit(1)` after the fail-fast log vs documenting a host health check). **Do not start Milestone 4 (Products) unasked, and do not mark anything accepted yourself.**

## Not done / deferred (M3)

- Customer `Orders` count, `Last Order` column and customer order-history view — they require the `Order` model (Milestone 5). Deliberately omitted rather than rendered as zeros.
- Audit finding **F4**: `assertAuthSecret()` logs a clear error but the process stays alive on `next start` — remediation is a decision (`process.exit(1)` vs a documented host health check), deferred for the owner.
- No automated render test of the customer list page states; no manual browser pass of the remediated UI.
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
