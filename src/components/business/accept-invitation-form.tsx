"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormError, ManagementSubmitButton } from "@/components/ui/management-form";
import { acceptInvitationAction } from "@/server/business/actions";
import type { AcceptInvitationActionState } from "@/server/business/action-states";

const initialState: AcceptInvitationActionState = { status: "idle" };

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(acceptInvitationAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/dashboard");
    }
  }, [state, router]);

  if (state.status === "invalid") {
    return (
      <AuthShell>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Invitation unavailable</h1>
        <p role="alert" className="mb-6 mt-1 text-sm text-muted">
          This invitation link is invalid, has expired, or has already been used.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Go to dashboard
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Accept invitation</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        You have been invited to join a business team. Accepting adds your account as a member.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />

        {state.status === "error" && (
          <FormError message={state.message ?? "Could not accept the invitation. Please try again."} />
        )}

        <ManagementSubmitButton className="w-full">Accept invitation</ManagementSubmitButton>
      </form>
    </AuthShell>
  );
}
