export class OrderNotFoundError extends Error {
  /// One indistinguishable condition family (missing / cross-tenant), mirroring
  /// the other not-found conditions so an outside actor cannot probe which
  /// order IDs exist in a tenant they cannot access.
  readonly name = "OrderNotFoundError";

  constructor() {
    super("Order not found.");
  }
}

/// The item references a product that is inactive, soft-deleted, or does not
/// belong to this business (the indistinguishable-condition rule again).
export class ProductUnavailableError extends Error {
  readonly name = "ProductUnavailableError";

  constructor() {
    super("That product is no longer available for new orders.");
  }
}

export class DeliveryFieldError extends Error {
  readonly name = "DeliveryFieldError";
}

/// Discount would drive `subtotal + deliveryFee − discount` below zero:
/// AMB-001's "Discount cannot create an invalid total" (decided 2026-10-18 —
/// fixed-amount discount, rejected rather than clamped). The service computes
/// totals only through src/lib/money.ts BigInt helpers per DEC-006.
export class InvalidOrderTotalsError extends Error {
  readonly name = "InvalidOrderTotalsError";

  constructor() {
    super("Order totals are invalid.");
  }
}

/// The requested status change is not permitted by the DEC-013 matrix for the
/// order's stored current status — a skipped/backwards/self transition, a
/// change out of a terminal status, or a stale request whose expected status
/// changed concurrently. §28: invalid transitions must be rejected; a rejected
/// change writes no status and no history row.
export class InvalidOrderStatusTransitionError extends Error {
  readonly name = "InvalidOrderStatusTransitionError";

  constructor() {
    super("That status change is not allowed.");
  }
}
