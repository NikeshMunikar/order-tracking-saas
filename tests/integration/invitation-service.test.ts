// DB-backed tests for the M2 invitation service: token handling, reissue,
// revocation, and the invitation-acceptance edge cases (including the
// sanitized duplicate-membership path, audit finding #3).
//
// These run against a dedicated PostgreSQL test database and use `node:test`
// (already present in the repository). This does NOT decide DEC-004, which
// remains OPEN.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { prisma } from "../../src/lib/db/client.ts";
import { generateSecureToken } from "../../src/lib/security/token.ts";
import { BusinessAuthorizationError } from "../../src/server/business/errors.ts";
import {
  acceptInvitation,
  inviteMember,
  listInvitations,
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function seedBusiness(prefix = "Invitations") {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, `${prefix} Business`);
  return { owner, business };
}

before(async () => {
  assertDedicatedTestDatabase();
  await prisma.business.count();
});

beforeEach(resetDatabase);

after(disconnectDatabase);

test("inviteMember persists only a SHA-256 hash of the token, with a 7-day expiry", async () => {
  const { owner, business } = await seedBusiness();

  const invited = await inviteMember(owner.id, business.id, {
    email: uniqueEmail("invitee"),
    role: "STAFF",
  });

  const stored = await prisma.businessInvitation.findUniqueOrThrow({
    where: { id: invited.invitationId },
  });

  assert.equal(stored.tokenHash, createHash("sha256").update(invited.rawToken).digest("hex"));
  assert.equal(stored.tokenHash.length, 64);
  assert.ok(!JSON.stringify(stored).includes(invited.rawToken), "raw token must not be stored");

  const drift = Math.abs(stored.expiresAt.getTime() - (Date.now() + SEVEN_DAYS_MS));
  assert.ok(drift < 60_000, `expected ~7-day expiry, drifted ${drift}ms`);
});

test("inviteMember normalizes the invited email, and acceptance compares normalized", async () => {
  const { owner, business } = await seedBusiness();

  const invited = await inviteMember(owner.id, business.id, {
    email: "  Mixed.Case@Example.TEST ",
    role: "STAFF",
  });

  const stored = await prisma.businessInvitation.findUniqueOrThrow({
    where: { id: invited.invitationId },
  });
  assert.equal(stored.email, "mixed.case@example.test");

  const invitee = await createUser("mixed.case@example.test");
  const result = await acceptInvitation(invitee.id, "MIXED.CASE@example.test", invited.rawToken);
  assert.deepEqual(result, { outcome: "accepted", businessId: business.id });
});

test("inviteMember revokes the previous active invitation for the same email", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("reissue");

  const first = await inviteMember(owner.id, business.id, { email, role: "STAFF" });
  const second = await inviteMember(owner.id, business.id, { email, role: "STAFF" });

  assert.notEqual(first.rawToken, second.rawToken);

  const firstRow = await prisma.businessInvitation.findUniqueOrThrow({ where: { id: first.invitationId } });
  assert.ok(firstRow.revokedAt instanceof Date);

  const activeCount = await prisma.businessInvitation.count({
    where: { businessId: business.id, email, acceptedAt: null, revokedAt: null },
  });
  assert.equal(activeCount, 1);
});

test("concurrent invites for the same email leave exactly one active invitation", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("concurrent-invite");

  const results = await Promise.allSettled([
    inviteMember(owner.id, business.id, { email, role: "STAFF" }),
    inviteMember(owner.id, business.id, { email, role: "STAFF" }),
  ]);

  assert.ok(results.some((r) => r.status === "fulfilled"));

  const activeCount = await prisma.businessInvitation.count({
    where: { businessId: business.id, email, acceptedAt: null, revokedAt: null },
  });
  assert.equal(activeCount, 1);
});

test("revokeInvitation revokes an active invitation and rejects a non-active one", async () => {
  const { owner, business } = await seedBusiness();
  const { invitation } = await createInvitationFixture({
    businessId: business.id,
    email: uniqueEmail("revoke"),
  });

  await revokeInvitation(owner.id, business.id, invitation.id);
  const revoked = await prisma.businessInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.ok(revoked.revokedAt instanceof Date);

  await assert.rejects(
    revokeInvitation(owner.id, business.id, invitation.id),
    (error: unknown) => error instanceof Error && error.name === "InvitationNotFoundError",
  );
});

test("listInvitations is OWNER-only", async () => {
  const { owner, business } = await seedBusiness();
  const staff = await createUser();
  await addMember(business.id, staff.id, "STAFF");

  await assert.rejects(
    listInvitations(staff.id, business.id),
    (error: unknown) => error instanceof BusinessAuthorizationError,
  );

  const listed = await listInvitations(owner.id, business.id);
  assert.ok(Array.isArray(listed));
});

test("acceptInvitation creates a membership with the invited role", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("accept");
  const invitee = await createUser(email);

  const invited = await inviteMember(owner.id, business.id, { email, role: "OWNER" });
  const result = await acceptInvitation(invitee.id, email, invited.rawToken);

  assert.deepEqual(result, { outcome: "accepted", businessId: business.id });

  const membership = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId: business.id, userId: invitee.id } },
  });
  assert.equal(membership?.role, "OWNER");
});

