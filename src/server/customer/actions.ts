"use server";

import { revalidatePath } from "next/cache";

import { createCustomerSchema, updateCustomerSchema } from "@/lib/validation/customer";
import { requireSession } from "@/server/auth/session";
import { toSafeActionMessage } from "@/server/business/action-errors";
import {
  createCustomer,
  softDeleteCustomer,
  updateCustomer,
} from "@/server/customer/customer-service";
import type {
  CreateCustomerActionState,
  CustomerMutationActionState,
} from "@/server/customer/action-states";

// Server Actions for the M3 customer UI. Same contract as the M2 business
// actions: establish identity server-side, treat every browser-supplied value
// (businessId, customerId, field values) as untrusted, delegate tenant
// authorization to the domain service, and map errors to safe messages
// (no Prisma/SQL detail ever reaches the browser).
//
// They return structured results rather than calling redirect() so the caller
// can render success/error states predictably.

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readCustomerFields(formData: FormData) {
  return {
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    notes: formData.get("notes"),
  };
}

export async function createCustomerAction(
  _prevState: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  if (!businessId) {
    return { status: "error", message: "Missing business." };
  }

  const parsed = createCustomerSchema.safeParse(readCustomerFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const customer = await createCustomer(session.user.id, businessId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/customers`);
    return { status: "success", customerId: customer.id };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function updateCustomerAction(
  _prevState: CustomerMutationActionState,
  formData: FormData,
): Promise<CustomerMutationActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const customerId = readRequiredString(formData, "customerId");
  if (!businessId || !customerId) {
    return { status: "error", message: "Missing customer." };
  }

  const parsed = updateCustomerSchema.safeParse(readCustomerFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await updateCustomer(session.user.id, businessId, customerId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/customers`);
    revalidatePath(`/dashboard/${businessId}/customers/${customerId}`);
    return { status: "success", message: "Customer updated." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function deleteCustomerAction(
  _prevState: CustomerMutationActionState,
  formData: FormData,
): Promise<CustomerMutationActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const customerId = readRequiredString(formData, "customerId");
  if (!businessId || !customerId) {
    return { status: "error", message: "Missing customer." };
  }

  try {
    await softDeleteCustomer(session.user.id, businessId, customerId);
    revalidatePath(`/dashboard/${businessId}/customers`);
    return { status: "success", message: "Customer removed." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}
