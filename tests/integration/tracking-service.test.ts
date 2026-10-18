import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { prisma } from "../../src/lib/db/client.ts";
import type { CreateOrderInput } from "../../src/lib/validation/order.ts";
import { createOrder, updateOrderStatus } from "../../src/server/order/order-service.ts";
import { createProduct } from "../../src/server/product/product-service.ts";
import { getPublicTrackingOrder } from "../../src/server/tracking/tracking-service.ts";
import {
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// M7 public tracking read model against PostgreSQL (dedicated `_test` db).
//
// MASTER_SPEC §15/§16 + docs/security.md SEC-004/SEC-006/§7: the public
// tracking page is a separate unauthenticated trust boundary whose response is
// a deliberate DTO. These tests pin the approved surface (business identity,
// order number, items, totals, status/timeline, delivery/pickup information)
// and, just as importantly, the exclusions: no internal ids, no customer
// email or customer notes, no internal order/history notes, no staff identity,
// and no token echo. A malformed and an unknown token must be indistinguishable.

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

before(async () => {
  assertDedicatedTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await disconnectDatabase();
});

async function setupTrackedOrder(
  businessName = "Kathmandu Bakery",
  productName = "Chocolate Cake",
  customerName = "Sita Thapa",
) {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, businessName);
  await prisma.business.update({
    where: { id: business.id },
    data: { phone: "9801111222", address: "Thamel, Kathmandu", currency: "NPR" },
  });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: customerName,
      phone: "9811111111",
      email: "sita.canary@example.com",
      notes: "customer-internal-note-canary",
    },
  });

  const product = await createProduct(owner.id, business.id, {
    name: productName,
    description: undefined,
    price: "1800.50",
    active: true,
  });

  const order = await createOrder(
    owner.id,
    business.id,
    orderInput({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      discount: "50",
      deliveryFee: "100",
      notes: "order-internal-note-canary",
    }),
  );

  return { owner, business, customer, product, order };
}

test("getPublicTrackingOrder returns the approved customer-facing projection", async () => {
  const { order } = await setupTrackedOrder();

  const tracking = await getPublicTrackingOrder(order.publicTrackingToken);
  assert.ok(tracking, "a valid token must resolve");

  // Business identity and basic contact information (§16 / §10).
  assert.equal(tracking.business.name, "Kathmandu Bakery");
  assert.equal(tracking.business.currency, "NPR");
  assert.equal(tracking.business.phone, "9801111222");
  assert.equal(tracking.business.address, "Thamel, Kathmandu");
  assert.equal(tracking.business.logoUrl, null);

  // Order summary: number, status, DEC-006 decimal strings, snapshots.
  assert.equal(tracking.order.orderNumber, order.orderNumber);
  assert.match(tracking.order.orderNumber, /^ORD-\d+$/);
  assert.equal(tracking.order.status, "PENDING");
  assert.equal(tracking.order.subtotal, "3601.00");
  assert.equal(tracking.order.discount, "50.00");
  assert.equal(tracking.order.deliveryFee, "100.00");
  assert.equal(tracking.order.total, "3651.00");
  assert.deepEqual(tracking.order.items, [
    {
      productName: "Chocolate Cake",
      unitPrice: "1800.50",
      quantity: 2,
      subtotal: "3601.00",
    },
  ]);

  // Delivery information comes from the order's own snapshot, not the customer.
  assert.equal(tracking.order.deliveryType, "DELIVERY");
  assert.equal(tracking.order.recipientName, "Ram Sharma");
  assert.equal(tracking.order.deliveryAddress, "Baneshwor, Kathmandu");

  // Timeline seed: the creation row proves PENDING was reached.
  assert.ok(tracking.order.reachedAt.PENDING instanceof Date);
});

test("malformed and unknown tokens are indistinguishable (both null)", async () => {
  const { order } = await setupTrackedOrder();

  const malformed = [
    "",
    "too-short",
    "A".repeat(31),
    "A".repeat(129),
    "has space in it".padEnd(32, "x"),
    "/".repeat(43),
    "?".repeat(43),
    "é".repeat(43),
  ];

  for (const token of malformed) {
    assert.equal(await getPublicTrackingOrder(token), null, `token rejected: ${token.slice(0, 12)}`);
  }

  // Well-formed but unknown, plus a token that only differs in its last char.
  assert.equal(await getPublicTrackingOrder("A".repeat(43)), null);
  const almost = `${order.publicTrackingToken.slice(0, -1)}X`;
  assert.notEqual(almost, order.publicTrackingToken);
  assert.equal(await getPublicTrackingOrder(almost), null);
});

