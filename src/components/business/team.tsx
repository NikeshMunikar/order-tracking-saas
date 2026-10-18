"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from "@/server/business/actions";
import type {
  FormActionState,
  InviteMemberActionState,
} from "@/server/business/action-states";

const initialFormState: FormActionState = { status: "idle" };
const initialInviteState: InviteMemberActionState = { status: "idle" };

function RoleField({ defaultValue }: { defaultValue: "OWNER" | "STAFF" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="role" className="text-sm font-medium text-neutral-700">
        Role
      </label>
      <select
        id="role"
        name="role"
        defaultValue={defaultValue}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
      >
        <option value="STAFF">Staff — customers, products, orders</option>
        <option value="OWNER">Owner — full business management</option>
      </select>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  return (
    <div className="flex flex-col gap-2">
      <code className="break-all rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied("done");
          } catch {
            setCopied("failed");
          }
        }}
        className="w-fit rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
      >
        Copy link
      </button>
      {copied === "done" && <span className="text-sm text-green-700">Copied.</span>}
      {copied === "failed" && (
        <span className="text-sm text-red-600">
          Could not copy automatically — select the link and copy it manually.
        </span>
      )}
    </div>
  );
}

export function InviteMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction] = useActionState(inviteMemberAction, initialInviteState);

  if (state.status === "success") {
    const url = `${window.location.origin}/invite/${state.inviteToken}`;

    return (
      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4">
        <p role="status" className="text-sm text-neutral-900">
          Invitation created for <span className="font-medium">{state.invitedEmail}</span>. This link
          is shown only once — share it with them directly.
        </p>
        <CopyLink url={url} />
        <p className="text-xs text-neutral-500">
          Expires {new Date(state.expiresAt).toLocaleString()}. They must sign in (or register) with{" "}
          {state.invitedEmail} to accept it.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <TextField label="Email" name="email" type="email" autoComplete="off" required />
      <RoleField defaultValue="STAFF" />

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <SubmitButton>Create invitation</SubmitButton>
    </form>
  );
}

export function MemberRow({
  businessId,
  member,
  canManage,
}: {
  businessId: string;
  member: { id: string; role: "OWNER" | "STAFF"; user: { name: string | null; email: string } };
  canManage: boolean;
}) {
  const [roleState, roleAction] = useActionState(updateMemberRoleAction, initialFormState);
  const [removeState, removeAction] = useActionState(removeMemberAction, initialFormState);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const label = member.user.name ?? member.user.email;

  if (!canManage) {
    return (
      <li className="flex items-center justify-between gap-4 py-3">
        <span className="text-sm text-neutral-900">{label}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {member.role}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="text-sm text-neutral-900">
          {label}
          {member.user.name && <span className="ml-2 text-neutral-500">{member.user.email}</span>}
        </span>

        <form action={roleAction} className="flex items-end gap-2">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="memberId" value={member.id} />
          <div className="flex flex-col gap-1">
            <label htmlFor={`role-${member.id}`} className="text-xs font-medium text-neutral-600">
              Role
            </label>
            <select
              id={`role-${member.id}`}
              name="role"
              defaultValue={member.role}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
            >
              <option value="STAFF">STAFF</option>
              <option value="OWNER">OWNER</option>
            </select>
          </div>
          <SubmitButton>Update</SubmitButton>
        </form>

        {confirmingRemove ? (
          <form action={removeAction} className="flex items-center gap-2">
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="memberId" value={member.id} />
            <SubmitButton>Confirm remove</SubmitButton>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-sm font-medium text-neutral-700 underline underline-offset-2"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="text-sm font-medium text-red-700 underline underline-offset-2"
          >
            Remove
          </button>
        )}
      </div>

      {roleState.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {roleState.message}
        </p>
      )}
      {removeState.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {removeState.message}
        </p>
      )}
    </li>
  );
}

export function InvitationRow({
  businessId,
  invitation,
  status,
}: {
  businessId: string;
  invitation: { id: string; email: string; role: "OWNER" | "STAFF"; expiresAt: Date };
  status: "Pending" | "Accepted" | "Revoked" | "Expired";
}) {
  const [state, formAction] = useActionState(revokeInvitationAction, initialFormState);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-neutral-900">
          {invitation.email}
          <span className="ml-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {invitation.role}
          </span>
        </span>

        <span className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {status}
          </span>
          {status === "Pending" && (
            <form action={formAction}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="invitationId" value={invitation.id} />
              <button
                type="submit"
                className="text-sm font-medium text-red-700 underline underline-offset-2"
              >
                Revoke
              </button>
            </form>
          )}
        </span>
      </div>

      {status === "Pending" && (
        <span className="text-xs text-neutral-500">
          Expires {invitation.expiresAt.toLocaleString()}
        </span>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
    </li>
  );
}
