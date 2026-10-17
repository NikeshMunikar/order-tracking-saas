# Current Milestone

Project phase: MILESTONE 1 ACCEPTED. MILESTONE 2 STAGE 1 (schema) and STAGE 2 (domain/authorization services) IMPLEMENTED and VERIFIED — **not yet accepted** (awaiting an independent security/governance re-audit). Milestone 3 not started.

## What exists

- **M1 (accepted):** Next.js App Router + TypeScript + Tailwind foundation, Auth.js v5 Credentials + JWT sessions, `sessionVersion` global invalidation, Argon2id hashing, protected dashboard shell, `User` model. DEC-001 ACCEPTED (amended).
- **M2 Stage 1 (verified):** `Business`, `BusinessMember`, `BusinessInvitation` models + enum `BusinessMemberRole { OWNER, STAFF }` and a committed migration (`20260907120000_add_business_membership`) including a hand-written partial unique index `business_invitations_active_email_key` on `(businessId, email) WHERE "revokedAt" IS NULL AND "acceptedAt" IS NULL`.
- **M2 Stage 2 (verified):** server-side business authorization and domain services in `src/server/business/**` — `createBusiness`, `updateBusinessSettings`, `updateMemberRole`, `removeMember`, `getBusinessForUser`, `listBusinessMembers`, `listBusinessesForUser`, `inviteMember`, `revokeInvitation`, `listInvitations`, `acceptInvitation`. No M2 UI or routes exist yet.
- **Invitations:** invite-by-link (DEC-011 ACCEPTED) with 256-bit tokens, SHA-256 at rest (DEC-012 ACCEPTED), 7-day expiry, OWNER-only invite/revoke. `DEC-010` is reserved (future transactional email provider referenced by DEC-001).
- **Tests:** `node:test`. Unit `tests/unit/**` (22, `npm test`); DB-backed `tests/integration/**` (27, `npm run test:integration`) with a dedicated `_test` database (`npm run test:db:setup`). **DEC-004 remains OPEN** — using `node:test` does not decide it.

## Last verified commit

`ad41f1a` — the test-suite commit. Verification (2026-10-17, local): `prisma generate`, `prisma validate`, `migrate deploy` to `order_tracking_dev_test`, `tsc --noEmit` (exit 0), `npm test` (22/22), `npm run test:integration` (27/27), `npm run lint` (exit 0), `npm run build` (exit 0). See `CURRENT_STATE.md` §3A.

## Exact next task

Await the independent re-audit of M2 Stage 2. If it passes, mark Stage 2 accepted in `CURRENT_STATE.md` and proceed to the next approved M2 scope item. **Do not start Milestone 3.**

## Not done / deferred

- M2 UI and routes (services only, so far).
- Business deletion; per-session revocation (global `sessionVersion` invalidation is the accepted mechanism).
- Migrations for this milestone were hand-authored and verified by applying them to a fresh database; they were not generated via `prisma migrate dev` in this environment.

## Open decisions (do NOT resolve silently)

DEC-002 (hosting), DEC-003 (production PostgreSQL), DEC-004 (test framework), DEC-005 (monitoring), DEC-006 (money storage), DEC-007 (order numbering). ACCEPTED: DEC-001, DEC-008, DEC-009, DEC-011, DEC-012. Ambiguities AMB-001 (order-calculation wording) and AMB-002 (cancellation matrix) remain OPEN.

Do not infer implementation from architecture documentation.
