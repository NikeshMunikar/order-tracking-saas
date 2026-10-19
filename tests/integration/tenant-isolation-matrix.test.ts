import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type { CreateOrderInput } from "../../src/lib/validation/order.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { BusinessNotFoundError } from "../../src/server/business/errors.ts";
import { CustomerNotFoundError } from "../../src/server/customer/errors.ts";
import { createCustomer } from "../../src/server/customer/customer-service.ts";
import { OrderNotFoundError } from "../../src/server/order/errors.ts";
import {
  createOrder,
  getDashboardSummary,
  getOrder,
  listCustomerOrders,
  listOrders,
  updateOrderStatus,
} from "../../src/server/order/order-service.ts";
import {
  createProduct,
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

// Milestone 9 (approved scope): consolidated negative cross-tenant and
// authorization regression coverage (docs/testing.md §5A). Most of the §5A
// bullets were already proven inside the per-service suites; this suite makes
// the mandatory contract explicit in one place and adds coverage that the
// per-service suites do not yet have: a cross-tenant order-status transition
// (the "Business A cannot delete Business B orders" analog in an MVP without
// order deletion) and the tenant/role gate matrix on the primary services.
// Per docs/testing.md §5A: authorization covers exactly OWNER and STAFF; no
// other business role exists.

function orderInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerId: "",
    items: [],
    deliveryType: "DELIVERY",
    deliveryName: "Ram Sharma",
    deliveryPhone: "9800000001",
    deliveryAddress: "Baneshwor, Kathmandu",
    discount: "0",
    deliveryFee: "100",
    estimatedDeliveryAt: undefined,
    paymentStatus: "UNPAID",
    notes: "",
    ...overrides,
  };
}

function customerInput(overrides: { name: string; phone: string }) {
  return {
    ...overrides,
    email: undefined,
    address: undefined,
    notes: undefined,
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

before(async () => {
  assertDedicatedTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await disconnectDatabase();
});

test("docs/testing.md §5A: business B cannot read, edit or transition business A's order", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  const customerA = await createCustomer(ownerA.id, businessA.id, customerInput({
    name: "A Customer",
    phone: "9800000001",
  }));
  const productA = await createProduct(ownerA.id, businessA.id, {
    name: "A Cake",
    description: undefined,
    price: "100",
    active: true,
  });
  const orderA = await createOrder(ownerA.id, businessA.id, orderInput({
    customerId: customerA.id,
    items: [{ productId: productA.id, quantity: 1 }],
  }));

  // Read: indistinguishable from "no such order".
  assert.equal(await getOrder(ownerB.id, businessB.id, orderA.id), null);
  assert.deepEqual((await listOrders(ownerB.id, businessB.id)).orders, []);

  // Update (the closest deletion analog is a status transition to CANCELLED):
  // must reject and leave the order exactly untouched — status unchanged,
  // exactly one (initial) history row, totals unchanged.
  const beforeRows = await prisma.orderStatusHistory.findMany({
    where: { orderId: orderA.id },
    select: { id: true },
  });
  await expectRejection(
    updateOrderStatus(ownerB.id, businessB.id, orderA.id, {
      status: "CANCELLED",
      note: "hostile cancel attempt",
    }),
    OrderNotFoundError.name,
  );

  const untouched = await prisma.order.findUniqueOrThrow({
    where: { id: orderA.id },
    select: { status: true, total: true },
  });
  assert.equal(untouched.status, "PENDING");
  assert.equal(untouched.total.toFixed(2), "200.00");
  const afterRows = await prisma.orderStatusHistory.findMany({
    where: { orderId: orderA.id },
    select: { id: true },
  });
  assert.equal(afterRows.length, beforeRows.length, "no history row may be appended");

  // And B's own tenant-scoped views never expose A's rows.
  assert.deepEqual((await listOrders(ownerB.id, businessB.id)).orders, []);
});

test("a member of another business cannot reach the order-status endpoint through their own businessId", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  const customerA = await createCustomer(ownerA.id, businessA.id, customerInput({
    name: "A Customer",
    phone: "9800000002",
  }));
  const orderA = await createOrder(ownerA.id, businessA.id, orderInput({
    customerId: customerA.id,
    items: [],
  }));

  // ownerB is a genuine member of businessB; supplying their own businessId
  // with A's order id must fail closed (requireMembership, then tenant-scope).
  await expectRejection(
    updateOrderStatus(ownerB.id, businessB.id, orderA.id, { status: "CANCELLED", note: undefined }),
    OrderNotFoundError.name,
  );

  // A non-member cannot read A's dashboard or B's customer history path.
  await expectRejection(
    getDashboardSummary(ownerB.id, businessA.id, new Date()),
    BusinessNotFoundError.name,
  );
  await expectRejection(
    listOrders(ownerB.id, businessA.id),
    BusinessNotFoundError.name,
  );
  await expectRejection(
    listCustomerOrders(ownerB.id, businessA.id, customerA.id),
    BusinessNotFoundError.name,
  );
});

test("a customerId from another tenant is treated like not-found on this business's history path", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  const customerB = await createCustomer(ownerB.id, businessB.id, customerInput({
    name: "B Customer",
    phone: "9800000003",
  }));

  // Scoped to A, B's customer id resolves to nothing (deletedAt-safe path).
  await expectRejection(
    listCustomerOrders(ownerA.id, businessA.id, customerB.id),
    CustomerNotFoundError.name,
  );
});

test("role gate matrix on the primary service endpoints stays exactly OWNER/STAFF", async () => {
  const owner = await createUser();
  const staff = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Gate Matrix");
  await addMember(business.id, staff.id, "STAFF");

  const customer = await createCustomer(staff.id, business.id, customerInput({
    name: "Gate Customer",
    phone: "9800000004",
  }));
  const order = await createOrder(staff.id, business.id, orderInput({
    customerId: customer.id,
    items: [],
  }));

  // STAFF may transition statuses (MASTER_SPEC §4)…
  await updateOrderStatus(staff.id, business.id, order.id, {
    status: "CONFIRMED",
    note: undefined,
  });

  // …but product mutation stays OWNER-only (§4).
  const product = await createProduct(owner.id, business.id, {
    name: "Gate Product",
    description: undefined,
    price: "50",
    active: true,
  });
  await expectRejection(
    updateProduct(staff.id, business.id, product.id, {
      name: "Renamed",
      price: "60",
      active: true,
      description: undefined,
    }),
    "BusinessAuthorizationError",
  );
  await expectRejection(
    softDeleteProduct(staff.id, business.id, product.id),
    "BusinessAuthorizationError",
  );

  const untouched = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    select: { name: true, deletedAt: true },
  });
  assert.equal(untouched.name, "Gate Product");
  assert.equal(untouched.deletedAt, null);
});
