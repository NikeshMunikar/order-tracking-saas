import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { prisma } from "../../src/lib/db/client.ts";
import { BusinessNotFoundError } from "../../src/server/business/errors.ts";
import { createCustomer, listCustomerOptions } from "../../src/server/customer/customer-service.ts";
import {
  createProduct,
  listProductOptions,
  listProducts,
  softDeleteProduct,
} from "../../src/server/product/product-service.ts";
import {
  DASHBOARD_RECENT_ORDERS_LIMIT,
  createOrder,
  getDashboardSummary,
  listOrders,
  ORDER_PAGE_SIZE,
} from "../../src/server/order/order-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// Milestone 8 integration tests (decisions D1–D4) against the dedicated
// `_test` PostgreSQL database:
//   - dashboard counts grouped by current status for orders CREATED during the
//     business's LOCAL calendar day (business timezone, UTC fallback, boundary
//     instants);
//   - order search/filter/pagination (literal escaped matching, truthful
//     pagination out-of-range behaviour);
//   - product-list search and the ACTIVE-only picker options;
//   - authorization and tenant isolation for every new read path.

function orderInput(customerId: string, items: Array<{ productId: string; quantity: number }>) {
  return {
    customerId,
    items,
    deliveryType: "DELIVERY" as const,
    deliveryName: "Ram Sharma",
    deliveryPhone: "9800000001",
    deliveryAddress: "Baneshwor, Kathmandu",
    discount: "0",
    deliveryFee: "50",
    estimatedDeliveryAt: undefined,
    paymentStatus: "UNPAID" as const,
    notes: "",
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

/** Force a fixture's stored status and createdAt (the workflow is M6 scope). */
async function placeOrder(
  orderId: string,
  createdAt: Date,
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED",
): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { createdAt, status } });
}

before(async () => {
  assertDedicatedTestDatabase();
  // Preflight: fails loudly if the database is unreachable or unmigrated.
  await prisma.order.count();
});

beforeEach(resetDatabase);

after(disconnectDatabase);

test("dashboard counts are grouped by current status and exclude cancelled orders", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Counting Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Count Customer", phone: "9801111111" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Count Product",
    description: undefined,
    price: "100",
    active: true,
  });

  const make = () => createOrder(owner.id, business.id, orderInput(customer.id, [
    { productId: product.id, quantity: 1 },
  ]));

  // Ordered as created; each is then placed at a controlled instant/status.
  const o1 = await make();
  const o2 = await make();
  const o3 = await make();
  const o4 = await make();
  const o5 = await make();
  const o6 = await make();
  const o7 = await make();
  const o8 = await make();

  const day = new Date("2026-03-11T05:00:00.000Z");
  await placeOrder(o1.id, day, "PENDING");
  await placeOrder(o2.id, day, "PENDING");
  await placeOrder(o3.id, day, "CONFIRMED");
  await placeOrder(o4.id, day, "OUT_FOR_DELIVERY");
  await placeOrder(o5.id, day, "DELIVERED");
  await placeOrder(o6.id, day, "CANCELLED");
  await placeOrder(o7.id, day, "PREPARING");
  await placeOrder(o8.id, day, "READY");

  const summary = await getDashboardSummary(
    owner.id,
    business.id,
    new Date("2026-03-11T05:00:00.000Z"),
  );

  assert.equal(summary.pending, 2);
  assert.equal(summary.inProgress, 4); // CONFIRMED + PREPARING + READY + OUT_FOR_DELIVERY
  assert.equal(summary.delivered, 1);
});

