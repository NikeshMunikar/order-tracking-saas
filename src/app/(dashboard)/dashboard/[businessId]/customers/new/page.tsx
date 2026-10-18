import Link from "next/link";

import { CreateCustomerForm } from "@/components/customer/customer-forms";

/**
 * Create customer. The `businessId` path segment is passed through to the
 * Server Action only so the service can re-derive authorization server-side;
 * it is never trusted as proof of access.
 */
export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/${businessId}/customers`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          &larr; Customers
        </Link>
        <h2 className="mt-1 text-base font-semibold text-neutral-900">Add customer</h2>
      </div>

      <CreateCustomerForm businessId={businessId} />
    </div>
  );
}
