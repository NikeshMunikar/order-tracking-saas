// DB-backed authorization tests for the M2 business/membership services.
//
// These run against a dedicated PostgreSQL test database (see
// tests/helpers/test-db.ts) and use `node:test`, which is already present in
// the repository. This does NOT decide DEC-004 (the unit/integration testing
// framework), which remains OPEN.
//
// Scope: OWNER/STAFF authorization for the five OWNER-only mutations, tenant
// isolation (including that a browser-supplied businessId cannot switch
// context), the closed business-role invariant, and the row-locking /
// re-verification behavior that the residual-TOCTOU remediation relies on.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type { BusinessMemberRole } from "@prisma/client";

import type { UpdateBusinessSettingsInput } from "../../src/lib/validation/business.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { lockBusinessOwnerRows } from "../../src/server/business/authorization.ts";
import {
  createBusiness,
  getBusinessForUser,
  listBusinessMembers,
  removeMember,
  updateBusinessSettings,
  updateMemberRole,
} from "../../src/server/business/business-service.ts";
import {
  BusinessAuthorizationError,
  LastOwnerError,
} from "../../src/server/business/errors.ts";
import {
  inviteMember,
  revokeInvitation,
} from "../../src/server/business/invitation-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createInvitationFixture,
  createUser,
  disconnectDatabase,
  resetDatabase,
  uniqueEmail,
} from "../helpers/test-db.ts";

function settings(overrides: Partial<UpdateBusinessSettingsInput> = {}): UpdateBusinessSettingsInput {
  return {
    name: "Updated Business",
    currency: "USD",
    timezone: "UTC",
    logoUrl: undefined,
    phone: undefined,
    email: undefined,
    address: undefined,
    description: undefined,
    ...overrides,
  };
}

type MutationCase = { name: string; run: () => Promise<unknown> };

/** The five OWNER-only mutations, bound to a given actor and business. */
function ownerOnlyMutations(
  actorId: string,
  businessId: string,
  targets: { memberId: string; invitationId: string },
): MutationCase[] {
  return [
    {
      name: "updateBusinessSettings",
      run: () => updateBusinessSettings(actorId, businessId, settings()),
    },
    {
      name: "updateMemberRole",
      run: () => updateMemberRole(actorId, businessId, targets.memberId, "STAFF"),
    },
    {
      name: "removeMember",
      run: () => removeMember(actorId, businessId, targets.memberId),
    },
    {
      name: "inviteMember",
      run: () => inviteMember(actorId, businessId, { email: uniqueEmail("invitee"), role: "STAFF" }),
    },
    {
      name: "revokeInvitation",
      run: () => revokeInvitation(actorId, businessId, targets.invitationId),
    },
  ];
}

/** The three OWNER-only mutations that lock OWNER rows (audit finding #2). */
function lockedMutations(actorId: string, businessId: string, invitationId: string): MutationCase[] {
  return [
    {
      name: "updateBusinessSettings",
      run: () => updateBusinessSettings(actorId, businessId, settings()),
    },
    {
      name: "inviteMember",
      run: () => inviteMember(actorId, businessId, { email: uniqueEmail("invitee"), role: "STAFF" }),
    },
    {
      name: "revokeInvitation",
      run: () => revokeInvitation(actorId, businessId, invitationId),
    },
  ];
}

async function expectRejection(promise: Promise<unknown>, errorName: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof Error && error.name === errorName,
      `expected ${errorName}, got ${(error as Error | undefined)?.name}: ${(error as Error | undefined)?.message}`,
    );
    return true;
  });
}

async function seed(prefix: string) {
  const owner = await createUser();
  const staff = await createUser();
  const business = await createBusinessWithOwner(owner.id, `${prefix} Business`);
  const staffMember = await addMember(business.id, staff.id, "STAFF");
  const { invitation } = await createInvitationFixture({
    businessId: business.id,
    email: uniqueEmail("invitee"),
  });

  return { owner, staff, business, staffMember, invitationId: invitation.id };
}

