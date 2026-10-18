"use server";

import { revalidatePath } from "next/cache";

import { createOrderSchema, updateOrderSchema, updateOrderStatusSchema } from "@/lib/validation/order";
import { requireSession } from "@/server/auth/session";
import { toSafeActionMessage } from "@/server/business/action-errors";
import { createOrder, updateOrder, updateOrderStatus } from "@/server/order/order-service";
import type {
  CreateOrderActionState,
  UpdateOrderActionState,
  UpdateOrderStatusActionState,
} from "@/server/order/action-states";

// Server Actions for the M5 order UI. Same contract as the M3/M4 actions:
// establish identity server-side, treat every browser-supplied value
// (businessId, orderId, field values) as untrusted, delegate tenant
// authorization to the domain service, and map errors to safe messages (no
// Prisma/SQL detail ever reaches the browser).
//
// They return structured results rather than calling redirect() so the caller
// can render success/error states predictably.

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The browser sends the item lines as one JSON array field (order rows are
 * multi-line, unlike the single-record forms). String contents are still
 * untrusted data — the schema below re-validates every element before the
 * service re-resolves the products server-side.
 */
function readOrderItemLines(formData: FormData): unknown {
  const raw = formData.get("items");
  if (typeof raw !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function readOrderFields(formData: FormData) {
  return {
    customerId: formData.get("customerId"),
    items: readOrderItemLines(formData),
    deliveryType: formData.get("deliveryType"),
    deliveryName: formData.get("deliveryName"),
    deliveryPhone: formData.get("deliveryPhone"),
    deliveryAddress: formData.get("deliveryAddress"),
    discount: formData.get("discount"),
    deliveryFee: formData.get("deliveryFee"),
    estimatedDeliveryAt: formData.get("estimatedDeliveryAt"),
    paymentStatus: formData.get("paymentStatus"),
    notes: formData.get("notes"),
  };
}

export async function createOrderAction(
  _prevState: CreateOrderActionState,
  formData: FormData,
): Promise<CreateOrderActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  if (!businessId) {
    return { status: "error", message: "Missing business." };
  }

  const parsed = createOrderSchema.safeParse(readOrderFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const order = await createOrder(session.user.id, businessId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/orders`);
    revalidatePath(`/dashboard/${businessId}/orders/${order.id}`);
    return { status: "success", orderId: order.id };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function updateOrderAction(
  _prevState: UpdateOrderActionState,
  formData: FormData,
): Promise<UpdateOrderActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const orderId = readRequiredString(formData, "orderId");
  if (!businessId || !orderId) {
    return { status: "error", message: "Missing order." };
  }

  const fields = readOrderFields(formData);
  const parsed = updateOrderSchema.safeParse({ ...fields, customerId: undefined });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await updateOrder(session.user.id, businessId, orderId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/orders`);
    revalidatePath(`/dashboard/${businessId}/orders/${orderId}`);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

/**
 * Status change (M6/DEC-013). The browser supplies only the target status and
 * an optional note; whether that change is legal is decided by the service
 * against the order's stored status, so a stale or hand-crafted request is
 * rejected exactly like an invalid one (MASTER_SPEC §28; docs/ui-ux.md §7
 * "The server remains authoritative").
 */
export async function updateOrderStatusAction(
  _prevState: UpdateOrderStatusActionState,
  formData: FormData,
): Promise<UpdateOrderStatusActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const orderId = readRequiredString(formData, "orderId");
  if (!businessId || !orderId) {
    return { status: "error", message: "Missing order." };
  }

  const parsed = updateOrderStatusSchema.safeParse({
    status: formData.get("status"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const changed = await updateOrderStatus(session.user.id, businessId, orderId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/orders`);
    revalidatePath(`/dashboard/${businessId}/orders/${orderId}`);
    return { status: "success", orderStatus: changed.status };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}
