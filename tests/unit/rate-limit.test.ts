import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRateLimitKey,
  createRateLimiter,
  isRateLimitConfigValid,
  RATE_LIMIT_BOUNDARY_INVITATION,
  RATE_LIMIT_BOUNDARY_SIGN_IN,
  RATE_LIMIT_BOUNDARY_TRACKING,
  RATE_LIMIT_KEY_MAX_LENGTH,
  RATE_LIMIT_MAX_BUCKETS,
  RATE_LIMITED_ACTION_MESSAGE,
  INVITATION_FAILURE_RATE_LIMIT,
  SIGN_IN_FAILURE_RATE_LIMIT,
  TRACKING_RATE_LIMIT,
} from "../../src/lib/security/rate-limit.ts";
import {
  RATE_LIMIT_IDENTITY_MAX_LENGTH,
  RATE_LIMIT_LOCAL_IDENTITY,
  readClientIdentityFromHeaders,
} from "../../src/lib/security/client-identity.ts";

// M9 interim in-process abuse protection (DEC-015): a fixed-window limiter
// with bounded memory for the public tracking page, sign-in failures and
// invitation-acceptance failures. These tests pin the contract: thresholds,
// window expiration, bounded memory under attacker-controlled keys, and the
// failure-only budget semantics for the auth boundaries.

const MINUTE = 60_000;
const TEN_MINUTES = 10 * MINUTE;

/** A tracking-shaped limiter with tiny numbers for fast, deterministic tests. */
function tinyTrackingLimiter() {
  return createRateLimiter({ limit: 3, windowMs: 5 * MINUTE }, new Map());
}

test("budget is consumed per request and blocks over the limit", () => {
  const limiter = tinyTrackingLimiter();

  for (let i = 1; i <= 3; i += 1) {
    assert.deepEqual(limiter.consume("ip-a", i * 1000), { allowed: true, retryAfterMs: 0 });
  }

  const blocked = limiter.consume("ip-a", 4000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 5 * MINUTE + 1000 - 4000, "measured from the window start (1000)");
});

test("different keys do not consume each other's budget", () => {
  const limiter = tinyTrackingLimiter();

  for (let i = 1; i <= 3; i += 1) {
    limiter.consume("ip-a", 1000);
  }
  assert.equal(limiter.consume("ip-a", 1000).allowed, false);
  assert.equal(limiter.consume("ip-b", 1000).allowed, true);
  assert.equal(limiter.isBlocked("ip-b", 1000), false);
});

test("the window expires and the budget resets", () => {
  const limiter = tinyTrackingLimiter();

  for (let i = 1; i <= 3; i += 1) {
    limiter.consume("ip-a", 1000);
  }
  assert.equal(limiter.isBlocked("ip-a", 1000), true);

  // One millisecond past the window start + windowMs the bucket is expired:
  // the next consume starts a fresh window and is allowed again.
  const fresh = limiter.consume("ip-a", 1000 + 5 * MINUTE + 1);
  assert.deepEqual(fresh, { allowed: true, retryAfterMs: 0 });

  for (let i = 1; i <= 2; i += 1) {
    assert.equal(limiter.consume("ip-a", 1000 + 5 * MINUTE + 1).allowed, true);
  }
  assert.equal(limiter.consume("ip-a", 1000 + 5 * MINUTE + 1).allowed, false);
});

test("isBlocked peeks without consuming (preflight semantics)", () => {
  const limiter = tinyTrackingLimiter();

  assert.equal(limiter.isBlocked("ip-a", 1000), false, "not throttled before failures");
  limiter.consume("ip-a", 1000);
  limiter.consume("ip-a", 1000);
  assert.equal(limiter.isBlocked("ip-a", 1000), false, "under the limit");
  limiter.consume("ip-a", 1000);
  assert.equal(limiter.isBlocked("ip-a", 1000), true, "at the limit");
  assert.equal(limiter.isBlocked("ip-a", 1000), true, "peek does not consume");
});

test("memory is bounded: distinct keys evict the oldest window", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: TEN_MINUTES }, new Map());

  // Fill the map with distinct attacker-controlled keys (e.g. forged
  // x-forwarded-for values), then exceed the cap.
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS; i += 1) {
    limiter.consume(`10.0.0.${i % 256}.${i}`, i);
  }
  assert.equal(limiter.size(), RATE_LIMIT_MAX_BUCKETS);

  // One more distinct key must not grow the map: the oldest window is evicted.
  limiter.consume("10.9.9.9", RATE_LIMIT_MAX_BUCKETS);
  assert.equal(limiter.size(), RATE_LIMIT_MAX_BUCKETS);
});

