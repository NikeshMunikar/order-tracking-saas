import Link from "next/link";

import { CreateProductForm } from "@/components/product/product-forms";
import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { requireSession } from "@/server/auth/session";

// M4 "Add product" screen. OWNER-only capability: getAuthorizedBusiness resolves
// the viewer's role (STAFF is refused here at the UI level as well, while the
// product service independently refuses non-OWNER writes server-side).

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  // No JSX is constructed inside the try/catch — the ESLint
  // react-hooks/error-boundaries rule forbids it; blocked states are resolved
  // to flags here and rendered afterwards.
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
      <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
        <h2 className="text-base font-semibold text-neutral-900">No access</h2>
        <p className="mt-2 text-sm text-neutral-600">
          You are not a member of this business.
        </p>
      </div>
    );
  }

  if (blocked === "staff") {
    return (
      <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
        <h2 className="text-base font-semibold text-neutral-900">Owner access required</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Only the business owner can add products.
        </p>
        <Link
          href={`/dashboard/${businessId}/products`}
          className="mt-4 inline-block text-sm font-medium text-neutral-700 underline underline-offset-2"
        >
          &larr; Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/dashboard/${businessId}/products`}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        &larr; Products
      </Link>

      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Add a product
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Items you sell in {businessName}.
        </p>
      </div>

      <CreateProductForm businessId={businessId} />
    </div>
  );
}
