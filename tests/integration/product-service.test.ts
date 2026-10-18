import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type { CreateProductInput } from "../../src/lib/validation/product.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { BusinessAuthorizationError, BusinessNotFoundError } from "../../src/server/business/errors.ts";
import { ProductNotFoundError } from "../../src/server/product/errors.ts";
import {
  createProduct,
  getProduct,
  listProducts,
  softDeleteProduct,
  updateProduct,
} from "../../src/server/product/product-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// M4 product service tests against PostgreSQL (dedicated `_test` database).
// MASTER_SPEC.md §4: STAFF may only VIEW products — every product mutation is
// OWNER-only. §5: tenant scoping is enforced by the service, not the caller.

function input(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    name: "Chocolate Cake",
    description: undefined,
    price: "1800",
    active: true,
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

/** Alias used inside tests for readability. */
const ProductNotFoundErrorName = ProductNotFoundError.name;

before(async () => {
  assertDedicatedTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await disconnectDatabase();
});

/** Insert a product row directly, bypassing the service (cross-tenant fixture). */
async function productRow(
  businessId: string,
  overrides: { name?: string; price?: string; active?: boolean } = {},
) {
  await prisma.product.create({
    data: {
      businessId,
      name: overrides.name ?? "Fixture Product",
      price: overrides.price ?? "100.00",
      active: overrides.active ?? false,
    },
  });
}

test("the owner can create a product and it appears in the list", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Owner Products");

  const created = await createProduct(owner.id, business.id, input({
    name: "Red Velvet Cake",
    price: "1800.5",
    description: "Rich red cake",
    active: true,
  }));

  assert.equal(created.name, "Red Velvet Cake");
  // Trimming is a validation-boundary responsibility (z.string().trim() in
  // src/lib/validation/product.ts); the service receives validated input, as
  // with customers. DEC-006: the price leaves the service as a string with
  // exactly 2 decimals, never a JavaScript number.
  assert.equal(typeof created.price, "string");
  assert.equal(created.price, "1800.50");
  assert.equal(created.description, "Rich red cake");
  assert.equal(created.active, true);

  const list = await listProducts(owner.id, business.id);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, created.id);
  assert.equal(list[0]?.price, "1800.50");
  assert.equal(list[0]?.active, true);
});

test("STAFF can view products but cannot create, update, or delete them", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Staff Products");
  const staff = await createUser();
  await addMember(business.id, staff.id, "STAFF");

  // VIEW (OWNER or STAFF) works.
  const staffList = await listProducts(staff.id, business.id);
  assert.equal(staffList.length, 0);
  await productRow(business.id, { name: "Viewable", price: "10.00" });
  const staffListWithRows = await listProducts(staff.id, business.id);
  assert.equal(staffListWithRows.length, 1);
  const staffView = await getProduct(staff.id, business.id, staffListWithRows[0]?.id ?? "");
  assert.equal(staffView?.name, "Viewable");

  // CREATE rejected.
  await expectRejection(
    createProduct(staff.id, business.id, input({ name: "Staff Product", price: "20.00" })),
    BusinessAuthorizationError.name,
  );

  // UPDATE rejected.
  const productId = staffListWithRows[0]?.id ?? "";
  await expectRejection(
    updateProduct(staff.id, business.id, productId, input({ name: "Hacked", price: "1.00", active: false })),
    BusinessAuthorizationError.name,
  );

  // SOFT DELETE rejected.
  await expectRejection(
    softDeleteProduct(staff.id, business.id, productId),
    BusinessAuthorizationError.name,
  );

  // Nothing changed server-side despite the STAFF attempts.
  const unchanged = await getProduct(owner.id, business.id, productId);
  assert.equal(unchanged?.name, "Viewable");
  assert.equal(unchanged?.active, false);
});

test("products are tenant-scoped on every operation", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  await productRow(businessA.id, { name: "A Only" });
  const listB = await listProducts(ownerB.id, businessB.id);
  assert.equal(listB.length, 0);

  const listA = await listProducts(ownerA.id, businessA.id);
  assert.equal(listA.length, 1);
  const productIdA = listA[0]?.id ?? "";

  await expectRejection(
    // Business B's owner cannot read, update, or delete business A's product.
    updateProduct(ownerB.id, businessB.id, productIdA, input({ name: "Moved", price: "1.00" })),
    ProductNotFoundErrorName,
  );
  await expectRejection(
    softDeleteProduct(ownerB.id, businessB.id, productIdA),
    ProductNotFoundErrorName,
  );

  await expectRejection(
    // A non-member gets the membership not-found error, not a product result.
    listProducts((await createUser()).id, businessA.id),
    BusinessNotFoundError.name,
  );

  // The row is untouched.
  const untouched = await getProduct(ownerA.id, businessA.id, productIdA);
  assert.equal(untouched?.name, "A Only");

  // A foreign id resolves to null with a valid membership (no existence leak).
  const missing = await getProduct(ownerA.id, businessA.id, "nonexistent-id");
  assert.equal(missing, null);
});

test("update replaces every editable field and price keeps exact decimal scale", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Update Products");
  const created = await createProduct(owner.id, business.id, input({
    description: "Original",
    price: "700.25",
  }));

  const updated = await updateProduct(owner.id, business.id, created.id, input({
    name: "Birthday Box",
    description: undefined, // full replacement: clearing an optional field works
    price: "0.05",
    active: false,
  }));

  assert.equal(updated.name, "Birthday Box");
  assert.equal(updated.description, null);
  assert.equal(updated.price, "0.05"); // no float artifacts (DEC-006)
  assert.equal(updated.active, false);

  const reread = await getProduct(owner.id, business.id, created.id);
  assert.equal(reread?.price, "0.05");
  assert.equal(reread?.active, false);
});

test("inactive products stay listed but are flagged inactive", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Mix Products");

  await createProduct(owner.id, business.id, input({ name: "Active Cake", price: "10.00", active: true }));
  await createProduct(owner.id, business.id, input({ name: "Retired Cake", price: "20.00", active: false }));

  const list = await listProducts(owner.id, business.id);
  assert.equal(list.length, 2);
  // Ordering: active first, then name.
  assert.equal(list[0]?.name, "Active Cake");
  assert.equal(list[1]?.name, "Retired Cake");
  assert.equal(list[1]?.active, false);
});

test("soft delete is OWNER-only, hides the product, and is not physical", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Delete Products");
  const created = await createProduct(owner.id, business.id, input({ price: "2200" }));

  await softDeleteProduct(owner.id, business.id, created.id);

  // Hidden from list and lookup.
  const list = await listProducts(owner.id, business.id);
  assert.equal(list.length, 0);
  const lookup = await getProduct(owner.id, business.id, created.id);
  assert.equal(lookup, null);

  // The row survives physically with a deletedAt timestamp (soft delete).
  const row = await prisma.product.findUnique({ where: { id: created.id } });
  assert.ok(row, "deleted product row must physically remain");
  assert.ok(row.deletedAt instanceof Date);

  // Deleting again resolves to the same not-found condition.
  await expectRejection(
    softDeleteProduct(owner.id, business.id, created.id),
    ProductNotFoundErrorName,
  );
});
