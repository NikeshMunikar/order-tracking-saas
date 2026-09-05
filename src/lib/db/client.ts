import "server-only";

import { PrismaClient } from "@prisma/client";

// Standard Next.js/Prisma singleton pattern: avoids exhausting database
// connections from module re-instantiation across hot reloads in
// development. Prisma access must stay behind this server-only module —
// UI components must never import PrismaClient directly (docs/development.md §5A).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