before(async () => {
  assertDedicatedTestDatabase();
  // Preflight: fails loudly if the database is unreachable or unmigrated.
  await prisma.business.count();
});

beforeEach(resetDatabase);

after(disconnectDatabase);

test("createBusiness atomically creates the business and the creator's OWNER membership", async () => {
  const creator = await createUser();

  const business = await createBusiness(creator.id, settings({ name: "Atomic Bakery" }));

  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId: business.id, userId: creator.id } },
  });

  assert.equal(business.name, "Atomic Bakery");
  assert.equal(membership?.role, "OWNER");
});

test("createBusiness generates distinct slugs for duplicate names", async () => {
  const creator = await createUser();

  const first = await createBusiness(creator.id, settings({ name: "Same Name" }));
  const second = await createBusiness(creator.id, settings({ name: "Same Name" }));

  assert.notEqual(first.slug, second.slug);
});

test("getBusinessForUser is readable by any member and denied to non-members", async () => {
  const { owner, staff, business } = await seed("Readable");
  const outsider = await createUser();

  const asOwner = await getBusinessForUser(owner.id, business.id);
  const asStaff = await getBusinessForUser(staff.id, business.id); // staff may read

  assert.equal(asOwner.business.id, business.id);
  assert.equal(asOwner.role, "OWNER");
  assert.equal(asStaff.role, "STAFF");

  await expectRejection(getBusinessForUser(outsider.id, business.id), "BusinessNotFoundError");
});

test("listBusinessMembers is visible to any member and denied to non-members", async () => {
  const { owner, staff, business } = await seed("Members");
  const outsider = await createUser();

  const listed = await listBusinessMembers(staff.id, business.id);
  assert.equal(listed.length, 2);

  await expectRejection(listBusinessMembers(outsider.id, business.id), "BusinessNotFoundError");
  void owner;
});

test("listBusinessesForUser never includes businesses the user is not a member of", async () => {
  const { owner, business } = await seed("Isolation");
  const otherOwner = await createUser();
  const otherBusiness = await createBusinessWithOwner(otherOwner.id, "Other Business");

  const owned = await import("../../src/server/business/authorization.ts").then((m) =>
    m.listBusinessesForUser(owner.id),
  );
  const ids = owned.map((entry) => entry.id);

  assert.deepEqual(ids, [business.id]);
  assert.ok(!ids.includes(otherBusiness.id));
});

test("STAFF is denied every OWNER-only mutation", async () => {
  const { staff, staffMember, business, invitationId } = await seed("StaffDenied");

  for (const mutation of ownerOnlyMutations(staff.id, business.id, {
    memberId: staffMember.id,
    invitationId,
  })) {
    await expectRejection(mutation.run(), "BusinessAuthorizationError");
  }
});

test("an OWNER can perform every OWNER-only mutation", async () => {
  const { owner, business, staffMember, invitationId } = await seed("OwnerAllowed");

  const updated = await updateBusinessSettings(owner.id, business.id, settings({ name: "Renamed" }));
  assert.equal(updated.name, "Renamed");

  const promoted = await updateMemberRole(owner.id, business.id, staffMember.id, "OWNER");
  assert.equal(promoted.role, "OWNER");

  const invited = await inviteMember(owner.id, business.id, {
    email: uniqueEmail("new-invitee"),
    role: "STAFF",
  });
  assert.equal(typeof invited.rawToken, "string");

  await revokeInvitation(owner.id, business.id, invitationId);
  const revoked = await prisma.businessInvitation.findUniqueOrThrow({ where: { id: invitationId } });
  assert.ok(revoked.revokedAt instanceof Date);

  await removeMember(owner.id, business.id, staffMember.id);
  assert.equal(
    await prisma.businessMember.findUnique({ where: { id: staffMember.id } }),
    null,
  );
});

