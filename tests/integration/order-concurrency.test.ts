import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import pg from "pg";

import { prisma } from "../../src/lib/db/client.ts";
import type { CreateOrderInput } from "../../src/lib/validation/order.ts";
import { createOrder } from "../../src/server/order/order-service.ts";
import { createProduct } from "../../src/server/product/product-service.ts";
import {
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// M5 focused completion task: a *genuine multi-connection* race test for
// concurrent order creation (the ordinary order-service suite only exercises
// sequential creation, which cannot expose a lost-update in the DEC-007(a)
// per-business counter).
//
// Honesty contract for this file:
//   * It runs against the dedicated `_test` database, behind the same
//     `assertDedicatedTestDatabase()` guard as every other integration test.
//   * It creates orders through the real `createOrder` service, so real
//     transactions are opened against PostgreSQL — nothing is mocked.
//   * Each `createOrder` call opens a Prisma interactive transaction, and the
//     `@prisma/adapter-pg` adapter checks a *distinct* connection out of the
//     `pg.Pool` per transaction (adapter `startTransaction` → `pool.connect()`).
//     The two tests below therefore verify, with observed evidence rather than
//     assumption, that the shared pool really does serve concurrent operations
//     on separate connections and that the resulting rows stay consistent.
//   * If the pool cannot provide enough simultaneous connections, these tests
//     fail loudly instead of silently degrading into sequential creation.

// The shared client's pool is a `pg.Pool` with the driver default `max = 10`
// (src/lib/db/client.ts passes only `{ connectionString }`). Keep the fan-out
// below that ceiling so every creation can genuinely run at once.
const CONCURRENT_ORDERS = 8;

function orderInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerId: "",
    items: [],
    deliveryType: "DELIVERY",
    deliveryName: "Ram Sharma",
    deliveryPhone: "9800000001",
    deliveryAddress: "Baneshwor, Kathmandu",
    discount: "0",
    deliveryFee: "0",
    estimatedDeliveryAt: undefined,
    paymentStatus: "UNPAID",
    notes: "",
    ...overrides,
  };
}

before(() => {
  assertDedicatedTestDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

after(async () => {
  await disconnectDatabase();
});

test("the shared Prisma pool runs concurrent transactions on distinct connections", async (t) => {
  const connections = 5;
  const holdSeconds = 0.25;

  const startedAt = Date.now();
  const pids = await Promise.all(
    Array.from({ length: connections }, () =>
      prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        // Hold the connection (and its transaction) open so every started
        // transaction must overlap with the others to finish in time. pg_sleep
        // returns `void`, which Prisma cannot deserialize — cast it to text.
        await tx.$queryRawUnsafe(`SELECT pg_sleep(${holdSeconds})::text`);
        return Number(rows[0]?.pid);
      }),
    ),
  );
  const elapsedMs = Date.now() - startedAt;

  const distinctPids = new Set(pids);
  assert.equal(
    distinctPids.size,
    connections,
    `expected ${connections} distinct PostgreSQL backend PIDs, saw [${[...distinctPids].join(", ")}]`,
  );
  // Serialized transactions would take ≈ connections × holdSeconds; a real
  // multi-connection pool finishes in about one hold.
  assert.ok(
    elapsedMs < connections * holdSeconds * 1000 * 0.6,
    `transactions did not overlap (took ${elapsedMs}ms for ${connections} × ${holdSeconds}s holds)`,
  );

  t.diagnostic(
    `${connections} overlapping transactions used ${distinctPids.size} distinct backends in ${elapsedMs}ms`,
  );
});

