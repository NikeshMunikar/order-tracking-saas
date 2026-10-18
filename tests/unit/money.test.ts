import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeLineSubtotal,
  computeOrderTotals,
  formatMinorUnits,
  parseMinorUnits,
} from "../../src/lib/money.ts";

// DEC-006: authoritative money never touches IEEE-754 numbers. These tests
// pin the BigInt-minor-units arithmetic that the order service depends on.

test("parseMinorUnits + formatMinorUnits keep an exact 2-decimal round trip", () => {
  for (const [text, minor] of [
    ["0", 0n],
    ["0.05", 5n],
    ["0.1", 10n],
    ["0.10", 10n],
    ["1", 100n],
    ["1.99", 199n],
    ["1800", 180000n],
    ["1800.5", 180050n],
    ["1800.50", 180050n],
    ["99999999.99", 9999999999n],
  ] as const) {
    assert.equal(parseMinorUnits(text), minor, `parseMinorUnits(${text})`);
  }
});

test("formatMinorUnits always renders two decimal places", () => {
  assert.equal(formatMinorUnits(0n), "0.00");
  assert.equal(formatMinorUnits(5n), "0.05");
  assert.equal(formatMinorUnits(100000n), "1000.00");
  assert.equal(formatMinorUnits(-150n), "-1.50");
});

test("computeOrderTotals = Σ(line) + deliveryFee − discount, exactly", () => {
  const totals = computeOrderTotals(
    [
      { unitPrice: "1800.50", quantity: 2 },
      { unitPrice: "2200", quantity: 1 },
      { unitPrice: "700", quantity: 3 },
    ],
    "1500.75",
    "250",
  );
  // 3601.00 + 2200.00 + 2100.00 = 7901.00; + 250 − 1500.75 = 6650.25
  assert.equal(totals.subtotal, "7901.00");
  assert.equal(totals.total, "6650.25");
});

test("line subtotal times quantity is exact at the minor-unit level", () => {
  assert.equal(computeLineSubtotal("0.07", 3), "0.21");
  assert.equal(computeLineSubtotal("1800.50", 2), "3601.00");
});
