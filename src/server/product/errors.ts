// Product domain errors. Kept to exactly one not-found error, mirroring
// src/server/customer/errors.ts: the service returns the same error whether a
// product id is missing, soft-deleted, or belongs to another business, so
// error responses cannot be used to probe cross-tenant rows.

export class ProductNotFoundError extends Error {
  constructor(message = "Product not found.") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}
