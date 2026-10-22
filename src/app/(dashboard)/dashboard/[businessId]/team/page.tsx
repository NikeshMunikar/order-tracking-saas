import { InvitationRow, InviteMemberForm, MemberRow } from "@/components/business/team";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { requireSession } from "@/server/auth/session";
import { BusinessAuthorizationError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { listBusinessMembers } from "@/server/business/business-service";
import { listInvitations } from "@/server/business/invitation-service";

function invitationStatus(
  invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  nowMs: number,
): "Pending" | "Accepted" | "Revoked" | "Expired" {
  if (invitation.acceptedAt) return "Accepted";
  if (invitation.revokedAt) return "Revoked";
  if (invitation.expiresAt.getTime() <= nowMs) return "Expired";
  return "Pending";
}

function requestTime(): number {
  return Date.now();
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();
  const authorized = await getAuthorizedBusiness(session.user.id, businessId);
  const isOwner = authorized.role === "OWNER";

  const members = await listBusinessMembers(session.user.id, businessId);

  let invitations: Awaited<ReturnType<typeof listInvitations>> = [];
  if (isOwner) {
    try {
      invitations = await listInvitations(session.user.id, businessId);
    } catch (error) {
      if (!(error instanceof BusinessAuthorizationError)) throw error;
    }
  }

  const nowMs = requestTime();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}`}
        backLabel="Dashboard"
        title="Team"
        description={
          isOwner
            ? "Manage who can access this business."
            : "People with access to this business."
        }
      />

      <SectionCard title="Members">
        <ul className="divide-y divide-line">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              businessId={businessId}
              member={member}
              canManage={isOwner}
            />
          ))}
        </ul>
      </SectionCard>

      {isOwner && (
        <>
          <SectionCard
            title="Invite a team member"
            description="Invitations are single-use links shown only once."
          >
            <InviteMemberForm businessId={businessId} />
          </SectionCard>

          <SectionCard title="Invitations">
            {invitations.length === 0 ? (
              <p className="text-sm text-muted">No invitations yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {invitations.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    businessId={businessId}
                    invitation={invitation}
                    status={invitationStatus(invitation, nowMs)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
