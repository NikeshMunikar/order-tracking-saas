"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import {
  createBusinessAction,
  updateBusinessSettingsAction,
} from "@/server/business/actions";
import type {
  CreateBusinessActionState,
  FormActionState,
} from "@/server/business/action-states";

const initialCreateState: CreateBusinessActionState = { status: "idle" };
const initialFormState: FormActionState = { status: "idle" };

/**
 * Optional business detail fields, shared by create + settings so the two
 * forms stay visually and behaviourally consistent.
 */
function OptionalBusinessFields({
  logoUrl,
  phone,
  email,
  address,
  description,
}: {
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  description?: string;
}) {
  return (
    <>
      <TextField label="Phone" name="phone" type="tel" autoComplete="tel" defaultValue={phone ?? ""} />
      <TextField label="Contact email" name="email" type="email" defaultValue={email ?? ""} />
      <TextField label="Address" name="address" type="text" defaultValue={address ?? ""} />
      <TextField label="Logo URL" name="logoUrl" type="url" defaultValue={logoUrl ?? ""} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-neutral-700">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={description ?? ""}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
        />
      </div>
    </>
  );
}

export function CreateBusinessForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(createBusinessAction, initialCreateState);
  const timezoneRef = useRef<HTMLInputElement>(null);

  // Default the timezone from the visitor's browser rather than imposing a
  // fixed region (the product deliberately avoids region-specific
  // assumptions). The field stays uncontrolled and is filled by mutating the
  // DOM after mount, so the server-rendered HTML and the hydrated DOM agree.
  useEffect(() => {
    const input = timezoneRef.current;
    if (input && input.value === "") {
      input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      router.push(`/dashboard/${state.businessId}/settings`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <TextField label="Business name" name="name" type="text" required />
      <TextField
        label="Currency"
        name="currency"
        type="text"
        placeholder="e.g. USD"
        maxLength={10}
        required
      />
      <TextField ref={timezoneRef} label="Timezone" name="timezone" type="text" required />

      <details className="rounded-md border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">
          Add contact and branding details (optional)
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <OptionalBusinessFields />
        </div>
      </details>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <SubmitButton>Create business</SubmitButton>
    </form>
  );
}

export function BusinessSettingsForm({
  businessId,
  defaultValues,
}: {
  businessId: string;
  defaultValues: {
    name: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    description: string | null;
  };
}) {
  const [state, formAction] = useActionState(updateBusinessSettingsAction, initialFormState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />

      <TextField label="Business name" name="name" type="text" defaultValue={defaultValues.name} required />
      <TextField
        label="Currency"
        name="currency"
        type="text"
        maxLength={10}
        defaultValue={defaultValues.currency}
        required
      />
      <TextField
        label="Timezone"
        name="timezone"
        type="text"
        defaultValue={defaultValues.timezone}
        required
      />

      <OptionalBusinessFields
        logoUrl={defaultValues.logoUrl ?? ""}
        phone={defaultValues.phone ?? ""}
        email={defaultValues.email ?? ""}
        address={defaultValues.address ?? ""}
        description={defaultValues.description ?? ""}
      />

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
