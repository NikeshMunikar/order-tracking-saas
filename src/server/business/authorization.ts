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
// IMPORTANT — mutations must authorize via `tx`, not a separate
// pre-transaction query: every function below accepts an optional
// `client` parameter (defaulting to the top-level `prisma` client) so
// that a mutation running inside `prisma.$transaction(async (tx) => ...)`
// can call `requireOwner(userId, businessId, tx)` and have the
// authorization check itself run inside that same transaction, reading
// the same locked/consistent row it's about to act on. A standalone
// `requireOwner(userId, businessId)` call *before* a transaction starts
// leaves a window in which the actor's role can change (e.g. another
// OWNER concurrently demotes or removes them) between the check and the
// write, letting a now-unauthorized actor's mutation still go through.
// Read-only lookups (business settings display, member listing) are fine
// with the default top-level client — the concern is specifically
// check-then-mutate.

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
