// DB-backed authorization tests for the M3 customer service.
//
// These run against a dedicated PostgreSQL test database (see
// tests/helpers/test-db.ts) and use `node:test`, which is already present in
// the repository. Using it here does NOT decide DEC-004 (the unit/integration
// testing-framework decision), which remains OPEN.
//
// Scope: OWNER/STAFF permissions per operation (MASTER_SPEC.md §4 — STAFF may
// "view/create/update customers", deletion is not in that list), tenant
// isolation (including that a browser-supplied businessId cannot switch
// context, and that a customer id from another tenant cannot be used), soft
// deletion, search, pagination, and the OWNER-row-lock re-verification that
// softDeleteCustomer relies on.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { CUSTOMER_PAGE_MAX, type CreateCustomerInput } from "../../src/lib/validation/customer.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { lockBusinessOwnerRows } from "../../src/server/business/authorization.ts";
import { BusinessAuthorizationError } from "../../src/server/business/errors.ts";
import {
  CUSTOMER_PAGE_SIZE,
  createCustomer,
  getCustomer,
  listCustomers,
  softDeleteCustomer,
  updateCustomer,
} from "../../src/server/customer/customer-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

function input(overrides: Partial<CreateCustomerInput> = {}): CreateCustomerInput {
  return {
    name: "Ram Sharma",
    phone: "9800000001",
    email: undefined,
    address: undefined,
    notes: undefined,
    ...overrides,
  };
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

/** Insert a customer row directly, bypassing the service (cross-tenant fixture). */
async function customerRow(businessId: string, overrides: { name?: string; phone?: string } = {}) {
  return prisma.customer.create({
    data: {
      businessId,
      name: overrides.name ?? "Fixture Customer",
      phone: overrides.phone ?? "9800000000",
    },
  });
}

before(async () => {
  assertDedicatedTestDatabase();
  // Preflight: fails loudly if the database is unreachable or unmigrated.
  await prisma.customer.count();
});

beforeEach(resetDatabase);

after(disconnectDatabase);

test("an OWNER can create, read, list, update and soft-delete a customer", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Customer Lifecycle");

  const created = await createCustomer(
    owner.id,
    business.id,
    input({
      name: "Sita Thapa",
      phone: "9801111111",
      email: "sita@example.test",
      address: "Kathmandu",
      notes: "Prefers pickup",
    }),
  );
  assert.ok(created.id);

  const detail = await getCustomer(owner.id, business.id, created.id);
  assert.equal(detail?.name, "Sita Thapa");
  assert.equal(detail?.email, "sita@example.test");
  assert.equal(detail?.notes, "Prefers pickup");

  const list = await listCustomers(owner.id, business.id, {});
  assert.equal(list.total, 1);
  assert.equal(list.customers[0]?.id, created.id);

  await updateCustomer(
    owner.id,
    business.id,
    created.id,
    input({ name: "Sita T.", phone: "9801111111" }),
  );
  assert.equal((await getCustomer(owner.id, business.id, created.id))?.name, "Sita T.");

  await softDeleteCustomer(owner.id, business.id, created.id);
  assert.equal(await getCustomer(owner.id, business.id, created.id), null);
  assert.equal((await listCustomers(owner.id, business.id, {})).total, 0);
});

test("STAFF can view, create and update customers but cannot delete them", async () => {
  const owner = await createUser();
  const staff = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Staff Permissions");
  await addMember(business.id, staff.id, "STAFF");

  const created = await createCustomer(staff.id, business.id, input({ name: "Hari Gurung" }));
  assert.ok(await getCustomer(staff.id, business.id, created.id));
  assert.equal((await listCustomers(staff.id, business.id, {})).total, 1);

  await updateCustomer(staff.id, business.id, created.id, input({ name: "Hari G." }));
  assert.equal((await getCustomer(staff.id, business.id, created.id))?.name, "Hari G.");

  // MASTER_SPEC.md §4: STAFF may "view/create/update customers" — deletion is
  // not among the STAFF capabilities, so it is OWNER-only.
  await expectRejection(
    softDeleteCustomer(staff.id, business.id, created.id),
    "BusinessAuthorizationError",
  );

  const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.deletedAt, null, "a denied delete must not modify the row");
});