test("a browser-supplied businessId cannot switch tenant context (member of A cannot act on B)", async () => {
  const actor = await createUser();
  const businessA = await createBusinessWithOwner(actor.id, "Business A");
  const { business: businessB, staffMember: memberB, invitationId: invitationB } = await seed(
    "Business B",
  );
  void businessA;

  for (const mutation of ownerOnlyMutations(actor.id, businessB.id, {
    memberId: memberB.id,
    invitationId: invitationB,
  })) {
    await expectRejection(mutation.run(), "BusinessNotFoundError");
  }

  await expectRejection(getBusinessForUser(actor.id, businessB.id), "BusinessNotFoundError");
});

test("a resource id from another tenant cannot be used with this businessId", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const { business: businessB, staffMember: memberB, invitationId: invitationB } = await seed(
    "Tenant B",
  );
  void businessB;

  await expectRejection(
    updateMemberRole(ownerA.id, businessA.id, memberB.id, "STAFF"),
    "BusinessMemberNotFoundError",
  );
  await expectRejection(removeMember(ownerA.id, businessA.id, memberB.id), "BusinessMemberNotFoundError");
  await expectRejection(
    revokeInvitation(ownerA.id, businessA.id, invitationB),
    "InvitationNotFoundError",
  );

  // The foreign member was not affected.
  const stillStaff = await prisma.businessMember.findUniqueOrThrow({ where: { id: memberB.id } });
  assert.equal(stillStaff.role, "STAFF");
});

test("BusinessMember.role cannot store platform roles", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Role Domain");
  const ownerMember = business.members[0];

  // Service layer: the closed enum rejects a platform role (DB is authoritative).
  await assert.rejects(
    updateMemberRole(
      owner.id,
      business.id,
      ownerMember.id,
      "SUPER_ADMIN" as unknown as BusinessMemberRole,
    ),
  );
  const unchanged = await prisma.businessMember.findUniqueOrThrow({ where: { id: ownerMember.id } });
  assert.equal(unchanged.role, "OWNER");

  // Database layer: a direct write of a platform role is rejected by the enum.
  const another = await createUser();
  await assert.rejects(
    prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: another.id,
        role: "ADMIN" as unknown as BusinessMemberRole,
      },
    }),
  );

  const roles = await prisma.businessMember.findMany({
    where: { businessId: business.id },
    select: { role: true },
  });
  assert.deepEqual([...new Set(roles.map((row) => row.role))], ["OWNER"]);
});

test("the last OWNER cannot be demoted or removed", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Solo Owner");
  const ownerMember = business.members[0];

  await expectRejection(
    updateMemberRole(owner.id, business.id, ownerMember.id, "STAFF"),
    "LastOwnerError",
  );
  await expectRejection(removeMember(owner.id, business.id, ownerMember.id), "LastOwnerError");
});

