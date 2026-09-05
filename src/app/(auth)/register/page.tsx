"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { registerAction, type RegisterActionState } from "@/server/auth/register";

const initialState: RegisterActionState = { status: "idle" };

export default function RegisterPage() {
  const [state, formAction] = useActionState(registerAction, initialState);

  if (state.status === "success") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
        <h1 className="mb-2 text-xl font-semibold text-neutral-900">Account created</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Your account has been created. You can now sign in.
        </p>
        <Link
          href="/login"
          className="inline-flex w-fit items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Go to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Create an account</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Set up your account to start tracking orders.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <TextField label="Name" name="name" type="text" autoComplete="name" />
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
          autoComplete="new-password"
          minLength={10}
          required
        />

        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <SubmitButton>Create account</SubmitButton>
      </form>

      <p className="mt-6 text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-neutral-900 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
