"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Sign in</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Sign in to manage your business and orders.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <SubmitButton>Sign in</SubmitButton>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        Don&apos;t have an account?{" "}
        <Link href={registerHref} className="font-medium text-neutral-900 underline">
          Register
        </Link>
      </p>
    </main>
  );
}
