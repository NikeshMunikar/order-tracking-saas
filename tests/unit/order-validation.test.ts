import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORDER_MAX_ITEMS,
  createOrderSchema,
  orderItemInputSchema,
  updateOrderSchema,
} from "../../src/lib/validation/order.ts";
import {
  computeLineSubtotal,
  computeOrderTotals,
  formatMinorUnits,
  parseMinorUnits,
} from "../../src/lib/money.ts";

// MASTER_SPEC §28 rules encoded in src/lib/validation/order.ts and the
// DEC-006/AMB-001 money rules in src/lib/money.ts, pinned as unit tests.
// Money arithmetic only ever happens on BigInt minor units — never floats.

test("parseMinorUnits converts decimal strings into exact minor units", () => {
  assert.equal(parseMinorUnits("1800"), 180000n);
  assert.equal(parseMinorUnits("1800.5"), 180050n);
  assert.equal(parseMinorUnits("1800.50"), 180050n);
  assert.equal(parseMinorUnits("0"), 0n);
  assert.equal(parseMinorUnits("0.05"), 5n);
  assert.equal(parseMinorUnits("99999999.99"), 9999999999n);
});

test("formatMinorUnits round-trips and keeps a stable 2-decimal scale", () => {
  assert.equal(formatMinorUnits(180050n), "1800.50");
  assert.equal(formatMinorUnits(180000n), "1800.00");
  assert.equal(formatMinorUnits(0n), "0.00");
  assert.equal(formatMinorUnits(parseMinorUnits("0.05")), "0.05");
  assert.equal(formatMinorUnits(parseMinorUnits("99999999.99")), "99999999.99");
});

test("computeOrderTotals applies subtotal + deliveryFee − discount exactly", () => {
  // AMB-001 resolved 2026-10-18: fixed-amount discount, server-side only.
  const totals = computeOrderTotals(
    [
      { unitPrice: "1800.50", quantity: 2 },
      { unitPrice: "700", quantity: 1 },
    ],
    "500",
    "120",
  );
  // 1800.50×2 + 700 = 4301.00; +120 − 500 = 3921.00
  assert.equal(totals.subtotal, "4301.00");
  assert.equal(totals.total, "3921.00");

  const zeroDiscount = computeOrderTotals([{ unitPrice: "0.01", quantity: 1 }], "0", "0");
  assert.equal(zeroDiscount.subtotal, "0.01");
  assert.equal(zeroDiscount.total, "0.01");

  const exactDiscount = computeOrderTotals([{ unitPrice: "1800", quantity: 1 }], "1850", "50");
  assert.equal(exactDiscount.total, "0.00");
});

test("computeOrderTotals rejects a discount that drives the total below zero", () => {
  // MASTER_SPEC §28: "Discount cannot create an invalid total" — rejection,
  // never clamping. 0.01-and-0.02-scale examples keep this independent of
  // float rounding.
  assert.throws(
    () => computeOrderTotals([{ unitPrice: "0.05", quantity: 1 }, { unitPrice: "0.02", quantity: 1 }], "3", "0"),
    (error: unknown) => error instanceof Error && error.name === "InvalidTotalsError",
  );
  // discount + subtotal equal exactly → allowed only when total reaches zero
  assert.throws(
    () => computeOrderTotals([{ unitPrice: "10", quantity: 1 }], "10.01", "0"),
    (error: unknown) => error instanceof Error && error.name === "InvalidTotalsError",
  );
});

test("computeLineSubtotal scales unit price by quantity exactly", () => {
  assert.equal(computeLineSubtotal("1800.50", 3), "5401.50");
  assert.equal(computeLineSubtotal("0.10", 3), "0.30");
});

test("orderItemInputSchema enforces positive integer quantities (§28)", () => {
  assert.equal(orderItemInputSchema.safeParse({ productId: "x".repeat(25), quantity: 1 }).success, true);
  assert.equal(orderItemInputSchema.safeParse({ productId: "x".repeat(25), quantity: "3" }).success, true);

  for (const quantity of [0, -1, 1.5, "abc", 1000]) {
    assert.equal(
      orderItemInputSchema.safeParse({ productId: "x".repeat(25), quantity }).success,
      false,
      `quantity ${quantity} must be rejected`,
    );
  }
});

