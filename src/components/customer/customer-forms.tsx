"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  FormError,
  FormSuccess,
  ManagementField,
  ManagementSubmitButton,
  ManagementTextArea,
} from "@/components/ui/management-form";
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/server/customer/actions";
import type {
  CreateCustomerActionState,
  CustomerMutationActionState,
} from "@/server/customer/action-states";

const initialCreateState: CreateCustomerActionState = { status: "idle" };
const initialMutationState: CustomerMutationActionState = { status: "idle" };

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

function CustomerFields({ defaultValues = {} }: { defaultValues?: Partial<CustomerFormValues> }) {
  return (
    <>
      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Contact details</legend>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ManagementField
            label="Name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={defaultValues.name}
            required
          />
          <ManagementField
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={defaultValues.phone}
            required
          />
          <ManagementField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultValues.email}
          />
          <ManagementField
            label="Address"
            name="address"
            type="text"
            autoComplete="street-address"
            defaultValue={defaultValues.address}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-sm font-semibold text-ink">Notes</legend>
        <div className="mt-4">
          <ManagementTextArea
            label="Notes"
            name="notes"
            hideLabel
            rows={3}
            defaultValue={defaultValues.notes}
            placeholder="Delivery preferences or anything useful for future orders"
          />
        </div>
      </fieldset>
    </>
  );
}

export function CreateCustomerForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createCustomerAction, initialCreateState);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/customers/${state.customerId}`);
    }
  }, [state, router, businessId]);

  return (
    <form action={formAction} className="flex max-w-4xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <CustomerFields />
      {state.status === "error" && <FormError message={state.message} />}
      <div>
        <ManagementSubmitButton>Add customer</ManagementSubmitButton>
      </div>
    </form>
  );
}

export function CustomerForm({
  businessId,
  customerId,
  defaultValues,
}: {
  businessId: string;
  customerId: string;
  defaultValues: CustomerFormValues;
}) {
  const [state, formAction] = useActionState(updateCustomerAction, initialMutationState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="customerId" value={customerId} />
      <CustomerFields defaultValues={defaultValues} />
      {state.status === "error" && <FormError message={state.message} />}
      {state.status === "success" && <FormSuccess message={state.message} />}
      <div>
        <ManagementSubmitButton>Save changes</ManagementSubmitButton>
      </div>
    </form>
  );
}

export function DeleteCustomerButton({
  businessId,
  customerId,
}: {
  businessId: string;
  customerId: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(deleteCustomerAction, initialMutationState);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${businessId}/customers`);
    }
  }, [state, router, businessId]);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          They will be removed from your customer list. Past orders keep their details.
        </p>
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-status-negative-fg transition-colors hover:bg-status-negative-bg"
          >
            Delete customer
          </button>
        </div>
        {state.status === "error" && <FormError message={state.message} />}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm text-ink">
        Remove this customer? This cannot be undone from this screen.
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