test("two concurrent demotions cannot leave the business with zero owners", async () => {
  const ownerA = await createUser();
  const ownerB = await createUser();
  const business = await createBusinessWithOwner(ownerA.id, "Concurrent Demote");
  const memberB = await addMember(business.id, ownerB.id, "OWNER");

  const results = await Promise.allSettled([
    updateMemberRole(ownerA.id, business.id, memberB.id, "STAFF"),
    updateMemberRole(ownerB.id, business.id, business.members[0].id, "STAFF"),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(
    rejectedError instanceof LastOwnerError || rejectedError instanceof BusinessAuthorizationError,
    `expected LastOwnerError or BusinessAuthorizationError, got ${rejectedError?.name}`,
  );

  const ownerCount = await prisma.businessMember.count({
    where: { businessId: business.id, role: "OWNER" },
  });
  assert.equal(ownerCount, 1);
});

test("two concurrent removals cannot leave the business with zero owners", async () => {
  const ownerA = await createUser();
  const ownerB = await createUser();
  const business = await createBusinessWithOwner(ownerA.id, "Concurrent Remove");
  const memberB = await addMember(business.id, ownerB.id, "OWNER");

  const results = await Promise.allSettled([
    removeMember(ownerA.id, business.id, memberB.id),
    removeMember(ownerB.id, business.id, business.members[0].id),
  ]);

  const ownerCount = await prisma.businessMember.count({
    where: { businessId: business.id, role: "OWNER" },
  });

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(ownerCount, 1);
});

test("a mutation by an actor already demoted to STAFF is rejected (authorization is re-read)", async () => {
  for (const mutationName of ["updateBusinessSettings", "inviteMember", "revokeInvitation"] as const) {
    const actor = await createUser();
    const business = await createBusinessWithOwner(actor.id, `Demoted ${mutationName}`);
    const otherOwner = await createUser();
    await addMember(business.id, otherOwner.id, "OWNER");

    const actorMember = business.members.find((m) => m.userId === actor.id);
    assert.ok(actorMember);
    await updateMemberRole(otherOwner.id, business.id, actorMember.id, "STAFF");

    const { invitation } = await createInvitationFixture({
      businessId: business.id,
      email: uniqueEmail("invitee"),
    });

    for (const mutation of lockedMutations(actor.id, business.id, invitation.id)) {
      await expectRejection(mutation.run(), "BusinessAuthorizationError");
    }
  }
});

test("a mutation by an actor whose membership was removed is rejected", async () => {
  const actor = await createUser();
  const business = await createBusinessWithOwner(actor.id, "Removed Actor");
  const otherOwner = await createUser();
  await addMember(business.id, otherOwner.id, "OWNER");

  const actorMember = business.members.find((m) => m.userId === actor.id);
  assert.ok(actorMember);
  await removeMember(otherOwner.id, business.id, actorMember.id);

  const { invitation } = await createInvitationFixture({
    businessId: business.id,
    email: uniqueEmail("invitee"),
  });

  for (const mutation of lockedMutations(actor.id, business.id, invitation.id)) {
    await expectRejection(mutation.run(), "BusinessNotFoundError");
  }
});

test("a mutation that blocks on the OWNER-row lock re-reads authorization and is rejected after the actor is demoted", async () => {
  for (const mutationName of ["updateBusinessSettings", "inviteMember", "revokeInvitation"] as const) {
    const actor = await createUser();
    const business = await createBusinessWithOwner(actor.id, `Locked ${mutationName}`);
    const otherOwner = await createUser();
    await addMember(business.id, otherOwner.id, "OWNER");

    const actorMember = business.members.find((m) => m.userId === actor.id);
    assert.ok(actorMember);
    const { invitation } = await createInvitationFixture({
      businessId: business.id,
      email: uniqueEmail("invitee"),
    });

    let signalLockAcquired!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // A transaction that holds the OWNER-row lock, then demotes the actor
    // before committing. While it is open, the mutation below cannot acquire
    // the lock, so the demotion necessarily commits first.
    const blocker = prisma.$transaction(async (tx) => {
      await lockBusinessOwnerRows(tx, business.id);
      signalLockAcquired();
      await lockReleased;
      await tx.businessMember.update({ where: { id: actorMember.id }, data: { role: "STAFF" } });
    });

    await lockAcquired;

    const makeMutation = () =>
      mutationName === "updateBusinessSettings"
        ? updateBusinessSettings(actor.id, business.id, settings())
        : mutationName === "inviteMember"
          ? inviteMember(actor.id, business.id, {
              email: uniqueEmail("invitee"),
              role: "STAFF",
            })
          : revokeInvitation(actor.id, business.id, invitation.id);

    const outcome = makeMutation().then(
      () => ({ ok: true as const, error: undefined as unknown }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // The mutation holds no OWNER-row lock yet, so it cannot settle while the
    // blocker is open (the assertion cannot spuriously pass as "settled").
    const settledWhileLocked = await Promise.race([
      outcome.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
    ]);
    assert.equal(
      settledWhileLocked,
      false,
      `${mutationName} should block on the OWNER-row lock`,
    );

    releaseLock();
    await blocker;

    const result = await outcome;
    assert.equal(result.ok, false, `${mutationName} should be rejected after the actor was demoted`);
    assert.ok(
      result.error instanceof BusinessAuthorizationError,
      `${mutationName} expected BusinessAuthorizationError, got ${(result.error as Error).name}`,
    );
  }
});
