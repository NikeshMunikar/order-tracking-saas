-- NOTE ON PROVENANCE: This migration was hand-authored to exactly match
-- prisma/schema.prisma (M2: Business, BusinessMember, BusinessInvitation),
-- because `prisma migrate dev` could not run in this sandbox — the Prisma
-- CLI requires fetching its schema-engine binary from binaries.prisma.sh,
-- which is not reachable from this environment's allowed network egress.
-- This mirrors the documented provenance of migration 20260905103000_init
-- (see that migration's header and CURRENT_STATE.md §3).
--
-- This is NOT equivalent to a `prisma migrate dev`-generated and
-- CLI-verified migration. Before relying on Prisma's own migration
-- history/drift detection, run one of the following in an environment
-- with unrestricted network access:
--   - `npx prisma migrate dev` (if the database does not yet have this
--     migration applied), or
--   - `npx prisma migrate resolve --applied 20260907120000_add_business_membership`
--     (if you apply this SQL directly first and only need Prisma's
--     `_prisma_migrations` bookkeeping to catch up), followed by
--     `npx prisma migrate status` to confirm "Database schema is up to
--     date!".
--
-- CRITICAL: the final `CREATE UNIQUE INDEX ... WHERE ...` statement below
-- is a POSTGRESQL PARTIAL UNIQUE INDEX. Prisma's schema DSL cannot express
-- partial indexes, so it is NOT represented anywhere in schema.prisma and
-- `prisma migrate diff` / `prisma db pull` will not surface it from the
-- schema file. It is the authoritative concurrency guard enforcing "at
-- most one database-active invitation per (businessId, normalized email)"
-- per the approved M2 invitation design. Do not drop, "simplify", or
-- regenerate this migration in a way that silently loses this index.

-- CreateEnum
CREATE TYPE "BusinessMemberRole" AS ENUM ('OWNER', 'STAFF');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "description" TEXT,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_members" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_invitations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "BusinessMemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "business_members_businessId_idx" ON "business_members"("businessId");

-- CreateIndex
CREATE INDEX "business_members_userId_idx" ON "business_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_businessId_userId_key" ON "business_members"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "business_invitations_tokenHash_key" ON "business_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "business_invitations_businessId_email_idx" ON "business_invitations"("businessId", "email");

-- CreateIndex
CREATE INDEX "business_invitations_email_idx" ON "business_invitations"("email");

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_invitations" ADD CONSTRAINT "business_invitations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (hand-added: PostgreSQL partial unique index, not expressible in schema.prisma)
-- Enforces: at most one database-active invitation (revokedAt IS NULL AND
-- acceptedAt IS NULL) may exist for a given (businessId, normalized email).
-- "Database-active" intentionally does NOT include an expiresAt condition —
-- expiration is evaluated at acceptance time, not by this index. This is
-- the authoritative concurrency guard for the invite/revoke-and-reissue
-- flow (see the invitation service for the retry-on-conflict behavior that
-- depends on this exact index existing).
CREATE UNIQUE INDEX "business_invitations_active_email_key"
ON "business_invitations" ("businessId", "email")
WHERE "revokedAt" IS NULL
  AND "acceptedAt" IS NULL;
