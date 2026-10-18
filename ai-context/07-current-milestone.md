# Current Milestone

Project phase: MILESTONE 1 ACCEPTED. MILESTONE 2 STAGE 1 (schema), STAGE 2 (domain/authorization services), and STAGE 3 (business UI + Server Actions) are IMPLEMENTED and VERIFIED. Stage 2 was re-audited 2026-10-17 (**PASS WITH MINOR FINDINGS** at `ed3cf59`; findings remediated). Stage 3 has **not** been independently audited. Milestone 2 as a whole is **not yet accepted** — that is the owner's decision. Milestone 3 not started.

## What exists

- **M1 (accepted):** Next.js App Router + TypeScript + Tailwind foundation, Auth.js v5 Credentials + JWT sessions, `sessionVersion` global invalidation, Argon2id hashing, protected dashboard shell, `User` model. DEC-001 ACCEPTED (amended).
- **M2 Stage 1 (verified):** `Business`, `BusinessMember`, `BusinessInvitation` models + enum `BusinessMemberRole { OWNER, STAFF }` and a committed migration (`20260907120000_add_business_membership`) including a hand-written partial unique index `business_invitations_active_email_key` on `(businessId, email) WHERE "revokedAt" IS NULL AND "acceptedAt" IS NULL`.
- **M2 Stage 2 (verified):** server-side business authorization and domain services in `src/server/business/**` — `createBusiness`, `updateBusinessSettings`, `updateMemberRole`, `removeMember`, `getBusinessForUser`, `listBusinessMembers`, `listBusinessesForUser`, `inviteMember`, `revokeInvitation`, `listInvitations`, `acceptInvitation`.
- **M2 Stage 3 (verified 2026-10-18):** the business UI and Server Actions wrapping those services.
  - Server Actions (`src/server/business/actions.ts`): `createBusinessAction`, `updateBusinessSettingsAction`, `updateMemberRoleAction`, `removeMemberAction`, `inviteMemberAction`, `revokeInvitationAction`, `acceptInvitationAction`. Each begins with `requireSession()`; `businessId` / `memberId` / `invitationId` / `role` / invite token arriving from the browser are treated as untrusted navigation data only; actions return structured results (no `redirect()` inside actions).
  - Safe error mapping (`src/server/business/action-errors.ts`): known domain errors → specific safe copy; anything else (Prisma errors, Postgres deadlock/serialization errors, programming errors) → one generic message, logged server-side.
  - Routes: `/dashboard` (business onboarding + business list), `/dashboard/[businessId]` (redirects to settings for OWNER, team for STAFF), `/dashboard/[businessId]/settings` (OWNER-only form), `/dashboard/[businessId]/team` (members for any member; invitations OWNER-only), `/invite/[token]` (accept-by-link).
  - Invite flow: the raw token is shown **once** as `${origin}/invite/<token>`; the accept page requires a session and sends unauthenticated visitors to `/login?callbackUrl=...`. `callbackUrl` is validated by `safeCallbackUrl` (`src/lib/security/redirect.ts`, same-origin absolute paths only) so sign-in/registration cannot become an open redirect. Acceptance reads the accepting user's email from a fresh database read.
  - The `[businessId]` layout performs server-side authorization for the whole subtree via `getAuthorizedBusiness` (React `cache`); an unknown or unauthorized id renders one generic "No access" page (no existence leak).
- **Invitations:** invite-by-link (DEC-011 ACCEPTED) with 256-bit tokens, SHA-256 at rest (DEC-012 ACCEPTED), 7-day expiry, OWNER-only invite/revoke. `DEC-010` is reserved (future transactional email provider referenced by DEC-001).
- **Tests:** `node:test`. Unit `tests/unit/**` (**31**, `npm test`); DB-backed `tests/integration/**` (**28**, `npm run test:integration`) with a dedicated `_test` database (`npm run test:db:setup`). **DEC-004 remains OPEN** — using `node:test` does not decide it.

## Last verified commit

`0437275` — M2 Stage 3 (business UI + Server Actions). Verification (2026-10-18, local): `prisma generate` ✓, `prisma validate` ✓, `npm run test:db:setup` (2 migrations, no pending) ✓, `tsc --noEmit` (exit 0) ✓, `npm test` (31/31) ✓, `npm run test:integration` (28/28) ✓, `npm run lint` (exit 0) ✓, `npm run build` (exit 0) ✓, plus a manual browser end-to-end pass of the whole M2 flow against a production build over real HTTP. See `CURRENT_STATE.md` §3B. Preceded by `e587611` (`next` 16.3.4 → 16.4.2, fixing the critical `next/og` RCE advisory GHSA-vcvr-r3jv-pc5j; `npm audit` 14 → 12 advisories, 0 critical).

Honest caveats: the Server Action layer has **no automated test** (its authorization delegates to the audited service layer; it was verified manually), and the manual smoke test left data in the development database.

## Exact next task

Await the **owner's** M2 acceptance decision (Stages 1–3). Stage 2 was independently re-audited (PASS WITH MINOR FINDINGS, remediated); Stage 3 has **not** been independently audited. **Do not start Milestone 3 unasked, and do not mark anything accepted yourself.**

## Not done / deferred

- No automated test covers the Stage 3 Server Action layer (verified manually).
- Business deletion; per-session revocation (global `sessionVersion` invalidation is the accepted mechanism).
- Migrations for this milestone were hand-authored and verified by applying them to a fresh database; they were not generated via `prisma migrate dev` in this environment.
- Manual smoke-test data remains in the development database `order_tracking_dev` ("Smoke Bakery Co" and two `smoke*@example.com` users).

## Stage 3 carry-forward items (from the Stage 2 re-audit) — status

- **(a) Error mapping at the Server Action boundary — DONE.** `action-errors.ts` maps known domain errors to specific safe copy and everything else (including Postgres deadlock/serialization errors) to one generic message that is logged server-side.
- **(b) Fresh email source on acceptance — DONE.** `acceptInvitationAction` reads the email from the database by the session's user id.
- **(c) `BusinessMemberAlreadyExistsError` mapping — DONE.** Deliberately mapped to "That person is already a member of this business." (reachable only with a valid token *and* a matching email).
- **(d) An invitation cannot change an existing member's role — behaviour confirmed; product question still OPEN.** Accepting an invitation for an email that is already a member errors through the P2002 path (now surfaced as the mapped membership message). Whether re-inviting an existing member should instead be a no-op or a role change remains an **open product question** — not decided here.

## Open decisions (do NOT resolve silently)

DEC-002 (hosting), DEC-003 (production PostgreSQL), DEC-004 (test framework), DEC-005 (monitoring), DEC-006 (money storage), DEC-007 (order numbering). ACCEPTED: DEC-001, DEC-008, DEC-009, DEC-011, DEC-012. Ambiguities AMB-001 (order-calculation wording) and AMB-002 (cancellation matrix) remain OPEN.

Do not infer implementation from architecture documentation.
