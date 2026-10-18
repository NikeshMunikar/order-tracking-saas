import assert from "node:assert/strict";
import { test } from "node:test";

import { assertAuthSecret } from "../../src/lib/env/auth-env.ts";

// The startup check exists so a missing/weak Auth.js secret fails once, with a
// clear message, instead of producing an opaque 500 per request.

test("accepts a sufficiently long secret", () => {
  assert.doesNotThrow(() => assertAuthSecret("a".repeat(32)));
  assert.doesNotThrow(() => assertAuthSecret("x".repeat(88)));
});

test("rejects a missing or blank secret", () => {
  for (const value of [undefined, "", "   "]) {
    assert.throws(() => assertAuthSecret(value), /AUTH_SECRET is not set/);
  }
});

test("rejects a secret shorter than the minimum length", () => {
  assert.throws(() => assertAuthSecret("too-short"), /too short/);
  assert.throws(() => assertAuthSecret("a".repeat(31)), /too short/);
});

test("never echoes the secret value in the failure message", () => {
  // Short enough to be rejected, distinctive enough that the assertion below
  // would catch the value being interpolated into the message.
  const secret = "SECRET-VALUE-ABCDEFGHIJKLMNOPQR";
  assert.throws(
    () => assertAuthSecret(secret),
    (error: unknown) => error instanceof Error && !error.message.includes(secret),
  );
});
