"use server";

import { revalidatePath } from "next/cache";

import { createProductSchema, updateProductSchema } from "@/lib/validation/product";
import { requireSession } from "@/server/auth/session";
import { toSafeActionMessage } from "@/server/business/action-errors";
import {
  createProduct,
  softDeleteProduct,
  updateProduct,
} from "@/server/product/product-service";
import type {
  CreateProductActionState,
  ProductMutationActionState,
} from "@/server/product/action-states";

// Server Actions for the M4 product UI. Same contract as the M2/M3 actions:
// establish identity server-side, treat every browser-supplied value
// (businessId, productId, field values) as untrusted, delegate tenant
// authorization to the domain service (every product mutation is OWNER-only
// inside the service), and map errors to safe messages — no Prisma/SQL detail
// ever reaches the browser.
//
// They return structured results rather than calling redirect() so the caller
// can render success/error states predictably.

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readProductFields(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    // Checkbox semantics (HTML): an unchecked checkbox is absent from the
    // FormData entirely. The form always renders the checkbox, so this
    // yields a defined boolean either way and the schema's boolean
    // requirement is met without trusting a browser-provided boolean value.
    active: formData.get("active") === "on",
  };
}

export async function createProductAction(
  _prevProductState: CreateProductActionState,
  formData: FormData,
): Promise<CreateProductActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  if (!businessId) {
    return { status: "error", message: "Missing business." };
  }

  const parsed = createProductSchema.safeParse(readProductFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const product = await createProduct(session.user.id, businessId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/products`);
    return { status: "success", productId: product.id };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function updateProductAction(
  _prevProductState: ProductMutationActionState,
  formData: FormData,
): Promise<ProductMutationActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const productId = readRequiredString(formData, "productId");
  if (!businessId || !productId) {
    return { status: "error", message: "Missing product." };
  }

  const parsed = updateProductSchema.safeParse(readProductFields(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    await updateProduct(session.user.id, businessId, productId, parsed.data);
    revalidatePath(`/dashboard/${businessId}/products`);
    revalidatePath(`/dashboard/${businessId}/products/${productId}`);
    return { status: "success", message: "Product updated." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}

export async function deleteProductAction(
  _prevProductState: ProductMutationActionState,
  formData: FormData,
): Promise<ProductMutationActionState> {
  const session = await requireSession();

  const businessId = readRequiredString(formData, "businessId");
  const productId = readRequiredString(formData, "productId");
  if (!businessId || !productId) {
    return { status: "error", message: "Missing product." };
  }

  try {
    await softDeleteProduct(session.user.id, businessId, productId);
    revalidatePath(`/dashboard/${businessId}/products`);
    return { status: "success", message: "Product removed." };
  } catch (error) {
    return { status: "error", message: toSafeActionMessage(error) };
  }
}