test("dashboard 'today' follows the business's timezone and falls back to UTC", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Timezone Co");
  await prisma.business.update({
    where: { id: business.id },
    data: { timezone: "Asia/Kathmandu" },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Zone Customer", phone: "9802222222" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Zone Product",
    description: undefined,
    price: "10",
    active: true,
  });

  const order = await createOrder(owner.id, business.id, orderInput(customer.id, [
    { productId: product.id, quantity: 1 },
  ]));

  // 2026-03-10T18:30Z is 2026-03-11T00:15 in Kathmandu: the local day runs
  // 2026-03-10T18:15Z (inclusive) .. 2026-03-11T18:15Z (exclusive).
  await placeOrder(order.id, new Date("2026-03-10T18:30:00.000Z"), "PENDING");

  const during = await getDashboardSummary(
    owner.id,
    business.id,
    new Date("2026-03-10T18:30:00.000Z"),
  );
  assert.equal(during.timeZone, "Asia/Kathmandu");
  assert.equal(during.pending, 1);

  // One second before the local-day start is still the previous local day, so
  // the same order is no longer "today".
  const before = await getDashboardSummary(
    owner.id,
    business.id,
    new Date("2026-03-10T18:14:59.000Z"),
  );
  assert.equal(before.pending, 0);

  // An invalid stored timezone degrades to a correct UTC day (DEC-014 D1).
  await prisma.business.update({
    where: { id: business.id },
    data: { timezone: "Nepal Standard Time" },
  });
  const utcDay = await getDashboardSummary(
    owner.id,
    business.id,
    new Date("2026-03-10T12:00:00.000Z"),
  );
  assert.equal(utcDay.timeZone, "UTC");
  // The order at 18:30Z is 2026-03-10T18:30 UTC — still inside the UTC day.
  assert.equal(utcDay.pending, 1);
  const nextUtcDay = await getDashboardSummary(
    owner.id,
    business.id,
    new Date("2026-03-11T12:00:00.000Z"),
  );
  assert.equal(nextUtcDay.pending, 0);
});

test("dashboard recent orders are newest-first, limited, not day-restricted, and tenant scoped", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Recent A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Recent B");
  const customerA = await prisma.customer.create({
    data: { businessId: businessA.id, name: "Recent Customer A", phone: "9803333331" },
  });
  const productA = await createProduct(ownerA.id, businessA.id, {
    name: "Recent Product A",
    description: undefined,
    price: "20",
    active: true,
  });

  const instants = [
    "2026-03-10T05:00:00.000Z",
    "2026-03-11T05:00:00.000Z",
    "2026-03-12T05:00:00.000Z",
    "2026-03-13T05:00:00.000Z",
    "2026-03-14T05:00:00.000Z",
    "2026-03-15T05:00:00.000Z",
  ];
  for (const instant of instants) {
    const order = await createOrder(ownerA.id, businessA.id, orderInput(customerA.id, [
      { productId: productA.id, quantity: 1 },
    ]));
    await placeOrder(order.id, new Date(instant), "PENDING");
  }

  const summary = await getDashboardSummary(
    ownerA.id,
    businessA.id,
    new Date("2026-03-15T05:00:00.000Z"),
  );

  assert.equal(summary.recentOrders.length, DASHBOARD_RECENT_ORDERS_LIMIT);
  // Newest first by (createdAt, id).
  const createdAtList = summary.recentOrders.map((order) => order.createdAt.getTime());
  const sorted = [...createdAtList].sort((a, b) => b - a);
  assert.deepEqual(createdAtList, sorted);
  // Not restricted to "today": the newest of the six is 2026-03-15.
  assert.equal(new Date(createdAtList[0]).getUTCDate(), 15);
  assert.ok(summary.pending + summary.inProgress + summary.delivered > 0);

  // Tenant isolation: business B's summary is its own (empty) one.
  const other = await getDashboardSummary(ownerB.id, businessB.id, new Date("2026-03-15T05:00:00.000Z"));
  assert.equal(other.recentOrders.length, 0);
  assert.equal(other.pending, 0);
  assert.equal(other.inProgress, 0);
  assert.equal(other.delivered, 0);
  assert.equal(other.timeZone, "UTC");
});

test("a non-member cannot read another business's dashboard summary", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Private Co");

  await expectRejection(
    getDashboardSummary((await createUser()).id, business.id, new Date()),
    BusinessNotFoundError.name,
  );
});

test("a STAFF member can read the dashboard summary and order list (§4)", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Staff View Co");
  // createBusinessWithOwner seeds the OWNER membership; a validated owner is
  // required before STAFF is added as a second member.
  const staff = await createUser();
  await addMember(business.id, staff.id, "STAFF");

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Staff Customer", phone: "9804444444" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Staff Product",
    description: undefined,
    price: "30",
    active: true,
  });
  const order = await createOrder(owner.id, business.id, orderInput(customer.id, [
    { productId: product.id, quantity: 2 },
  ]));

  const summary = await getDashboardSummary(staff.id, business.id, new Date());
  assert.ok(summary.recentOrders.some((entry) => entry.id === order.id));

  const page = await listOrders(staff.id, business.id, {});
  assert.equal(page.total, 1);
  assert.equal(page.orders.length, 1);
});