test("the public DTO has exactly the approved shape and leaks nothing", async () => {
  const { owner, business, customer, product, order } = await setupTrackedOrder();

  // Write a status change with a history note, so the canaries are real.
  await updateOrderStatus(owner.id, business.id, order.id, {
    status: "CONFIRMED",
    note: "history-note-canary",
  });

  const tracking = await getPublicTrackingOrder(order.publicTrackingToken);
  assert.ok(tracking);

  // Exact key sets: nothing extra can appear without failing here.
  assert.deepEqual(Object.keys(tracking.business).sort(), [
    "address",
    "currency",
    "logoUrl",
    "name",
    "phone",
  ]);
  assert.deepEqual(Object.keys(tracking.order).sort(), [
    "createdAt",
    "deliveryAddress",
    "deliveryFee",
    "deliveryType",
    "discount",
    "estimatedDeliveryAt",
    "items",
    "orderNumber",
    "reachedAt",
    "recipientName",
    "status",
    "subtotal",
    "total",
  ]);
  assert.deepEqual(Object.keys(tracking.order.items[0]).sort(), [
    "productName",
    "quantity",
    "subtotal",
    "unitPrice",
  ]);

  // Forbidden content (§16 / docs/security.md §7 exclusions).
  const serialized = JSON.stringify(tracking);
  const forbidden: Array<[string, string]> = [
    ["internal order id", order.id],
    ["internal business id", business.id],
    ["internal customer id", customer.id],
    ["internal product id", product.id],
    ["staff/actor user id", owner.id],
    ["customer email", "sita.canary@example.com"],
    ["customer phone", customer.phone],
    ["customer notes", "customer-internal-note-canary"],
    ["order notes", "order-internal-note-canary"],
    ["status-history note", "history-note-canary"],
    ["the bearer token itself", order.publicTrackingToken],
  ];
  for (const [label, value] of forbidden) {
    assert.ok(!serialized.includes(value), `public DTO must not contain ${label}`);
  }
});

test("tracking is tenant-scoped: each token resolves only to its own business", async () => {
  const first = await setupTrackedOrder("Kathmandu Bakery", "Chocolate Cake", "Sita First");
  const second = await setupTrackedOrder("Patan Sweets", "Red Velvet", "Hari Second");

  const firstTracking = await getPublicTrackingOrder(first.order.publicTrackingToken);
  const secondTracking = await getPublicTrackingOrder(second.order.publicTrackingToken);
  assert.ok(firstTracking && secondTracking);

  assert.equal(firstTracking.business.name, "Kathmandu Bakery");
  assert.equal(firstTracking.order.orderNumber, first.order.orderNumber);
  assert.equal(firstTracking.order.items[0].productName, "Chocolate Cake");
  assert.equal(secondTracking.business.name, "Patan Sweets");
  assert.equal(secondTracking.order.orderNumber, second.order.orderNumber);
  assert.equal(secondTracking.order.items[0].productName, "Red Velvet");

  // Per-business order numbers are independent (both are ORD-1001), so
  // isolation is asserted on ids, names and item snapshots instead.
  const firstSerialized = JSON.stringify(firstTracking);
  const secondSerialized = JSON.stringify(secondTracking);
  assert.ok(!firstSerialized.includes(second.business.id));
  assert.ok(!firstSerialized.includes(second.customer.name));
  assert.ok(!firstSerialized.includes("Red Velvet"));
  assert.ok(!secondSerialized.includes(first.business.id));
  assert.ok(!secondSerialized.includes(first.customer.name));
  assert.ok(!secondSerialized.includes("Chocolate Cake"));
});

test("status and timeline follow the real workflow, including cancellation", async () => {
  const { owner, business, order } = await setupTrackedOrder();
  const token = order.publicTrackingToken;

  await updateOrderStatus(owner.id, business.id, order.id, {
    status: "CONFIRMED",
    note: undefined,
  });
  await updateOrderStatus(owner.id, business.id, order.id, {
    status: "PREPARING",
    note: undefined,
  });

  const preparing = await getPublicTrackingOrder(token);
  assert.ok(preparing);
  assert.equal(preparing.order.status, "PREPARING");
  assert.ok(preparing.order.reachedAt.PENDING);
  assert.ok(preparing.order.reachedAt.CONFIRMED);
  assert.ok(preparing.order.reachedAt.PREPARING);
  assert.equal(preparing.order.reachedAt.DELIVERED, undefined);

  await updateOrderStatus(owner.id, business.id, order.id, {
    status: "CANCELLED",
    note: "cancelled-note-canary",
  });

  const cancelled = await getPublicTrackingOrder(token);
  assert.ok(cancelled);
  assert.equal(cancelled.order.status, "CANCELLED");
  assert.ok(cancelled.order.reachedAt.CANCELLED instanceof Date);
  assert.equal(cancelled.order.reachedAt.DELIVERED, undefined);
  assert.ok(!JSON.stringify(cancelled).includes("cancelled-note-canary"));
});