test("a browser-supplied businessId cannot switch tenant context for customer operations", async () => {
  const actor = await createUser();
  await createBusinessWithOwner(actor.id, "Actor Business");
  const otherOwner = await createUser();
  const otherBusiness = await createBusinessWithOwner(otherOwner.id, "Other Business");
  const otherCustomer = await customerRow(otherBusiness.id, { name: "Other Tenant Customer" });

  // The actor is a member of their own business but supplies the other
  // business's id — every entry point must fail closed. requireMembership
  // reports the same BusinessNotFoundError for "no such business" and "not a
  // member", so this cannot be used to probe which ids exist.
  await expectRejection(listCustomers(actor.id, otherBusiness.id, {}), "BusinessNotFoundError");
  await expectRejection(
    getCustomer(actor.id, otherBusiness.id, otherCustomer.id),
    "BusinessNotFoundError",
  );
  await expectRejection(createCustomer(actor.id, otherBusiness.id, input()), "BusinessNotFoundError");
  await expectRejection(
    updateCustomer(actor.id, otherBusiness.id, otherCustomer.id, input()),
    "BusinessNotFoundError",
  );
  await expectRejection(
    softDeleteCustomer(actor.id, otherBusiness.id, otherCustomer.id),
    "BusinessNotFoundError",
  );

  const untouched = await prisma.customer.findUniqueOrThrow({ where: { id: otherCustomer.id } });
  assert.equal(untouched.name, "Other Tenant Customer");
  assert.equal(untouched.deletedAt, null);
});

test("a customer id from another tenant cannot be used with this businessId", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  const customerA = await customerRow(businessA.id, { name: "A Only" });
  const customerB = await customerRow(businessB.id, { name: "B Only" });

  // Reading B's customer while scoped to A: indistinguishable from "no such
  // customer" (the single CustomerNotFoundError condition).
  assert.equal(await getCustomer(ownerA.id, businessA.id, customerB.id), null);

  await expectRejection(
    updateCustomer(ownerA.id, businessA.id, customerB.id, input()),
    "CustomerNotFoundError",
  );
  await expectRejection(
    softDeleteCustomer(ownerA.id, businessA.id, customerB.id),
    "CustomerNotFoundError",
  );

  // And A's own customer id is not reachable through B's businessId.
  await expectRejection(
    getCustomer(ownerA.id, businessB.id, customerA.id),
    "BusinessNotFoundError",
  );

  const stillB = await prisma.customer.findUniqueOrThrow({ where: { id: customerB.id } });
  assert.equal(stillB.name, "B Only");
  assert.equal(stillB.deletedAt, null);

  const stillA = await prisma.customer.findUniqueOrThrow({ where: { id: customerA.id } });
  assert.equal(stillA.name, "A Only");
  assert.equal(stillA.deletedAt, null);
});

test("a customer mutation by an actor whose membership is gone is rejected", async () => {
  const owner = await createUser();
  const staff = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Removed Member");
  const staffMember = await addMember(business.id, staff.id, "STAFF");
  const created = await createCustomer(owner.id, business.id, input({ name: "Ram Sharma" }));

  await prisma.businessMember.delete({ where: { id: staffMember.id } });

  await expectRejection(
    createCustomer(staff.id, business.id, input()),
    "BusinessNotFoundError",
  );
  await expectRejection(
    updateCustomer(staff.id, business.id, created.id, input({ name: "Changed" })),
    "BusinessNotFoundError",
  );
  await expectRejection(
    softDeleteCustomer(staff.id, business.id, created.id),
    "BusinessNotFoundError",
  );

  const row = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.name, "Ram Sharma");
  assert.equal(row.deletedAt, null);
});

test("soft-deleted customers are hidden from list, view and search but their row is preserved", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Soft Delete");

  const kept = await createCustomer(owner.id, business.id, input({ name: "Sita Thapa" }));
  const removed = await createCustomer(
    owner.id,
    business.id,
    input({ name: "Unique Deleted Name", phone: "9805555555" }),
  );

  await softDeleteCustomer(owner.id, business.id, removed.id);

  assert.equal((await listCustomers(owner.id, business.id, {})).total, 1);
  assert.equal(await getCustomer(owner.id, business.id, removed.id), null);
  assert.equal((await listCustomers(owner.id, business.id, { query: "Unique Deleted" })).total, 0);
  assert.equal((await listCustomers(owner.id, business.id, { query: "9805555555" })).total, 0);

  // The row still exists with deletedAt set, so a future order can keep its
  // customer reference (docs/database.md DB-003).
  const row = await prisma.customer.findUniqueOrThrow({ where: { id: removed.id } });
  assert.equal(row.name, "Unique Deleted Name");
  assert.ok(row.deletedAt instanceof Date);

  // A soft-deleted customer cannot be updated or deleted again.
  await expectRejection(
    updateCustomer(owner.id, business.id, removed.id, input({ name: "Resurrected" })),
    "CustomerNotFoundError",
  );
  await expectRejection(
    softDeleteCustomer(owner.id, business.id, removed.id),
    "CustomerNotFoundError",
  );

  // The other customer is untouched.
  assert.equal((await getCustomer(owner.id, business.id, kept.id))?.name, "Sita Thapa");
});

