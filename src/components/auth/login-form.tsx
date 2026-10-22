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
import { loginAction, type LoginActionState } from "@/server/auth/login";

const initialState: LoginActionState = { status: "idle" };

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  // Return the visitor to where they came from (e.g. an invitation link)
  // after signing in. The value is untrusted and is re-validated by
  // safeCallbackUrl inside the Server Action.
  const registerHref = callbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/register";

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Sign in to manage your business and orders.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

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
          autoComplete="current-password"
          required
        />

        {state.status === "error" && (
          <FormError message={state.message ?? "Sign in failed. Please try again."} />
        )}

        <ManagementSubmitButton className="w-full">Sign in</ManagementSubmitButton>
      </form>

      <p className="mt-6 text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href={registerHref}
          className="font-medium text-ink underline underline-offset-2"
        >
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