test("concurrent order creation for one business yields unique numbers and consistent rows", async (t) => {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Concurrency Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Concurrent Customer", phone: "9800000009" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Concurrency Cake",
    description: undefined,
    price: "500",
    active: true,
  });

  // An observer on its own connection records how many backends were active in
  // this database while the creations ran — direct evidence that the race was
  // real rather than a sequential loop.
  const observer = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await observer.connect();

  let sampling = true;
  let peakConcurrent = 0;
  const observedPids = new Set<number>();
  const sampler = (async () => {
    while (sampling) {
      try {
        const { rows } = await observer.query<{ pid: number }>(
          `SELECT pid FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND state IN ('active', 'idle in transaction')`,
        );
        for (const row of rows) {
          observedPids.add(Number(row.pid));
        }
        peakConcurrent = Math.max(peakConcurrent, rows.length);
      } catch {
        // A transient sampler error must never fail the creation assertions.
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  })();

  let created: Awaited<ReturnType<typeof createOrder>>[];
  try {
    created = await Promise.all(
      Array.from({ length: CONCURRENT_ORDERS }, () =>
        createOrder(
          owner.id,
          business.id,
          orderInput({
            customerId: customer.id,
            items: [{ productId: product.id, quantity: 1 }],
          }),
        ),
      ),
    );
  } finally {
    sampling = false;
    await sampler;
    await observer.end();
  }

  // 1. Every creation succeeded and received a unique, correctly formatted,
  //    per-business number with no gaps.
  assert.equal(created.length, CONCURRENT_ORDERS);
  const numbers = created.map((order) => order.orderNumber);
  assert.equal(
    new Set(numbers).size,
    CONCURRENT_ORDERS,
    `duplicate order numbers: [${numbers.join(", ")}]`,
  );
  for (const orderNumber of numbers) {
    assert.match(orderNumber, /^ORD-\d+$/);
  }
  const expectedNumbers = Array.from(
    { length: CONCURRENT_ORDERS },
    (_, index) => `ORD-${1001 + index}`,
  );
  assert.deepEqual([...numbers].sort(), expectedNumbers);

  // 2. The stored orders match the returned numbers exactly, once each.
  const orders = await prisma.order.findMany({
    where: { businessId: business.id },
    select: {
      orderNumber: true,
      status: true,
      subtotal: true,
      total: true,
      publicTrackingToken: true,
    },
  });
  assert.equal(orders.length, CONCURRENT_ORDERS);
  assert.equal(new Set(orders.map((order) => order.orderNumber)).size, CONCURRENT_ORDERS);
  assert.deepEqual([...orders.map((order) => order.orderNumber)].sort(), expectedNumbers);
  for (const order of orders) {
    assert.equal(order.status, "PENDING");
    // DEC-006/AMB-001: exact decimal money, never a float artifact.
    assert.equal(order.subtotal.toFixed(2), "500.00");
    assert.equal(order.total.toFixed(2), "500.00");
  }

  // 3. Exactly one item line per order, carrying the §10 snapshot.
  const items = await prisma.orderItem.findMany({
    where: { order: { businessId: business.id } },
  });
  assert.equal(items.length, CONCURRENT_ORDERS);
  const itemsPerOrder = new Map<string, number>();
  for (const item of items) {
    assert.equal(item.productNameSnapshot, "Concurrency Cake");
    assert.equal(item.unitPrice.toFixed(2), "500.00");
    assert.equal(item.quantity, 1);
    assert.equal(item.subtotal.toFixed(2), "500.00");
    itemsPerOrder.set(item.orderId, (itemsPerOrder.get(item.orderId) ?? 0) + 1);
  }
  assert.equal(itemsPerOrder.size, CONCURRENT_ORDERS);
  for (const count of itemsPerOrder.values()) {
    assert.equal(count, 1);
  }

  // 4. Exactly one initial PENDING history row per order (null → PENDING).
  const history = await prisma.orderStatusHistory.findMany({
    where: { order: { businessId: business.id } },
  });
  assert.equal(history.length, CONCURRENT_ORDERS);
  const historyPerOrder = new Map<string, number>();
  for (const entry of history) {
    assert.equal(entry.oldStatus, null);
    assert.equal(entry.newStatus, "PENDING");
    assert.equal(entry.changedBy, owner.id);
    historyPerOrder.set(entry.orderId, (historyPerOrder.get(entry.orderId) ?? 0) + 1);
  }
  assert.equal(historyPerOrder.size, CONCURRENT_ORDERS);
  for (const count of historyPerOrder.values()) {
    assert.equal(count, 1);
  }

  // 5. Globally unique raw tracking tokens, and the counter consumed exactly
  //    CONCURRENT_ORDERS slots.
  const tokens = created.map((order) => order.publicTrackingToken);
  assert.equal(new Set(tokens).size, CONCURRENT_ORDERS);
  assert.equal(
    await prisma.order.count({ where: { publicTrackingToken: { in: tokens } } }),
    CONCURRENT_ORDERS,
  );
  const sequence = await prisma.businessOrderSequence.findUnique({
    where: { businessId: business.id },
  });
  assert.equal(sequence?.lastNumber, CONCURRENT_ORDERS);

  // 6. Evidence that the creations really overlapped on independent
  //    connections. Under the DEC-007(a) row lock the losing transactions wait
  //    on the sequence row while still holding their own connections, so the
  //    observer should see several concurrently active backends.
  assert.ok(
    peakConcurrent >= 2 && observedPids.size >= 2,
    `expected concurrent database activity during order creation, observed peak ${peakConcurrent} ` +
      `across ${observedPids.size} backend PID(s)`,
  );

  t.diagnostic(
    `${CONCURRENT_ORDERS} concurrent creations produced ${numbers.join(", ")}; observer saw a peak of ` +
      `${peakConcurrent} concurrently active connection(s) across ${observedPids.size} backend PID(s)`,
  );
});
