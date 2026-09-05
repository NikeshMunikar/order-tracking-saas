/**
 * Pure comparison logic for the DEC-001 `sessionVersion` global JWT
 * invalidation mechanism (docs/architecture-decisions.md).
 *
 * A JWT is current only if the database still has a matching user record
 * with the exact same sessionVersion the token was issued with. Any
 * mismatch (including a deleted/missing user) means the token must be
 * treated as invalid — e.g. after a password change/reset or business
 * membership removal increments sessionVersion.
 *
 * Kept as a pure function (no Prisma/DB import) so it can be unit tested
 * without a database connection.
 */
export function isSessionVersionCurrent(
  tokenSessionVersion: number | undefined,
  currentSessionVersion: number | undefined,
): boolean {
  if (typeof tokenSessionVersion !== "number" || typeof currentSessionVersion !== "number") {
    return false;
  }

  return tokenSessionVersion === currentSessionVersion;
}
