import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type { CreateOrderInput, UpdateOrderInput } from "../../src/lib/validation/order.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { BusinessNotFoundError } from "../../src/server/business/errors.ts";
import { CustomerNotFoundError } from "../../src/server/customer/errors.ts";
import {
  DeliveryFieldError,
  InvalidOrderTotalsError,
  OrderNotFoundError,
  ProductUnavailableError,
} from "../../src/server/order/errors.ts";
import {
  createOrder,
  getOrder,
  listCustomerOrders,
  listOrders,
  updateOrder,
} from "../../src/server/order/order-service.ts";
import { createProduct, softDeleteProduct } from "../../src/server/product/product-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// M5 order service tests against PostgreSQL (dedicated `_test` database).
// MASTER_SPEC.md §4: STAFF may view/create/update orders (status changes are
// an M6 concern), so order create/edit requires membership only — no OWNER
// lock; there is no order-deletion path in the approved model. §5: tenant
// scoping is enforced by the service, not the caller. docs/database.md §7:
// the creation transaction writes the order, its items, the tracking token
// and the initial status history atomically — any failure rolls back. §10:
// item lines snapshot the product NAME and CURRENT price server-side.
// Money: DEC-006 + AMB-001 (resolved 2026-10-18) — totals are exact decimal
// strings, total = subtotal + deliveryFee − discount, rejected not clamped.

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

async function expectRejection(promise: Promise<unknown>, errorName: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(
      error instanceof Error && error.name === errorName,
      `expected ${errorName}, got ${(error as Error | undefined)?.name}: ${(error as Error | undefined)?.message}`,
    );
    return true;
  });
}

const OrderNotFoundErrorName = OrderNotFoundError.name;
const ProductUnavailableErrorName = ProductUnavailableError.name;
const InvalidOrderTotalsErrorName = InvalidOrderTotalsError.name;

before(async () => {
  assertDedicatedTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await disconnectDatabase();
});

test("createOrder writes the order, items, token and initial history atomically", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Order Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Chocolate Cake",
    description: undefined,
    price: "1800.50",
    active: true,
  });

  const created = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [
      { productId: product.id, quantity: 2 },
    ],
    deliveryFee: "100",
    discount: "10.25",
  }));

  assert.match(created.orderNumber, /^ORD-\d+$/);
  assert.ok(created.publicTrackingToken.length >= 32);
  assert.equal(created.status, "PENDING");

  const detail = await getOrder(owner.id, business.id, created.id);
  assert.ok(detail);
  // 1800.50 × 2 + 100 − 10.25 → exact string, no float artifacts.
  assert.equal(detail.subtotal, "3601.00");
  assert.equal(detail.total, "3690.75");
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0]?.productNameSnapshot, "Chocolate Cake");
  assert.equal(detail.items[0]?.unitPrice, "1800.50");
  assert.equal(detail.items[0]?.quantity, 2);
  assert.equal(detail.items[0]?.subtotal, "3601.00");

  const history = await prisma.orderStatusHistory.findMany({
    where: { orderId: created.id },
  });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.oldStatus, null);
  assert.equal(history[0]?.newStatus, "PENDING");
  assert.equal(history[0]?.changedBy, owner.id);
});

test("order numbers are allocated per business through the DEC-007(a) counter", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Sequence Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ram Sharma", phone: "9800000001" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Red Velvet", description: undefined, price: "700", active: true,
  });

  const first = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));
  const second = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));

  assert.equal(first.orderNumber, "ORD-1001");
  assert.equal(second.orderNumber, "ORD-1002");

  // The counter is per business: another tenant's first order independently
  // starts its own sequence.
  const otherOwner = await createUser();
  const otherBusiness = await createBusinessWithOwner(otherOwner.id, "Other Sequence Co");
  const otherCustomer = await prisma.customer.create({
    data: { businessId: otherBusiness.id, name: "Hari Gurung", phone: "9800000002" },
  });
  const otherProduct = await createProduct(otherOwner.id, otherBusiness.id, {
    name: "Birthday Box", description: undefined, price: "800", active: true,
  });
  const otherFirst = await createOrder(otherOwner.id, otherBusiness.id, orderInput({
    customerId: otherCustomer.id,
    items: [{ productId: otherProduct.id, quantity: 1 }],
  }));
  assert.equal(otherFirst.orderNumber, "ORD-1001");
});

test("tracking tokens are globally unique and stored raw", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Token Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Cake", description: undefined, price: "500", active: true,
  });

  const first = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));
  const second = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));

  assert.notEqual(first.publicTrackingToken, second.publicTrackingToken);
  const stored = await prisma.order.findUnique({
    where: { publicTrackingToken: first.publicTrackingToken },
    select: { id: true },
  });
  assert.equal(stored?.id, first.id);
});

