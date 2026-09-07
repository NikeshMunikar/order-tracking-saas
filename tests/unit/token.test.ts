import assert from "node:assert/strict";
import { test } from "node:test";

import { generateSecureToken, hashToken } from "../../src/lib/security/token.ts";

test("generateSecureToken produces a URL-safe raw token with no padding/unsafe characters", () => {
  const { rawToken } = generateSecureToken();

  // 32 random bytes, base64url-encoded (no '+', '/', or '=' padding).
  assert.match(rawToken, /^[A-Za-z0-9_-]+$/);
  // base64url of 32 bytes is 43 characters (no padding).
  assert.equal(rawToken.length, 43);
});

test("generateSecureToken's tokenHash is a 64-character hex SHA-256 digest", () => {
  const { tokenHash } = generateSecureToken();

  assert.match(tokenHash, /^[a-f0-9]{64}$/);
});

test("hashToken(rawToken) matches the tokenHash returned alongside it", () => {
  const { rawToken, tokenHash } = generateSecureToken();

  assert.equal(hashToken(rawToken), tokenHash);
});

test("hashToken is deterministic for the same input", () => {
  const raw = "fixed-example-token-value";
  assert.equal(hashToken(raw), hashToken(raw));
});

test("hashToken produces different hashes for different inputs", () => {
  assert.notEqual(hashToken("token-a"), hashToken("token-b"));
});

test("generateSecureToken does not repeat across calls (entropy sanity check)", () => {
  const tokens = new Set(Array.from({ length: 50 }, () => generateSecureToken().rawToken));
  assert.equal(tokens.size, 50, "expected 50 distinct tokens from 50 calls");
});
