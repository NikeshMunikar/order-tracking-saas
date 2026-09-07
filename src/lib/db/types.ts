import { prisma } from "@/lib/db/client";

/**
 * Structural type covering both the top-level PrismaClient and an open
 * interactive-transaction client (the `tx` parameter inside
 * `prisma.$transaction(async (tx) => ...)`) — i.e. anything with the same
 * query methods (`businessMember.findUnique`, `$queryRaw`, etc.).
 *
 * Derived from `prisma.$transaction`'s own callback parameter type rather
 * than importing `Prisma.TransactionClient` from the generated `Prisma`
 * namespace, which (like the rest of the generated client) is unavailable
 * until `prisma generate` has been run — see src/lib/db/errors.ts for the
 * same reasoning applied to error detection.
 *
 * Exists so authorization checks (src/server/business/authorization.ts)
 * can be run either standalone (read-only lookups, using the default
 * `prisma` client) or inside an open transaction (mutations, using `tx`),
 * with the same function — see the module-level note in authorization.ts
 * on why mutations must check authorization via `tx`, not a separate
 * pre-transaction query.
 */
export type PrismaClientOrTransaction =
  | typeof prisma
  | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
