import Link from "next/link";

import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { requireSession } from "@/server/auth/session";

/**
 * Business-scoped shell.
 *
 * Authorization is enforced here (server-side) for anything rendered inside
 * this layout: `getAuthorizedBusiness` resolves the caller's membership for
 * the `businessId` in the URL, which is treated purely as a navigation
 * identifier. A user who is not a member — or supplies a businessId that
 * does not exist — gets the same "no access" response, so cross-tenant
 * existence is never disclosed.
 */
export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const session = await requireSession();
  const { businessId } = await params;

  let authorized;
  try {
    authorized = await getAuthorizedBusiness(session.user.id, businessId);
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return (
        <div className="mx-auto max-w-lg">
          <h1 className="text-lg font-semibold text-neutral-900">No access</h1>
          <p className="mt-2 text-sm text-neutral-500">
            You don&apos;t have permission to access this business.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
          >
            Back to your businesses
          </Link>
        </div>
      );
    }

    throw error;
  }

  const isOwner = authorized.role === "OWNER";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">
          &larr; All businesses
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-neutral-900">{authorized.business.name}</h1>
      </div>

      <nav
        aria-label="Business sections"
        className="flex gap-6 border-b border-neutral-200 text-sm font-medium"
      >
        {isOwner && (
          <Link
            href={`/dashboard/${businessId}/settings`}
            className="pb-2 text-neutral-700 hover:text-neutral-900"
          >
            Settings
          </Link>
        )}
        <Link
          href={`/dashboard/${businessId}/team`}
          className="pb-2 text-neutral-700 hover:text-neutral-900"
        >
          Team
        </Link>
      </nav>

      <div>{children}</div>
    </div>
  );
}
