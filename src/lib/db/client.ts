import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Standard Next.js/Prisma singleton pattern: avoids exhausting database
// connections from module re-instantiation across hot reloads in
// development. Prisma access must stay behind this server-only module —
// UI components must never import PrismaClient directly (docs/development.md §5A).
//
// Prisma 7 compatibility: PrismaClient no longer reads a connection URL
// from the generated schema (schema.prisma's datasource.url was removed —
// see prisma/schema.prisma). It must instead be given a driver adapter
// explicitly. This is an implementation-detail compatibility fix, not an
// architecture change — still PostgreSQL, still Prisma, per DEC-001/§7 of
// docs/architecture.md.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
