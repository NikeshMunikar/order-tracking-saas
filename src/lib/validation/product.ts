import { z } from "zod";

// Server-side validation boundary for M4 product inputs. MASTER_SPEC.md §28
// names `createProductSchema` and the roadmap milestone is "Products: CRUD,
// Active/inactive". Every value below arrives from the browser and is
// therefore untrusted; conventions mirror src/lib/validation/customer.ts.

/** Max length accepted for the product name. */
export const PRODUCT_NAME_MAX_LENGTH = 120;

/** Max length accepted for the optional product description. */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Highest value accepted for `price`, as a string, under DEC-006.
 *
 * PostgreSQL stores `price` as DECIMAL(12, 2) (docs/architecture-decisions.md
 * DEC-006): up to 10 integer digits with exactly 2 fraction digits. The app
 * accepts up to 8 integer digits (99,999,999.99), which is far above any MVP
 * price while leaving headroom inside the column. The amount is matched as a
 * plain decimal string — never a JavaScript number — so binary floating-point
 * handling (MASTER_SPEC.md §29) stays out of the authoritative path entirely.
 * The regex also enforces MASTER_SPEC.md §28's "Price cannot be negative": a
 * leading `-` simply does not match, while `0` and `0.00` do.
 */
export const PRODUCT_PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
export const PRODUCT_PRICE_MAX = "99999999.99";

const priceSchema = z
  .string()
  .trim()
  .min(1, "Price is required")
  .regex(PRODUCT_PRICE_PATTERN, "Price must be a non-negative amount with up to 2 decimal places");

const productFieldsSchema = z.object({
  // `name` and `price` are required: MASTER_SPEC.md §8 lists both as core
  // product fields; `description` is explicitly nullable.
  name: z.string().trim().min(1, "Product name is required").max(PRODUCT_NAME_MAX_LENGTH, "Product name is too long"),
  description: z
    .string()
    .trim()
    .max(PRODUCT_DESCRIPTION_MAX_LENGTH, "Product description is too long")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  price: priceSchema,
  // `active` is required (never a "patch" field): the M4 milestone is
  // CRUD + Active/inactive, and the UI always submits the checkbox state, so
  // the schema accepts only an explicit boolean.
  active: z.boolean({
    message: "Product status is required",
  }),
});

export const createProductSchema = productFieldsSchema;
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productFieldsSchema;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
