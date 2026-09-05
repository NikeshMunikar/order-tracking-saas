import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "../../src/lib/security/password.ts";

// Uses Node's built-in test runner (node:test) — no new testing-framework
// dependency added. DEC-004 (unit/integration framework) remains OPEN;
// this is a minimal, non-binding verification aid for M1 only, not a
// resolution of DEC-004. See CURRENT_STATE.md.

test("hashPassword produces a hash that verifyPassword accepts for the correct password", async () => {
  const plainTextPassword = "correct-horse-battery-staple";

  const hash = await hashPassword(plainTextPassword);

  assert.notEqual(hash, plainTextPassword, "hash must not equal the plaintext password");

  const isValid = await verifyPassword(hash, plainTextPassword);
  assert.equal(isValid, true);
});

test("verifyPassword rejects an incorrect password", async () => {
  const hash = await hashPassword("correct-horse-battery-staple");

  const isValid = await verifyPassword(hash, "wrong-password");
  assert.equal(isValid, false);
});

test("verifyPassword returns false (does not throw) for a malformed hash", async () => {
  const isValid = await verifyPassword("not-a-real-argon2-hash", "anything");
  assert.equal(isValid, false);
});

test("hashPassword produces different hashes for the same input (random salt)", async () => {
  const password = "correct-horse-battery-staple";

  const hashA = await hashPassword(password);
  const hashB = await hashPassword(password);

  assert.notEqual(hashA, hashB);
});
