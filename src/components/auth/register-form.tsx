"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import {
  FormError,
  ManagementField,
  ManagementSubmitButton,
} from "@/components/ui/management-form";
import { registerAction, type RegisterActionState } from "@/server/auth/register";

const initialState: RegisterActionState = { status: "idle" };

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(registerAction, initialState);

  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";

  if (state.status === "success") {
    return (
      <AuthShell>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Account created</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          Your account has been created. You can now sign in.
        </p>
        <Link
          href={loginHref}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink"
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Create an account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Set up your account to start tracking orders.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <ManagementField label="Name" name="name" type="text" autoComplete="name" />
        <ManagementField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
          hint="At least 10 characters."
        />

        {state.status === "error" && (
          <FormError message={state.message ?? "Could not create the account. Please try again."} />
        )}

        <ManagementSubmitButton className="w-full">Create account</ManagementSubmitButton>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="font-medium text-ink underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
