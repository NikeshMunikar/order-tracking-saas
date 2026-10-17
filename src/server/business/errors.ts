// Domain error types for the M2 business/membership/invitation service
// layer. Kept as small, purpose-specific error classes rather than a
// generic error-code/permission framework — callers (Server Actions, in
// Stage 3) map these to safe, generic user-facing messages; none of these
// messages are meant to be shown to end users verbatim without review.

/**
 * The requesting user has no membership in the target business — thrown
 * for both "business does not exist" and "you are not a member" so callers
 * cannot distinguish the two and leak cross-tenant existence.
 */
export class BusinessNotFoundError extends Error {
  constructor(message = "Business not found.") {
    super(message);
    this.name = "BusinessNotFoundError";
  }
}

/** The requesting user is a member but lacks the required role (OWNER) for this operation. */
export class BusinessAuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "BusinessAuthorizationError";
  }
}

/** The target member does not exist, or does not belong to the given business. */
export class BusinessMemberNotFoundError extends Error {
  constructor(message = "Member not found.") {
    super(message);
    this.name = "BusinessMemberNotFoundError";
  }
}

/** A mutation would leave the business with zero OWNERs. */
export class LastOwnerError extends Error {
  constructor(message = "A business must always have at least one owner.") {
    super(message);
    this.name = "LastOwnerError";
  }
}

/** An explicit revoke targeted an invitation that is not database-active, or does not belong to the given business. */
export class InvitationNotFoundError extends Error {
  constructor(message = "Invitation not found.") {
    super(message);
    this.name = "InvitationNotFoundError";
  }
}

/**
 * Accepting an invitation would create a membership that already exists for
 * this (business, user). Sanitized replacement for a raw Prisma P2002 on
 * BusinessMember's (businessId, userId) unique constraint — the underlying
 * database error must never reach callers. Reached only in edge cases
 * outside the normal M2 flow (a user who is already a member).
 */
export class BusinessMemberAlreadyExistsError extends Error {
  constructor(message = "User is already a member of this business.") {
    super(message);
    this.name = "BusinessMemberAlreadyExistsError";
  }
}