test("STAFF can create orders but cannot exceed view-only product rules", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Staff Order Co");
  await addMember(business.id, (await createUser()).id, "STAFF");
  const staffMembership = await prisma.businessMember.findFirstOrThrow({
    where: { businessId: business.id, role: "STAFF" },
    select: { userId: true },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const active = await createProduct(owner.id, business.id, {
    name: "Active Cake", description: undefined, price: "700", active: true,
  });
  const inactive = await createProduct(owner.id, business.id, {
    name: "Retired Cake", description: undefined, price: "700", active: false,
  });

  // STAFF create works (§4: view/create/update orders).
  const staffCreated = await createOrder(staffMembership.userId, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: active.id, quantity: 1 }],
    deliveryType: "PICKUP",
    deliveryName: undefined,
    deliveryPhone: undefined,
    deliveryAddress: undefined,
  }));
  const staffDetail = await getOrder(staffMembership.userId, business.id, staffCreated.id);
  assert.equal(staffDetail?.deliveryName, "Sita Thapa");
  assert.equal(staffDetail?.deliveryPhone, "9811111111");
  assert.equal(staffDetail?.deliveryAddress, "");

  // Inactive products cannot enter new orders (§8).
  await expectRejection(
    createOrder(staffMembership.userId, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: inactive.id, quantity: 1 }],
    })),
    ProductUnavailableErrorName,
  );
});

test("order rows stay tenant-scoped across every entry point", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");

  const customerA = await prisma.customer.create({
    data: { businessId: businessA.id, name: "A Customer", phone: "9800000011" },
  });
  const productA = await createProduct(ownerA.id, businessA.id, {
    name: "A Cake", description: undefined, price: "100", active: true,
  });
  const orderA = await createOrder(ownerA.id, businessA.id, orderInput({
    customerId: customerA.id,
    items: [{ productId: productA.id, quantity: 1 }],
  }));

  // Tenant B sees nothing from A; every entry point treats A's ids as
  // not-found or denies the member relationship.
  assert.equal(await getOrder(ownerB.id, businessB.id, orderA.id), null);
  assert.deepEqual((await listOrders(ownerB.id, businessB.id)).orders, []);
  await expectRejection(
    updateOrder(ownerB.id, businessB.id, orderA.id, {
      items: [{ productId: productA.id, quantity: 1 }],
      deliveryType: "DELIVERY",
      deliveryName: "Evil",
      deliveryPhone: "000",
      deliveryAddress: "Nowhere",
      discount: "0",
      deliveryFee: "0",
      paymentStatus: "UNPAID",
    } as UpdateOrderInput),
    OrderNotFoundErrorName,
  );

  // A non-member cannot even list.
  await expectRejection(
    listOrders((await createUser()).id, businessA.id),
    BusinessNotFoundError.name,
  );
});

test("updateOrder replaces items, money and delivery info exactly", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Update Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const cake = await createProduct(owner.id, business.id, {
    name: "Chocolate Cake", description: undefined, price: "1800.50", active: true,
  });
  const box = await createProduct(owner.id, business.id, {
    name: "Birthday Box", description: undefined, price: "700", active: true,
  });

  const created = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: cake.id, quantity: 1 }],
  }));

  await updateOrder(owner.id, business.id, created.id, {
    items: [
      { productId: cake.id, quantity: 2 },
      { productId: box.id, quantity: 3 },
    ],
    deliveryType: "PICKUP",
    deliveryName: undefined,
    deliveryPhone: undefined,
    deliveryAddress: undefined,
    discount: "50",
    deliveryFee: "0",
    estimatedDeliveryAt: undefined,
    paymentStatus: "PAID",
    notes: "Collect before 5pm",
  });

  const detail = await getOrder(owner.id, business.id, created.id);
  assert.ok(detail);
  // 2×1800.50 + 3×700 = 5701.00; +0 −50 → 5651.00
  assert.equal(detail.subtotal, "5701.00");
  assert.equal(detail.total, "5651.00");
  assert.equal(detail.deliveryType, "PICKUP");
  assert.equal(detail.deliveryName, "Sita Thapa");
  assert.equal(detail.deliveryAddress, "");
  assert.equal(detail.paymentStatus, "PAID");
  assert.equal(detail.notes, "Collect before 5pm");
  assert.deepEqual(
    detail.items.map((item) => [item.productNameSnapshot, item.subtotal]),
    [["Chocolate Cake", "3601.00"], ["Birthday Box", "2100.00"]],
  );

  // Full replacement: the old single line is gone.
  const storedItems = await prisma.orderItem.findMany({
    where: { orderId: created.id },
    orderBy: { productNameSnapshot: "asc" },
  });
  assert.equal(storedItems.length, 2);
});

test("soft-deleted products disappear from new orders but old snapshots survive", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Snapshot Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ram Sharma", phone: "9800000001" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Limited Cake", description: undefined, price: "999.99", active: true,
  });

  const created = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));

  await softDeleteProduct(owner.id, business.id, product.id);

  // New orders: unacceptable.
  await expectRejection(
    createOrder(owner.id, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    })),
    ProductUnavailableErrorName,
  );

  // Historical order keeps the snapshot (§10 and DB-003).
  const detail = await getOrder(owner.id, business.id, created.id);
  assert.ok(detail);
  assert.equal(detail.items[0]?.productNameSnapshot, "Limited Cake");
  assert.equal(detail.items[0]?.unitPrice, "999.99");
});

