import "server-only";

import {
  BusinessAuthorizationError,
  BusinessMemberAlreadyExistsError,
  BusinessMemberNotFoundError,
  BusinessNotFoundError,
  InvitationNotFoundError,
  LastOwnerError,
} from "@/server/business/errors";
import { CustomerNotFoundError } from "@/server/customer/errors";
import { ProductNotFoundError } from "@/server/product/errors";
import {
  DeliveryFieldError,
  InvalidOrderStatusTransitionError,
  InvalidOrderTotalsError,
  OrderNotFoundError,
  ProductUnavailableError,
} from "@/server/order/errors";

/**
 * Translate an error thrown by the M2 business/membership/invitation
 * services, the M3 customer service, the M4 product service, or the M5
 * order service into a safe, user-facing message.
 *
 * Only messages authored here are ever shown to the browser. Any error that
 * is NOT one of the known domain conditions — including Prisma/SQL errors
 * and a Postgres deadlock (SQLSTATE 40P01) or serialization failure (40001)
 * surfaced by a mutation transaction — collapses to a single generic
 * message, so no SQL text, stack trace, constraint name, or identifier can
 * reach the UI. The error name is logged server-side for diagnosis.
 */
export function toSafeActionMessage(error: unknown): string {
  if (error instanceof BusinessNotFoundError) {
    // Same message for "no such business" and "not a member": callers must
    // not be able to distinguish the two (no cross-tenant existence leak).
    return "You don't have access to this business.";
  }

  if (error instanceof CustomerNotFoundError) {
    // Same message for "no such customer", "soft-deleted" and "belongs to
    // another business" — the service deliberately collapses all three.
    return "That customer could not be found.";
  }

  if (error instanceof ProductNotFoundError) {
    // Same message for "no such product", "soft-deleted" and "belongs to
    // another business" — the service deliberately collapses all three.
    return "That product could not be found.";
  }

  if (error instanceof OrderNotFoundError) {
    // Same message for "no such order" and "belongs to another business" —
    // the M5 order service deliberately collapses all such conditions.
    return "That order could not be found.";
  }

  if (error instanceof ProductUnavailableError) {
    // Reused by order create/edit for an inactive/soft-deleted/foreign
    // product line, so the message stays equally indistinguishable.
    return "That product is no longer available for new orders.";
  }

  if (error instanceof InvalidOrderTotalsError) {
    // AMB-001 (as resolved 2026-10-18): the discount may never drive the
    // total below zero; the input is rejected, not clamped.
    return "The discount cannot exceed the order amount.";
  }

  if (error instanceof InvalidOrderStatusTransitionError) {
    // DEC-013 (accepted 2026-10-18): the matrix, not the UI, decides which
    // status changes are legal; a stale/concurrent change is rejected the same
    // way as a skipped or backwards one so no history row is written.
    return error.message;
  }

  if (error instanceof DeliveryFieldError) {
    // §28 "required customer fields must exist" applied to the order's
    // delivery recipient (cross-field service rule).
    return error.message;
  }

  if (error instanceof BusinessAuthorizationError) {
    return "You don't have permission to perform this action.";
  }

  if (error instanceof BusinessMemberNotFoundError) {
    return "That team member could not be found.";
  }

  if (error instanceof LastOwnerError) {
    return "A business must always have at least one owner.";
  }

  if (error instanceof InvitationNotFoundError) {
    return "That invitation is no longer available.";
  }

  if (error instanceof BusinessMemberAlreadyExistsError) {
    return "That person is already a member of this business.";
  }

  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[business-action] unexpected error (${name})`);

  return "Something went wrong. Please try again.";
}
