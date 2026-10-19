import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { escapeLikePattern } from "@/lib/db/like";
import { businessDayWindow } from "@/lib/business-day";
import {
  computeLineSubtotal,
  computeOrderTotals,
} from "@/lib/money";
import {
  canTransitionOrderStatus,
  IN_PROGRESS_ORDER_STATUSES,
} from "@/lib/order-status";
import type { OrderStatusValue } from "@/lib/order-status";
import { generateSecureToken } from "@/lib/security/token";
import { requireMembership } from "@/server/business/authorization";
import {
  DeliveryFieldError,
  InvalidOrderStatusTransitionError,
  InvalidOrderTotalsError,
  OrderNotFoundError,
  ProductUnavailableError,
} from "@/server/order/errors";
import { CustomerNotFoundError } from "@/server/customer/errors";
import type {
  CreateOrderInput,
  UpdateOrderInput,
  UpdateOrderStatusInput,
} from "@/lib/validation/order";

// §28 cross-field rule: a DELIVERY order needs its recipient fields, decided
// with the same trim/emptiness conventions as the customer validation.
function validateDeliveryFields(
  input: CreateOrderInput | UpdateOrderInput,
): string | undefined {
  if (input.deliveryType !== "DELIVERY") return undefined;
  if (!input.deliveryName) return "Recipient name is required for delivery orders";
  if (!input.deliveryPhone) return "Recipient phone is required for delivery orders";
  if (!input.deliveryAddress) return "Delivery address is required for delivery orders";
  return undefined;
}

// M5 order domain service — the only place order rows are read or written.
// Orders sit inside a tenant: every function resolves membership through the
// M2 authorization boundary first and every query is additionally scoped by
// `businessId` in the WHERE clause. A browser-supplied businessId or orderId
// is only a navigation/lookup identifier, never evidence of authorization.
//
// Role rules (MASTER_SPEC §4): STAFF may "view/create/update orders" and
// "Update order statuses" (§4 + DEC-013 rule 5), so order create/edit/status
// changes check membership only — no OWNER lock. There is no order-deletion
// path in the approved model.
//
// Money (DEC-006 + AMB-001 as reconciled 2026-10-18, fixed-amount discount,
// `total = subtotal + deliveryFee − discount`, rejection not clamping):
// arithmetic happens ONLY in src/lib/money.ts on BigInt minor units; values
// cross into Prisma decimal columns as fixed-scale decimal strings.
//
// Status history (docs/database.md §7–8): the creation transaction writes the
// order, its items, the unique public tracking token, and the initial
// PENDING history row atomically; updateOrderStatus (M6/DEC-013) updates the
// stored status and appends its history row in the same transaction.

export type OrderListEntry = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  customerName: string;
  itemCount: number;
  createdAt: Date;
};

/** Orders listed per page (M8 reuses the M3 customer-list page size). */
export const ORDER_PAGE_SIZE = 20;

/** Most recent orders the dashboard shows (M8 — "recent orders"). */
export const DASHBOARD_RECENT_ORDERS_LIMIT = 5;

export type OrderListParams = {
  /** Untrusted search term (already length-checked by the caller's schema). */
  query?: string;
  /** Optional DEC-013 status filter. */
  status?: OrderStatusValue;
  /** 1-based page number. */
  page?: number;
};

export type OrderListResult = {
  orders: OrderListEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Shapes a raw order row into the list entry the order list/dashboard render. */
function toOrderListEntry(order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: { toFixed(digits: number): string };
  createdAt: Date;
  customer: { name: string };
  _count: { items: number };
}): OrderListEntry {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total.toFixed(2),
    customerName: order.customer.name,
    itemCount: order._count.items,
    createdAt: order.createdAt,
  };
}

/** Selective projection for the order list and the dashboard's recent orders. */
const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  total: true,
  createdAt: true,
  customer: { select: { name: true } },
  _count: { select: { items: true } },
} as const;

