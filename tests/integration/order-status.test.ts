import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import type { OrderStatusValue } from "../../src/lib/order-status.ts";
import type { CreateOrderInput } from "../../src/lib/validation/order.ts";
import { prisma } from "../../src/lib/db/client.ts";
import { BusinessNotFoundError } from "../../src/server/business/errors.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../src/server/order/errors.ts";
import {
  createOrder,
  getOrder,
  updateOrderStatus,
} from "../../src/server/order/order-service.ts";
import { createProduct } from "../../src/server/product/product-service.ts";
import {
  addMember,
  assertDedicatedTestDatabase,
  createBusinessWithOwner,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/test-db.ts";

// M6 status-workflow tests against PostgreSQL (dedicated `_test` database).
// DEC-013 (owner-accepted 2026-10-18, resolving AMB-002):
//   - CANCELLED is reachable from every pre-delivery status, never from
//     DELIVERED;
//   - forward movement is exactly one step, no skips, no backwards moves;
//   - DELIVERED and CANCELLED are terminal;
//   - a status-change note is optional free text;
//   - both OWNER and STAFF may change statuses (MASTER_SPEC §4), subject to
//     tenant-membership authorization.
// docs/database.md §8: the status update and its history row are written
// atomically, and a rejected/stale change must leave the status UNCHANGED with
// NO history row. §13: every accepted change creates exactly one history row.

const FORWARD_CHAIN: OrderStatusValue[] = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

const PRE_DELIVERY_STATUSES: OrderStatusValue[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
];

const InvalidTransitionName = InvalidOrderStatusTransitionError.name;
const OrderNotFoundErrorName = OrderNotFoundError.name;
const BusinessNotFoundErrorName = BusinessNotFoundError.name;

function orderInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerId: "",
    items: [],
    deliveryType: "PICKUP",
    discount: "0",
    deliveryFee: "0",
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

type TenantFixture = {
  ownerId: string;
  businessId: string;
  customerId: string;
  productId: string;
  orderId: string;
};

/** One tenant (owner + customer + product) with one fresh order. */
async function setupTenantWithOrder(): Promise<TenantFixture> {
  const owner = await createUser();
  const business = await createBusinessWithOwner(owner.id, "Status Co");
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Sita Thapa", phone: "9811111111" },
  });
  const product = await createProduct(owner.id, business.id, {
    name: "Chocolate Cake",
    description: undefined,
    price: "1800.50",
    active: true,
  });
  const order = await createOrder(
    owner.id,
    business.id,
    orderInput({ customerId: customer.id, items: [{ productId: product.id, quantity: 1 }] }),
  );
  return {
    ownerId: owner.id,
    businessId: business.id,
    customerId: customer.id,
    productId: product.id,
    orderId: order.id,
  };
}

/** A second order in an existing tenant. */
async function createExtraOrder(fixture: TenantFixture) {
  return createOrder(
    fixture.ownerId,
    fixture.businessId,
    orderInput({
      customerId: fixture.customerId,
      items: [{ productId: fixture.productId, quantity: 1 }],
    }),
  );
}

/** Move an order along the forward chain until it reaches `target`. */
async function advanceTo(fixture: TenantFixture, orderId: string, target: OrderStatusValue) {
  if (target === "PENDING") return;
  for (const status of FORWARD_CHAIN) {
    await updateOrderStatus(fixture.ownerId, fixture.businessId, orderId, {
      status,
      note: undefined,
    });
    if (status === target) return;
  }
  throw new Error(`cannot reach ${target} along the forward chain`);
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

test("walks the full forward chain one step at a time and records every change", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId, orderId } = fixture;

  const seen: OrderStatusValue[] = ["PENDING"];
  for (const status of FORWARD_CHAIN) {
    const result = await updateOrderStatus(ownerId, businessId, orderId, {
      status,
      note: undefined,
    });
    assert.equal(result.status, status);
    assert.equal(result.id, orderId);
    seen.push(status);

    const detail = await getOrder(ownerId, businessId, orderId);
    assert.notEqual(detail, null);
    assert.equal(detail!.status, status);
  }

  const detail = await getOrder(ownerId, businessId, orderId);
  // Initial creation row (oldStatus null) + one row per forward step.
  assert.equal(detail!.statusHistory.length, FORWARD_CHAIN.length + 1);
  assert.equal(detail!.statusHistory[0].oldStatus, null);
  assert.equal(detail!.statusHistory[0].newStatus, "PENDING");
  for (let index = 0; index < FORWARD_CHAIN.length; index += 1) {
    const entry = detail!.statusHistory[index + 1];
    assert.equal(entry.oldStatus, seen[index]);
    assert.equal(entry.newStatus, seen[index + 1]);
    assert.equal(entry.changedBy, ownerId);
    assert.equal(entry.note, null);
  }

  // DELIVERED is terminal: every further change is rejected and writes nothing.
  const rowsBefore = detail!.statusHistory.length;
  for (const status of ["CONFIRMED", "CANCELLED", "DELIVERED", "PREPARING"] as OrderStatusValue[]) {
    await expectRejection(
      updateOrderStatus(ownerId, businessId, orderId, { status, note: undefined }),
      InvalidTransitionName,
    );
  }
  const after = await getOrder(ownerId, businessId, orderId);
  assert.equal(after!.status, "DELIVERED");
  assert.equal(after!.statusHistory.length, rowsBefore);
});

