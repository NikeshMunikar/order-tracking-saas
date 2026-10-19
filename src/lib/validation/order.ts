import { z } from "zod";

import { ORDER_STATUSES } from "@/lib/order-status";
import type { OrderStatusValue } from "@/lib/order-status";

// Server-side validation boundary for M5 order inputs. MASTER_SPEC.md §9/§10
// and docs/database.md §§7–9 define the fields; §28 names the rules that are
// encoded below ("Quantity must be positive", "Delivery fee cannot be
// negative", "Order must contain at least one item", "Discount cannot create
// an invalid total" — the last is enforced with the money helper once totals
// are known). Every value below arrives from the browser and is therefore
// untrusted. Conventions mirror src/lib/validation/customer.ts.

export const ORDER_NAME_MAX_LENGTH = 120;
export const ORDER_PHONE_MAX_LENGTH = 30;
export const ORDER_ADDRESS_MAX_LENGTH = 500;
export const ORDER_NOTES_MAX_LENGTH = 500;
/** Per-status-change note cap (optional free text; DEC-013 rule 4). */
export const ORDER_STATUS_NOTE_MAX_LENGTH = 500;
/** Per-order item-count cap (raw safety bound; the avg. order is small). */
export const ORDER_MAX_ITEMS = 50;
/** Per-item quantity cap (per-order line quantity). */
export const ORDER_ITEM_QUANTITY_MAX = 999;

/**
 * An order line as submitted by the browser. The productNameSnapshot and the
 * unitPrice are NEVER accepted from the browser: the service looks the
 * product up server-side inside the order's own tenant and snapshots its
 * name and CURRENT live price there (MASTER_SPEC §10).
 */
export const orderItemInputSchema = z.object({
  productId: z.string().min(1, "Product is required").max(64, "Product is invalid"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be positive")
    .max(ORDER_ITEM_QUANTITY_MAX, `Quantity cannot exceed ${ORDER_ITEM_QUANTITY_MAX}`),
});

const moneyAmountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Amount must be a non-negative number with up to 2 decimal places");

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required").max(64, "Customer is invalid"),
  items: z.array(orderItemInputSchema).min(1, "Order must contain at least one item").max(ORDER_MAX_ITEMS, `An order can contain at most ${ORDER_MAX_ITEMS} items`),
  deliveryType: z.enum(["DELIVERY", "PICKUP"], { message: "Delivery type is required" }),
  // DELIVERY requires the recipient fields (validated below); for PICKUP the
  // service snapshots the customer's own name/phone instead.
  deliveryName: z.string().trim().max(ORDER_NAME_MAX_LENGTH, "Recipient name is too long").optional(),
  deliveryPhone: z.string().trim().max(ORDER_PHONE_MAX_LENGTH, "Recipient phone is too long").optional(),
  deliveryAddress: z.string().trim().max(ORDER_ADDRESS_MAX_LENGTH, "Delivery address is too long").optional(),
  discount: moneyAmountSchema,
  deliveryFee: moneyAmountSchema,
  estimatedDeliveryAt: z
    .string()
    .trim()
    .max(40, "Estimated delivery date is invalid")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
  paymentStatus: z.enum(["UNPAID", "PAID", "PARTIALLY_PAID", "REFUNDED"], {
    message: "Payment status is required",
  }),
  notes: z
    .string()
    .trim()
    .max(ORDER_NOTES_MAX_LENGTH, "Order notes are too long")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/**
 * Order-update schema. The customer on an existing order is deliberately NOT
 * editable (per M5 scope decision 2026-10-18: items, delivery, money,
 * payment-status, estimated date and notes can change; the customer reference
 * cannot be re-targeted, keeping historical references simple and explicit).
 */
export const updateOrderSchema = createOrderSchema.omit({ customerId: true });
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** Delivery-recipient cross-field rule (§28 "required customer fields exist"). */
export function validateDeliveryFields(input: CreateOrderInput | UpdateOrderInput): string | undefined {
  if (input.deliveryType === "DELIVERY") {
    if (!input.deliveryName) return "Recipient name is required for delivery orders";
    if (!input.deliveryPhone) return "Recipient phone is required for delivery orders";
    if (!input.deliveryAddress) return "Delivery address is required for delivery orders";
  }
  return undefined;
}

/**
 * Status-change input (MASTER_SPEC §28 names `updateOrderStatusSchema`;
 * M6/DEC-013). The target status must be a known order status, but WHICH
 * transitions are legal is NOT decided here — that is the matrix in
 * src/lib/order-status.ts, enforced by the service against the order's stored
 * current status. A note (e.g. a cancellation reason) is optional free text;
 * no reason is required (DEC-013 rule 4).
 */
export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, { message: "Status is required" }),
  note: z
    .string()
    .trim()
    .max(ORDER_STATUS_NOTE_MAX_LENGTH, "Status note is too long")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value)),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// ---------------------------------------------------------------------------
