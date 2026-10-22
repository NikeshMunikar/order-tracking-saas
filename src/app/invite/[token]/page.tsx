import { redirect } from "next/navigation";

import { AcceptInvitationForm } from "@/components/business/accept-invitation-form";
import { auth } from "@/server/auth/config";

/**
 * Public accept-by-link entry point for an invitation.
 *
 * The route itself is not authenticated, but acceptance is: an unauthenticated
 * visitor is sent to sign in and returned here afterwards. The raw token is
 * relayed to the Server Action, which re-reads the caller's email from the
 * database and lets `acceptInvitation` decide whether the invitation may be
 * claimed.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  return <AcceptInvitationForm token={token} />;
}
