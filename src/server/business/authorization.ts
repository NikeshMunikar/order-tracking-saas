import "server-only";

import type { BusinessMemberRole } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import type { PrismaClientOrTransaction } from "@/lib/db/types";
import { BusinessAuthorizationError, BusinessNotFoundError } from "@/server/business/errors";

// THE tenant-authorization boundary for M2 (docs/security.md, ai-context/00-rules.md).
//
// Every business-scoped service function must resolve authorization
// through requireMembership()/requireOwner() below — never by trusting a
// browser-supplied businessId, a client-provided role, or stale
// session/JWT claims. JWT claims establish *who is asking*; this module,
// backed by a fresh database read, establishes *what they're currently
// allowed to do* (consistent with DEC-001's reaffirmed authorization
// source-of-truth note in docs/architecture-decisions.md).
//
// Mutation authorization and row locking:
//   - Every function below accepts an optional `client` parameter
//     (defaulting to the top-level `prisma` client) so that a mutation
//     running inside `prisma.$transaction(async (tx) => ...)` can pass
//     `tx` and have the authorization read happen inside the same
//     transaction. Running the check inside the transaction is necessary
//     but NOT sufficient on its own to prevent a check-then-mutate race.
//   - The five OWNER-only mutations in the M2 service layer
//     (updateBusinessSettings, updateMemberRole, removeMember,
//     inviteMember, revokeInvitation) additionally call
//     lockBusinessOwnerRows(tx, businessId) as the first statement of
//     their transaction and only re-read the acting user's role
//     (requireOwner) AFTER that lock is acquired. The lock is what
//     prevents a concurrent demotion/removal of the acting user from
//     letting a now-unauthorized mutation pass a stale "still OWNER"
//     check; a `tx`-scoped read without the lock would not.
//   - acceptInvitation is a different case: the accepting user need not be
//     an OWNER, so it does not use the owner-row lock. It relies on a
//     single conditional UPDATE (claim) inside its transaction instead —
//     see invitation-service.ts.
// Read-only lookups (business settings display, member listing) use the
// default top-level client — the concern is specifically check-then-mutate.

/**
 * Lock every OWNER row for a business within an open transaction, so
 * concurrent OWNER-affecting mutations (settings updates, role changes,
 * removals, invitation creation/revocation) serialize against each other
 * instead of racing. Must be called, and its result awaited, before the
 * acting user's role is read via requireOwner(), and before any
 * owner-count check.
 *
 * Why the whole OWNER set rather than only the acting user's row: all five
 * OWNER-only mutations share this single audited locking pattern instead of
 * each hand-rolling a variant. Since every caller has already been
 * *intended* to be an OWNER, the acting user's own row is necessarily part
 * of the locked set — so their concurrent demotion/removal cannot pass a
 * stale authorization check. (The set is also what protects the last-owner
 * invariant in updateMemberRole()/removeMember().)
 *
 * Postgres re-evaluates a blocked `SELECT ... FOR UPDATE`'s WHERE clause
 * against the latest committed row version once the lock is acquired, so
 * two concurrent transactions targeting owners of the same business
 * correctly serialize rather than both observing a stale count/role.
 *
 * Deterministic ordering: callers always invoke this as the first statement
 * of their transaction, before touching any member or invitation row, so
 * lock-acquisition order is consistent and cannot self-deadlock.
 */
export async function lockBusinessOwnerRows(
  tx: PrismaClientOrTransaction,
  businessId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM business_members
    WHERE "businessId" = ${businessId} AND role = 'OWNER'
    FOR UPDATE
  `;
}

export type AuthorizedMembership = {
  businessId: string;
  userId: string;
  role: BusinessMemberRole;
};

/**
 * Resolve the authenticated user's membership for a specific business, or
 * null if none exists (including when the business itself does not
 * exist). Read-only — does not throw. Prefer requireMembership()/
 * requireOwner() in service code; use this directly only when "no
 * membership" is itself a valid, handled outcome (e.g. the business
 * switcher).
 */
export async function getMembership(
  userId: string,
  businessId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<AuthorizedMembership | null> {
  return client.businessMember.findUnique({
    where: { businessId_userId: { businessId, userId } },
    select: { businessId: true, userId: true, role: true },
  });
}

/**
 * Require that the authenticated user is a member (OWNER or STAFF) of the
 * given business. Throws BusinessNotFoundError otherwise — deliberately
 * not distinguishing "business doesn't exist" from "you're not a member",
 * so a non-member cannot use error responses to probe which businessIds
 * are real.
 *
 * Pass `tx` explicitly when this check gates a mutation running inside a
 * transaction (see the module-level note above).
 */
export async function requireMembership(
  userId: string,
  businessId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<AuthorizedMembership> {
  const membership = await getMembership(userId, businessId, client);

  if (!membership) {
    throw new BusinessNotFoundError();
  }

  return membership;
}

/**
 * Require that the authenticated user is specifically the OWNER of the
 * given business. Used for every OWNER-only mutation (settings, member
 * role changes, member removal, invitation creation/revocation) — always
 * pass `tx` for these so the check is authorized against the same
 * transaction that performs the write (see the module-level note above).
 */
export async function requireOwner(
  userId: string,
  businessId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<AuthorizedMembership> {
  const membership = await requireMembership(userId, businessId, client);

  if (membership.role !== "OWNER") {
    throw new BusinessAuthorizationError("Only the business owner can perform this action.");
  }

  return membership;
}

/**
 * List every business the authenticated user belongs to, for
 * navigation/the business switcher. Source of truth is BusinessMember —
 * never derived from a client-supplied list, and never includes businesses
 * the user is not a member of.
 */
export async function listBusinessesForUser(userId: string) {
  const memberships = await prisma.businessMember.findMany({
    where: { userId },
    select: {
      role: true,
      business: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => ({
    ...membership.business,
    role: membership.role,
  }));
}
