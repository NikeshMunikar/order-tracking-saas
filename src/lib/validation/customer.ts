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

/**
 * Highest accepted customer list page number.
 *
 * 10,000 pages x `CUSTOMER_PAGE_SIZE` (20) addresses 200,000 customers for a
 * single business, far beyond MVP scale. The bound exists so that a hostile or
 * corrupted `page` value cannot overflow the `skip = (page - 1) * pageSize`
 * calculation and turn a list render into an unhandled Prisma error. Note that
 * `z.number().int()` alone is not a bound: `Number.isInteger(1e21)` is `true`.
 */
export const CUSTOMER_PAGE_MAX = 10_000;

const singleStringParam = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Search term exactly as it arrives from the URL (untrusted). */
export const customerSearchFieldSchema = z.preprocess(
  singleStringParam,
  z.string().trim().max(CUSTOMER_SEARCH_MAX_LENGTH, "Search text is too long").optional(),
);

/** Page number exactly as it arrives from the URL (untrusted). */
export const customerPageFieldSchema = z.preprocess(
  singleStringParam,
  z.coerce
    .number()
    .int()
    .min(1)
    .max(CUSTOMER_PAGE_MAX, `Page must be ${CUSTOMER_PAGE_MAX} or less`)
    .optional(),
);

/**
 * Query-string input for the customer list. Both values come straight from the
 * URL, so they are validated/coerced here rather than trusted; an unparseable
 * page number falls back to page 1 via the service's own normalization.
 */
export const customerListQuerySchema = z.object({
  q: customerSearchFieldSchema,
  page: customerPageFieldSchema,
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type CustomerListQueryInput = {
  q: string | undefined;
  page: number | undefined;
  searchError: string | undefined;
  pageError: string | undefined;
};

/**
 * Parse the two list parameters *independently*.
 *
 * Parsing them as one object (or aborting on the first failure) means a
 * malformed `page` also throws away a perfectly good `q` search term, which
 * silently changes what the user sees. Each parameter is therefore validated
 * on its own: a rejected value becomes `undefined` (the unfiltered / first-page
 * behaviour) together with a message, while the other parameter still applies.
 */
export function parseCustomerListQuery(raw: { q?: unknown; page?: unknown }): CustomerListQueryInput {
  const search = customerSearchFieldSchema.safeParse(raw.q);
  const page = customerPageFieldSchema.safeParse(raw.page);

  return {
    q: search.success ? search.data : undefined,
    page: page.success ? page.data : undefined,
    searchError: search.success ? undefined : (search.error.issues[0]?.message ?? "Invalid search."),
    pageError: page.success ? undefined : (page.error.issues[0]?.message ?? "Invalid page."),
  };
}