test("cancellation is allowed from every pre-delivery status", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId } = fixture;

  for (const target of PRE_DELIVERY_STATUSES) {
    const order = await createExtraOrder(fixture);
    await advanceTo(fixture, order.id, target);

    const result = await updateOrderStatus(ownerId, businessId, order.id, {
      status: "CANCELLED",
      note: undefined,
    });
    assert.equal(result.status, "CANCELLED", `${target} -> CANCELLED must be allowed`);

    const detail = await getOrder(ownerId, businessId, order.id);
    assert.equal(detail!.status, "CANCELLED");
    const last = detail!.statusHistory.at(-1)!;
    assert.equal(last.oldStatus, target);
    assert.equal(last.newStatus, "CANCELLED");
    assert.equal(last.changedBy, ownerId);
  }
});

test("cancellation from DELIVERED is rejected and CANCELLED is terminal", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId } = fixture;

  await advanceTo(fixture, fixture.orderId, "DELIVERED");
  const deliveredRows = (await getOrder(ownerId, businessId, fixture.orderId))!.statusHistory.length;

  await expectRejection(
    updateOrderStatus(ownerId, businessId, fixture.orderId, { status: "CANCELLED", note: undefined }),
    InvalidTransitionName,
  );
  const stillDelivered = await getOrder(ownerId, businessId, fixture.orderId);
  assert.equal(stillDelivered!.status, "DELIVERED");
  assert.equal(stillDelivered!.statusHistory.length, deliveredRows);

  // A cancelled order is equally final — no reopening back into the workflow.
  const cancelled = await createExtraOrder(fixture);
  await updateOrderStatus(ownerId, businessId, cancelled.id, { status: "CANCELLED", note: undefined });
  const cancelledRows = (await getOrder(ownerId, businessId, cancelled.id))!.statusHistory.length;

  for (const status of ["CONFIRMED", "PREPARING", "DELIVERED", "CANCELLED"] as OrderStatusValue[]) {
    await expectRejection(
      updateOrderStatus(ownerId, businessId, cancelled.id, { status, note: undefined }),
      InvalidTransitionName,
    );
  }
  const stillCancelled = await getOrder(ownerId, businessId, cancelled.id);
  assert.equal(stillCancelled!.status, "CANCELLED");
  assert.equal(stillCancelled!.statusHistory.length, cancelledRows);
});

test("skipped, backwards and self transitions are rejected without side effects", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId, orderId } = fixture;

  // From PENDING the only legal moves are CONFIRMED and CANCELLED.
  for (const status of [
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "PENDING",
  ] as OrderStatusValue[]) {
    await expectRejection(
      updateOrderStatus(ownerId, businessId, orderId, { status, note: undefined }),
      InvalidTransitionName,
    );
  }

  let detail = await getOrder(ownerId, businessId, orderId);
  assert.equal(detail!.status, "PENDING", "a rejected change must not alter the status");
  assert.equal(detail!.statusHistory.length, 1, "a rejected change must write no history row");

  await updateOrderStatus(ownerId, businessId, orderId, { status: "CONFIRMED", note: undefined });
  const rowsAfterConfirm = (await getOrder(ownerId, businessId, orderId))!.statusHistory.length;

  // CONFIRMED allows only PREPARING or CANCELLED: no backwards moves, no skips.
  for (const status of ["PENDING", "READY", "DELIVERED", "CONFIRMED"] as OrderStatusValue[]) {
    await expectRejection(
      updateOrderStatus(ownerId, businessId, orderId, { status, note: undefined }),
      InvalidTransitionName,
    );
  }

  detail = await getOrder(ownerId, businessId, orderId);
  assert.equal(detail!.status, "CONFIRMED");
  assert.equal(detail!.statusHistory.length, rowsAfterConfirm);
});

test("an optional note is recorded with the change and defaults to null", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId } = fixture;

  await updateOrderStatus(ownerId, businessId, fixture.orderId, {
    status: "CANCELLED",
    note: "Customer called to cancel",
  });
  const detail = await getOrder(ownerId, businessId, fixture.orderId);
  const last = detail!.statusHistory.at(-1)!;
  assert.equal(last.newStatus, "CANCELLED");
  assert.equal(last.note, "Customer called to cancel");

  // No note is required, and an absent note is stored as null (not "").
  const other = await createExtraOrder(fixture);
  await updateOrderStatus(ownerId, businessId, other.id, { status: "CONFIRMED", note: undefined });
  const otherDetail = await getOrder(ownerId, businessId, other.id);
  assert.equal(otherDetail!.statusHistory.at(-1)!.note, null);
});

