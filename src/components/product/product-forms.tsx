"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  FormError,
  FormSuccess,
  ManagementCheckbox,
  ManagementField,
  ManagementSubmitButton,
  ManagementTextArea,
} from "@/components/ui/management-form";
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

export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  active: boolean;
};

function ProductFields({ defaultValues = {} }: { defaultValues?: Partial<ProductFormValues> }) {
  return (
    <>
      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Product details</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ManagementField
            label="Name"
            name="name"
            type="text"
            autoComplete="off"
            defaultValue={defaultValues.name}
            required
          />
          <ManagementField
            label="Price"
            name="price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={defaultValues.price}
            hint="Decimal amount, for example 4.50."
            required
          />
          <div className="sm:col-span-2">
            <ManagementTextArea
              label="Description"
              name="description"
              rows={3}
              defaultValue={defaultValues.description}
              placeholder="What is included or what makes this product useful"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Availability</legend>
        <div className="mt-4">
          <ManagementCheckbox
            label="Active (purchasable on new orders)"
            name="active"
            id="product-active"
            defaultChecked={defaultValues.active ?? true}
          />
        </div>
      </fieldset>
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
    <form action={formAction} className="flex max-w-4xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <ProductFields />
      {state.status === "error" && <FormError message={state.message} />}
      <div>
        <ManagementSubmitButton>Add product</ManagementSubmitButton>
      </div>
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
  defaultValues: ProductFormValues;
}) {
  const [state, formAction] = useActionState(updateProductAction, initialMutationState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productId" value={productId} />
      <ProductFields defaultValues={defaultValues} />
      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "success" && <FormSuccess message={state.message} />}
      <div>
        <ManagementSubmitButton>Save changes</ManagementSubmitButton>
      </div>
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

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          It will be removed from your product list. Past orders keep their details.
        </p>
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-status-negative-fg transition-colors hover:bg-status-negative-bg"
          >
            Delete product
          </button>
        </div>
        {state.status === "error" && <FormError message={state.message} />}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm text-ink">
        Remove this product? This cannot be undone from this screen.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ManagementSubmitButton tone="danger">Confirm delete</ManagementSubmitButton>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Cancel
        </button>
      </div>
      {state.status === "error" && <FormError message={state.message} />}
    </form>
  );
}
