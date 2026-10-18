import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CUSTOMER_SEARCH_MAX_LENGTH,
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from "../../src/lib/validation/customer.ts";

// MASTER_SPEC.md §28 requires server-side validation for customer input and
// states that "required customer fields must exist". Every value below arrives
// from the browser, so these tests pin the validation boundary itself; they do
// not assert UI behaviour.

test("accepts a minimal customer and trims whitespace", () => {
  const parsed = createCustomerSchema.safeParse({
    name: "  Ram Sharma  ",
    phone: "  9800000001  ",
  });

  if (!parsed.success) assert.fail("expected a minimal customer to be accepted");
  assert.equal(parsed.data.name, "Ram Sharma");
  assert.equal(parsed.data.phone, "9800000001");
  assert.equal(parsed.data.email, undefined);
  assert.equal(parsed.data.address, undefined);
  assert.equal(parsed.data.notes, undefined);
});

test("requires both name and phone", () => {
  const missing = createCustomerSchema.safeParse({});
  if (missing.success) assert.fail("expected an empty customer to be rejected");
  assert.deepEqual(
    missing.error.issues.map((issue) => issue.path.join(".")),
    ["name", "phone"],
  );

  const missingPhone = createCustomerSchema.safeParse({ name: "Sita Thapa" });
  assert.equal(missingPhone.success, false);

  const blankName = createCustomerSchema.safeParse({ name: "   ", phone: "9800000001" });
  if (blankName.success) assert.fail("expected a blank name to be rejected");
  assert.equal(blankName.error.issues[0]?.message, "Customer name is required");
});

test("rejects over-long fields with the documented messages", () => {
  const tooLongName = createCustomerSchema.safeParse({
    name: "a".repeat(121),
    phone: "9800000001",
  });
  if (tooLongName.success) assert.fail("expected an over-long name to be rejected");
  assert.equal(tooLongName.error.issues[0]?.message, "Customer name is too long");

  const tooLongPhone = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9".repeat(31),
  });
  if (tooLongPhone.success) assert.fail("expected an over-long phone to be rejected");
  assert.equal(tooLongPhone.error.issues[0]?.message, "Phone number is too long");

  const tooLongAddress = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9800000001",
    address: "a".repeat(501),
  });
  if (tooLongAddress.success) assert.fail("expected an over-long address to be rejected");
  assert.equal(tooLongAddress.error.issues[0]?.message, "Address is too long");

  const tooLongNotes = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9800000001",
    notes: "a".repeat(2001),
  });
  if (tooLongNotes.success) assert.fail("expected over-long notes to be rejected");
  assert.equal(tooLongNotes.error.issues[0]?.message, "Notes are too long");
});

test("normalizes empty optional strings to undefined", () => {
  const parsed = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9800000001",
    email: "",
    address: "",
    notes: "",
  });

  if (!parsed.success) assert.fail("expected empty optional fields to be accepted");
  assert.equal(parsed.data.email, undefined);
  assert.equal(parsed.data.address, undefined);
  assert.equal(parsed.data.notes, undefined);
});

test("normalizes email to lowercase and rejects malformed values", () => {
  const parsed = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9800000001",
    email: "  RAM@Example.TEST  ",
  });
  if (!parsed.success) assert.fail("expected a valid email to be accepted");
  assert.equal(parsed.data.email, "ram@example.test");

  const malformed = createCustomerSchema.safeParse({
    name: "Ram Sharma",
    phone: "9800000001",
    email: "not-an-email",
  });
  if (malformed.success) assert.fail("expected a malformed email to be rejected");
  assert.equal(malformed.error.issues[0]?.message, "Enter a valid email address");
});

test("updateCustomerSchema accepts the same shape as createCustomerSchema", () => {
  const parsed = updateCustomerSchema.safeParse({
    name: "Hari Gurung",
    phone: "9800000002",
    address: "Pokhara",
  });

  if (!parsed.success) assert.fail("expected an update payload to be accepted");
  assert.equal(parsed.data.address, "Pokhara");
});

test("customerListQuerySchema coerces the page and trims the search term", () => {
  const parsed = customerListQuerySchema.safeParse({ page: "2", q: "  ram  " });
  if (!parsed.success) assert.fail("expected a well-formed list query to be accepted");
  assert.equal(parsed.data.page, 2);
  assert.equal(parsed.data.q, "ram");

  const empty = customerListQuerySchema.safeParse({});
  if (!empty.success) assert.fail("expected an empty list query to be accepted");
  assert.equal(empty.data.page, undefined);
  assert.equal(empty.data.q, undefined);

  const blankQuery = customerListQuerySchema.safeParse({ q: "   " });
  if (!blankQuery.success) assert.fail("expected a blank search term to be accepted");
  assert.equal(blankQuery.data.q, "");
});

test("customerListQuerySchema rejects a non-numeric or non-positive page", () => {
  for (const page of ["abc", "0", "-1", "1.5"]) {
    assert.equal(
      customerListQuerySchema.safeParse({ page }).success,
      false,
      `page "${page}" should be rejected`,
    );
  }
});

test("customerListQuerySchema bounds the search term length", () => {
  assert.equal(
    customerListQuerySchema.safeParse({ q: "a".repeat(CUSTOMER_SEARCH_MAX_LENGTH) }).success,
    true,
  );
  assert.equal(
    customerListQuerySchema.safeParse({ q: "a".repeat(CUSTOMER_SEARCH_MAX_LENGTH + 1) }).success,
    false,
  );
});

test("customerListQuerySchema ignores repeated query parameters instead of failing", () => {
  // `?q=a&q=b` and `?page=1&page=2` arrive as arrays from searchParams. They
  // are not strings, so they are dropped rather than trusted or crashed on.
  const parsed = customerListQuerySchema.safeParse({ q: ["a", "b"], page: ["1", "2"] });
  if (!parsed.success) assert.fail("expected repeated query parameters to be ignored");
  assert.equal(parsed.data.q, undefined);
  assert.equal(parsed.data.page, undefined);
});
