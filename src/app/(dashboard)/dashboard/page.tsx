import Link from "next/link";

import { CreateBusinessForm } from "@/components/business/business-forms";
import { requireSession } from "@/server/auth/session";
import { listBusinessesForUser } from "@/server/business/authorization";

export default async function DashboardPage() {
  const session = await requireSession();
  const businesses = await listBusinessesForUser(session.user.id);
  const hasBusinesses = businesses.length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-neutral-900">
        {hasBusinesses ? "Your businesses" : "Set up your business"}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        {hasBusinesses
          ? "Choose a business to manage."
          : "Create your business to start managing orders and sharing tracking links."}
      </p>

      <div className="mt-6">
        {hasBusinesses ? (
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {businesses.map((business) => (
              <li key={business.id} className="flex items-center justify-between gap-4 py-3">
                <Link
                  href={`/dashboard/${business.id}`}
                  className="text-sm font-medium text-neutral-900 underline-offset-2 hover:underline"
                >
                  {business.name}
                </Link>
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {business.role}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500">
            You are not part of a business yet.
          </p>
        )}
      </div>

      {/*
        This block stays mounted in every state. The create action revalidates
        this route; if the form were conditionally rendered, React would
        unmount half way through the submission and the post-create
        navigation to the new business would be lost.
      */}
      <div className="mt-10">
        {hasBusinesses && (
          <h2 className="text-base font-semibold text-neutral-900">Create another business</h2>
        )}
        <div className="mt-4 max-w-lg">
          <CreateBusinessForm />
        </div>
      </div>
    </div>
  );
}
