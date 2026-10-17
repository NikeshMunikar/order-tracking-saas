import "server-only";

import type { BusinessMemberRole } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { isUniqueConstraintViolation } from "@/lib/db/errors";
import { generateSecureToken, hashToken } from "@/lib/security/token";
import { lockBusinessOwnerRows, requireOwner } from "@/server/business/authorization";
import {
  BusinessMemberAlreadyExistsError,
  InvitationNotFoundError,
} from "@/server/business/errors";

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_INVITE_ATTEMPTS = 3;

function normalizeEmail(email: string): string {
  // Reuses the exact same normalization as authentication
  // (src/lib/validation/auth.ts) rather than introducing a second scheme.
  return email.trim().toLowerCase();
}

/**
 * Create (or revoke-and-reissue) an invitation. OWNER-only.
 *
 * Flow, all inside one transaction per attempt:
 *   1. Revoke any current database-active invitation for
 *      (businessId, normalizedEmail) (`revokedAt IS NULL AND acceptedAt
 *      IS NULL`).
 *   2. Insert the new invitation with a fresh token hash and 7-day expiry.
 *
 * The PostgreSQL partial unique index
 * (`business_invitations_active_email_key`, see the M2 migration) is the
 * authoritative invariant, not this revoke-then-insert sequence by itself:
 * if a concurrent invite request commits between our revoke and our
 * insert, the insert hits that unique index and fails with a P2002. On
 * that specific, expected conflict, the entire transaction (including the
 * revoke) is retried with a freshly generated token, up to a bounded
 * number of attempts — never an unbounded retry loop.
 *
 * The raw token is returned only in this function's return value for the
 * immediate caller to relay to the OWNER (e.g. as a copyable link). It is
 * never logged and never persisted — only `tokenHash` is stored.
 */
export async function inviteMember(
  actingUserId: string,
  businessId: string,
  input: { email: string; role: BusinessMemberRole },
): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
  const normalizedEmail = normalizeEmail(input.email);
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_INVITE_ATTEMPTS; attempt += 1) {
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

    try {
      const invitation = await prisma.$transaction(async (tx) => {
        // Lock every OWNER row, then re-read the acting user's role via `tx`
        // (see lockBusinessOwnerRows): the lock prevents a concurrent
        // demotion/removal of the acting user from passing a stale
        // "still OWNER" check before the invitation write below.
        await lockBusinessOwnerRows(tx, businessId);
        await requireOwner(actingUserId, businessId, tx);

        await tx.businessInvitation.updateMany({
          where: {
            businessId,
            email: normalizedEmail,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });

        return tx.businessInvitation.create({
          data: {
            businessId,
            email: normalizedEmail,
            role: input.role,
            tokenHash,
            expiresAt,
          },
        });
      });

      return {
        invitationId: invitation.id,
        rawToken,
        expiresAt: invitation.expiresAt,
      };
    } catch (error) {
      lastError = error;
      if (isUniqueConstraintViolation(error)) {
        // Expected race on the partial unique index (or, astronomically
        // less likely, a tokenHash collision) — retry with fresh values.
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create invitation after multiple attempts.");
}

/**
 * Explicitly revoke a still-active invitation. OWNER-only. This is
 * distinct from the automatic revoke-and-reissue inside inviteMember()
 * above — it is a standalone "cancel this invite" operation with no
 * reissue.
 */
export async function revokeInvitation(
  actingUserId: string,
  businessId: string,
  invitationId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock every OWNER row, then re-read the acting user's role via `tx`
    // (see lockBusinessOwnerRows) before revoking, so a concurrent
    // demotion/removal of the acting user cannot race this check.
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(actingUserId, businessId, tx);

    const result = await tx.businessInvitation.updateMany({
      where: {
        id: invitationId,
        businessId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new InvitationNotFoundError();
    }
  });
}

/** List a business's invitations (all statuses) for the team page. OWNER-only — invitation email addresses are not STAFF-visible. */
export async function listInvitations(
  actingUserId: string,
  businessId: string,
) {
  await requireOwner(actingUserId, businessId);

  return prisma.businessInvitation.findMany({
    where: { businessId },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export type AcceptInvitationResult =
  | { outcome: "accepted"; businessId: string }
  | { outcome: "invalid" };

/**
 * Atomically accept an invitation by its raw token.
 *
 * Per the approved correction to the naive "read, create, then mark
 * accepted" sequence (which is race-prone), this performs a single
 * conditional UPDATE ... WHERE ... equivalent
 * (`businessInvitation.updateMany` with the same WHERE conditions) that
 * only succeeds if the invitation is still database-active and unexpired,
 * and creates the BusinessMember row in the SAME transaction. If the
 * conditional update affects zero rows (already accepted / revoked /
 * expired / never existed / email mismatch), the function returns
 * `{ outcome: "invalid" }` without creating a membership, and the caller
 * (Server Action layer) must render the same generic invalid/expired
 * response for every one of those cases — never distinguishing them
 * externally (no enumeration of invitation/email state).
 *
 * Two simultaneous acceptance attempts for the same token: the second
 * transaction's conditional UPDATE blocks on the first's row lock, then
 * re-evaluates its WHERE clause once unblocked; after the first commits
 * (acceptedAt now set), the second matches zero rows and returns
 * "invalid" — exactly one membership is created.
 */
export async function acceptInvitation(
  authenticatedUserId: string,
  authenticatedUserEmail: string,
  rawToken: string,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashToken(rawToken);
  const normalizedEmail = normalizeEmail(authenticatedUserEmail);

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.businessInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation || invitation.email !== normalizedEmail) {
      return { outcome: "invalid" as const };
    }

    const claimed = await tx.businessInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date() },
    });

    if (claimed.count === 0) {
      return { outcome: "invalid" as const };
    }

    // If the accepting user already has a membership row for this business
    // (an edge case outside the normal M2 flow), this create() hits the
    // (businessId, userId) unique constraint and throws, rolling back the
    // whole transaction — including the acceptedAt claim above — so the
    // invitation and membership state change together or not at all, per
    // the atomicity requirement.
    try {
      await tx.businessMember.create({
        data: {
          businessId: invitation.businessId,
          userId: authenticatedUserId,
          role: invitation.role,
        },
      });
    } catch (error) {
      // Never let the raw Prisma error (P2002, meta, SQL detail) escape to
      // callers — translate the one expected unique-constraint case into a
      // sanitized domain error; rethrow anything else unchanged.
      if (isUniqueConstraintViolation(error)) {
        throw new BusinessMemberAlreadyExistsError();
      }
      throw error;
    }

    return { outcome: "accepted" as const, businessId: invitation.businessId };
  });
}
