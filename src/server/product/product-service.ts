import "server-only";

import { prisma } from "@/lib/db/client";
import { escapeLikePattern } from "@/lib/db/like";
import {
  lockBusinessOwnerRows,
  requireMembership,
  requireOwner,
} from "@/server/business/authorization";
import { ProductNotFoundError } from "@/server/product/errors";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validation/product";

// M4 product domain service — the only place product rows are read or
// written. Every function resolves tenant authorization through the M2
// membership boundary (src/server/business/authorization.ts) before touching
// a row, and every query is scoped by `businessId` in the WHERE clause as
// well. A `businessId` or `productId` arriving from the browser (via a URL
// segment or a Server Action field) is only ever a navigation/lookup
// identifier: it is never by itself evidence of authorization.
//
// Role rules (MASTER_SPEC.md §4): OWNER = "Products" is part of full business
// management; STAFF may only VIEW products. Unlike customers, there is no
// product capability in the STAFF list at all, so EVERY product mutation
// (create, update, soft delete) is OWNER-only and uses the M2 mutation
// pattern: check authorization through the transaction's own connection
// (`tx`), never a pre-transaction query, while holding the OWNER-row lock.
//
// Money (DEC-006 in docs/architecture-decisions.md): `price` is DECIMAL(12, 2)
// in PostgreSQL. The app never converts prices through a JavaScript number —
// validated input is a decimal STRING that is scale-normalized textually, and
// values read back are serialized as a string with exactly 2 decimal places.

/** "1800" → "1800.00", "12.5" → "12.50" — exact string arithmetic, no float. */
function formatPriceAmount(price: string): string {
  const [whole = "", fraction = ""] = price.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

const productSummarySelect = {
  id: true,
  name: true,
  price: true,
  active: true,
  createdAt: true,
};

const productDetailSelect = {
  ...productSummarySelect,
  description: true,
  updatedAt: true,
};

export type ProductSummary = {
  id: string;
  name: string;
  price: string;
  active: boolean;
  createdAt: Date;
};

export type ProductDetail = ProductSummary & {
  description: string | null;
  updatedAt: Date;
};

/** One option in the M5 order-creation product selector. */
export type ProductOption = {
  id: string;
  name: string;
  price: string;
};

export type ProductListParams = {
  /** Untrusted search term (already length-checked by the caller's schema). */
  query?: string;
};

/** Trim, and treat an empty term as "no filter". */
function normalizeSearch(query: string | undefined): string | undefined {
  const trimmed = query?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * List a business's active AND inactive products (MASTER_SPEC.md §8 keeps both
 * in the table; inactivity is a flag, not a removal), optionally filtered by a
 * name search (M8 — §20 lists "Search" among the product features). There is
 * still no pagination: per-tenant product counts are small, so the list stays
 * a single page and ordering is deterministic — active first, then by name, so
 * the list is stable across renders.
 *
 * `%`, `_` and `\` are LIKE/ILIKE metacharacters and Prisma's string filters
 * expose no escape option, so the search goes through `escapeLikePattern` and
 * stays literal (M3 audit F1), while still using the normal Prisma query API —
 * no raw SQL.
 */
export async function listProducts(
  userId: string,
  businessId: string,
  params: ProductListParams = {},
): Promise<ProductSummary[]> {
  await requireMembership(userId, businessId);

  const search = normalizeSearch(params.query);
  const pattern = search === undefined ? undefined : escapeLikePattern(search);

  const products = await prisma.product.findMany({
    where: {
      businessId,
      deletedAt: null,
      ...(pattern === undefined
        ? {}
        : { name: { contains: pattern, mode: "insensitive" as const } }),
    },
    select: productSummarySelect,
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
  });

  return products.map((product) => ({
    ...product,
    price: product.price.toFixed(2),
  }));
}

/**
 * Options for the order-creation product selector (MASTER_SPEC.md §18): every
 * ACTIVE, non-deleted product, name-ordered, no pagination — the picker must
 * see the whole selectable list, unlike the paginated/searchable products page.
 * Inactive products are excluded because they can no longer be ordered, and a
 * soft-deleted product is excluded like everywhere else. Requires membership
 * (OWNER or STAFF create orders).
 */
export async function listProductOptions(
  userId: string,
  businessId: string,
): Promise<ProductOption[]> {
  await requireMembership(userId, businessId);

  const products = await prisma.product.findMany({
    where: { businessId, deletedAt: null, active: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, price: true },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price.toFixed(2),
  }));
}

/**
 * Get one product. Requires membership (OWNER or STAFF). A missing,
 * soft-deleted, or foreign `productId` all resolve to `null` — one
 * indistinguishable not-found condition, so callers cannot probe cross-tenant
 * rows.
 */
export async function getProduct(
  userId: string,
  businessId: string,
  productId: string,
): Promise<ProductDetail | null> {
  await requireMembership(userId, businessId);

  const product = await prisma.product.findFirst({
    where: { id: productId, businessId, deletedAt: null },
    select: productDetailSelect,
  });

  if (!product) {
    return null;
  }

  return {
    ...product,
    price: product.price.toFixed(2),
  };
}

/**
 * Create a product. OWNER-only: runs inside the OWNER-row lock and re-checks
 * authorization through `tx`, mirroring the M2/M3 mutation pattern.
 */
export async function createProduct(
  userId: string,
  businessId: string,
  input: CreateProductInput,
): Promise<ProductDetail> {
  return prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(userId, businessId, tx);

    const product = await tx.product.create({
      data: {
        businessId,
        name: input.name,
        description: input.description ?? null,
        price: formatPriceAmount(input.price),
        active: input.active,
      },
      select: productDetailSelect,
    });

    return {
      ...product,
      price: product.price.toFixed(2),
    };
  });
}

/**
 * Update a product — full replacement of the editable fields, same as
 * customers: every call sets `name`, `description`, `price` and `active`, so
 * there is no partial-patch path for stale clients to exploit. OWNER-only.
 */
export async function updateProduct(
  userId: string,
  businessId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductDetail> {
  return prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(userId, businessId, tx);

    const updated = await tx.product.updateMany({
      where: { id: productId, businessId, deletedAt: null },
      data: {
        name: input.name,
        description: input.description ?? null,
        price: formatPriceAmount(input.price),
        active: input.active,
      },
    });

    if (updated.count === 0) {
      throw new ProductNotFoundError();
    }

    // The row exists and is active in this business (the update matched it),
    // so the re-read must succeed; the shared where-clause keeps it scoped.
    const product = await tx.product.findFirstOrThrow({
      where: { id: productId, businessId, deletedAt: null },
      select: productDetailSelect,
    });

    return {
      ...product,
      price: product.price.toFixed(2),
    };
  });
}

/**
 * Soft-delete a product (MASTER_SPEC.md §8 + docs/database.md DB-003): the row
 * is marked `deletedAt` and disappears from lists and lookups; it is never
 * physically removed, so M5+ order items keep a resolvable reference.
 * OWNER-only via the same lock pattern as every other product mutation.
 */
export async function softDeleteProduct(
  userId: string,
  businessId: string,
  productId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(userId, businessId, tx);

    const result = await tx.product.updateMany({
      where: { id: productId, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new ProductNotFoundError();
    }
  });
}
