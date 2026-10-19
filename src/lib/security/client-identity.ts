/**
 * Bounded client-identity extraction for rate-limit keys (DEC-015).
 *
 * Only the FIRST hop of `x-forwarded-for` is consulted; no other request
 * header influences the key (a long chain of other spoofable headers would
 * multiply key cardinality and memory pressure for no benefit). The value is
 * truncated to `RATE_LIMIT_IDENTITY_MAX_LENGTH`, so a hostile header cannot
 * inflate per-entry memory; together with the limiter's bucket cap this
 * bounds the whole limiter state.
 *
 * Without the header (e.g. local development) a constant local identity is
 * used. With no trusted reverse proxy the identity is best-effort and an
 * attacker can rotate it freely — accepted for the interim control and
 * recorded as part of the Milestone 10 deployment dependency (the host must
 * supply the real client IP and/or terminate abuse protection).
 *
 * Pure and dependency-free so unit tests can exercise it with `new Headers()`.
 */

export const RATE_LIMIT_IDENTITY_MAX_LENGTH = 64;

/** Constant key identity when no forwarded client IP is available. */
export const RATE_LIMIT_LOCAL_IDENTITY = "local";

export function readClientIdentityFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded === null) {
    return RATE_LIMIT_LOCAL_IDENTITY;
  }

  const first = forwarded.split(",")[0] ?? "";
  const trimmed = first.trim();
  if (trimmed.length === 0) {
    return RATE_LIMIT_LOCAL_IDENTITY;
  }

  return trimmed.slice(0, RATE_LIMIT_IDENTITY_MAX_LENGTH);
}
