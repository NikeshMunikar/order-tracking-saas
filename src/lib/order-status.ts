// Order status workflow — DEC-013 ("Order status transition and cancellation
// matrix", owner-accepted 2026-10-18, resolving AMB-002).
//
// This module is the SINGLE source of truth for which status changes are
// allowed. It is deliberately framework-free (no "server-only", no Prisma
// runtime import) so both the server service — which is authoritative and
// enforces the matrix against every request — and the order UI, which only
// renders controls the server would accept (docs/ui-ux.md §7), import the
// same definitions.
//
// Source refs: MASTER_SPEC.md §12 (statuses, "Cancellation can occur before
// delivery", "Prevent nonsensical status transitions"), §4 (STAFF may
// "Update order statuses"), §13 (every change writes a history row), §28
// ("Invalid status transitions must be rejected").

/** Every order status, including the DEC-013 `CANCELLED` addition. */
export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/**
 * The DEC-013 authoritative transition matrix. A status absent from the keys
 * (i.e. DELIVERED and CANCELLED) is terminal.
 */
export const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Statuses the workflow can never leave (DEC-013 rule 3). */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatusValue[] = ["DELIVERED", "CANCELLED"];

/** Human-readable labels for status displays and the change controls. */
export const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Is this a status this application knows about? */
export function isOrderStatus(value: unknown): value is OrderStatusValue {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Is the given status terminal (no transitions out of it)? */
export function isTerminalOrderStatus(status: OrderStatusValue): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/**
 * The next statuses a valid change may move to from `status` — exactly one
 * step forward and/or `CANCELLED` while pre-delivery. Empty for terminal
 * statuses.
 */
export function nextOrderStatuses(status: OrderStatusValue): OrderStatusValue[] {
  return [...ALLOWED_ORDER_STATUS_TRANSITIONS[status]];
}

export function orderStatusLabel(status: string): string {
  return isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status;
}

/**
 * Is `from → to` an allowed transition? Self-transitions are never allowed
 * (a "change" must change something), skipped and backwards transitions are
 * rejected, and terminal statuses allow nothing.
 */
export function canTransitionOrderStatus(
  from: OrderStatusValue,
  to: OrderStatusValue,
): boolean {
  if (from === to) return false;
  return ALLOWED_ORDER_STATUS_TRANSITIONS[from].includes(to);
}