test("order search matches order number and customer name literally and combines with the status filter", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Search Co");
  const sita = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Sharma", phone: "9805555551" },
  });
  const gita = await prisma.customer.create({
    data: { businessId: business.id, name: "Gita Sharma", phone: "9805555552" },
  });
  const bit = await prisma.customer.create({
    data: { businessId: business.id, name: "A_bit", phone: "9805555553" },
  });
  const agbit = await prisma.customer.create({
    data: { businessId: business.id, name: "Agbit", phone: "9805555554" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Search Product",
    description: undefined,
    price: "40",
    active: true,
  });

  const make = (customerId: string) => createOrder(owner.id, business.id, orderInput(customerId, [
    { productId: product.id, quantity: 1 },
  ]));
  const ordSita = await make(sita.id);
  const ordGita = await make(gita.id);
  const ordBit = await make(bit.id);
  const ordAgbit = await make(agbit.id);
  await placeOrder(ordSita.id, new Date(2026, 2, 1, 5, 0, 0), "PENDING");
  await placeOrder(ordGita.id, new Date(2026, 2, 1, 5, 0, 0), "PREPARING");

  // All four orders exist first.
  assert.equal((await listOrders(owner.id, business.id, {})).total, 4);

  // By order number (prefix/part; created sequence starts at ORD-1001).
  const byNumber = await listOrders(owner.id, business.id, { query: ordSita.orderNumber });
  assert.equal(byNumber.total, 1);
  assert.equal(byNumber.orders[0]?.id, ordSita.id);

  // By customer name, case-insensitive partial.
  const byName = await listOrders(owner.id, business.id, { query: "sita" });
  assert.equal(byName.total, 1);
  assert.equal(byName.orders[0]?.customerName, "Sita Sharma");

  // Underscore is a literal, not a wildcard: "A_b" must not match "Agbit".
  const literalUnderscore = await listOrders(owner.id, business.id, { query: "A_b" });
  assert.equal(literalUnderscore.total, 1);
  assert.equal(literalUnderscore.orders[0]?.id, ordBit.id);

  // A "%" search is literal too: no order happens to contain a literal "%".
  const literalPercent = await listOrders(owner.id, business.id, { query: "%" });
  assert.equal(literalPercent.total, 0);

  // Status filter alone.
  const byStatus = await listOrders(owner.id, business.id, { status: "PREPARING" });
  assert.equal(byStatus.total, 1);
  assert.equal(byStatus.orders[0]?.id, ordGita.id);

  // Search + status combined.
  const combined = await listOrders(owner.id, business.id, { query: "sita", status: "PENDING" });
  assert.equal(combined.total, 1);
  assert.equal(combined.orders[0]?.id, ordSita.id);
  const combinedMiss = await listOrders(owner.id, business.id, { query: "sita", status: "DELIVERED" });
  assert.equal(combinedMiss.total, 0);

  // ordAgbit.id is referenced to keep the fixture explicit.
  assert.ok(ordAgbit.id);
});

test("order pagination is truthful, including pages past the end", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Paging Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Paging Customer", phone: "9806666666" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Paging Product",
    description: undefined,
    price: "50",
    active: true,
  });

  const ids: string[] = [];
  for (let index = 0; index < ORDER_PAGE_SIZE + 1; index += 1) {
    const order = await createOrder(owner.id, business.id, orderInput(customer.id, [
      { productId: product.id, quantity: 1 },
    ]));
    ids.push(order.id);
  }

  const page1 = await listOrders(owner.id, business.id, { page: 1 });
  assert.equal(page1.pageSize, ORDER_PAGE_SIZE);
  assert.equal(page1.total, ORDER_PAGE_SIZE + 1);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.orders.length, ORDER_PAGE_SIZE);

  const page2 = await listOrders(owner.id, business.id, { page: 2 });
  assert.equal(page2.orders.length, 1);
  assert.equal(page2.total, ORDER_PAGE_SIZE + 1);
  // Pages never duplicate rows.
  assert.equal(page1.orders.some((order) => order.id === page2.orders[0]?.id), false);

  const page3 = await listOrders(owner.id, business.id, { page: 3 });
  assert.equal(page3.orders.length, 0);
  assert.equal(page3.total, ORDER_PAGE_SIZE + 1); // truthful out-of-range behaviour
});

