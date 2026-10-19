import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseProductSearchQuery,
  PRODUCT_SEARCH_MAX_LENGTH,
} from "../../src/lib/validation/product.ts";

// M8 decision D3 (MASTER_SPEC.md §20 "Search"): the product list accepts a `q`
// search term from the URL; it is length-checked and trimmed here, then escaped
// for the database query in the service.

test("parses and trims a search term", () => {
  const parsed = parseProductSearchQuery({ q: "  Chocolate Cake  " });

  assert.equal(parsed.q, "Chocolate Cake");
  assert.equal(parsed.searchError, undefined);
});

test("treats a missing term as no filter", () => {
  const parsed = parseProductSearchQuery({});

  assert.equal(parsed.q, undefined);
  assert.equal(parsed.searchError, undefined);
});

test("rejects an over-long term", () => {
  const parsed = parseProductSearchQuery({ q: "x".repeat(PRODUCT_SEARCH_MAX_LENGTH + 1) });

  assert.equal(parsed.q, undefined);
  assert.match(parsed.searchError ?? "", /too long/i);
});

test("ignores an array-valued term", () => {
  const parsed = parseProductSearchQuery({ q: ["a", "b"] });

  assert.equal(parsed.q, undefined);
  assert.equal(parsed.searchError, undefined);
});
