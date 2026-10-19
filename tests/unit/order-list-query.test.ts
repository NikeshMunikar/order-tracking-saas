import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ORDER_PAGE_MAX,
  ORDER_SEARCH_MAX_LENGTH,
  parseOrderListQuery,
} from "../../src/lib/validation/order.ts";

// M8 decisions D3/D4: the order list accepts `q` (order number or customer
// name), `status` (a DEC-013 status) and `page`. All three arrive from the URL,
// so they are validated/coerced here. Parsing is independent: one bad value
// must not discard the others (the M3 audit F3 rule).

test("parses a valid q, status and page", () => {
  const parsed = parseOrderListQuery({ q: "  ORD-1001  ", status: "PREPARING", page: "3" });

  assert.equal(parsed.q, "ORD-1001");
  assert.equal(parsed.status, "PREPARING");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.searchError, undefined);
  assert.equal(parsed.statusError, undefined);
  assert.equal(parsed.pageError, undefined);
});

test("treats missing parameters as no filter and no error", () => {
  const parsed = parseOrderListQuery({});

  assert.equal(parsed.q, undefined);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.page, undefined);
  assert.equal(parsed.searchError, undefined);
  assert.equal(parsed.statusError, undefined);
  assert.equal(parsed.pageError, undefined);
});

test("rejects a status that is not a DEC-013 status", () => {
  const parsed = parseOrderListQuery({ q: "Ram", status: "SHIPPED" });

  assert.equal(parsed.status, undefined);
  assert.match(parsed.statusError ?? "", /status/i);
  // The valid search term survives the invalid status.
  assert.equal(parsed.q, "Ram");
  assert.equal(parsed.searchError, undefined);
});

test("rejects an over-long search term without losing the other parameters", () => {
  const parsed = parseOrderListQuery({
    q: "x".repeat(ORDER_SEARCH_MAX_LENGTH + 1),
    status: "DELIVERED",
    page: "2",
  });

  assert.equal(parsed.q, undefined);
  assert.match(parsed.searchError ?? "", /too long/i);
  assert.equal(parsed.status, "DELIVERED");
  assert.equal(parsed.page, 2);
});

test("rejects page values that are not positive integers within the cap", () => {
  for (const page of ["0", "-1", "1.5", "abc", String(ORDER_PAGE_MAX + 1)]) {
    const parsed = parseOrderListQuery({ q: "Ram", page });
    assert.equal(parsed.page, undefined, `expected page ${page} to be rejected`);
    assert.ok(parsed.pageError, `expected a page error for ${page}`);
    assert.equal(parsed.q, "Ram");
  }
});

test("accepts the highest page number", () => {
  const parsed = parseOrderListQuery({ page: String(ORDER_PAGE_MAX) });

  assert.equal(parsed.page, ORDER_PAGE_MAX);
  assert.equal(parsed.pageError, undefined);
});

test("ignores array-valued parameters instead of crashing", () => {
  const parsed = parseOrderListQuery({ q: ["a", "b"], status: ["PENDING"], page: ["2"] });

  assert.equal(parsed.q, undefined);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.page, undefined);
  assert.equal(parsed.searchError, undefined);
  assert.equal(parsed.statusError, undefined);
  assert.equal(parsed.pageError, undefined);
});

test("keeps an empty search term as an empty string rather than an error", () => {
  const parsed = parseOrderListQuery({ q: "   " });

  assert.equal(parsed.q, "");
  assert.equal(parsed.searchError, undefined);
});
