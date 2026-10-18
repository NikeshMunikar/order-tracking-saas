import "server-only";

import { prisma } from "@/lib/db/client";
import {
  CUSTOMER_PAGE_MAX,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/lib/validation/customer";
import {
  lockBusinessOwnerRows,
  requireMembership,
  requireOwner,
} from "@/server/business/authorization";
import { CustomerNotFoundError } from "@/server/customer/errors";

// M3 customer domain service — the only place customer rows are read or
// written. Every function resolves tenant authorization through the M2
// membership boundary (src/server/business/authorization.ts) before touching
// a row, and every query is scoped by `businessId` in the WHERE clause as
// well. A `businessId` or `customerId` arriving from the browser (via a URL
// segment or a Server Action field) is only ever a navigation/lookup
// identifier: it is never by itself evidence of authorization.
//
// Role rules (MASTER_SPEC.md §4):
//   - OWNER: full business management — includes customers.
//   - STAFF: "view/create/update customers" — so list/view/create/update are
//     membership-level (OWNER or STAFF).
//   - Deleting a customer is NOT in the STAFF capability list, so soft
//     deletion is OWNER-only.
//
// Soft deletion: docs/database.md DB-003 and MASTER_SPEC.md §7 require
// historical order relationships to survive, so a customer is never
// physically removed — `deletedAt` is set and every read filters it out.

/** Rows per page for the customer list. Bounded so a tenant cannot force an unbounded read. */
export const CUSTOMER_PAGE_SIZE = 20;

export type CustomerListParams = {
  /** Free-text search over name (case-insensitive) and phone. */
  query?: string;
  /** 1-based page number; invalid values fall back to 1 in the service. */
  page?: number;
};

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
};

export type CustomerListResult = {
  customers: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Defense in depth for the page number. Request validation already bounds it
 * (see CUSTOMER_PAGE_MAX), but the service must never compute a `skip` outside
 * the range Prisma/PostgreSQL accept: a huge page would otherwise surface as an
 * unhandled Prisma error during a render. Anything that is not a whole number
 * in [1, CUSTOMER_PAGE_MAX] is treated as page 1 — the same fallback the
 * existing "unparseable page" behaviour already used.
 */
function normalizePage(page: number | undefined): number {
  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > CUSTOMER_PAGE_MAX
  ) {
    return 1;
  }

  return page;
}

function normalizeSearch(query: string | undefined): string | undefined {
  const trimmed = query?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * List one page of a business's active customers, optionally filtered by a
 * search term. Requires membership (OWNER or STAFF).
 *
 * Selects only the fields the list UI renders (docs/database.md §11A:
 * selective projection), and paginates with a deterministic total order
 * (`createdAt` then `id`) so pages neither duplicate nor skip rows.
 */
export async function listCustomers(
  userId: string,
  businessId: string,
  params: CustomerListParams = {},
): Promise<CustomerListResult> {
  await requireMembership(userId, businessId);

  const search = normalizeSearch(params.query);
  const page = normalizePage(params.page);

  const where = {
    businessId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true, email: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    customers,
    total,
    page,
    pageSize: CUSTOMER_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE)),
  };
}

/**
 * Read one active customer. Requires membership (OWNER or STAFF).
 *
 * Returns null when the id does not resolve *within this business* — which
 * covers "no such customer", "soft-deleted" and "belongs to another tenant"
 * with one indistinguishable outcome. Callers render a not-found state.
 */
export async function getCustomer(
  userId: string,
  businessId: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  await requireMembership(userId, businessId);

  return prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Create a customer. Requires membership (OWNER or STAFF).
 *
 * The membership check runs inside the same transaction as the insert, so
 * authorization is re-verified against current database state rather than
 * relying on a check performed earlier in the request.
 */
export async function createCustomer(
  userId: string,
  businessId: string,
  input: CreateCustomerInput,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await requireMembership(userId, businessId, tx);

    return tx.customer.create({
      data: {
        businessId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
  });
}

/**
 * Update a customer's editable fields. Requires membership (OWNER or STAFF).
 *
 * The UPDATE's WHERE clause carries `businessId`, `id` AND
 * `deletedAt: null`, so a customerId from another tenant — or a soft-deleted
 * one — matches nothing rather than being updated by id alone.
 */
export async function updateCustomer(
  userId: string,
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await requireMembership(userId, businessId, tx);

    const result = await tx.customer.updateMany({
      where: { id: customerId, businessId, deletedAt: null },
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
    });

    if (result.count === 0) {
      throw new CustomerNotFoundError();
    }
  });
}

/**
 * Soft-delete a customer (`deletedAt = now`). OWNER only.
 *
 * This is the only customer mutation whose authorization depends on the
 * acting user's *current role*, so it mirrors the five OWNER-only M2
 * mutations exactly: `lockBusinessOwnerRows(tx, businessId)` is the first
 * statement of the transaction, and the acting user's role is only re-read
 * (requireOwner) AFTER that lock is held. A concurrent demotion/removal of
 * the acting user therefore cannot slip past a stale "still OWNER" check —
 * the lock serializes the two transactions and the post-lock read sees the
 * committed role.
 *
 * No row is physically removed: historical order relationships must survive
 * (docs/database.md DB-003).
 */
export async function softDeleteCustomer(
  userId: string,
  businessId: string,
  customerId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockBusinessOwnerRows(tx, businessId);
    await requireOwner(userId, businessId, tx);

    const result = await tx.customer.updateMany({
      where: { id: customerId, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw new CustomerNotFoundError();
    }
  });
}