test("cross-tenant customer and product references are rejected like not-found", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Cross A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Cross B");

  const productB = await createProduct(ownerB.id, businessB.id, {
    name: "B Cake", description: undefined, price: "500", active: true,
  });
  const customerB = await prisma.customer.create({
    data: { businessId: businessB.id, name: "B Customer", phone: "9800000022" },
  });

  // Foreign product id behaves exactly like an unavailable one (checked
  // before the customer lookup, so pass a valid-in-A customer id).
  const customerA = await prisma.customer.create({
    data: { businessId: businessA.id, name: "A Customer", phone: "9800000011" },
  });
  await expectRejection(
    createOrder(ownerA.id, businessA.id, orderInput({
      customerId: customerA.id,
      items: [{ productId: productB.id, quantity: 1 }],
    })),
    ProductUnavailableErrorName,
  );

  // Foreign customer id: CustomerNotFoundError (mapped to the same safe
  // message as a soft-deleted one — no cross-tenant existence leak).
  await expectRejection(
    createOrder(ownerA.id, businessA.id, orderInput({
      customerId: customerB.id,
      items: [],
    })),
    CustomerNotFoundError.name,
  );
});

test("an invalid total is rejected, never clamped (AMB-001)", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Totals Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ram Sharma", phone: "9800000001" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Cheap Cake", description: undefined, price: "10", active: true,
  });

  await expectRejection(
    createOrder(owner.id, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      discount: "10.01",
      deliveryFee: "0",
    })),
    InvalidOrderTotalsErrorName,
  );

  // Exactly zero total is fine.
  const zero = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
    discount: "10",
    deliveryFee: "0",
  }));
  const zeroDetail = await getOrder(owner.id, business.id, zero.id);
  assert.equal(zeroDetail?.total, "0.00");
});

test("missing delivery recipient fields on a DELIVERY order is a clean domain error", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Delivery Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ram Sharma", phone: "9800000001" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Cake", description: undefined, price: "500", active: true,
  });

  await expectRejection(
    createOrder(owner.id, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      deliveryName: undefined,
    })),
    DeliveryFieldError.name,
  );

  await expectRejection(
    createOrder(owner.id, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
      deliveryAddress: "",
    })),
    DeliveryFieldError.name,
  );
});

test("rollback restores nothing when any write in the creation transaction fails", async () => {  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Rollback Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Ram Sharma", phone: "9800000001" },
  });

  // An empty product id array already fails validation upstream — instead
  // drive an in-transaction failure via a foreign product (ProductUnavailable)
  // and confirm no order, sequence, or history rows leaked.
  const before = await prisma.order.count({ where: { businessId: business.id } });
  await expectRejection(
    createOrder(owner.id, business.id, orderInput({
      customerId: customer.id,
      items: [{ productId: "missing", quantity: 1 }],
    })),
    ProductUnavailableErrorName,
  );
  const after = await prisma.order.count({ where: { businessId: business.id } });
  assert.equal(after, before);
  assert.equal(await prisma.orderStatusHistory.count(), 0);
  // The sequence counter is rolled back too: the first successful order
  // after the failed one still gets the first number of the sequence.
  const product = await createProduct(owner.id, business.id, {
    name: "Cake", description: undefined, price: "500", active: true,
  });
  const retry = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
  }));
  assert.equal(retry.orderNumber, "ORD-1001");
});

test("listCustomerOrders returns a tenant-safe, newest-first history", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "History Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Cake", description: undefined, price: "500", active: true,
  });

  const first = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 1 }],
    deliveryFee: "0",
  }));
  const second = await createOrder(owner.id, business.id, orderInput({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 2 }],
    deliveryFee: "0",
  }));

  const history = await listCustomerOrders(owner.id, business.id, customer.id);
  assert.equal(history.length, 2);
  assert.deepEqual(
    history.map((order) => order.orderNumber),
    [second.orderNumber, first.orderNumber],
  );
  assert.equal(history[1]?.total, "500.00");

  // Cross-tenant customerId is indistinguishable from soft-deleted.
  const otherBusiness = await createBusinessWithOwner((await createUser()).id, "Other Co");
  await expectRejection(
    listCustomerOrders(owner.id, business.id, (await prisma.customer.create({
      data: { businessId: otherBusiness.id, name: "Foreign", phone: "000" },
    })).id),
    CustomerNotFoundError.name,
  );

  // A deleted customer's history is not reachable either (soft-delete
  // preserves rows but the profile entry points treat them as gone).
  await expectRejection(
    listCustomerOrders(owner.id, business.id, "nonexistent"),
    CustomerNotFoundError.name,
  );
});
