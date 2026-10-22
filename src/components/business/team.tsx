"use client";

import { useActionState, useState } from "react";

import {
  FormError,
  FormSuccess,
  ManagementField,
  ManagementSelect,
  ManagementSubmitButton,
} from "@/components/ui/management-form";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from "@/server/business/actions";
import type { FormActionState, InviteMemberActionState } from "@/server/business/action-states";

const initialFormState: FormActionState = { status: "idle" };
const initialInviteState: InviteMemberActionState = { status: "idle" };

function roleTone(role: "OWNER" | "STAFF") {
  return role === "OWNER" ? "info" : "neutral";
}

function RoleOptions() {
  return (
    <>
      <option value="STAFF">Staff — customers, products, orders</option>
      <option value="OWNER">Owner — full business management</option>
    </>
  );
}

export function RoleField({ defaultValue = "STAFF" }: { defaultValue?: "OWNER" | "STAFF" }) {
  return (
    <ManagementSelect
      label="Role"
      name="role"
      defaultValue={defaultValue}
      hint="Choose what this person can manage."
    >
      <RoleOptions />
    </ManagementSelect>
  );
}

function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  return (
    <div className="flex flex-col gap-2">
      <code className="break-all rounded-md border border-line bg-raised px-3 py-2 font-mono text-xs text-ink">
        {url}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setState("done");
            } catch {
              setState("failed");
            }
          }}
          className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          Copy link
        </button>
        <div className="text-sm" aria-live="polite">
          {state === "done" && <span className="text-status-positive-fg">Copied.</span>}
          {state === "failed" && (
            <span className="text-status-negative-fg">
              Could not copy automatically — select the link and copy it manually.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function InviteMemberForm({ businessId }: { businessId: string }) {
  const [state, formAction] = useActionState(inviteMemberAction, initialInviteState);

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-md border border-status-positive-fg/25 bg-status-positive-bg p-4"
      >
        <div>
          <p className="text-sm font-medium text-status-positive-fg">
            Invitation created for {state.invitedEmail}.
          </p>
          <p className="mt-1 text-sm text-status-positive-fg">
            This link is shown only once — share it with them directly.
          </p>
        </div>
        <CopyLink url={`${window.location.origin}/invite/${state.inviteToken}`} />
        <p className="text-xs text-status-positive-fg">
          Expires {new Date(state.expiresAt).toLocaleDateString()}. They must sign in (or register)
          with {state.invitedEmail} to accept it.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      <ManagementField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="teammate@example.com"
        required
      />
      <RoleField />
      {state.status === "error" && <FormError message={state.message} />}
      <div>
        <ManagementSubmitButton>Create invitation</ManagementSubmitButton>
      </div>
    </form>
  );
}

export function MemberRow({
  businessId,
  member,
  canManage,
}: {
  businessId: string;
  member: {
    id: string;
    role: "OWNER" | "STAFF";
    user: { name: string | null; email: string };
  };
  canManage: boolean;
}) {
  const [roleState, roleAction] = useActionState(updateMemberRoleAction, initialFormState);
  const [removeState, removeAction] = useActionState(removeMemberAction, initialFormState);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const displayName = member.user.name ?? member.user.email;

  if (!canManage) {
    return (
      <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{displayName}</p>
          {member.user.name && (
            <p className="mt-0.5 truncate text-sm text-muted">{member.user.email}</p>
          )}
        </div>
        <StatusBadge tone={roleTone(member.role)}>
          {member.role === "OWNER" ? "Owner" : "Staff"}
        </StatusBadge>
      </li>
    );
  }

  return (
    <li className="py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            <StatusBadge tone={roleTone(member.role)}>
              {member.role === "OWNER" ? "Owner" : "Staff"}
            </StatusBadge>
          </div>
          {member.user.name && (
            <p className="mt-1 truncate text-sm text-muted">{member.user.email}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <form action={roleAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="memberId" value={member.id} />
            <div className="w-full sm:w-56">
              <ManagementSelect
                label="Role"
                name="role"
                id={`role-${member.id}`}
                defaultValue={member.role}
              >
                <RoleOptions />
              </ManagementSelect>
            </div>
            <ManagementSubmitButton tone="secondary">Update</ManagementSubmitButton>
          </form>
          {!confirmingRemove && (
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="inline-flex min-h-11 items-center self-start rounded-md border border-control bg-surface px-3 text-sm font-medium text-status-negative-fg transition-colors hover:bg-status-negative-bg sm:self-auto"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {roleState.status === "error" && <div className="mt-3"><FormError message={roleState.message ?? "Unable to update role."} /></div>}
      {roleState.status === "success" && roleState.message && (
        <div className="mt-3"><FormSuccess message={roleState.message} /></div>
      )}

      {confirmingRemove && (
        <form
          action={removeAction}
          className="mt-4 flex flex-col gap-3 rounded-md border border-line bg-raised p-4"
        >
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="memberId" value={member.id} />
          <p className="text-sm text-ink">Remove {displayName} from this business?</p>
          <div className="flex flex-wrap items-center gap-2">
            <ManagementSubmitButton tone="danger">Confirm remove</ManagementSubmitButton>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
            >
              Cancel
            </button>
          </div>
          {removeState.status === "error" && (
            <FormError message={removeState.message ?? "Unable to remove member."} />
          )}
        </form>
      )}
      {removeState.status === "error" && !confirmingRemove && (
        <div className="mt-3"><FormError message={removeState.message ?? "Unable to remove member."} /></div>
      )}
      {removeState.status === "success" && removeState.message && (
        <div className="mt-3"><FormSuccess message={removeState.message} /></div>
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
  invitation: {
    id: string;
    email: string;
    role: "OWNER" | "STAFF";
    expiresAt: Date;
  };
  status: "Pending" | "Accepted" | "Revoked" | "Expired";
}) {
  const [state, formAction] = useActionState(revokeInvitationAction, initialFormState);
  const tone =
    status === "Accepted"
      ? "positive"
      : status === "Pending"
        ? "warning"
        : status === "Revoked"
          ? "negative"
          : "neutral";

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{invitation.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={roleTone(invitation.role)}>
            {invitation.role === "OWNER" ? "Owner" : "Staff"}
          </StatusBadge>
          <StatusBadge tone={tone}>{status}</StatusBadge>
        </div>
        {status === "Pending" && (
          <p className="mt-2 text-xs text-muted">
            Expires {invitation.expiresAt.toLocaleDateString()}
          </p>
        )}
        {state.status === "error" && (
          <div className="mt-2">
            <FormError message={state.message ?? "Unable to revoke invitation."} />
          </div>
        )}
        {state.status === "success" && state.message && (
          <div className="mt-2">
            <FormSuccess message={state.message} />
          </div>
        )}
      </div>

      {status === "Pending" && (
        <form action={formAction}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="invitationId" value={invitation.id} />
          <ManagementSubmitButton tone="secondary">Revoke</ManagementSubmitButton>
        </form>
      )}
    </li>
  );
}
