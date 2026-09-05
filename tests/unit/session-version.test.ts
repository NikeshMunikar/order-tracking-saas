import assert from "node:assert/strict";
import { test } from "node:test";

import { isSessionVersionCurrent } from "../../src/lib/security/session-version.ts";

test("matching sessionVersion is considered current", () => {
  assert.equal(isSessionVersionCurrent(3, 3), true);
});

test("mismatched sessionVersion is considered invalid (e.g. after password change)", () => {
  assert.equal(isSessionVersionCurrent(1, 2), false);
});

test("missing current sessionVersion (e.g. deleted user) is considered invalid", () => {
  assert.equal(isSessionVersionCurrent(1, undefined), false);
});

test("missing token sessionVersion is considered invalid", () => {
  assert.equal(isSessionVersionCurrent(undefined, 1), false);
});
