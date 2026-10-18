import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  createProductSchema,
  updateProductSchema,
} from "../../src/lib/validation/product.ts";

// MASTER_SPEC.md §28 requires server-side validation of product input; §28's
// "Price cannot be negative" and §29's decimal/money handling rule are pinned
// by the price tests below. Every value arrives from the browser, so these
// tests pin the validation boundary itself; they do not assert UI behaviour.

function minimalInput() {
  return { name: "Chocolate Cake", price: "1800", active: true };
}

test("accepts a minimal product and trims whitespace", () => {
  const parsed = createProductSchema.safeParse({
    ...minimalInput(),
    name: "  Chocolate Cake  ",
    price: " 1800 ",
  });

  if (!parsed.success) assert.fail("expected a minimal product to be accepted");
  assert.equal(parsed.data.name, "Chocolate Cake");
  assert.equal(parsed.data.price, "1800");
  assert.equal(parsed.data.active, true);
  assert.equal(parsed.data.description, undefined);
});

test("requires name, price, and active", () => {
  for (const missing of ["name", "price", "active"] as const) {
    const input = minimalInput();
    delete input[missing];
    const parsed = createProductSchema.safeParse(input);
    assert.equal(parsed.success, false, `"${missing}" must be required`);
  }
});

test("rejects over-long fields with the documented messages", () => {
  const longName = "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1);
  const parsedName = createProductSchema.safeParse({
    ...minimalInput(),
    name: longName,
  });
  if (parsedName.success) assert.fail("expected an over-long name to be rejected");
  assert.equal(parsedName.error.issues[0]?.message, "Product name is too long");

  const longDescription = "a".repeat(PRODUCT_DESCRIPTION_MAX_LENGTH + 1);
  const parsedDescription = createProductSchema.safeParse({
    ...minimalInput(),
    description: longDescription,
  });
  if (parsedDescription.success) assert.fail("expected an over-long description to be rejected");
  assert.equal(parsedDescription.error.issues[0]?.message, "Product description is too long");

  const okName = createProductSchema.safeParse({
    ...minimalInput(),
    name: "a".repeat(PRODUCT_NAME_MAX_LENGTH),
  });
  assert.equal(okName.success, true);
});

test("normalizes an empty description to undefined", () => {
  const parsed = createProductSchema.safeParse({ ...minimalInput(), description: "   " });
  if (!parsed.success) assert.fail("expected a blank description to be accepted");
  assert.equal(parsed.data.description, undefined);
});

test("price must be a non-negative decimal string with at most 2 fraction digits", () => {
  const accepted = ["0", "0.5", "0.00", "1800", "1800.50", "99999999.99", "00.10"];
  for (const price of accepted) {
    const parsed = createProductSchema.safeParse({ ...minimalInput(), price });
    assert.equal(parsed.success, true, `price "${price}" should be accepted`);
  }

  // MASTER_SPEC.md §28: "Price cannot be negative."
  const rejected: Array<[string, string]> = [
    ["-1", "a negative price"],
    ["-0.01", "a small negative price"],
    ["1.999", "more than 2 fraction digits"],
    [".50", "no integer part"],
    ["1.", "trailing dot"],
    ["abc", "non-numeric text"],
    ["1e3", "scientific notation"],
    [" 1 800", "internal spaces"],
    ["1,800", "thousands separators"],
    ["999999999.99", "9 integer digits (above the accepted bound)"],
    ["", "an empty string"],
  ];
  for (const [price, label] of rejected) {
    const parsed = createProductSchema.safeParse({ ...minimalInput(), price });
    assert.equal(parsed.success, false, `${label} (${price}) should be rejected`);
  }
});

test("active must be a real boolean, not a string", () => {
  for (const active of ["true", "on", 1] as unknown as boolean[]) {
    const parsed = createProductSchema.safeParse({ ...minimalInput(), active });
    assert.equal(parsed.success, false, `active "${String(active)}" must be rejected`);
  }
});

test("updateProductSchema accepts the same shape as createProductSchema", () => {
  const parsed = updateProductSchema.safeParse({ ...minimalInput(), active: false });
  if (!parsed.success) assert.fail("expected an update payload to be accepted");
  assert.equal(parsed.data.active, false);
  assert.equal(parsed.data.price, "1800");
});
