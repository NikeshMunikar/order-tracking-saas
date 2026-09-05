-- NOTE ON PROVENANCE: This migration was hand-authored to exactly match
-- prisma/schema.prisma, because `prisma migrate dev` could not run in the
-- environment that produced it — the Prisma CLI requires fetching its
-- schema-engine binary from binaries.prisma.sh, which was not reachable
-- from that sandbox's network. It was applied directly via `psql` against
-- a local dev PostgreSQL instance and the resulting table was verified
-- with `\d users` to match this schema exactly. This is NOT equivalent to
-- a `prisma migrate dev`-generated and CLI-verified migration. Before
-- relying on Prisma's own migration history/drift detection, run
-- `npx prisma migrate dev` (or `prisma migrate resolve --applied
-- 20260905103000_init` against an already-matching database) in an
-- environment with unrestricted network access. See CURRENT_STATE.md.

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