test("acceptance is externally indistinguishable for accepted / revoked / expired / nonexistent / email-mismatch", async () => {
  const { owner, business } = await seedBusiness();

  const acceptedEmail = uniqueEmail("accepted");
  const acceptedUser = await createUser(acceptedEmail);
  const acceptedInvite = await inviteMember(owner.id, business.id, {
    email: acceptedEmail,
    role: "STAFF",
  });
  await acceptInvitation(acceptedUser.id, acceptedEmail, acceptedInvite.rawToken);

  const revoked = await createInvitationFixture({
    businessId: business.id,
    email: uniqueEmail("revoked"),
    revokedAt: new Date(),
  });
  const expired = await createInvitationFixture({
    businessId: business.id,
    email: uniqueEmail("expired"),
    expiresAt: new Date(Date.now() - 60_000),
  });

  const mismatchEmail = uniqueEmail("mismatch");
  const mismatchInvite = await inviteMember(owner.id, business.id, {
    email: mismatchEmail,
    role: "STAFF",
  });
  const mismatchedUser = await createUser(uniqueEmail("other"));

  const nonexistentToken = generateSecureToken().rawToken;

  const membersBeforeInvalid = await prisma.businessMember.count({
    where: { businessId: business.id },
  });

  const invalidResults = await Promise.all([
    acceptInvitation(acceptedUser.id, acceptedEmail, acceptedInvite.rawToken), // already accepted
    acceptInvitation(
      (await createUser(revoked.invitation.email)).id,
      revoked.invitation.email,
      revoked.rawToken,
    ),
    acceptInvitation(
      (await createUser(expired.invitation.email)).id,
      expired.invitation.email,
      expired.rawToken,
    ),
    acceptInvitation(mismatchedUser.id, mismatchedUser.email, mismatchInvite.rawToken),
    acceptInvitation(mismatchedUser.id, mismatchedUser.email, nonexistentToken),
  ]);

  for (const result of invalidResults) {
    assert.deepEqual(result, { outcome: "invalid" });
  }

  // None of the invalid attempts created a membership.
  const membersAfterInvalid = await prisma.businessMember.count({
    where: { businessId: business.id },
  });
  assert.equal(membersAfterInvalid, membersBeforeInvalid);
});

test("accepting the same invitation twice creates exactly one membership", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("twice");
  const invitee = await createUser(email);

  const invited = await inviteMember(owner.id, business.id, { email, role: "STAFF" });

  const first = await acceptInvitation(invitee.id, email, invited.rawToken);
  const second = await acceptInvitation(invitee.id, email, invited.rawToken);

  assert.deepEqual(first, { outcome: "accepted", businessId: business.id });
  assert.deepEqual(second, { outcome: "invalid" });

  const count = await prisma.businessMember.count({
    where: { businessId: business.id, userId: invitee.id },
  });
  assert.equal(count, 1);
});

test("two concurrent acceptances of the same token create exactly one membership", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("concurrent-accept");
  const invitee = await createUser(email);

  const invited = await inviteMember(owner.id, business.id, { email, role: "STAFF" });

  const results = await Promise.all([
    acceptInvitation(invitee.id, email, invited.rawToken),
    acceptInvitation(invitee.id, email, invited.rawToken),
  ]);

  const accepted = results.filter((result) => result.outcome === "accepted");
  const invalid = results.filter((result) => result.outcome === "invalid");

  assert.equal(accepted.length, 1);
  assert.equal(invalid.length, 1);

  const count = await prisma.businessMember.count({
    where: { businessId: business.id, userId: invitee.id },
  });
  assert.equal(count, 1);
});

test("acceptInvitation never lets a raw Prisma unique-constraint error escape", async () => {
  const { owner, business } = await seedBusiness();
  const email = uniqueEmail("already-member");
  const invitee = await createUser(email);
  // The user is already a member, so the membership insert conflicts.
  await addMember(business.id, invitee.id, "STAFF");

  const invited = await inviteMember(owner.id, business.id, { email, role: "OWNER" });

  await assert.rejects(acceptInvitation(invitee.id, email, invited.rawToken), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "BusinessMemberAlreadyExistsError");
    assert.ok(
      !/P2002|prisma|constraint|SQL|business_members|token/i.test(error.message),
      `error message must not leak database details: ${error.message}`,
    );
    return true;
  });

  // The acceptedAt claim is part of the rolled-back transaction.
  const stored = await prisma.businessInvitation.findUniqueOrThrow({
    where: { id: invited.invitationId },
  });
  assert.equal(stored.acceptedAt, null);

  // The existing membership is untouched.
  const membership = await prisma.businessMember.findUniqueOrThrow({
    where: { businessId_userId: { businessId: business.id, userId: invitee.id } },
  });
  assert.equal(membership.role, "STAFF");
});
