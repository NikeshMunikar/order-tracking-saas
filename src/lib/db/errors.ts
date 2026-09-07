/**
 * Detect a Prisma "unique constraint violation" error (P2002) structurally
 * rather than via `instanceof Prisma.PrismaClientKnownRequestError`.
 *
 * Prisma's `PrismaClientKnownRequestError` class is part of the generated
 * client output (`.prisma/client/*`, produced by `prisma generate`), not
 * the static `@prisma/client` package contents. Checking `error.code`
 * structurally works identically once the client is generated and avoids
 * an import that would not resolve in an environment where `prisma
 * generate` has not yet been run — see CURRENT_STATE.md for this
 * project's documented sandbox network limitation.
 *
 * This intentionally only checks the error code, not which column/index
 * triggered it — callers that need to distinguish, e.g., a slug collision
 * from a token-hash collision should use a bounded retry that regenerates
 * every value it controls (see the business/invitation services), rather
 * than branching on `error.meta.target`.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
