import Link from "next/link";

import { CreateProductForm } from "@/components/product/product-forms";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/server/auth/session";
import { BusinessNotFoundError } from "@/server/business/errors";
import { getAuthorizedBusiness } from "@/server/business/queries";

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  let blocked: "no-access" | "staff" | null = null;
  let businessName = "";

  try {
    const authorized = await getAuthorizedBusiness(session.user.id, businessId);
    businessName = authorized.business.name;
    if (authorized.role !== "OWNER") {
      blocked = "staff";
    }
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      blocked = "no-access";
    } else {
      throw error;
    }
  }

  if (blocked === "no-access") {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">No access</h2>
        <p className="mt-2 text-sm text-muted">You are not a member of this business.</p>
      </div>
    );
  }

  if (blocked === "staff") {
    return (
      <div className="max-w-lg rounded-lg border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Owner access required</h2>
        <p className="mt-2 text-sm text-muted">Only the business owner can add products.</p>
        <Link
          href={`/dashboard/${businessId}/products`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-raised"
        >
          &larr; Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/dashboard/${businessId}/products`}
        backLabel="Products"
        title="Add a product"
        description={`Items you sell in ${businessName}.`}
      />
      <CreateProductForm businessId={businessId} />
    </div>
  );
}