test("customer search matches name case-insensitively and phone, within the tenant only", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Search Tenant");
  const otherOwner = await createUser();
  const otherBusiness = await createBusinessWithOwner(otherOwner.id, "Search Other Tenant");

  await createCustomer(owner.id, business.id, input({ name: "Ram Sharma", phone: "9800000001" }));
  await createCustomer(owner.id, business.id, input({ name: "Sita Thapa", phone: "9812345678" }));
  // Identical name and phone in another tenant: must never appear in results.
  await createCustomer(
    otherOwner.id,
    otherBusiness.id,
    input({ name: "Ram Sharma", phone: "9800000001" }),
  );

  const byName = await listCustomers(owner.id, business.id, { query: "ram" });
  assert.equal(byName.total, 1);
  assert.equal(byName.customers[0]?.name, "Ram Sharma");

  const byNameUpper = await listCustomers(owner.id, business.id, { query: "RAM" });
  assert.equal(byNameUpper.total, 1);

  const byPhone = await listCustomers(owner.id, business.id, { query: "9812" });
  assert.equal(byPhone.total, 1);
  assert.equal(byPhone.customers[0]?.name, "Sita Thapa");

  const noMatches = await listCustomers(owner.id, business.id, { query: "no-such-customer" });
  assert.equal(noMatches.total, 0);
  assert.deepEqual(noMatches.customers, []);
});

test("customer search treats LIKE metacharacters as literal text", async () => {
  // M3 audit F1: `%`, `_` and `\` are LIKE metacharacters with no escape
  // option in Prisma's `contains`, so the search term must be escaped or "%%"
  // style input silently matches unrelated rows.
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Literal Search");

  await customerRow(business.id, { name: "Percent", phone: "A%b" });
  await customerRow(business.id, { name: "Underscore", phone: "A_b" });
  await customerRow(business.id, { name: "Ordinary", phone: "Axb" });
  await customerRow(business.id, { name: "Plain", phone: "plain" });
  await customerRow(business.id, { name: "Backslash", phone: "A\\B" });

  const percent = await listCustomers(owner.id, business.id, { query: "%" });
  assert.equal(percent.total, 1, "% must match only a literal percent sign");
  assert.equal(percent.customers[0]?.phone, "A%b");

  const underscore = await listCustomers(owner.id, business.id, { query: "_" });
  assert.equal(underscore.total, 1, "_ must match only a literal underscore");
  assert.equal(underscore.customers[0]?.phone, "A_b");

  const mixedPercent = await listCustomers(owner.id, business.id, { query: "A%b" });
  assert.equal(mixedPercent.total, 1, "% must not act as a wildcard inside a term");
  assert.equal(mixedPercent.customers[0]?.phone, "A%b");

  const mixedUnderscore = await listCustomers(owner.id, business.id, { query: "A_b" });
  assert.equal(mixedUnderscore.total, 1, "_ must not act as a wildcard inside a term");
  assert.equal(mixedUnderscore.customers[0]?.phone, "A_b");

  const backslash = await listCustomers(owner.id, business.id, { query: "A\\B" });
  assert.equal(backslash.total, 1, "a backslash must match only a literal backslash");
  assert.equal(backslash.customers[0]?.phone, "A\\B");

  // Ordinary text and case-insensitive name matching are unchanged.
  const ordinary = await listCustomers(owner.id, business.id, { query: "Axb" });
  assert.equal(ordinary.total, 1);
  assert.equal(ordinary.customers[0]?.phone, "Axb");

  const insensitive = await listCustomers(owner.id, business.id, { query: "percent" });
  assert.equal(insensitive.total, 1);
  assert.equal(insensitive.customers[0]?.name, "Percent");

  // Tenant scoping is unchanged: an identical phone in another business is
  // never returned, escaped search term or not.
  const otherOwner = await createUser();
  const otherBusiness = await createBusinessWithOwner(otherOwner.id, "Other Literal Tenant");
  await customerRow(otherBusiness.id, { name: "Foreign", phone: "A%b" });

  const scoped = await listCustomers(owner.id, business.id, { query: "A%b" });
  assert.equal(scoped.total, 1);
  assert.equal(scoped.customers[0]?.name, "Percent");
});