test("STAFF may change statuses and cancel (MASTER_SPEC §4 + DEC-013 rule 5)", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId, orderId } = fixture;
  const staff = await createUser();
  await addMember(businessId, staff.id, "STAFF");

  const result = await updateOrderStatus(staff.id, businessId, orderId, {
    status: "CONFIRMED",
    note: "Preparing now",
  });
  assert.equal(result.status, "CONFIRMED");

  const detail = await getOrder(staff.id, businessId, orderId);
  const last = detail!.statusHistory.at(-1)!;
  assert.equal(last.oldStatus, "PENDING");
  assert.equal(last.newStatus, "CONFIRMED");
  assert.equal(last.changedBy, staff.id, "history must attribute the change to the acting member");
  assert.equal(last.note, "Preparing now");

  await updateOrderStatus(staff.id, businessId, orderId, { status: "CANCELLED", note: undefined });
  assert.equal((await getOrder(staff.id, businessId, orderId))!.status, "CANCELLED");

  // The OWNER can still read the member's changes (shared tenant history).
  assert.equal((await getOrder(ownerId, businessId, orderId))!.status, "CANCELLED");
});

test("tenant isolation: foreign, missing and non-member order ids are indistinguishable", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId, orderId } = fixture;

  // A second tenant with its own owner cannot reach this order.
  const other = await setupTenantWithOrder();
  await expectRejection(
    updateOrderStatus(other.ownerId, other.businessId, orderId, {
      status: "CONFIRMED",
      note: undefined,
    }),
    OrderNotFoundErrorName,
  );

  // A missing id and a foreign id behave identically.
  await expectRejection(
    updateOrderStatus(ownerId, businessId, "missing-order-id", {
      status: "CONFIRMED",
      note: undefined,
    }),
    OrderNotFoundErrorName,
  );

  // A non-member cannot even see the business.
  const outsider = await createUser();
  await expectRejection(
    updateOrderStatus(outsider.id, businessId, orderId, { status: "CONFIRMED", note: undefined }),
    BusinessNotFoundErrorName,
  );

  // Nothing leaked into the real order.
  const detail = await getOrder(ownerId, businessId, orderId);
  assert.equal(detail!.status, "PENDING");
  assert.equal(detail!.statusHistory.length, 1);
});

test("concurrent status changes: only one wins and exactly one history row is added", async () => {
  const fixture = await setupTenantWithOrder();
  const { ownerId, businessId, orderId } = fixture;
  await advanceTo(fixture, orderId, "OUT_FOR_DELIVERY");

  // DELIVERED and CANCELLED are mutually exclusive from OUT_FOR_DELIVERY
  // (whichever wins, the other is illegal from the new status), so this race
  // has exactly one winner regardless of interleaving.
  const race = await Promise.allSettled([
    updateOrderStatus(ownerId, businessId, orderId, { status: "DELIVERED", note: undefined }),
    updateOrderStatus(ownerId, businessId, orderId, { status: "CANCELLED", note: undefined }),
  ]);

  const fulfilled = race.filter((result) => result.status === "fulfilled");
  const rejected = race.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one competing change may win");
  assert.equal(rejected.length, 1);

  const failure = (rejected[0] as PromiseRejectedResult).reason as Error;
  assert.equal(failure.name, InvalidTransitionName, `unexpected loser error: ${failure.message}`);

  const detail = await getOrder(ownerId, businessId, orderId);
  const winningStatus = (fulfilled[0] as PromiseFulfilledResult<{ status: string }>).value.status;
  assert.equal(detail!.status, winningStatus, "the stored status must match the winning request");
  assert.ok(winningStatus === "DELIVERED" || winningStatus === "CANCELLED");

  // Initial row + 4 forward steps + exactly one final change; the loser's
  // request left no trace.
  assert.equal(detail!.statusHistory.length, 6);
  const terminalRows = detail!.statusHistory.filter(
    (entry) => entry.newStatus === "DELIVERED" || entry.newStatus === "CANCELLED",
  );
  assert.equal(terminalRows.length, 1);
  assert.equal(terminalRows[0].oldStatus, "OUT_FOR_DELIVERY");
  assert.equal(detail!.statusHistory.at(-1)!.newStatus, winningStatus);

  // Two competing requests for the SAME target: at most one may win, because
  // the loser re-reads the updated status and hits the self-transition rule.
  const second = await createExtraOrder(fixture);
  const duplicate = await Promise.allSettled([
    updateOrderStatus(ownerId, businessId, second.id, { status: "CONFIRMED", note: undefined }),
    updateOrderStatus(ownerId, businessId, second.id, { status: "CONFIRMED", note: undefined }),
  ]);
  assert.equal(duplicate.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of duplicate) {
    if (result.status === "rejected") {
      assert.equal((result.reason as Error).name, InvalidTransitionName);
    }
  }

  const secondDetail = await getOrder(ownerId, businessId, second.id);
  assert.equal(secondDetail!.status, "CONFIRMED");
  assert.equal(secondDetail!.statusHistory.length, 2);
  assert.deepEqual(
    secondDetail!.statusHistory.map((entry) => [entry.oldStatus, entry.newStatus]),
    [
      [null, "PENDING"],
      ["PENDING", "CONFIRMED"],
    ],
  );
});