test("eviction restores service rather than permanently blocking new keys", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: TEN_MINUTES }, new Map());
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS; i += 1) {
    limiter.consume(`10.1.1.${i % 256}.${i}`, i);
  }

  // A brand-new key at a later time gets a bucket (evicting an old one).
  const decision = limiter.consume("10.8.8.8", RATE_LIMIT_MAX_BUCKETS + 1);
  assert.deepEqual(decision, { allowed: true, retryAfterMs: 0 });
});

test("repeated consume on one key keeps map growth at zero", () => {
  const limiter = tinyTrackingLimiter();
  for (let i = 0; i < 10_000; i += 1) {
    limiter.consume("ip-a", 1000);
  }
  assert.equal(limiter.size(), 1);
  assert.equal(limiter.consume("ip-a", 1000).allowed, false);
});

test("separate limiter instances are fully isolated", () => {
  const trackingLimiter = tinyTrackingLimiter();
  const authLimiter = createRateLimiter({ limit: 2, windowMs: TEN_MINUTES }, new Map());

  for (let i = 0; i < 3; i += 1) {
    trackingLimiter.consume("ip-a", 1000);
  }
  assert.equal(trackingLimiter.isBlocked("ip-a", 1000), true);
  assert.equal(authLimiter.isBlocked("ip-a", 1000), false, "the auth limiter has its own map");
});

test("boundary configs match DEC-015", () => {
  assert.deepEqual(TRACKING_RATE_LIMIT, { limit: 60, windowMs: TEN_MINUTES });
  assert.deepEqual(SIGN_IN_FAILURE_RATE_LIMIT, { limit: 10, windowMs: TEN_MINUTES });
  assert.deepEqual(INVITATION_FAILURE_RATE_LIMIT, { limit: 10, windowMs: TEN_MINUTES });
  assert.equal(RATE_LIMIT_MAX_BUCKETS, 10_000);
  assert.equal(RATE_LIMITED_ACTION_MESSAGE.length > 0, true);

  assert.equal(RATE_LIMIT_BOUNDARY_TRACKING, "track");
  assert.equal(RATE_LIMIT_BOUNDARY_SIGN_IN, "signin");
  assert.equal(RATE_LIMIT_BOUNDARY_INVITATION, "invite");
});

test("keys are bounded in length regardless of the identity", () => {
  assert.equal(
    buildRateLimitKey("track", "x".repeat(500)).length,
    RATE_LIMIT_KEY_MAX_LENGTH,
    "a hostile identity cannot inflate per-entry memory",
  );
  assert.equal(buildRateLimitKey("signin", "203.0.113.7"), "signin:203.0.113.7");
  assert.equal(
    isRateLimitConfigValid({ limit: 0, windowMs: 1000 }),
    false,
    "a zero limit would block everything and is rejected at creation",
  );
  assert.equal(isRateLimitConfigValid(TRACKING_RATE_LIMIT), true);
  assert.equal(isRateLimitConfigValid(SIGN_IN_FAILURE_RATE_LIMIT), true);
  assert.equal(isRateLimitConfigValid(INVITATION_FAILURE_RATE_LIMIT), true);
});

test("invalid limiter configs are rejected eagerly", () => {
  assert.throws(() => createRateLimiter({ limit: 0, windowMs: 1000 }, new Map()));
  assert.throws(() => createRateLimiter({ limit: 3, windowMs: 0 }, new Map()));
  assert.throws(() => createRateLimiter({ limit: 1.5, windowMs: 1000 }, new Map()));
});

test("client identity reads only the first x-forwarded-for hop and is bounded", () => {
  assert.equal(
    readClientIdentityFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })),
    "203.0.113.7",
    "the first hop only",
  );
  assert.equal(readClientIdentityFromHeaders(new Headers()), RATE_LIMIT_LOCAL_IDENTITY);
  assert.equal(
    readClientIdentityFromHeaders(new Headers({ "x-forwarded-for": "   " })),
    RATE_LIMIT_LOCAL_IDENTITY,
    "an empty hop falls back to the local identity",
  );
  assert.equal(
    readClientIdentityFromHeaders(new Headers({ "x-forwarded-for": `${"9".repeat(300)}.7` })).length,
    RATE_LIMIT_IDENTITY_MAX_LENGTH,
    "a hostile header cannot inflate the stored identity",
  );
  // No other header influences the identity.
  assert.equal(
    readClientIdentityFromHeaders(new Headers({ "x-real-ip": "203.0.113.9", "cf-connecting-ip": "203.0.113.9" })),
    RATE_LIMIT_LOCAL_IDENTITY,
  );
});
