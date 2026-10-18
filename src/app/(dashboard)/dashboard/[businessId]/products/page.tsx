import Link from "next/link";

import { getAuthorizedBusiness } from "@/server/business/queries";
import { BusinessNotFoundError } from "@/server/business/errors";
import { listProducts } from "@/server/product/product-service";
import { requireSession } from "@/server/auth/session";

// M4 Products list (MASTER_SPEC.md roadmap: "Products: CRUD, Active/inactive").
// Access is resolved server-side: the session user must be a member of the
// business in the URL, so a businessId in a browser tab is only ever a lookup
// identifier, never authorization.
//
// Both OWNER and STAFF may view products (MASTER_SPEC.md §4); mutation is
// OWNER-only and the UI hides OWNER-only controls for STAFF while the
// service enforces the same rule independently.

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const session = await requireSession();

  let isOwner = false;
  try {
    const authorized = await getAuthorizedBusiness(session.user.id, businessId);
    isOwner = authorized.role === "OWNER";
  } catch (error) {
    if (error instanceof BusinessNotFoundError) {
      return (
        <div className="max-w-lg rounded-md border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-900">No access</h2>
          <p className="mt-2 text-sm text-neutral-600">
            You are not a member of this business.
          </p>
        </div>
      );
    }

    throw error;
  }

  // Membership was already verified above; listProducts re-checks it inside
  // the service so every entry point resolves authorization the same way.
  const products = await listProducts(session.user.id, businessId);
  const listHref = `/dashboard/${businessId}/products`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Products</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Items this business sells.
          </p>
        </div>
        {isOwner && (
          <Link
            href={`${listHref}/new`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Add product
          </Link>
        )}
      </div>

      {products.length === 0 ? (
        <div className="rounded-md border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-600">No products yet.</p>
          {isOwner ? (
            <p className="mt-1 text-sm text-neutral-500">
              Add your first product to start taking orders.
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-500">
              The business owner has not added any products yet.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Price
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-neutral-500"
                >
                  Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    <Link
                      href={`${listHref}/${product.id}`}
                      className="hover:underline underline-offset-2"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{product.price}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        product.active
                          ? "text-sm text-green-700"
                          : "text-sm text-neutral-500"
                      }
                    >
                      {product.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {product.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
