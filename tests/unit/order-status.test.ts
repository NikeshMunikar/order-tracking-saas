import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALLOWED_ORDER_STATUS_TRANSITIONS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  TERMINAL_ORDER_STATUSES,
  canTransitionOrderStatus,
  isOrderStatus,
  isTerminalOrderStatus,
  nextOrderStatuses,
  orderStatusLabel,
} from "../../src/lib/order-status.ts";
import type { OrderStatusValue } from "../../src/lib/order-status.ts";

// DEC-013 ("Order status transition and cancellation matrix", owner-accepted
// 2026-10-18, resolving AMB-002) pinned as unit tests. The matrix is the single
// source of truth shared by the server service (authoritative) and the UI.
//
// Owner decision: CANCELLED is reachable from every pre-delivery status but
// never from DELIVERED; forward movement is exactly one step with no skipped or
// backwards transitions; DELIVERED and CANCELLED are terminal.

const PRE_DELIVERY_STATUSES: OrderStatusValue[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
];

const FORWARD_SEQUENCE: OrderStatusValue[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

test("the status set contains every approved status, including CANCELLED", () => {
  assert.deepEqual([...ORDER_STATUSES], [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]);
  assert.equal(ORDER_STATUSES.length, 7);
  // Every status has a human label for the controls.
  for (const status of ORDER_STATUSES) {
    assert.equal(typeof ORDER_STATUS_LABELS[status], "string");
    assert.ok(ORDER_STATUS_LABELS[status].length > 0);
  }
});

test("only DELIVERED and CANCELLED are terminal", () => {
  assert.deepEqual([...TERMINAL_ORDER_STATUSES], ["DELIVERED", "CANCELLED"]);
  for (const status of ORDER_STATUSES) {
    assert.equal(isTerminalOrderStatus(status), status === "DELIVERED" || status === "CANCELLED");
  }
});

test("nextOrderStatuses offers exactly one forward step plus CANCELLED before delivery", () => {
  for (const status of PRE_DELIVERY_STATUSES) {
    const expected = [...nextOrderStatuses(status)].sort();
    assert.deepEqual(expected, ["CANCELLED", FORWARD_SEQUENCE[FORWARD_SEQUENCE.indexOf(status) + 1]].sort());
  }
  assert.deepEqual(nextOrderStatuses("DELIVERED"), []);
  assert.deepEqual(nextOrderStatuses("CANCELLED"), []);
});

test("nextOrderStatuses returns a copy that cannot mutate the matrix", () => {
  const next = nextOrderStatuses("PENDING");
  next.push("DELIVERED");
  assert.deepEqual(ALLOWED_ORDER_STATUS_TRANSITIONS.PENDING, ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(nextOrderStatuses("PENDING"), ["CONFIRMED", "CANCELLED"]);
});

test("every allowed edge is accepted by canTransitionOrderStatus", () => {
  for (const from of ORDER_STATUSES) {
    for (const to of ALLOWED_ORDER_STATUS_TRANSITIONS[from]) {
      assert.equal(canTransitionOrderStatus(from, to), true, `${from} -> ${to} should be allowed`);
    }
  }
});

test("exactly one forward step is allowed: skipped steps are rejected", () => {
  // PENDING -> PREPARING (skips CONFIRMED), READY -> DELIVERED (skips
  // OUT_FOR_DELIVERY), CONFIRMED -> DELIVERED (skips two).
  const skipped: Array<[OrderStatusValue, OrderStatusValue]> = [
    ["PENDING", "PREPARING"],
    ["CONFIRMED", "READY"],
    ["PREPARING", "OUT_FOR_DELIVERY"],
    ["READY", "DELIVERED"],
    ["PENDING", "DELIVERED"],
  ];
  for (const [from, to] of skipped) {
    assert.equal(canTransitionOrderStatus(from, to), false, `${from} -> ${to} must be rejected`);
  }
});

test("backwards transitions are rejected", () => {
  for (let index = 1; index < FORWARD_SEQUENCE.length; index += 1) {
    const from = FORWARD_SEQUENCE[index];
    for (const to of FORWARD_SEQUENCE.slice(0, index)) {
      assert.equal(canTransitionOrderStatus(from, to), false, `${from} -> ${to} must be rejected`);
    }
  }
  // MASTER_SPEC's explicit nonsensical example.
  assert.equal(canTransitionOrderStatus("DELIVERED", "PREPARING"), false);
});

test("self-transitions are never a change", () => {
  for (const status of ORDER_STATUSES) {
    assert.equal(canTransitionOrderStatus(status, status), false);
  }
});

test("CANCELLED is reachable from every pre-delivery status but not from DELIVERED", () => {
  for (const status of PRE_DELIVERY_STATUSES) {
    assert.equal(canTransitionOrderStatus(status, "CANCELLED"), true, `${status} -> CANCELLED`);
  }
  assert.equal(canTransitionOrderStatus("DELIVERED", "CANCELLED"), false);
});

test("terminal statuses allow no transitions at all", () => {
  for (const terminal of TERMINAL_ORDER_STATUSES) {
    for (const status of ORDER_STATUSES) {
      assert.equal(canTransitionOrderStatus(terminal, status), false, `${terminal} -> ${status}`);
    }
  }
});

test("no status can transition back into PENDING", () => {
  for (const status of ORDER_STATUSES) {
    assert.equal(canTransitionOrderStatus(status, "PENDING"), false, `${status} -> PENDING`);
  }
});

test("isOrderStatus narrows only known statuses", () => {
  assert.equal(isOrderStatus("PENDING"), true);
  assert.equal(isOrderStatus("CANCELLED"), true);
  assert.equal(isOrderStatus("pending"), false);
  assert.equal(isOrderStatus("SHIPPED"), false);
  assert.equal(isOrderStatus(undefined), false);
  assert.equal(isOrderStatus(42), false);
});

test("orderStatusLabel renders friendly text and tolerates unknown values", () => {
  assert.equal(orderStatusLabel("OUT_FOR_DELIVERY"), "Out for delivery");
  assert.equal(orderStatusLabel("CANCELLED"), "Cancelled");
  assert.equal(orderStatusLabel("SHIPPED"), "SHIPPED");
});
