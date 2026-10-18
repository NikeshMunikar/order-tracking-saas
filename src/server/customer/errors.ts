// Domain error types for the M3 customer service layer. Small and
// purpose-specific, matching the M2 convention in
// src/server/business/errors.ts — not a generic error-code framework.

/**
 * The target customer does not exist, has been soft-deleted, or belongs to a
 * different business.
 *
 * One condition only, deliberately: a customerId belonging to another tenant
 * must be indistinguishable from a customerId that does not exist, so a
 * caller scoped to its own business cannot use error responses to probe
 * another tenant's records.
 */
export class CustomerNotFoundError extends Error {
  constructor(message = "Customer not found.") {
    super(message);
    this.name = "CustomerNotFoundError";
  }
}