test("a non-member cannot list orders, and tenant rows never leak across businesses", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Tenant A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Tenant B");
  const customerA = await prisma.customer.create({
    data: { businessId: businessA.id, name: "A Customer", phone: "9807777771" },
  });
  const productA = await createProduct(ownerA.id, businessA.id, {
    name: "A Product",
    description: undefined,
    price: "60",
    active: true,
  });
  await createOrder(ownerA.id, businessA.id, orderInput(customerA.id, [
    { productId: productA.id, quantity: 1 },
  ]));

  assert.equal((await listOrders(ownerB.id, businessB.id, {})).total, 0);
  await expectRejection(
    listOrders((await createUser()).id, businessA.id, {}),
    BusinessNotFoundError.name,
  );
});

test("product search matches names literally across inactive and active products", async () => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "ProductSearch Co");
  await createProduct(owner.id, business.id, {
    name: "Chocolate Cake",
    description: undefined,
    price: "120",
    active: true,
  });
  await createProduct(owner.id, business.id, {
    name: "Mug 5_pack",
    description: undefined,
    price: "10",
    active: true,
  });
  await createProduct(owner.id, business.id, {
    name: "Mug 5pack",
    description: undefined,
    price: "15",
    active: true,
  });
  await createProduct(owner.id, business.id, {
    name: "Inactive Tea",
    description: undefined,
    price: "99",
    active: false,
  });

  const all = await listProducts(owner.id, business.id, {});
  assert.equal(all.length, 4);
  // M4 behavior preserved: active AND inactive products are listed.
  assert.ok(all.some((product) => product.name === "Inactive Tea"));

  const byName = await listProducts(owner.id, business.id, { query: "chocolate" });
  assert.equal(byName.length, 1);
  assert.equal(byName[0]?.name, "Chocolate Cake");

  // `_` is a literal, so "5_" must not match "Mug 5pack".
  const literalUnderscore = await listProducts(owner.id, business.id, { query: "5_" });
  assert.equal(literalUnderscore.length, 1);
  assert.equal(literalUnderscore[0]?.name, "Mug 5_pack");

  const noMatch = await listProducts(owner.id, business.id, { query: "Pizza" });
  assert.equal(noMatch.length, 0);
});

test("picker options are scoped to the authorized business and active-only", async () => {
  const ownerA = await createUser();
  const businessA = await createBusinessWithOwner(ownerA.id, "Picker A");
  const ownerB = await createUser();
  const businessB = await createBusinessWithOwner(ownerB.id, "Picker B");

  const customerA = await createCustomer(ownerA.id, businessA.id, {
    name: "Picker Customer A",
    phone: "9808888881",
    email: undefined,
    address: undefined,
    notes: undefined,
  });
  const activeProduct = await createProduct(ownerA.id, businessA.id, {
    name: "Picker Active",
    description: undefined,
    price: "70",
    active: true,
  });
  const inactiveProduct = await createProduct(ownerA.id, businessA.id, {
    name: "Picker Inactive",
    description: undefined,
    price: "80",
    active: false,
  });
  await softDeleteProduct(ownerA.id, businessA.id, inactiveProduct.id);

  // Business B must not see A's rows through either picker.
  await createCustomer(ownerB.id, businessB.id, {
    name: "Picker Customer B",
    phone: "9808888882",
    email: undefined,
    address: undefined,
    notes: undefined,
  });
  await createProduct(ownerB.id, businessB.id, {
    name: "Picker Product B",
    description: undefined,
    price: "90",
    active: true,
  });

  const customerOptions = await listCustomerOptions(ownerA.id, businessA.id);
  assert.equal(customerOptions.length, 1);
  assert.equal(customerOptions[0]?.id, customerA.id);
  assert.equal(customerOptions[0]?.name, "Picker Customer A");
  assert.equal(customerOptions[0]?.phone, "9808888881");

  const productOptions = await listProductOptions(ownerA.id, businessA.id);
  assert.equal(productOptions.length, 1);
  assert.equal(productOptions[0]?.id, activeProduct.id);
  assert.equal(productOptions[0]?.price, "70.00");
  // DEC-006: prices cross the boundary as fixed 2-decimal strings.
  assert.equal(typeof productOptions[0]?.price, "string");

  // Authorization: a non-member gets the business-not-found error, and STAFF
  // (who creates orders) can read the pickers.
  await expectRejection(
    listCustomerOptions((await createUser()).id, businessA.id),
    BusinessNotFoundError.name,
  );
  const staff = await createUser();
  await addMember(businessA.id, staff.id, "STAFF");
  const staffProductOptions = await listProductOptions(staff.id, businessA.id);
  assert.equal(staffProductOptions.length, 1);
});
