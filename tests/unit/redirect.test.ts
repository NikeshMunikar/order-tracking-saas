import assert from "node:assert/strict";
import { test } from "node:test";

import { safeCallbackUrl } from "../../src/lib/security/redirect.ts";

// The login Server Action accepts a post-login destination from the browser
// (`callbackUrl`, used by the "sign in, then return to the invitation" flow).
// These tests pin the open-redirect guard: only same-origin absolute paths
// may survive; everything else falls back.

test("accepts a same-origin absolute path", () => {
  assert.equal(safeCallbackUrl("/dashboard"), "/dashboard");
  assert.equal(safeCallbackUrl("/invite/abc123"), "/invite/abc123");
});

test("preserves query strings on same-origin paths", () => {
  assert.equal(safeCallbackUrl("/invite/abc?x=1&y=2"), "/invite/abc?x=1&y=2");
});

test("falls back for missing or non-string values", () => {
  assert.equal(safeCallbackUrl(undefined), "/dashboard");
  assert.equal(safeCallbackUrl(null), "/dashboard");
  assert.equal(safeCallbackUrl(""), "/dashboard");
  assert.equal(safeCallbackUrl(42), "/dashboard");
});

test("rejects absolute URLs to another origin", () => {
  assert.equal(safeCallbackUrl("https://evil.example/phish"), "/dashboard");
  assert.equal(safeCallbackUrl("http://evil.example/phish"), "/dashboard");
});

test("rejects protocol-relative URLs", () => {
  assert.equal(safeCallbackUrl("//evil.example/phish"), "/dashboard");
});

test("rejects backslash-smuggled protocol-relative URLs", () => {
  // WHATWG URL parsing treats '\' as '/' for special schemes, so this must
  // not be able to resolve to another host.
  assert.equal(safeCallbackUrl("/\\evil.example/phish"), "/dashboard");
});

test("rejects non-http schemes", () => {
  assert.equal(safeCallbackUrl("javascript:alert(1)"), "/dashboard");
  assert.equal(safeCallbackUrl("data:text/html,<script>alert(1)</script>"), "/dashboard");
});

test("rejects a relative path that does not start at the root", () => {
  assert.equal(safeCallbackUrl("dashboard"), "/dashboard");
  assert.equal(safeCallbackUrl("../dashboard"), "/dashboard");
});

test("honours a caller-supplied fallback", () => {
  assert.equal(safeCallbackUrl(undefined, "/login"), "/login");
  assert.equal(safeCallbackUrl("//evil.example", "/login"), "/login");
});
