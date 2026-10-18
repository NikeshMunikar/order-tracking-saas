import { InvitationRow, InviteMemberForm, MemberRow } from "@/components/business/team";
import { BusinessAuthorizationError } from "@/server/business/errors";
import { listBusinessMembers } from "@/server/business/business-service";
import { listInvitations } from "@/server/business/invitation-service";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";
import { nowMs } from "@/lib/time";

type Invitation = Awaited<ReturnType<typeof listInvitations>>[number];

function invitationStatus(invitation: Invitation, now: number) {
  if (invitation.acceptedAt) return "Accepted" as const;
  if (invitation.revokedAt) return "Revoked" as const;
  if (invitation.expiresAt.getTime() <= now) return "Expired" as const;
  return "Pending" as const;
}

export default async function BusinessTeamPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await requireSession();
  const { businessId } = await params;
  const { role } = await getAuthorizedBusiness(session.user.id, businessId);
  const isOwner = role === "OWNER";

  const members = await listBusinessMembers(session.user.id, businessId);

  // Invitation email addresses are OWNER-only. `listInvitations` re-verifies
  // the OWNER role server-side, so a concurrent demotion between the layout
  // read and this call fails closed rather than exposing the list.
  let invitations: Invitation[] = [];
  if (isOwner) {
    try {
      invitations = await listInvitations(session.user.id, businessId);
    } catch (error) {
      if (!(error instanceof BusinessAuthorizationError)) {
        throw error;
      }
    }
  }

  const now = nowMs();

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-base font-semibold text-neutral-900">Team</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {isOwner
            ? "Owners manage the business; staff work with customers, products, and orders."
            : "People with access to this business."}
        </p>

        <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              businessId={businessId}
              canManage={isOwner}
              member={{
                id: member.id,
                role: member.role,
                user: { name: member.user.name, email: member.user.email },
              }}
            />
          ))}
        </ul>
      </section>

      {isOwner && (
        <section>
          <h2 className="text-base font-semibold text-neutral-900">Invite a team member</h2>
          <p className="mt-1 mb-4 text-sm text-neutral-500">
            Create a single-use invitation link for a specific email address. Share it out of band —
            the link is shown once and cannot be retrieved later.
          </p>

          <InviteMemberForm businessId={businessId} />

          <h3 className="mt-8 text-sm font-semibold text-neutral-900">Invitations</h3>
          {invitations.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No invitations yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
              {invitations.map((invitation) => (
                <InvitationRow
                  key={invitation.id}
                  businessId={businessId}
                  status={invitationStatus(invitation, now)}
                  invitation={{
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    expiresAt: invitation.expiresAt,
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