/** Trim, and treat an empty term as "no filter". */
function normalizeSearch(query: string | undefined): string | undefined {
  const trimmed = query?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizePage(page: number | undefined): number {
  return page === undefined || !Number.isFinite(page) || page < 1 ? 1 : Math.trunc(page);
}

export type OrderItemDetail = {
  id: string;
  productId: string | null;
  productNameSnapshot: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  /// M7: the bearer token of the order's public tracking link. It is returned
  /// to an authenticated member of the owning business so the detail page can
  /// offer copy/share (MASTER_SPEC §18/§21); it is never exposed publicly
  /// except through the token-addressed /track/[token] page, nor logged.
  publicTrackingToken: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  discount: string;
  deliveryFee: string;
  total: string;
  deliveryType: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  estimatedDeliveryAt: Date | null;
  notes: string;
  createdAt: Date;
  customerName: string;
  items: OrderItemDetail[];
  statusHistory: Array<{
    id: string;
    oldStatus: string | null;
    newStatus: string;
    changedBy: string;
    note: string | null;
    createdAt: Date;
  }>;
};

export type CreateOrderResult = {
  id: string;
  orderNumber: string;
  status: string;
  publicTrackingToken: string;
};

function toPayableError(error: unknown): InvalidOrderTotalsError {
  if (error instanceof InvalidOrderTotalsError) return error;
  if (error instanceof Error && error.name === "InvalidTotalsError") {
    const mapped = new InvalidOrderTotalsError();
    return mapped;
  }
  throw error;
}

/**
 * Create an order transactionally: order + items + tracking token + the
 * initial PENDING status-history row (docs/database.md §7). Membership is
 * re-verified inside the transaction; product prices are snapshotted from the
 * tenant's own, active, non-deleted products.
 */
export async function createOrder(
  userId: string,
  businessId: string,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const deliveryFieldError = validateDeliveryFields(input);
  if (deliveryFieldError) {
    throw new DeliveryFieldError(deliveryFieldError);
  }

  return prisma.$transaction(async (tx) => {
    await requireMembership(userId, businessId, tx);

    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, businessId, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) {
      // Customer is missing / soft-deleted / cross-tenant — one indistinguishable
      // condition, mapped by toSafeActionMessage like the customer service's not-found.
      throw new CustomerNotFoundError();
    }

    // Snapshot pricing reads the business's own live products; an inactive or
    // soft-deleted product cannot enter a new order (MASTER_SPEC §8).
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId, deletedAt: null },
      select: { id: true, name: true, price: true, active: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const lines = input.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product || !product.active) {
        throw new ProductUnavailableError();
      }
      const unitPrice = product.price.toFixed(2);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        unitPrice,
        quantity: item.quantity,
        lineSubtotal: computeLineSubtotal(unitPrice, item.quantity),
        raw: item,
      };
    });

    let totals;
    try {
      totals = computeOrderTotals(
        lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
        input.discount,
        input.deliveryFee,
      );
    } catch (error) {
      throw toPayableError(error);
    }

    // DEC-007(a): allocate the order number by locking this business's
    // sequence row for the duration of the transaction. The single atomic
    // INSERT … ON CONFLICT … DO UPDATE … RETURNING increments under the row
    // lock, so concurrent creations serialize and the numbers stay unique
    // (the composite unique constraint on (businessId, orderNumber) remains
    // the backstop).
    const [sequenceRow] = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "business_order_sequences" ("businessId", "lastNumber", "updatedAt")
      VALUES (${businessId}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("businessId")
      DO UPDATE SET "lastNumber" = "business_order_sequences"."lastNumber" + 1, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "lastNumber"
    `;
    const lastNumber = sequenceRow?.["lastNumber"];
    const orderNumber = `ORD-${1000 + Number(lastNumber)}`;

    const { rawToken } = generateSecureToken();
    const isDelivery = input.deliveryType === "DELIVERY";

    const order = await tx.order.create({
      data: {
        businessId,
        customerId: customer.id,
        orderNumber,
        subtotal: totals.subtotal,
        total: totals.total,
        discount: input.discount,
        deliveryFee: input.deliveryFee,
        deliveryType: input.deliveryType,
        deliveryName: isDelivery ? input.deliveryName! : customer.name,
        deliveryPhone: isDelivery ? input.deliveryPhone! : customer.phone,
        deliveryAddress: isDelivery ? input.deliveryAddress! : "",
        estimatedDeliveryAt: input.estimatedDeliveryAt ? new Date(input.estimatedDeliveryAt) : null,
        paymentStatus: input.paymentStatus,
        notes: input.notes ?? "",
        publicTrackingToken: rawToken,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            subtotal: line.lineSubtotal,
          })),
        },
        statusHistory: {
          create: {
            oldStatus: null,
            newStatus: "PENDING",
            changedBy: userId,
            note: null,
          },
        },
      },
      select: { id: true, orderNumber: true, status: true, publicTrackingToken: true },
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      publicTrackingToken: rawToken,
    };
  });
}

/**
 * Replace an order's editable surface (items, delivery fields, money,
 * payment status, estimated delivery, notes) with FULL-REPLACEMENT semantics.
 * The customer reference is not editable; totals are re-derived server-side
 * from the CURRENT product prices and the submitted quantities.
 */
export async function updateOrder(
  userId: string,
  businessId: string,
  orderId: string,
  input: UpdateOrderInput,
): Promise<void> {
  const deliveryFieldError = validateDeliveryFields(input);
  if (deliveryFieldError) {
    throw new DeliveryFieldError(deliveryFieldError);
  }

  await prisma.$transaction(async (tx) => {
    await requireMembership(userId, businessId, tx);

    const order = await tx.order.findFirst({
      where: { id: orderId, businessId },
      select: { id: true, customerId: true },
    });
    if (!order) {
      throw new OrderNotFoundError();
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, businessId, deletedAt: null },
      select: { id: true, name: true, price: true, active: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const lines = input.items.map((item) => {
      const product = productById.get(item.productId);
      if (!product || !product.active) {
        throw new ProductUnavailableError();
      }
      const unitPrice = product.price.toFixed(2);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        unitPrice,
        quantity: item.quantity,
        lineSubtotal: computeLineSubtotal(unitPrice, item.quantity),
        raw: item,
      };
    });

    let totals;
    try {
      totals = computeOrderTotals(
        lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
        input.discount,
        input.deliveryFee,
      );
    } catch (error) {
      throw toPayableError(error);
    }

    const isDelivery = input.deliveryType === "DELIVERY";
    let recipientName: string | undefined;
    let recipientPhone: string | undefined;
    let recipientAddress: string | undefined;
    if (isDelivery) {
      ({ deliveryName: recipientName, deliveryPhone: recipientPhone, deliveryAddress: recipientAddress } = input);
    } else {
      const customer = await tx.customer.findFirst({
        where: { id: order.customerId, businessId, deletedAt: null },
        select: { name: true, phone: true },
      });
      if (!customer) {
        throw new OrderNotFoundError();
      }
      recipientName = customer.name;
      recipientPhone = customer.phone;
      recipientAddress = "";
    }

    await tx.orderItem.deleteMany({ where: { orderId: order.id } });
    await tx.orderItem.createMany({
      data: lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        subtotal: line.lineSubtotal,
      })),
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        deliveryType: input.deliveryType,
        deliveryName: recipientName,
        deliveryPhone: recipientPhone,
        deliveryAddress: recipientAddress,
        estimatedDeliveryAt: input.estimatedDeliveryAt ? new Date(input.estimatedDeliveryAt) : null,
        paymentStatus: input.paymentStatus,
        notes: input.notes ?? "",
        subtotal: totals.subtotal,
        discount: input.discount,
        deliveryFee: input.deliveryFee,
        total: totals.total,
      },
    });
  });
}

export type OrderStatusChangeResult = {
  id: string;
  status: string;
};

/**
 * Change an order's status (M6/DEC-013). Membership is re-verified inside the
 * transaction and the order is read tenant-scoped, so a foreign or missing id
 * is indistinguishable (OrderNotFoundError). The requested change must be an
 * edge of the DEC-013 matrix from the order's STORED current status — the UI
 * never decides this.
 *
 * Concurrency (docs/database.md §8, "every accepted status change updates the
 * order and appends its history row atomically"): the update is a conditional
 * `updateMany` whose WHERE includes the status the matrix check just read. A
 * concurrent change therefore cannot slip through: the loser's UPDATE matches
 * zero rows (`count !== 1`), so it throws and writes NO history row — the
 * audit trail can never disagree with the order's stored status.
 */
export async function updateOrderStatus(
  userId: string,
  businessId: string,
  orderId: string,
  input: UpdateOrderStatusInput,
): Promise<OrderStatusChangeResult> {
  return prisma.$transaction(async (tx) => {
    await requireMembership(userId, businessId, tx);

    const order = await tx.order.findFirst({
      where: { id: orderId, businessId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new OrderNotFoundError();
    }

    // Prisma types `status` as the enum; the matrix covers every enum member.
    const currentStatus = order.status as OrderStatusValue;
    if (!canTransitionOrderStatus(currentStatus, input.status)) {
      throw new InvalidOrderStatusTransitionError();
    }

    const updated = await tx.order.updateMany({
      where: { id: order.id, businessId, status: currentStatus },
      data: { status: input.status },
    });
    if (updated.count !== 1) {
      // The stored status changed between the read and this UPDATE (another
      // request won the race), so this transition is stale — reject without
      // writing history.
      throw new InvalidOrderStatusTransitionError();
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        oldStatus: currentStatus,
        newStatus: input.status,
        changedBy: userId,
        note: input.note ?? null,
      },
    });

    return { id: order.id, status: input.status };
  });
}

/** Read one order (tenant-scoped) with items and status history. */
export async function getOrder(
  userId: string,
  businessId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  await requireMembership(userId, businessId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    select: {
      id: true,
      orderNumber: true,
      publicTrackingToken: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      discount: true,
      deliveryFee: true,
      total: true,
      deliveryType: true,
      deliveryName: true,
      deliveryPhone: true,
      deliveryAddress: true,
      estimatedDeliveryAt: true,
      notes: true,
      createdAt: true,
      customer: { select: { name: true } },
      items: {
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          unitPrice: true,
          quantity: true,
          subtotal: true,
        },
      },
      statusHistory: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          oldStatus: true,
          newStatus: true,
          changedBy: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });
  if (!order) return null;

  return {
    ...order,
    subtotal: order.subtotal.toFixed(2),
    discount: order.discount.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    total: order.total.toFixed(2),
    deliveryType: order.deliveryType,
    status: order.status,
    paymentStatus: order.paymentStatus,
    items: order.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
    })),
    statusHistory: order.statusHistory,
    customerName: order.customer.name,
  };
}

/**
 * List one page of the business's orders, newest first, optionally filtered by
 * an order-number / customer-name search term (literal, escaped LIKE) and a
 * status (M8 — MASTER_SPEC §17/§44; decisions D3/D4). Pagination reuses the M3
 * customer-list convention; the `(createdAt, id)` total order makes pages
 * neither duplicate nor skip rows.
 *
 * Requires membership (OWNER or STAFF). The `businessId` is a navigation
 * identifier only; authorization is re-resolved here, and every query is
 * additionally scoped by `businessId`, so results can never cross tenants.
 */
export async function listOrders(
  userId: string,
  businessId: string,
  params: OrderListParams = {},
): Promise<OrderListResult> {
  await requireMembership(userId, businessId);

  const search = normalizeSearch(params.query);
  const pattern = search === undefined ? undefined : escapeLikePattern(search);
  const page = normalizePage(params.page);

  const where: Prisma.OrderWhereInput = {
    businessId,
    ...(params.status === undefined ? {} : { status: params.status }),
    ...(pattern === undefined
      ? {}
      : {
          OR: [
            { orderNumber: { contains: pattern, mode: "insensitive" as const } },
            { customer: { name: { contains: pattern, mode: "insensitive" as const } } },
          ],
        }),
  };

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      select: orderListSelect,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(toOrderListEntry),
    total,
    page,
    pageSize: ORDER_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
  };
}

export type DashboardSummary = {
  /** Timezone actually used for the local day (UTC on invalid/missing zone). */
  timeZone: string;
  /** Start-inclusive UTC bound of the business-local day. */
  dayStart: Date;
  /** End-exclusive UTC bound of the business-local day. */
  dayEnd: Date;
  /** Orders created during the local day, by current status (D2). */
  pending: number;
  inProgress: number;
  delivered: number;
  /** Newest orders regardless of day (limit DASHBOARD_RECENT_ORDERS_LIMIT). */
  recentOrders: OrderListEntry[];
};

/**
 * Dashboard summary for one business (M8 — MASTER_SPEC §17; decisions D1/D2).
 *
 * "Today" is the business's LOCAL calendar day derived from `Business.timezone`
 * (falling back to UTC when the stored value is not a valid zone), queried as a
 * start-inclusive / end-exclusive range. Counts cover only orders CREATED
 * during that day, grouped by their CURRENT status: PENDING → pending,
 * CONFIRMED/PREPARING/READY/OUT_FOR_DELIVERY → inProgress, DELIVERED →
 * delivered; CANCELLED is excluded from every count. Recent orders are the
 * newest overall (not restricted to today).
 *
 * Requires membership (OWNER or STAFF); both roles may view orders (§4).
 */
export async function getDashboardSummary(
  userId: string,
  businessId: string,
  now: Date,
): Promise<DashboardSummary> {
  await requireMembership(userId, businessId);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const { start, end, timeZone } = businessDayWindow(now, business?.timezone ?? null);

  const withinDay = { gte: start, lt: end };

  const [pending, inProgress, delivered, recentOrders] = await prisma.$transaction([
    prisma.order.count({
      where: { businessId, status: "PENDING", createdAt: withinDay },
    }),
    prisma.order.count({
      where: {
        businessId,
        status: { in: [...IN_PROGRESS_ORDER_STATUSES] },
        createdAt: withinDay,
      },
    }),
    prisma.order.count({
      where: { businessId, status: "DELIVERED", createdAt: withinDay },
    }),
    prisma.order.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: DASHBOARD_RECENT_ORDERS_LIMIT,
      select: orderListSelect,
    }),
  ]);

  return {
    timeZone,
    dayStart: start,
    dayEnd: end,
    pending,
    inProgress,
    delivered,
    recentOrders: recentOrders.map(toOrderListEntry),
  };
}

export type CustomerOrderEntry = {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: Date;
};

/**
 * A customer's order history (MASTER_SPEC §19 "Order History": ORD-1042,
 * ORD-1031, … newest first — here with status/total/link context). Requires
 * membership; a customerId outside the tenant is indistinguishable from a
 * soft-deleted one (CustomerNotFoundError), matching the create path.
 * Deliberately without pagination: a single customer's history is bounded in
 * practice; revisit only if a profile grows beyond MVP scale.
 */
export async function listCustomerOrders(
  userId: string,
  businessId: string,
  customerId: string,
): Promise<CustomerOrderEntry[]> {
  await requireMembership(userId, businessId);

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) {
    throw new CustomerNotFoundError();
  }

  const orders = await prisma.order.findMany({
    where: { businessId, customerId },
    orderBy: [{ createdAt: "desc" }, { orderNumber: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      createdAt: true,
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total.toFixed(2),
    createdAt: order.createdAt,
  }));
}
