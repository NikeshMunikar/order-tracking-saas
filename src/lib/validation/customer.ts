import { z } from "zod";

// Server-side validation boundary for M3 customer inputs. MASTER_SPEC.md §28
// names `createCustomerSchema` / `updateCustomerSchema` and requires that
// "required customer fields must exist"; every value below arrives from the
// browser and is therefore untrusted. Conventions mirror
// src/lib/validation/business.ts, including the same trim/lowercase email
// normalization so the app has one scheme, not several.

function optionalTrimmedString(maxLength: number, message: string) {
  return z
    .string()
    .trim()
    .max(maxLength, message)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value));
}

const customerFieldsSchema = z.object({
  // `name` and `phone` are required: MASTER_SPEC.md §13 and docs/database.md
  // §2 list them as non-nullable customer fields (unlike email/address/notes).
  name: z.string().trim().min(1, "Customer name is required").max(120, "Customer name is too long"),
  phone: z.string().trim().min(1, "Phone number is required").max(30, "Phone number is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .email("Enter a valid email address")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  address: optionalTrimmedString(500, "Address is too long"),
  notes: optionalTrimmedString(2000, "Notes are too long"),
});

/** Customer creation input. `businessId` is never client-supplied. */
export const createCustomerSchema = customerFieldsSchema;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/** Customer update input — same field shape; soft deletion is a separate operation. */
export const updateCustomerSchema = customerFieldsSchema;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Max length accepted for the customer search term. */
export const CUSTOMER_SEARCH_MAX_LENGTH = 120;

const singleStringParam = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * Query-string input for the customer list. Both values come straight from the
 * URL, so they are validated/coerced here rather than trusted; an unparseable
 * page number falls back to page 1 via the service's own normalization.
 */
export const customerListQuerySchema = z.object({
  q: z.preprocess(
    singleStringParam,
    z.string().trim().max(CUSTOMER_SEARCH_MAX_LENGTH, "Search text is too long").optional(),
  ),
  page: z.preprocess(singleStringParam, z.coerce.number().int().min(1).optional()),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
