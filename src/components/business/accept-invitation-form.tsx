"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { SubmitButton } from "@/components/ui/submit-button";
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
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Invitation unavailable</h1>
        <p role="alert" className="text-sm text-neutral-600">
          This invitation link is invalid, has expired, or has already been used.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-neutral-900 underline">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold text-neutral-900">Accept invitation</h1>
      <p className="text-sm text-neutral-600">
        You have been invited to join a business team. Accepting adds your account as a member.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />

        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <SubmitButton>Accept invitation</SubmitButton>
      </form>
    </div>
  );
}
