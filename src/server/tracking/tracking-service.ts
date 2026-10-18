import "server-only";

import type { OrderStatusValue } from "@/lib/order-status";
import { prisma } from "@/lib/db/client";
import { isPlausibleTrackingToken } from "@/lib/tracking";

// M7 public tracking read model — the ONLY unauthenticated data path in the
// application (docs/security.md SEC-004 "public tracking uses a separate
// unauthenticated trust boundary").
//
// There is no session here and deliberately no tenant parameter: the bearer
// token IS the authorization, and the lookup is by the globally unique
// `publicTrackingToken` column. Everything the customer is allowed to see is
// selected explicitly below — never a raw record, never a caller-supplied
// business/order id (MASTER_SPEC §26/§27, docs/security.md SEC-006 "public
// responses are deliberate DTOs, not raw database records").
//
// Deliberately NOT selected or returned: any internal id (order, item,
// product, customer, business), the customer's email/notes, the order's
// internal notes, status-history notes and `changedBy` (staff/actor identity),
// and the raw token itself.
//
// The token is a bearer credential: it must never be logged, so this module
// keeps it out of every error path and callers must not include it in logs.

export type PublicTrackingItem = {
  productName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
};

export type PublicTrackingOrder = {
  business: {
    name: string;
    logoUrl: string | null;
    phone: string | null;
    address: string | null;
    currency: string;
  };
  order: {
    orderNumber: string;
    status: string;
    createdAt: Date;
    estimatedDeliveryAt: Date | null;
    deliveryType: string;
    /** Delivery recipient for DELIVERY orders; "" for pickup orders. */
    recipientName: string;
    deliveryAddress: string;
    subtotal: string;
    discount: string;
    deliveryFee: string;
    total: string;
    items: PublicTrackingItem[];
    /** First time the order reached each status, from its history. */
    reachedAt: Partial<Record<OrderStatusValue, Date>>;
  };
};

/**
 * Resolve a public tracking token to the customer-facing tracking view, or
 * null when the token is not usable. A token that fails the plausibility gate
 * (no database read) and a well-formed but unknown token return exactly the
 * same null, so the page can show one generic invalid/unavailable state
 * (docs/security.md §7 "intentionally generic invalid/unavailable response").
 */
export async function getPublicTrackingOrder(
  rawToken: string,
): Promise<PublicTrackingOrder | null> {
  if (!isPlausibleTrackingToken(rawToken)) {
    return null;
  }

  const order = await prisma.order.findUnique({
    where: { publicTrackingToken: rawToken },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      estimatedDeliveryAt: true,
      deliveryType: true,
      deliveryName: true,
      deliveryAddress: true,
      subtotal: true,
      discount: true,
      deliveryFee: true,
      total: true,
      business: {
        select: { name: true, logoUrl: true, phone: true, address: true, currency: true },
      },
      items: {
        orderBy: [{ id: "asc" }],
        select: { productNameSnapshot: true, unitPrice: true, quantity: true, subtotal: true },
      },
      statusHistory: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { newStatus: true, createdAt: true },
      },
    },
  });

  if (!order) {
    return null;
  }

  const reachedAt: Partial<Record<OrderStatusValue, Date>> = {};
  for (const entry of order.statusHistory) {
    const status = entry.newStatus as OrderStatusValue;
    if (!reachedAt[status]) {
      reachedAt[status] = entry.createdAt;
    }
  }

  return {
    business: order.business,
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryAt: order.estimatedDeliveryAt,
      deliveryType: order.deliveryType,
      // The recipient name is approved delivery information for a DELIVERY
      // order; a pickup order needs no recipient, so nothing is returned
      // (a deliberate over-returning guard, §16 exclusions).
      recipientName: order.deliveryType === "DELIVERY" ? order.deliveryName : "",
      deliveryAddress: order.deliveryAddress,
      subtotal: order.subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      deliveryFee: order.deliveryFee.toFixed(2),
      total: order.total.toFixed(2),
      items: order.items.map((item) => ({
        productName: item.productNameSnapshot,
        unitPrice: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        subtotal: item.subtotal.toFixed(2),
      })),
      reachedAt,
    },
  };
}
