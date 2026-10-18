import { redirect } from "next/navigation";

import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";

export default async function BusinessIndexPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const session = await requireSession();
  const { businessId } = await params;
  const { role } = await getAuthorizedBusiness(session.user.id, businessId);

  // Owners land on settings; staff (who cannot change settings) land on the
  // team view, which every member may see.
  redirect(role === "OWNER" ? `/dashboard/${businessId}/settings` : `/dashboard/${businessId}/team`);
}
