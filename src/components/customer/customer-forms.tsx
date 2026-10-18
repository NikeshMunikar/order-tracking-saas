"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
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

type CustomerFieldValues = {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

function CustomerFields({ defaultValues }: { defaultValues?: CustomerFieldValues }) {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        type="text"
        autoComplete="name"
        defaultValue={defaultValues?.name ?? ""}
        required
      />
      <TextField
        label="Phone"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={defaultValues?.phone ?? ""}
        required
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={defaultValues?.email ?? ""}
      />
      <TextField
        label="Address"
        name="address"
        type="text"
        autoComplete="street-address"
        defaultValue={defaultValues?.address ?? ""}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-neutral-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes ?? ""}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <CustomerFields />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <SubmitButton>Add customer</SubmitButton>
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
  defaultValues: CustomerFieldValues;
}) {
  const [state, formAction] = useActionState(updateCustomerAction, initialMutationState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="customerId" value={customerId} />

      <CustomerFields defaultValues={defaultValues} />

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

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="customerId" value={customerId} />
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
          Delete customer
        </button>
      )}

      {/* The underlying operation is a soft delete, so the copy must not
          imply that the record is erased. */}
      <p className="text-xs text-neutral-500">
        They will be removed from your customer list. Past orders keep their details.
      </p>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </div>
  );
}