test("the customer list is paginated and reports a bounded page size", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Pagination");
  const total = CUSTOMER_PAGE_SIZE + 5;

  await prisma.customer.createMany({
    data: Array.from({ length: total }, (_unused, index) => ({
      businessId: business.id,
      name: `Customer ${String(index).padStart(3, "0")}`,
      phone: `98000${String(index).padStart(5, "0")}`,
    })),
  });

  const page1 = await listCustomers(owner.id, business.id, { page: 1 });
  assert.equal(page1.total, total);
  assert.equal(page1.page, 1);
  assert.equal(page1.pageSize, CUSTOMER_PAGE_SIZE);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.customers.length, CUSTOMER_PAGE_SIZE);

  const page2 = await listCustomers(owner.id, business.id, { page: 2 });
  assert.equal(page2.customers.length, 5);

  const seen = new Set([...page1.customers, ...page2.customers].map((customer) => customer.id));
  assert.equal(seen.size, total, "pages must not overlap");

  const pastEnd = await listCustomers(owner.id, business.id, { page: 99 });
  assert.deepEqual(pastEnd.customers, []);
  assert.equal(pastEnd.total, total);

  // Page 0 and negatives are normalized by the service rather than rejected.
  const pageZero = await listCustomers(owner.id, business.id, { page: 0 });
  assert.equal(pageZero.page, 1);
  assert.equal(pageZero.customers.length, CUSTOMER_PAGE_SIZE);
});

test("an out-of-range page number cannot produce a raw Prisma error", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Page Bounds");
  await customerRow(business.id, { name: "Bounded" });

  // Regression (M3 audit F2): accepting 1e21 as a page produced
  // `skip = (1e21 - 1) * 20`, which overflowed the range Prisma/PostgreSQL
  // accept and surfaced as an unhandled PrismaClientValidationError during a
  // Server Component render. The service must clamp, not throw.
  const huge = await listCustomers(owner.id, business.id, { page: 1e21 });
  assert.equal(huge.page, 1);
  assert.equal(huge.total, 1);
  assert.equal(huge.customers.length, 1);

  const beyondMax = await listCustomers(owner.id, business.id, {
    page: CUSTOMER_PAGE_MAX + 1,
  });
  assert.equal(beyondMax.page, 1);

  // The largest permitted page still reports the real total, with no rows.
  const lastAllowed = await listCustomers(owner.id, business.id, { page: CUSTOMER_PAGE_MAX });
  assert.equal(lastAllowed.page, CUSTOMER_PAGE_MAX);
  assert.deepEqual(lastAllowed.customers, []);
  assert.equal(lastAllowed.total, 1);
});

test("softDeleteCustomer blocks on the OWNER-row lock and re-reads authorization after a concurrent demotion", async () => {
  const actor = await createUser();
  const business = await createBusinessWithOwner(actor.id, "Locked Delete");
  const otherOwner = await createUser();
  await addMember(business.id, otherOwner.id, "OWNER");

  const actorMember = business.members.find((member) => member.userId === actor.id);
  assert.ok(actorMember);
  const customer = await customerRow(business.id, { name: "Lock Target" });

  let signalLockAcquired!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    signalLockAcquired = resolve;
  });
  let releaseLock!: () => void;
  const lockReleased = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // A transaction that holds the OWNER-row lock and then demotes the actor
  // before committing. While it is open, softDeleteCustomer cannot acquire the
  // lock, so the demotion necessarily commits first and the delete must
  // re-read (and reject) the actor's role afterwards.
  const blocker = prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, business.id);
    signalLockAcquired();
    await lockReleased;
    await tx.businessMember.update({ where: { id: actorMember.id }, data: { role: "STAFF" } });
  });

  await lockAcquired;

  const outcome = softDeleteCustomer(actor.id, business.id, customer.id).then(
    () => ({ ok: true as const, error: undefined as unknown }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  // The delete holds no OWNER-row lock yet, so it cannot settle while the
  // blocker is open (the assertion cannot spuriously pass as "settled").
  const settledWhileLocked = await Promise.race([
    outcome.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
  ]);
  assert.equal(settledWhileLocked, false, "softDeleteCustomer should block on the OWNER-row lock");

  releaseLock();
  await blocker;

  const result = await outcome;
  assert.equal(result.ok, false, "the delete should be rejected after the actor was demoted");
  assert.ok(
    result.error instanceof BusinessAuthorizationError,
    `expected BusinessAuthorizationError, got ${(result.error as Error).name}`,
  );

  const row = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
  assert.equal(row.deletedAt, null, "a denied delete must not modify the row");
});
