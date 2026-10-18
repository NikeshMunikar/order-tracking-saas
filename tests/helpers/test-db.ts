// Shared fixtures and cleanup for the DB-backed integration suite.
//
// Safety: `resetDatabase()` calls `assertDedicatedTestDatabase()` first, and
// the suite bootstrap (tests/helpers/register.mjs) points DATABASE_URL at the
// `_test` database. Together these guarantee the suite can never operate on
// development data.
import { randomUUID } from "node:crypto";

import { prisma } from "../../src/lib/db/client.ts";
import { generateSecureToken, hashToken } from "../../src/lib/security/token.ts";

const TEST_DATABASE_SUFFIX = "_test";

/**
 * Fails loudly (rather than silently skipping) if the configured database is
 * not a dedicated test database, or if DATABASE_URL is missing entirely.
 */
export function assertDedicatedTestDatabase(): void {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const databaseName = new URL(configuredUrl).pathname.replace(/^\//, "");

  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run DB-backed tests against database "${databaseName}": a dedicated ` +
        `test database (name ending in "${TEST_DATABASE_SUFFIX}") is required. Run ` +
        "`node tests/helpers/setup-test-db.mjs`, then `npm run test:integration`.",
    );
  }
}

/** Remove every row from the M1/M2/M3 tables between tests. */
export async function resetDatabase(): Promise<void> {
  assertDedicatedTestDatabase();

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "customers", "business_invitations", "business_members", "businesses", "users" RESTART IDENTITY CASCADE',
  );
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export async function createUser(email: string = uniqueEmail()) {
  return prisma.user.create({
    data: {
      email,
      // Authentication/password hashing is not under test here; a placeholder
      // keeps fixtures fast. No login flow is exercised.
      passwordHash: "not-a-real-password-hash",
    },
  });
}

export async function createBusinessWithOwner(ownerId: string, name = "Test Business") {
  return prisma.business.create({
    data: {
      name,
      slug: `test-${randomUUID()}`,
      currency: "USD",
      timezone: "UTC",
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
    include: { members: true },
  });
}

export async function addMember(businessId: string, userId: string, role: "OWNER" | "STAFF") {
  return prisma.businessMember.create({ data: { businessId, userId, role } });
}

export async function createInvitationFixture(params: {
  businessId: string;
  email: string;
  role?: "OWNER" | "STAFF";
  expiresAt?: Date;
  rawToken?: string;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}) {
  const rawToken = params.rawToken ?? generateSecureToken().rawToken;

  const invitation = await prisma.businessInvitation.create({
    data: {
      businessId: params.businessId,
      email: params.email.trim().toLowerCase(),
      role: params.role ?? "STAFF",
      tokenHash: hashToken(rawToken),
      expiresAt: params.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: params.acceptedAt ?? null,
      revokedAt: params.revokedAt ?? null,
    },
  });

  return { invitation, rawToken };
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