test("createOrderSchema requires at least one item and caps item count", () => {
  const item = { productId: "x".repeat(25), quantity: 1 };
  const base = {
    deliveryType: "DELIVERY",
    deliveryName: "Ram Sharma",
    deliveryPhone: "9800000001",
    deliveryAddress: "Kathmandu",
    discount: "0",
    deliveryFee: "120",
    paymentStatus: "UNPAID",
  };

  assert.equal(createOrderSchema.safeParse({ ...base, customerId: "c1", items: [] }).success, false);
  assert.equal(
    createOrderSchema.safeParse({ ...base, customerId: "c1", items: Array.from({ length: ORDER_MAX_ITEMS + 1 }, () => item) })
      .success,
    false,
  );
  assert.equal(
    createOrderSchema.safeParse({ ...base, customerId: "c1", items: [item] }).success,
    true,
  );
});

test("createOrderSchema validates money, enums and delivery recipient fields", () => {
  const item = { productId: "x".repeat(25), quantity: 1 };
  const customerId = "c".repeat(25);

  const valid = createOrderSchema.safeParse({
    customerId,
    items: [item],
    deliveryType: "DELIVERY",
    deliveryName: "Ram Sharma",
    deliveryPhone: "9800000001",
    deliveryAddress: "Kathmandu",
    discount: "500.50",
    deliveryFee: "120",
    estimatedDeliveryAt: "2026-10-20T10:00",
    paymentStatus: "UNPAID",
    notes: "Ring the doorbell",
  });
  if (!valid.success) assert.fail("expected a valid DELIVERY order to parse");
  assert.equal(valid.data.deliveryName, "Ram Sharma");
  assert.equal(valid.data.estimatedDeliveryAt, "2026-10-20T10:00");
  assert.equal(valid.data.notes, "Ring the doorbell");

  const pickup = createOrderSchema.safeParse({
    customerId,
    items: [item],
    deliveryType: "PICKUP",
    discount: "0",
    deliveryFee: "0",
    paymentStatus: "PAID",
  });
  if (!pickup.success) assert.fail("expected a minimal PICKUP order to parse");
  assert.equal(pickup.data.deliveryName, undefined);
  assert.equal(pickup.data.notes, undefined);

  for (const [field, value] of [
    ["discount", "-5"],
    ["discount", "1.999"],
    ["discount", "abc"],
    ["deliveryFee", "-1"],
    ["deliveryFee", "10.5.1"],
  ] as const) {
    const attempt = createOrderSchema.safeParse({
      customerId,
      items: [item],
      deliveryType: "PICKUP",
      [field]: value,
      deliveryFee: field === "deliveryFee" ? value : "0",
      discount: field === "discount" ? value : "0",
      paymentStatus: "UNPAID",
    });
    assert.equal(attempt.success, false, `money field ${field}=${value} must be rejected`);
  }

  assert.equal(
    createOrderSchema.safeParse({
      customerId,
      items: [item],
      deliveryType: "PICKUP",
      discount: "0",
      deliveryFee: "0",
      paymentStatus: "NOT_A_STATUS",
    }).success,
    false,
  );
  assert.equal(
    createOrderSchema.safeParse({
      customerId,
      items: [item],
      deliveryType: "COURIER",
      discount: "0",
      deliveryFee: "0",
      paymentStatus: "UNPAID",
    }).success,
    false,
  );
});

test("updateOrderSchema mirrors create shape without customerId (full edit)", () => {
  const item = { productId: "x".repeat(25), quantity: 2 };
  const update = updateOrderSchema.safeParse({
    items: [item],
    deliveryType: "DELIVERY",
    deliveryName: "  Ram Sharma  ",
    deliveryPhone: "9800000001",
    deliveryAddress: "Kathmandu",
    discount: "0",
    deliveryFee: "120",
    paymentStatus: "PARTIALLY_PAID",
    notes: "",
  });
  if (!update.success) assert.fail("expected an update shape to parse");
  // Full-replacement semantics: an ABSENT notes field is normalised to
  // undefined, which the service stores as '' (the Order.notes column is
  // NOT NULL with default '').
  assert.equal(update.data.notes, undefined, "absent notes must normalise to undefined");
  assert.equal("customerId" in update.data, false);
});