// Order-list search/filter/pagination query (Milestone 8, decisions D3/D4).
//
// The order list accepts `q` (order number OR customer name), `status` (one of
// the DEC-013 statuses) and `page`. Like the M3 customer list, the values come
// straight from the URL and are validated/coerced here rather than trusted, and
// they are parsed INDEPENDENTLY so a malformed `page` does not discard a valid
// search term (and vice versa).
// ---------------------------------------------------------------------------

/** Max length accepted for the order search term. */
export const ORDER_SEARCH_MAX_LENGTH = 120;

/**
 * Highest accepted order list page number. See `CUSTOMER_PAGE_MAX`: the bound
 * exists only to keep a hostile/corrupted `page` from overflowing
 * `skip = (page - 1) * pageSize`; 10,000 pages x `ORDER_PAGE_SIZE` (20)
 * addresses 200,000 orders for one business, far beyond MVP scale.
 */
export const ORDER_PAGE_MAX = 10_000;

const singleStringParam = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Order search term exactly as it arrives from the URL (untrusted). */
export const orderSearchFieldSchema = z.preprocess(
  singleStringParam,
  z.string().trim().max(ORDER_SEARCH_MAX_LENGTH, "Search text is too long").optional(),
);

/** Status filter exactly as it arrives from the URL (untrusted). */
export const orderStatusFilterFieldSchema = z.preprocess(
  singleStringParam,
  z.enum(ORDER_STATUSES, { message: "Invalid status filter." }).optional(),
);

/** Page number exactly as it arrives from the URL (untrusted). */
export const orderPageFieldSchema = z.preprocess(
  singleStringParam,
  z.coerce
    .number()
    .int()
    .min(1)
    .max(ORDER_PAGE_MAX, `Page must be ${ORDER_PAGE_MAX} or less`)
    .optional(),
);

export const orderListQuerySchema = z.object({
  q: orderSearchFieldSchema,
  status: orderStatusFilterFieldSchema,
  page: orderPageFieldSchema,
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export type OrderListQueryInput = {
  q: string | undefined;
  status: OrderStatusValue | undefined;
  page: number | undefined;
  searchError: string | undefined;
  statusError: string | undefined;
  pageError: string | undefined;
};

/**
 * Parse the order-list parameters *independently* (same rationale as
 * `parseCustomerListQuery`): an unparseable value becomes `undefined` (the
 * unfiltered / first-page behaviour) with a message, while the other
 * parameters still apply.
 */
export function parseOrderListQuery(raw: {
  q?: unknown;
  status?: unknown;
  page?: unknown;
}): OrderListQueryInput {
  const search = orderSearchFieldSchema.safeParse(raw.q);
  const status = orderStatusFilterFieldSchema.safeParse(raw.status);
  const page = orderPageFieldSchema.safeParse(raw.page);

  return {
    q: search.success ? search.data : undefined,
    status: status.success ? status.data : undefined,
    page: page.success ? page.data : undefined,
    searchError: search.success ? undefined : (search.error.issues[0]?.message ?? "Invalid search."),
    statusError: status.success ? undefined : (status.error.issues[0]?.message ?? "Invalid status filter."),
    pageError: page.success ? undefined : (page.error.issues[0]?.message ?? "Invalid page."),
  };
}
