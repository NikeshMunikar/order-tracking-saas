import "server-only";

import { prisma } from "@/lib/db/client";
import {
  computeLineSubtotal,
  computeOrderTotals,
} from "@/lib/money";
import { generateSecureToken } from "@/lib/security/token";
import { requireMembership } from "@/server/business/authorization";
import {
  DeliveryFieldError,
  InvalidOrderTotalsError,
  OrderNotFoundError,
  ProductUnavailableError,
} from "@/server/order/errors";
import { CustomerNotFoundError } from "@/server/customer/errors";
import type {
  CreateOrderInput,
  UpdateOrderInput,
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
// Role rules (MASTER_SPEC §4): STAFF may "view/create/update orders" (status
// changes belong to M6), so order create/edit checks membership only — no
// OWNER lock. There is no order-deletion path in the approved model.
//
// Money (DEC-006 + AMB-001 as reconciled 2026-10-18, fixed-amount discount,
// `total = subtotal + deliveryFee − discount`, rejection not clamping):
// arithmetic happens ONLY in src/lib/money.ts on BigInt minor units; values
// cross into Prisma decimal columns as fixed-scale decimal strings.
//
// Status history (docs/database.md §7): the creation transaction writes the
// order, its items, the unique public tracking token, and the initial
// PENDING history row atomically.

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
 * List the business's orders, newest first. Deliberately without
 * search/filters: MASTER_SPEC defers search/filtering to M8.
 */
export async function listOrders(userId: string, businessId: string): Promise<OrderListEntry[]> {
  await requireMembership(userId, businessId);

  const orders = await prisma.order.findMany({
    where: { businessId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      customer: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total.toFixed(2),
    customerName: order.customer.name,
    itemCount: order._count.items,
    createdAt: order.createdAt,
  }));
}
