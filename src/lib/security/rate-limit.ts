import { nowMs } from "@/lib/time";

/**
 * In-process, fixed-window rate limiting for the three boundary surfaces
 * (DEC-015 — Milestone 9, owner-approved):
 *
 *  - the public `/track/[token]` page,
 *  - the sign-in Server Action,
 *  - the invitation-acceptance Server Action.
 *
 * This is an INTERIM control. Its state is process-local memory: it does NOT
 * share enforcement across application instances, it resets whenever the
 * process restarts, and one instance's buckets are invisible to another.
 * Production-grade (shared/host-level) abuse protection is an explicit
 * Milestone 10 deployment dependency; DEC-002 (hosting) stays open.
 *
 * Properties required by the approval:
 *  - Bounded memory. Buckets live in a single `Map` capped at
 *    `RATE_LIMIT_MAX_BUCKETS` entries; when the cap is reached the buckets
 *    with the oldest `windowStart` are evicted first, so neither legitimate
 *    nor attacker-controlled keys can grow the map without bound. Eviction
 *    can re-window an unrelated evicted key (accepted for the interim).
 *  - No camouflage: the limiter runs IN ADDITION to authentication,
 *    invitation-token validation, tenant authorization and session checks —
 *    never instead of them. It receives only what it needs to decide
 *    (a key and the clock), so it cannot weaken any existing gate.
 *  - No enumeration: callers surface a single generic message on throttle.
 *  - Fairness: the auth (sign-in / invitation) limiters count FAILED
 *    attempts only; a success never consumes budget, so one user's failures
 *    cannot lock an unrelated user out of their own activity.
 *  - The key is a bounded-length string; keys never influence behavior
 *    beyond grouping.
 */

export type RateLimitConfig = { limit: number; windowMs: number };

export type RateLimitDecision = {
  allowed: boolean;
  /** Milliseconds until the current window ends (0 when allowed and the window already ended). */
  retryAfterMs: number;
};

export type RateLimitBucket = { windowStart: number; count: number };

/** Maximum number of buckets kept in memory at once (DEC-015). */
export const RATE_LIMIT_MAX_BUCKETS = 10_000;

/**
 * Maximum stored length of a rate-limit key. Identities are truncated before
 * they are stored, so a hostile `x-forwarded-for` header cannot inflate
 * per-entry memory.
 */
export const RATE_LIMIT_KEY_MAX_LENGTH = 72;

/** Public tracking page: 60 requests per 10-minute window per client (DEC-015). */
export const TRACKING_RATE_LIMIT: RateLimitConfig = {
  limit: 60,
  windowMs: 10 * 60_000,
};

/**
 * Sign-in: 10 FAILED attempts per 10-minute window per client (DEC-015).
 * Successful sign-ins must not call `recordFailure`.
 */
export const SIGN_IN_FAILURE_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 10 * 60_000,
};

/** Invitation acceptance: 10 FAILED attempts per 10-minute window per client (DEC-015). */
export const INVITATION_FAILURE_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowMs: 10 * 60_000,
};

/** Boundary prefixes; keep keys distinct even across separate limiter maps. */
export const RATE_LIMIT_BOUNDARY_TRACKING = "track";
export const RATE_LIMIT_BOUNDARY_SIGN_IN = "signin";
export const RATE_LIMIT_BOUNDARY_INVITATION = "invite";

/** The single generic throttle message for Server Actions (no enumeration). */
export const RATE_LIMITED_ACTION_MESSAGE = "Too many attempts. Please try again later.";

/**
 * Build a bounded key from a boundary prefix and a client identity.
 * Returns `null` when there is nothing usable (callers then decide whether a
 * missing identity may still be throttled under a fallback key).
 */
export function buildRateLimitKey(boundary: string, identity: string): string {
  const safeIdentity = identity.slice(0, RATE_LIMIT_KEY_MAX_LENGTH - boundary.length - 1);
  return `${boundary}:${safeIdentity}`;
}

export function isRateLimitConfigValid(config: RateLimitConfig): boolean {
  return (
    Number.isFinite(config.limit) &&
    Number.isInteger(config.limit) &&
    config.limit >= 1 &&
    Number.isFinite(config.windowMs) &&
    config.windowMs >= 1
  );
}

/**
 * Create one limiter. Each boundary uses its own instance (double-isolated
 * keyspaces: distinct configs AND distinct maps), so unrelated boundaries can
 * never consume each other's budget.
 *
 * `buckets` is injectable for unit tests; production uses the default Map.
 */
export function createRateLimiter(
  config: RateLimitConfig,
  buckets: Map<string, RateLimitBucket> = new Map(),
): {
  /** Count one request/attempt and return the decision. */
  consume: (key: string, now?: number) => RateLimitDecision;
  /** Peek without counting: is this key currently over its limit? */
  isBlocked: (key: string, now?: number) => boolean;
  /** Test/diagnostics only. */
  size: () => number;
} {
  if (!isRateLimitConfigValid(config)) {
    throw new Error("Invalid rate limit config: limit >= 1 and windowMs >= 1 required.");
  }

  function evictOldestWhileFull(): void {
    while (buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
      let oldestKey: string | null = null;
      let oldestWindowStart = Number.POSITIVE_INFINITY;
      for (const [key, bucket] of buckets) {
        if (bucket.windowStart < oldestWindowStart) {
          oldestWindowStart = bucket.windowStart;
          oldestKey = key;
        }
      }
      if (oldestKey === null) {
        // Defensive: an empty map below the cap cannot get here.
        return;
      }
      buckets.delete(oldestKey);
    }
  }

  function consume(key: string, now: number = nowMs()): RateLimitDecision {
    const bucket = buckets.get(key);
    const expired = bucket !== undefined && now - bucket.windowStart >= config.windowMs;

    if (bucket === undefined || expired) {
      evictOldestWhileFull();
      buckets.set(key, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }

    bucket.count += 1;
    if (bucket.count > config.limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(0, bucket.windowStart + config.windowMs - now),
      };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  function isBlocked(key: string, now: number = nowMs()): boolean {
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      return false;
    }
    if (now - bucket.windowStart >= config.windowMs) {
      return false;
    }
    return bucket.count >= config.limit;
  }

  return {
    consume,
    isBlocked,
    size: () => buckets.size,
  };
}
