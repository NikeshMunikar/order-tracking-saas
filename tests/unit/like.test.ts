import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeLikePattern } from "../../src/lib/db/like.ts";

// M3 audit F1. Prisma's `contains`/`startsWith`/`endsWith` filters have no
// `escape` option and compile to SQL LIKE/ILIKE on PostgreSQL, whose default
// escape character is the backslash. Callers must therefore escape the pattern
// themselves, or a search for "%" matches every row.

test("escapeLikePattern escapes the LIKE metacharacters", () => {
  assert.equal(escapeLikePattern("%"), "\\%");
  assert.equal(escapeLikePattern("_"), "\\_");
  assert.equal(escapeLikePattern("\\"), "\\\\");
  assert.equal(escapeLikePattern("100%"), "100\\%");
  assert.equal(escapeLikePattern("a_b"), "a\\_b");
  assert.equal(escapeLikePattern("A%b"), "A\\%b");
});

test("escapeLikePattern escapes a backslash before the metacharacter it precedes", () => {
  // `\%` must become `\\\%`: the backslash is escaped first so it stays a
  // literal character and cannot turn the `%` back into a wildcard.
  assert.equal(escapeLikePattern("\\%"), "\\\\\\%");
  assert.equal(escapeLikePattern("\\_"), "\\\\\\_");
});

test("escapeLikePattern leaves ordinary search text untouched", () => {
  assert.equal(escapeLikePattern(""), "");
  assert.equal(escapeLikePattern("Ram Sharma"), "Ram Sharma");
  assert.equal(escapeLikePattern("9812345678"), "9812345678");
  assert.equal(escapeLikePattern("a-b.c?d"), "a-b.c?d");
  assert.equal(escapeLikePattern("Bishal's Store"), "Bishal's Store");
});
