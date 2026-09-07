import "server-only";

import type { BusinessMemberRole } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { isUniqueConstraintViolation } from "@/lib/db/errors";
import type { PrismaClientOrTransaction } from "@/lib/db/types";
import { randomSlugSuffix, slugify } from "@/lib/business/slug";
import type { CreateBusinessInput, UpdateBusinessSettingsInput } from "@/lib/validation/business";
import { requireMembership, requireOwner } from "@/server/business/authorization";
import { BusinessMemberNotFoundError, BusinessNotFoundError, LastOwnerError } from "@/server/business/errors";

const MAX_SLUG_ATTEMPTS = 5;

function businessCreateData(input: CreateBusinessInput, slug: string) {
  return {
    name: input.name,
    slug,
    currency: input.currency,
    timezone: input.timezone,
    logoUrl: input.logoUrl ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    description: input.description ?? null,
  };
}

/**
 * Create a business and its creator's initial OWNER membership atomically.
 * The creator must never end up with a Business record without its
 * corresponding OWNER membership because of a partial failure — both
 * writes happen in the same database transaction.
 *
 * Slug uniqueness is database-enforced (Business.slug @unique). Rather
 * than a pre-check-then-insert (race-prone), this attempts the insert and,
 * on a unique-constraint collision, retries the entire transaction with a
 * short cryptographically random suffix appended, up to a bounded number
 * of attempts.
 */
export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const baseSlug = slugify(input.name);
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSlugSuffix()}`;

    try {
      return await prisma.$transaction(async (tx) => {
        const business = await tx.business.create({ data: businessCreateData(input, slug) });

        await tx.businessMember.create({
          data: { businessId: business.id, userId, role: "OWNER" },
        });

        return business;
      });
    } catch (error) {
      lastError = error;
      if (isUniqueConstraintViolation(error)) {
        // Expected race/collision on `slug`; retry with a new suffix.
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create business after multiple slug attempts.");
}

/**
 * Fetch a business for an authenticated, authorized member. `businessId`
 * in the URL is only a navigation identifier — this establishes actual
 * authorization via requireMembership() before returning any data.
 */
export async function getBusinessForUser(userId: string, businessId: string) {
  const membership = await requireMembership(userId, businessId);

  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    // FK integrity should make this unreachable, but fail closed rather
    // than let a null business flow further.
    throw new BusinessNotFoundError();
  }

  return { business, role: membership.role };
}

/** Update business settings. OWNER-only. Slug is immutable in M2 (not part of the update shape). */
export async function updateBusinessSettings(
  userId: string,
  businessId: string,
  input: UpdateBusinessSettingsInput,
) {
  return prisma.$transaction(async (tx) => {
    // Authorization runs inside this same transaction (see the
    // module-level note in authorization.ts) so a concurrent demotion of
    // this user cannot race a stale "still OWNER" check against the write.
    await requireOwner(userId, businessId, tx);

    return tx.business.update({
      where: { id: businessId },
      data: {
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
        logoUrl: input.logoUrl ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        description: input.description ?? null,
      },
    });
  });
}

/** List a business's members. Any member (OWNER or STAFF) may view membership. */
export async function listBusinessMembers(userId: string, businessId: string) {
  await requireMembership(userId, businessId);

  return prisma.businessMember.findMany({
    where: { businessId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Lock every OWNER row for a business within an open transaction, so
 * concurrent last-owner-affecting mutations (role changes, removals)
 * serialize against each other instead of racing. Must be called, and its
 * result awaited, before reading/relying on the current owner count in
 * updateMemberRole()/removeMember() below.
 *
 * Postgres re-evaluates a blocked `SELECT ... FOR UPDATE`'s WHERE clause
 * against the latest committed row version once the lock is acquired, so
 * two concurrent transactions targeting different owners of the same
 * business correctly serialize rather than both observing a stale
 * "2 owners" count.
 */
async function lockBusinessOwnerRows(tx: PrismaClientOrTransaction, businessId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM business_members
    WHERE "businessId" = ${businessId} AND role = 'OWNER'
    FOR UPDATE
  `;
}

/**
 * Change a member's role. OWNER-only. Demoting the business's last OWNER
 * to STAFF is rejected — protected transactionally (see
 * lockBusinessOwnerRows) so two concurrent demotions of different owners
 * cannot both succeed and leave zero owners.
 *
 * The acting user's OWNER authorization is checked via `tx` *after*
 * lockBusinessOwnerRows() has acquired its row lock, not as a separate
 * pre-transaction query — otherwise a concurrent demotion/removal of the
 * acting user between an earlier standalone check and this write could
 * let an actor who is no longer OWNER still push the mutation through.
 */
export async function updateMemberRole(
  actingUserId: string,
  businessId: string,
  targetMemberId: string,
  newRole: BusinessMemberRole,
) {
  return prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(actingUserId, businessId, tx);

    const target = await tx.businessMember.findUnique({ where: { id: targetMemberId } });

    if (!target || target.businessId !== businessId) {
      throw new BusinessMemberNotFoundError();
    }

    if (target.role === "OWNER" && newRole === "STAFF") {
      const ownerCount = await tx.businessMember.count({ where: { businessId, role: "OWNER" } });
      if (ownerCount <= 1) {
        throw new LastOwnerError();
      }
    }

    return tx.businessMember.update({ where: { id: targetMemberId }, data: { role: newRole } });
  });
}

/**
 * Remove a member. OWNER-only. Removing the business's last OWNER is
 * rejected, protected by the same transactional owner-row lock as
 * updateMemberRole() above. See that function's docstring for why the
 * acting user's authorization is checked via `tx`, after the lock, rather
 * than as a separate pre-transaction query.
 */
export async function removeMember(actingUserId: string, businessId: string, targetMemberId: string) {
  await prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(actingUserId, businessId, tx);

    const target = await tx.businessMember.findUnique({ where: { id: targetMemberId } });

    if (!target || target.businessId !== businessId) {
      throw new BusinessMemberNotFoundError();
    }

    if (target.role === "OWNER") {
      const ownerCount = await tx.businessMember.count({ where: { businessId, role: "OWNER" } });
      if (ownerCount <= 1) {
        throw new LastOwnerError();
      }
    }

    await tx.businessMember.delete({ where: { id: targetMemberId } });
  });
}
