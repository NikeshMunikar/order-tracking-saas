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

test("rejects dot-segment payloads that normalize to a protocol-relative path", () => {
  // WHATWG URL parsing collapses dot segments, so each of these passes the
  // origin check while normalizing to "//evil.com". Returning it would be a
  // protocol-relative (open) redirect.
  assert.equal(safeCallbackUrl("/.//evil.com"), "/dashboard");
  assert.equal(safeCallbackUrl("/..//evil.com"), "/dashboard");
  assert.equal(safeCallbackUrl("/a/..//evil.com"), "/dashboard");
  assert.equal(safeCallbackUrl("/dashboard/..//evil.com"), "/dashboard");
  assert.equal(safeCallbackUrl("/.//evil.com/phish"), "/dashboard");
});

test("still accepts dot segments that normalize to a safe same-origin path", () => {
  assert.equal(safeCallbackUrl("/a/../dashboard"), "/dashboard");
  assert.equal(safeCallbackUrl("/./dashboard"), "/dashboard");
});

test("leaves percent-encoded variants unchanged without promoting them to an authority", () => {
  // These are not decoded into separators by URL parsing, so they stay
  // same-origin paths. Pinned here so the guard is not "fixed" later by
  // decoding untrusted input.
  for (const payload of [
    "/%2F%2Fevil.com",
    "/%2f%2fevil.com",
    "/%5Cevil.com",
    "/%2e%2e//evil.com",
    "/%252F%252Fevil.com",
  ]) {
    const result = safeCallbackUrl(payload);
    assert.ok(result.startsWith("/"), `${payload} should stay root-relative`);
    assert.ok(!/^\/[/\\]/.test(result), `${payload} must not become protocol-relative`);
  }
});

test("honours a caller-supplied fallback", () => {
  assert.equal(safeCallbackUrl(undefined, "/login"), "/login");
  assert.equal(safeCallbackUrl("//evil.example", "/login"), "/login");
});
