# Current Milestone

Project phase: MILESTONE 1 ACCEPTED. MILESTONE 2 STAGE 1 (schema) and STAGE 2 (domain/authorization services) IMPLEMENTED and VERIFIED, and RE-AUDITED 2026-10-17 (**PASS WITH MINOR FINDINGS** at `ed3cf59`; findings remediated) — **not yet accepted** (awaiting the owner's acceptance decision). Milestone 3 not started.

## What exists

- **M1 (accepted):** Next.js App Router + TypeScript + Tailwind foundation, Auth.js v5 Credentials + JWT sessions, `sessionVersion` global invalidation, Argon2id hashing, protected dashboard shell, `User` model. DEC-001 ACCEPTED (amended).
- **M2 Stage 1 (verified):** `Business`, `BusinessMember`, `BusinessInvitation` models + enum `BusinessMemberRole { OWNER, STAFF }` and a committed migration (`20260907120000_add_business_membership`) including a hand-written partial unique index `business_invitations_active_email_key` on `(businessId, email) WHERE "revokedAt" IS NULL AND "acceptedAt" IS NULL`.
- **M2 Stage 2 (verified):** server-side business authorization and domain services in `src/server/business/**` — `createBusiness`, `updateBusinessSettings`, `updateMemberRole`, `removeMember`, `getBusinessForUser`, `listBusinessMembers`, `listBusinessesForUser`, `inviteMember`, `revokeInvitation`, `listInvitations`, `acceptInvitation`. No M2 UI or routes exist yet.
- **Invitations:** invite-by-link (DEC-011 ACCEPTED) with 256-bit tokens, SHA-256 at rest (DEC-012 ACCEPTED), 7-day expiry, OWNER-only invite/revoke. `DEC-010` is reserved (future transactional email provider referenced by DEC-001).
- **Tests:** `node:test`. Unit `tests/unit/**` (22, `npm test`); DB-backed `tests/integration/**` (28, `npm run test:integration`) with a dedicated `_test` database (`npm run test:db:setup`). **DEC-004 remains OPEN** — using `node:test` does not decide it.

## Last verified commit

`b50a5f1` — post-re-audit cleanup (lock-serialization regression test `1ccabe1`; deterministic `ORDER BY id` lock order `b50a5f1`; documentation update as a subsequent commit). Verification (2026-10-18, local): `prisma generate`, `prisma validate`, `migrate deploy` to `order_tracking_dev_test` (already existed, no pending migrations), `tsc --noEmit` (exit 0), `npm test` (22/22), `npm run test:integration` (28/28), `npm run lint` (exit 0), `npm run build` (exit 0). See `CURRENT_STATE.md` §3A.

Honest caveat: the new lock-serialization test discriminates the `updateMemberRole`/`removeMember` lock mainly by its outcome assertion; during the scratch proof it failed 8/8 on the final streak but also passed 2 times out of ~9 earlier runs when the lock was removed, so it is a strong but not infallible detector of lock removal.

## Exact next task

Await the **owner's** M2 Stage 2 acceptance decision — the independent re-audit already returned PASS WITH MINOR FINDINGS and the minor findings are remediated, but acceptance itself is the owner's call and has not been given. Once accepted, proceed to the next approved M2 Stage 3 scope item per the approved design; start M3 planning only if the owner explicitly says so. **Do not start Milestone 3 unasked, and do not mark anything accepted yourself.**

## Not done / deferred

- M2 UI and routes (services only, so far).
- Business deletion; per-session revocation (global `sessionVersion` invalidation is the accepted mechanism).
- Migrations for this milestone were hand-authored and verified by applying them to a fresh database; they were not generated via `prisma migrate dev` in this environment.

## Carry-forward constraints for Stage 3 (audit recommendations — not approved requirements)

These are observations from the re-audit to honour while building M2 Stage 3 (UI/routes). They are not new requirements and no behaviour was changed for them in this cleanup.

- **(a) Error mapping at the Server Action boundary.** Server Actions must map *unknown* errors — including Postgres deadlock/serialization errors — to a single generic, user-safe message. `acceptInvitation` currently rethrows any non-P2002 error unchanged, so an unexpected DB error would surface to the caller; the Action layer must catch and sanitize it.
- **(b) Fresh email source on acceptance.** `acceptInvitation`'s `authenticatedUserEmail` must come from a fresh server-side database read of the authenticated user — never from a stale JWT claim or any browser-supplied value.
- **(c) Deliberate mapping of `BusinessMemberAlreadyExistsError`.** It *is* externally distinguishable from the generic `invalid` outcome, but only reachable with a valid token *and* a matching email. Decide its user-facing message deliberately (e.g. "You are already a member of this business").
- **(d) An invitation cannot change an existing member's role** — accepting an invitation for an email that is already a member errors (the P2002 path). Confirm this is the intended product behaviour before building the invitation UI (e.g. whether re-inviting an existing member should instead be a no-op or a role change).

## Open decisions (do NOT resolve silently)

DEC-002 (hosting), DEC-003 (production PostgreSQL), DEC-004 (test framework), DEC-005 (monitoring), DEC-006 (money storage), DEC-007 (order numbering). ACCEPTED: DEC-001, DEC-008, DEC-009, DEC-011, DEC-012. Ambiguities AMB-001 (order-calculation wording) and AMB-002 (cancellation matrix) remain OPEN.

Do not infer implementation from architecture documentation.
