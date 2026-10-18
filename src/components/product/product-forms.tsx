"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/server/product/actions";
import type {
  CreateProductActionState,
  ProductMutationActionState,
} from "@/server/product/action-states";

const initialCreateState: CreateProductActionState = { status: "idle" };
const initialMutationState: ProductMutationActionState = { status: "idle" };

type ProductFieldValues = {
  name: string;
  description: string | null;
  price: string;
  active: boolean;
};

function ProductFields({ defaultValues }: { defaultValues?: ProductFieldValues }) {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        type="text"
        autoComplete="off"
        defaultValue={defaultValues?.name ?? ""}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-neutral-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
      {/* Plain text input: the value is a decimal STRING end-to-end (DEC-006),
          and the schema — not the browser — decides what a valid price is. */}
      <TextField
        label="Price"
        name="price"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={defaultValues?.price ?? ""}
        required
      />
      <div className="flex items-center gap-2">
        <input
          id="product-active"
          name="active"
          type="checkbox"
          defaultChecked={defaultValues?.active ?? true}
          className="size-4 rounded border-neutral-300 text-neutral-900"
        />
        <label htmlFor="product-active" className="text-sm text-neutral-700">
          Active (purchasable on new orders)
        </label>
      </div>
    </>
  );
}

export function CreateProductForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createProductAction, initialCreateState);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/products/${state.productId}`);
    }
  }, [state, router, businessId]);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <ProductFields />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <SubmitButton>Add product</SubmitButton>
    </form>
  );
}

export function ProductForm({
  businessId,
  productId,
  defaultValues,
}: {
  businessId: string;
  productId: string;
  defaultValues: ProductFieldValues;
}) {
  const [state, formAction] = useActionState(updateProductAction, initialMutationState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productId" value={productId} />

      <ProductFields defaultValues={defaultValues} />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {state.message}
        </p>
      )}

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}

export function DeleteProductButton({
  businessId,
  productId,
}: {
  businessId: string;
  productId: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(deleteProductAction, initialMutationState);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/products`);
    }
  }, [state, router, businessId]);

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="productId" value={productId} />
          <SubmitButton>Confirm delete</SubmitButton>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm font-medium text-neutral-700 underline underline-offset-2"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-fit text-sm font-medium text-red-700 underline underline-offset-2"
        >
          Delete product
        </button>
      )}

      {/* The underlying operation is a soft delete, so the copy must not
          imply that the record is erased. */}
      <p className="text-xs text-neutral-500">
        It will be removed from your product list. Past orders keep their details.
      </p>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}
