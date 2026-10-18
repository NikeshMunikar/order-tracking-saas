import "server-only";

import {
  BusinessAuthorizationError,
  BusinessMemberAlreadyExistsError,
  BusinessMemberNotFoundError,
  BusinessNotFoundError,
  InvitationNotFoundError,
  LastOwnerError,
} from "@/server/business/errors";

/**
 * Translate an error thrown by the M2 business/membership/invitation
 * services into a safe, user-facing message.
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
